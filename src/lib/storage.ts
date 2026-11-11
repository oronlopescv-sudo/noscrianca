import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { env } from "./env";
import { ActionError } from "./result";

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
  await writeFile(full, Buffer.from(await f.arrayBuffer()));
  return { path: rel, mime: f.type, size: f.size };
}

export async function readTenantFile(institutionId: string, relPath: string): Promise<{ data: Buffer; mime: string } | null> {
  try {
    const full = resolveTenantFile(institutionId, relPath);
    await stat(full);
    const ext = path.extname(full).slice(1).toLowerCase();
    return { data: await readFile(full), mime: MIME_BY_EXT[ext] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

export async function deleteTenantFile(institutionId: string, relPath: string | null | undefined) {
  if (!relPath) return;
  try {
    await unlink(resolveTenantFile(institutionId, relPath));
  } catch {
    /* já não existe */
  }
}
