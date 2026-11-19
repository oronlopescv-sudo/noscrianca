import "../../scripts/_env";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { central, c, closeCentral } from "@/db/central";
import { closeAllTenantPools, getTenantDb, t, type TenantDb } from "@/db/tenant";
import { setChildStatusAction } from "@/server/people";

let db: TenantDb;
let childId: string;
let slug = "creche-sol";

vi.mock("@/lib/tenant", () => ({
  tenantAction: async () => ({ db, settings: { timezone: "Atlantic/Cape_Verde" }, user: { name: "Teste", id: null }, can: () => true, readOnly: false, institution: { id: "x" } }),
  audit: async () => undefined,
  assertChildAccess: async () => undefined,
  canAccessChild: async () => true,
}));

const fd = (o: Record<string, string>) => { const f = new FormData(); f.set("slug", slug); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

beforeAll(async () => {
  const row = await central().query.institutions.findFirst({ where: eq(c.institutions.slug, slug) });
  if (!row) throw new Error("Execute npm run seed:demo.");
  db = await getTenantDb(row.id);
  const ch = await db.query.children.findFirst();
  childId = ch!.id;
});

describe("estado da criança", () => {
  it("inativa, volta a inativar no mesmo dia e reativa", async () => {
    expect((await setChildStatusAction(undefined as never, fd({ childId, status: "INACTIVE" }))).ok).toBe(true);
    expect((await setChildStatusAction(undefined as never, fd({ childId, status: "INACTIVE" }))).ok).toBe(true);
    expect((await setChildStatusAction(undefined as never, fd({ childId, status: "ACTIVE" }))).ok).toBe(true);
    const periodos = await db.query.childInactivePeriods.findMany({ where: eq(t.childInactivePeriods.childId, childId) });
    expect(periodos.length).toBe(1);
    expect(periodos[0].toDate).not.toBeNull();
  });
});

afterAll(async () => {
  await db.update(t.children).set({ status: "ACTIVE", leftAt: null }).where(eq(t.children.id, childId));
  await db.delete(t.childInactivePeriods).where(eq(t.childInactivePeriods.childId, childId));
  await closeAllTenantPools();
  await closeCentral();
});
