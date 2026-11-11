import { describe, expect, it } from "vitest";
import { decrypt, encrypt, hashPassword, sha256, verifyPassword } from "@/lib/crypto";
import { ALL_PERMISSIONS, DIRECTOR_KEY, PERMISSIONS, PERMISSION_GROUPS, SYSTEM_ROLES } from "@/lib/permissions";

describe("palavras-passe e cifra", () => {
  it("verifica palavras-passe com scrypt", async () => {
    const h = await hashPassword("Segredo123");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("Segredo123", h)).toBe(true);
    expect(await verifyPassword("errada", h)).toBe(false);
    expect(await verifyPassword("x", null)).toBe(false);
  });
  it("cifra e decifra (AES-256-GCM) sem repetir o texto", () => {
    const c1 = encrypt("senha-da-base");
    const c2 = encrypt("senha-da-base");
    expect(c1).not.toBe(c2);
    expect(decrypt(c1)).toBe("senha-da-base");
    expect(c1).not.toContain("senha-da-base");
  });
  it("sha256 é determinístico", () => {
    expect(sha256("abc")).toBe(sha256("abc"));
    expect(sha256("abc")).not.toBe(sha256("abd"));
  });
});

describe("permissões", () => {
  it("todas as chaves de grupos existem em PERMISSIONS", () => {
    const grouped = PERMISSION_GROUPS.flatMap((g) => g.items);
    for (const p of grouped) expect(PERMISSIONS).toHaveProperty(p);
    expect(new Set(grouped).size).toBe(grouped.length);
  });
  it("a direção tem todas as permissões", () => {
    const director = SYSTEM_ROLES.find((r) => r.key === DIRECTOR_KEY)!;
    expect([...director.permissions].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });
  it("cargos padrão só usam permissões conhecidas", () => {
    for (const role of SYSTEM_ROLES) for (const p of role.permissions) expect(ALL_PERMISSIONS).toContain(p);
  });
  it("encarregados não aparecem em cargos de staff", () => {
    const staff = SYSTEM_ROLES.filter((r) => r.key !== DIRECTOR_KEY);
    for (const r of staff) expect(r.permissions).not.toContain("audit.view");
  });
});
