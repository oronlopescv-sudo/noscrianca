import "../../scripts/_env";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { central, c, closeCentral } from "@/db/central";
import { closeAllTenantPools, getTenantDb, t, type TenantDb } from "@/db/tenant";
import { saveAdAction } from "@/server/settings";

let db: TenantDb;
let original: { adEnabled: boolean; adTitle: string; adText: string; adLink: string };

vi.mock("@/lib/tenant", () => ({
  tenantAction: async () => ({ db, user: { name: "Teste" }, can: () => true, readOnly: false }),
  audit: async () => undefined,
}));

const fd = (o: Record<string, string>) => { const f = new FormData(); f.set("slug", "creche-sol"); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

beforeAll(async () => {
  const row = await central().query.institutions.findFirst({ where: eq(c.institutions.slug, "creche-sol") });
  if (!row) throw new Error("Execute npm run seed:demo antes de correr os testes.");
  db = await getTenantDb(row.id);
  const s = await db.query.settings.findFirst({ where: eq(t.settings.id, 1) });
  original = { adEnabled: s!.adEnabled, adTitle: s!.adTitle, adText: s!.adText, adLink: s!.adLink };
});

afterAll(async () => {
  await db.update(t.settings).set(original).where(eq(t.settings.id, 1));
  await closeAllTenantPools();
  await closeCentral();
});

describe("anúncio da creche", () => {
  it("guarda e devolve o anúncio ativo", async () => {
    const r = await saveAdAction(null, fd({ adEnabled: "on", adTitle: "Vagas abertas", adText: "Inscreva já", adLink: "https://exemplo.cv" }));
    expect(r?.ok).toBe(true);
    const s = await db.query.settings.findFirst({ where: eq(t.settings.id, 1) });
    expect([s!.adEnabled, s!.adTitle, s!.adLink]).toEqual([true, "Vagas abertas", "https://exemplo.cv"]);
  });

  it("recusa links que não são https/http", async () => {
    const r = await saveAdAction(null, fd({ adEnabled: "on", adTitle: "X", adLink: "javascript:alert(1)" }));
    expect(r?.ok).toBe(false);
  });

  it("não ativa um anúncio sem título nem texto", async () => {
    const r = await saveAdAction(null, fd({ adEnabled: "on" }));
    expect(r?.ok).toBe(false);
  });

  it("desativado guarda sem exigir conteúdo", async () => {
    const r = await saveAdAction(null, fd({}));
    expect(r?.ok).toBe(true);
    const s = await db.query.settings.findFirst({ where: eq(t.settings.id, 1) });
    expect(s!.adEnabled).toBe(false);
  });
});
