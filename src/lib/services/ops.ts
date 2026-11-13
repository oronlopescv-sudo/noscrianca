import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { and, count, eq, inArray, isNull, lt } from "drizzle-orm";
import { central, centralPool, closeCentral, c } from "@/db/central";
import { migrateTenant } from "@/db/migrate";
import { dropTenantPool, getTenantDb, t, tenantConnectionString } from "@/db/tenant";
import { isPgDumpExtension, isPgDumpHeader, sanitizeBackupName } from "@/lib/backup-file";
import { env } from "@/lib/env";

function runTool(cmd: string, args: string[], url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const child = spawn(cmd, args, {
      env: {
        ...process.env, PGHOST: u.hostname, PGPORT: u.port || "5432", PGUSER: decodeURIComponent(u.username),
        PGPASSWORD: decodeURIComponent(u.password), PGDATABASE: u.pathname.slice(1),
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let err = "";
    child.stderr.on("data", (d) => { err = (err + d.toString()).slice(-2000); });
    child.on("error", (e) => reject(new Error(`${cmd} não está disponível no servidor: ${e.message}`)));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || `${cmd} terminou com código ${code}`))));
  });
}

export function backupFolder(slug: string) {
  return path.resolve(env.backupDir, slug);
}

function platformFolder() {
  return backupFolder("platform");
}

// ---------------------------------------------------------------------------
// Cópias da base central (plataforma): contas de acesso, instituições, planos,
// faturas do SaaS e o registo das cópias. Sem ela, perder o servidor perde
// também o acesso — as cópias das instituições sozinhas não chegam.
// ---------------------------------------------------------------------------

export type CentralBackupInfo = { fileName: string; sizeBytes: number; createdAt: Date };

/** Cópia de segurança da base central (pg_dump, formato custom). */
export async function backupCentral() {
  const folder = platformFolder();
  await mkdir(folder, { recursive: true });
  const fileName = `central-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`;
  const full = path.join(folder, fileName);
  try {
    await runTool("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", `--file=${full}`], env.centralUrl);
  } catch (e) {
    // Um dump a meio não é uma cópia: não pode ficar listado nem descarregável.
    await unlink(full).catch(() => {});
    throw e;
  }
  const size = (await stat(full)).size;
  return { fileName, sizeBytes: size, createdAt: new Date() };
}

export async function listCentralBackups(): Promise<CentralBackupInfo[]> {
  const folder = platformFolder();
  const names = await readdir(folder).catch(() => [] as string[]);
  const out: CentralBackupInfo[] = [];
  for (const name of names) {
    const st = await stat(path.join(folder, name)).catch(() => null);
    if (st?.isFile()) out.push({ fileName: name, sizeBytes: st.size, createdAt: st.mtime });
  }
  return out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Caminho de um ficheiro de cópia da central, já com o nome limpo. */
export function centralBackupPath(fileName: string): string {
  return path.join(platformFolder(), sanitizeBackupName(fileName));
}

/**
 * Restaura a base central a partir de um ficheiro de cópia (pg_restore --clean).
 * DESTROI o conteúdo atual da central: corre só por comando, com o site parado
 * (o resto do fluxo de perda total está na secção "Recuperação" do README).
 */
export async function restoreCentralBackup(fileName: string) {
  const full = centralBackupPath(fileName);
  await stat(full).catch(() => { throw new Error("O ficheiro de cópia não existe no servidor."); });
  // Fecha a ligação da central (se houver) para o pg_restore não disputar locks.
  await closeCentral();
  const u = new URL(env.centralUrl);
  await runTool("pg_restore", [
    "--clean", "--if-exists", "--no-owner", "--no-privileges", "--single-transaction",
    `--dbname=${u.pathname.slice(1)}`,
    full,
  ], env.centralUrl);
}

// ---------------------------------------------------------------------------
// Subidas (upload) de cópias: o admin traz de volta um .dump descarregado
// antes, para restaurar num servidor novo.
// ---------------------------------------------------------------------------

// Limite da subida: se a variável estiver mal posta (não numérica), fica 256 MB
// em vez de desligar o limite.
const MB_MAX = Number(process.env.BACKUP_UPLOAD_MAX_MB ?? 256);
export const backupUploadMaxBytes = Number.isFinite(MB_MAX) && MB_MAX > 0 ? Math.ceil(MB_MAX * 1_000_000) : 256_000_000;

/**
 * Guarda no servidor uma cópia subida pelo admin: valida o formato pg_dump
 * (cabecalho PGDMP + tabela legível), escreve com limite de tamanho e remove
 * o ficheiro se algo falhar. Devolve o nome usado no disco.
 */
export async function savePgDumpUpload(folder: string, originalName: string, body: ReadableStream): Promise<{ fileName: string; sizeBytes: number; path: string }> {
  // A extensão vê-se ANTES de cortar o nome: um nome comprido não deve perder
  // o ".dump" e ser recusado por isso.
  if (!isPgDumpExtension(originalName.split(/[\\/]/).pop() ?? "")) throw new Error("O ficheiro não é uma cópia pg_dump (esperava .dump ou .backup).");
  const clean = sanitizeBackupName(originalName);
  const fileName = `subida-${new Date().toISOString().replace(/[:.]/g, "-")}-${clean}`;
  await mkdir(folder, { recursive: true });
  const full = path.join(folder, fileName);
  try {
    const reader = body.getReader();
    const first = await reader.read();
    if (first.done || !first.value) throw new Error("Ficheiro vazio.");
    if (!isPgDumpHeader(first.value)) throw new Error("Isto não é uma cópia pg_dump em formato \"custom\" (volte a fazer o backup pelo painel e suba esse ficheiro).");
    async function* rest(): AsyncGenerator<Uint8Array> {
      let total = first.value!.byteLength;
      if (total > backupUploadMaxBytes) { reader.cancel().catch(() => {}); throw new Error(`O ficheiro passa de ${Math.round(backupUploadMaxBytes / 1_000_000)} MB (limite da subida).`); }
      yield first.value!;
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        total += value.byteLength;
        if (total > backupUploadMaxBytes) {
          reader.cancel().catch(() => {});
          throw new Error(`O ficheiro passa de ${Math.round(backupUploadMaxBytes / 1_000_000)} MB (limite da subida).`);
        }
        yield value;
      }
    }
    await pipeline(Readable.from(rest()), createWriteStream(full));
    // Valida a integridade lendo a tabela do dump — apanha subidas truncadas.
    await runTool("pg_restore", ["--list", full], env.centralUrl).catch((e) => {
      throw new Error(`O ficheiro subido não passa a validação do pg_restore: ${(e as Error).message}`);
    });
    const size = (await stat(full)).size;
    return { fileName, sizeBytes: size, path: full };
  } catch (e) {
    await unlink(full).catch(() => {});
    throw e;
  }
}

/** Guarda uma cópia subida PARA UMA instituição e regista-a (aparece na lista, restaúvel pelo painel). */
export async function saveInstitutionBackupUpload(institutionId: string, originalName: string, body: ReadableStream) {
  const inst = await central().query.institutions.findFirst({ where: eq(c.institutions.id, institutionId) });
  if (!inst) throw new Error("Instituição não encontrada.");
  const saved = await savePgDumpUpload(backupFolder(inst.slug), originalName, body);
  try {
    const [rec] = await central().insert(c.backupRecords).values({
      institutionId: inst.id, fileName: saved.fileName, sizeBytes: saved.sizeBytes, manual: true, status: "DONE",
    }).returning();
    return { recordId: rec.id, ...saved, slug: inst.slug };
  } catch (e) {
    // Sem registo, o painel nunca vê o ficheiro: não deixa órfão no disco.
    await unlink(saved.path).catch(() => {});
    throw e;
  }
}

/** Guarda uma cópia subida DA CENTRAL (sem registo na própria central — é a BD que está a ser copiada). */
export async function saveCentralBackupUpload(originalName: string, body: ReadableStream) {
  const saved = await savePgDumpUpload(platformFolder(), originalName, body);
  return saved;
}

/** Corpo de resposta com um ficheiro do disco (descarregar cópia). */
export async function downloadBackupResponse(fullPath: string, fileName: string): Promise<Response> {
  const st = await stat(fullPath).catch(() => null);
  if (!st?.isFile()) throw new Error("O ficheiro de cópia já não está no servidor (retenção do disco).");
  const stream = Readable.toWeb(createReadStream(fullPath)) as unknown as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${sanitizeBackupName(fileName)}"`,
      "Content-Length": String(st.size),
      "Cache-Control": "no-store",
    },
  });
}

/** Backup independente de UMA instituição (pg_dump em formato custom). */
export async function backupInstitution(institutionId: string, manual: boolean) {
  const inst = await central().query.institutions.findFirst({ where: eq(c.institutions.id, institutionId) });
  if (!inst) throw new Error("Instituição não encontrada.");
  const fileName = `${inst.slug}-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`;
  const [rec] = await central().insert(c.backupRecords).values({ institutionId, fileName, manual }).returning();
  try {
    const url = await tenantConnectionString(institutionId);
    const folder = backupFolder(inst.slug);
    await mkdir(folder, { recursive: true });
    const full = path.join(folder, fileName);
    await runTool("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", `--file=${full}`], url);
    const size = (await stat(full)).size;
    await central().update(c.backupRecords).set({ status: "DONE", sizeBytes: size }).where(eq(c.backupRecords.id, rec.id));
    await central().update(c.institutions).set({ lastBackupAt: new Date() }).where(eq(c.institutions.id, institutionId));
    return { ...rec, status: "DONE" as const, sizeBytes: size };
  } catch (e) {
    await central().update(c.backupRecords).set({ status: "FAILED", error: (e as Error).message }).where(eq(c.backupRecords.id, rec.id));
    throw e;
  }
}

/** Restaura a BD de UMA instituição a partir de um backup seu. */
export async function restoreInstitution(institutionId: string, backupId: string) {
  const rec = await central().query.backupRecords.findFirst({
    where: and(eq(c.backupRecords.id, backupId), eq(c.backupRecords.institutionId, institutionId), eq(c.backupRecords.status, "DONE")),
  });
  const inst = await central().query.institutions.findFirst({ where: eq(c.institutions.id, institutionId) });
  if (!rec || !inst) throw new Error("Backup não encontrado para esta instituição.");
  const full = path.join(backupFolder(inst.slug), path.basename(rec.fileName));
  await stat(full).catch(() => { throw new Error("O ficheiro de backup já não existe no servidor."); });
  const url = await tenantConnectionString(institutionId);
  await dropTenantPool(institutionId);
  await runTool("pg_restore", ["--clean", "--if-exists", "--no-owner", "--no-privileges", "--single-transaction", `--dbname=${new URL(url).pathname.slice(1)}`, full], url);
  await migrateTenant(url);
  await dropTenantPool(institutionId);
}

export async function pruneBackups() {
  const cutoff = new Date(Date.now() - env.backupRetentionDays * 86_400_000);
  // Cópias da central não têm registo na BD (é a própria BD que se copia):
  // só as automáticas (nome «central-…») expiram; as subidas pelo painel não
  // têm registo e não se pode distinguir uma intenção de restauro — mantêm-se,
  // como as cópias manuais das instituições.
  const platform = platformFolder();
  for (const f of (await listCentralBackups()).filter((f) => f.createdAt < cutoff && f.fileName.startsWith("central-"))) {
    await unlink(path.join(platform, f.fileName)).catch(() => {});
  }
  const old = await central().query.backupRecords.findMany({
    where: and(lt(c.backupRecords.createdAt, cutoff), eq(c.backupRecords.manual, false)), with: { institution: true },
  });
  for (const rec of old) {
    await unlink(path.join(backupFolder(rec.institution.slug), path.basename(rec.fileName))).catch(() => {});
    await central().delete(c.backupRecords).where(eq(c.backupRecords.id, rec.id));
  }
}

export async function backupFileExists(slug: string, fileName: string): Promise<boolean> {
  try {
    return (await readdir(backupFolder(slug))).includes(path.basename(fileName));
  } catch {
    return false;
  }
}

const LIVE = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED"] as const;

export async function liveInstitutions() {
  return central().query.institutions.findMany({ where: inArray(c.institutions.status, [...LIVE]) });
}

/** Atualiza as estatísticas (crianças, utilizadores, tamanho da BD) na central. */
export async function refreshStats(institutionId: string) {
  const reg = await central().query.tenantDatabases.findFirst({ where: eq(c.tenantDatabases.institutionId, institutionId) });
  if (!reg) return;
  const db = await getTenantDb(institutionId);
  const [{ kids }] = await db.select({ kids: count() }).from(t.children).where(eq(t.children.status, "ACTIVE"));
  const [{ people }] = await db.select({ people: count() }).from(t.users).where(isNull(t.users.deletedAt));
  const size = Number((await centralPool().query("SELECT pg_database_size($1) AS s", [reg.dbName])).rows[0]?.s ?? 0);
  await central().update(c.institutions)
    .set({ childrenCount: kids, usersCount: people, dbSizeBytes: size, statsUpdatedAt: new Date() }).where(eq(c.institutions.id, institutionId));
}

/** Aplica as migrations a todas as BDs de tenants, com relatório por instituição. */
export async function migrateAllTenants(): Promise<{ slug: string; ok: boolean; error?: string }[]> {
  const report: { slug: string; ok: boolean; error?: string }[] = [];
  for (const inst of await liveInstitutions()) {
    try {
      await migrateTenant(await tenantConnectionString(inst.id));
      report.push({ slug: inst.slug, ok: true });
    } catch (e) {
      report.push({ slug: inst.slug, ok: false, error: (e as Error).message });
    }
  }
  return report;
}
