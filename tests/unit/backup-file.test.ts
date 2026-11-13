import { describe, expect, it } from "vitest";
import { isPgDumpExtension, isPgDumpHeader, sanitizeBackupName } from "@/lib/backup-file";

describe("ficheiros de cópia de segurança", () => {
  it("nome limpo: tira caminhos, caracteres estranhos e limita o comprimento", () => {
    expect(sanitizeBackupName("creche-sol-2026-11-13.dump")).toBe("creche-sol-2026-11-13.dump");
    expect(sanitizeBackupName("backups/../etc/passwd")).toBe("passwd");
    expect(sanitizeBackupName("backups/creche sol?.dump")).toBe("creche_sol_.dump");
    expect(sanitizeBackupName("cópia da creche .dump")).toBe("c_pia_da_creche_.dump");
    expect(sanitizeBackupName("")).toBe("copia.dump");
    expect(sanitizeBackupName(".")).toBe("copia.dump");
    expect(sanitizeBackupName(`a${"b".repeat(400)}.dump`)).toBe(`a${"b".repeat(199)}`);
  });

  it("extensão: só .dump e .backup (nunca .sql nem scripts)", () => {
    expect(isPgDumpExtension("copia.dump")).toBe(true);
    expect(isPgDumpExtension("COPIA.BACKUP")).toBe(true);
    expect(isPgDumpExtension("dump.pgdmp")).toBe(false);
    expect(isPgDumpExtension("instituicao.sql")).toBe(false);
    expect(isPgDumpExtension("ficheiro.php")).toBe(false);
    expect(isPgDumpExtension("")).toBe(false);
  });

  it("cabecalho pg_dump: só o formato custom (PGDMP) abre", () => {
    expect(isPgDumpHeader(new TextEncoder().encode("PGDMP\u0014\u0007..."))).toBe(true);
    expect(isPgDumpHeader(new TextEncoder().encode("PGDMP"))).toBe(true);
    expect(isPgDumpHeader(new TextEncoder().encode("PGD"))).toBe(false);
    expect(isPgDumpHeader(new TextEncoder().encode("---- PostgreSQL dump"))).toBe(false);
    expect(isPgDumpHeader(new Uint8Array())).toBe(false);
    expect(isPgDumpHeader(new TextEncoder().encode("<?php exit; ?>"))).toBe(false);
  });
});
