/** Ficheiros de cópia de segurança: nomes seguros e reconhecimento do formato. */

/** Assinatura cabecalho do formato "custom" do pg_dump. */
export const PGDMP_MAGIC = "PGDMP";

/**
 * Nome de ficheiro inofensivo para o sistema de ficheiros: sem caminhos, sem
 * caracteres especiais, comprimento limitado. "backup/fatura.dump" -> "backup_fatura.dump".
 */
export function sanitizeBackupName(name: string): string {
  const base = name.split(/[\\/]/).pop()!.replace(/[^A-Za-z0-9._-]/g, "_");
  return base.length > 0 && base !== "." && base !== ".." ? base.slice(0, 200) : "copia.dump";
}

/** Aceita só ficheiros de cópia pg_dump (formato custom) — nada de scripts SQL nem binários estranhos. */
export function isPgDumpExtension(name: string): boolean {
  return /\.(dump|backup)$/i.test(name);
}

/** Os primeiros 5 bytes de um pg_dump --format=custom são PGDMP. */
export function isPgDumpHeader(head: Uint8Array): boolean {
  if (head.length < 5) return false;
  for (let i = 0; i < 5; i++) if (head[i] !== PGDMP_MAGIC.charCodeAt(i)) return false;
  return true;
}
