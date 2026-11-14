import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { env } from "./env";
import { stripImageMetadata } from "./image-metadata";
import { ActionError } from "./result";
import { central, c } from "@/db/central";

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const DOC_TYPES: Record<string, string> = { ...IMAGE_TYPES, "application/pdf": "pdf" };
export const MIME_BY_EXT: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };

function tenantRoot(institutionId: string) {
  return path.resolve(env.storageDir, institutionId);
}

/** Resolve um caminho relativo dentro da pasta do tenant, impedindo path traversal. */
export function resolveTenantFile(institutionId: string, relPath: string): string {
  const root = tenantRoot(institutionId);
  const full = path.resolve(root, relPath);
  if (!full.startsWith(root + path.sep)) throw new ActionError("Caminho inválido.");
  return full;
}

/** Espelha o ficheiro na BD central: um redeploy pode limpar o disco — a base não. */
async function espelharNaCentral(institutionId: string, rel: string, dados: Buffer, mime: string) {
  await central().insert(c.dbFiles).values({ institutionId, raiz: "storage", path: rel, mime, bytes: dados, size: dados.length })
    .onConflictDoUpdate({
      target: [c.dbFiles.institutionId, c.dbFiles.raiz, c.dbFiles.path],
      set: { mime, bytes: dados, size: dados.length, updatedAt: new Date() },
    });
}

export async function saveUpload(
  institutionId: string, folder: string, f: File, opts: { kind: "image" | "document"; maxMb?: number },
): Promise<{ path: string; mime: string; size: number }> {
  const allowed = opts.kind === "image" ? IMAGE_TYPES : DOC_TYPES;
  const ext = allowed[f.type];
  if (!ext) throw new ActionError(opts.kind === "image" ? "Formato inválido. Use JPG, PNG ou WebP." : "Formato inválido. Use PDF, JPG, PNG ou WebP.");
  const maxMb = opts.maxMb ?? 8;
  if (f.size > maxMb * 1024 * 1024) throw new ActionError(`Ficheiro demasiado grande (máx. ${maxMb} MB).`);
  if (!/^[a-zA-Z0-9/_-]+$/.test(folder)) throw new ActionError("Pasta inválida.");
  const rel = `${folder}/${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
  const full = resolveTenantFile(institutionId, rel);
  await mkdir(path.dirname(full), { recursive: true });
  // Fotos de crianças: GPS, câmara, comentários e IPTC ficam fora (a orientação
  // EXIF e o perfil de cor mantêm-se). Qualquer ficheiro estranho é gravado
  // como veio.
  const raw = Buffer.from(await f.arrayBuffer());
  const limpo = stripImageMetadata(raw, f.type);
  await writeFile(full, limpo);
  await espelharNaCentral(institutionId, rel, limpo, f.type).catch((e) =>
    console.error(`[storage] espelho na central falhou (${rel}):`, (e as Error).message),
  );
  return { path: rel, mime: f.type, size: limpo.length };
}

/** Busca um ficheiro espelhado na central (raiz «storage» ou «backups»). */
async function lerDaCentral(institutionId: string, raiz: string, rel: string): Promise<{ data: Buffer; mime: string } | null> {
  try {
    const linha = await central().query.dbFiles.findFirst({
      where: and(eq(c.dbFiles.institutionId, institutionId), eq(c.dbFiles.raiz, raiz), eq(c.dbFiles.path, rel)),
    });
    if (!linha) return null;
    return { data: Buffer.from(linha.bytes), mime: linha.mime };
  } catch {
    return null;
  }
}

export async function readTenantFile(institutionId: string, relPath: string): Promise<{ data: Buffer; mime: string } | null> {
  try {
    const full = resolveTenantFile(institutionId, relPath);
    await stat(full);
    const ext = path.extname(full).slice(1).toLowerCase();
    return { data: await readFile(full), mime: MIME_BY_EXT[ext] ?? "application/octet-stream" };
  } catch {
    // Disco sem o ficheiro (redeploy, volume novo): a base fornece e repõe.
    const daCentral = await lerDaCentral(institutionId, "storage", relPath);
    if (!daCentral) return null;
    try {
      const full = resolveTenantFile(institutionId, relPath);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, daCentral.data);
    } catch { /* sem disco: serve à mesma da base */ }
    return daCentral;
  }
}

export async function deleteTenantFile(institutionId: string, relPath: string | null | undefined) {
  if (!relPath) return;
  try {
    await unlink(resolveTenantFile(institutionId, relPath));
  } catch { /* já não existe */ }
  try {
    await central().delete(c.dbFiles).where(and(eq(c.dbFiles.institutionId, institutionId), eq(c.dbFiles.raiz, "storage"), eq(c.dbFiles.path, relPath)));
  } catch (e) {
    console.error(`[storage] remoção do espelho falhou (${relPath}):`, (e as Error).message);
  }
}

/**
 * Põe no disco tudo o que só existe na base (um redeploy limpa o container).
 * Corre no arranque: logo, capa, fotografias e cópias recentes voltam a estar
 * no sítio — mesmo sem volume montado.
 */
export async function repostarFicheiros(): Promise<number> {
  const linhas = await central().select({ institutionId: c.dbFiles.institutionId, raiz: c.dbFiles.raiz, path: c.dbFiles.path }).from(c.dbFiles);
  let repostos = 0;
  for (const linha of linhas) {
    try {
      if (linha.raiz === "storage") {
        const full = resolveTenantFile(linha.institutionId, linha.path);
        await stat(full);
        continue; // já está no disco
      }
      await stat(path.resolve(env.backupDir, linha.path));
      continue;
    } catch { /* não está: buscar e escrever, em baixo */ }
    try {
      const dado = await lerDaCentral(linha.institutionId, linha.raiz, linha.path);
      if (!dado) continue;
      const destino = linha.raiz === "storage"
        ? resolveTenantFile(linha.institutionId, linha.path)
        : path.resolve(env.backupDir, linha.path);
      await mkdir(path.dirname(destino), { recursive: true });
      await writeFile(destino, dado.data);
      repostos++;
    } catch (e) {
      console.error(`[arranque] reposição falhou (${linha.path}):`, (e as Error).message);
    }
  }
  return repostos;
}
