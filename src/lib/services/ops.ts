import { spawn } from "node:child_process";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { and, count, eq, inArray, isNull, lt } from "drizzle-orm";
import { central, centralPool, c } from "@/db/central";
import { migrateTenant } from "@/db/migrate";
import { dropTenantPool, getTenantDb, t, tenantConnectionString } from "@/db/tenant";
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

function backupFolder(slug: string) {
  return path.resolve(env.backupDir, slug);
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
