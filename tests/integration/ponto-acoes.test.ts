import "../../scripts/_env";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { central, c, closeCentral } from "@/db/central";
import { closeAllTenantPools, getTenantDb, t, type TenantDb } from "@/db/tenant";
import { clockInAction, clockOutAction, correctTimeEntryAction, decideTimeEntryAction, addTimeEntryAction } from "@/server/timeclock";

// Sessão simulada: o funcionário da demonstração e, para as ações da direção, permissão de salários.
let who: { employeeId: string | null; can: (p: string) => boolean; name: string };
let db: TenantDb;
let settings: { timezone: string };
let employeeId: string;

vi.mock("@/lib/tenant", () => ({
  tenantAction: async () => ({ db, settings, user: { name: who.name }, employeeId: who.employeeId, can: who.can, readOnly: false }),
  audit: async () => undefined,
}));

const fd = (o: Record<string, string>) => { const f = new FormData(); f.set("slug", "creche-sol"); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

beforeAll(async () => {
  const row = await central().query.institutions.findFirst({ where: eq(c.institutions.slug, "creche-sol") });
  if (!row) throw new Error("Execute npm run seed:demo antes de correr os testes.");
  db = await getTenantDb(row.id);
  settings = (await db.query.settings.findFirst({ where: eq(t.settings.id, 1) }))!;
  const emp = await db.query.employees.findFirst();
  employeeId = emp!.id;
});

beforeEach(async () => {
  // Apaga todas as marcações do funcionário de teste (as ações criam marcações com o dia de hoje).
  await db.delete(t.timeEntries).where(eq(t.timeEntries.employeeId, employeeId));
  who = { employeeId, can: () => true, name: "Teste" };
});

afterAll(async () => {
  await db.delete(t.timeEntries).where(eq(t.timeEntries.employeeId, employeeId));
  await closeAllTenantPools();
  await closeCentral();
});

const openEntries = () => db.query.timeEntries.findMany({ where: eq(t.timeEntries.employeeId, employeeId) });

describe("funcionário marca entrada e saída", () => {
  it("entrada → saída fecha a mesma marcação", async () => {
    const r1 = await clockInAction(null, fd({}));
    expect(r1?.ok).toBe(true);
    const [e] = await openEntries();
    expect(e.clockOut).toBeNull();
    expect(e.status).toBe("PENDING");
    expect(e.source).toBe("EMPLOYEE");
  });

  it("não deixa abrir uma segunda entrada enquanto a primeira está aberta", async () => {
    await clockInAction(null, fd({}));
    const r2 = await clockInAction(null, fd({}));
    expect(r2?.ok).toBe(false);
    expect(await openEntries()).toHaveLength(1);
  });

  it("saída sem entrada aberta é recusada", async () => {
    const r = await clockOutAction(null, fd({}));
    expect(r?.ok).toBe(false);
  });

  it("saída com entrada anterior fecha a marcação", async () => {
    await db.insert(t.timeEntries).values({ employeeId, date: "2025-05-02", clockIn: "00:00" });
    const r = await clockOutAction(null, fd({}));
    expect(r?.ok).toBe(true);
    const [e] = await openEntries();
    expect(e.clockOut).not.toBeNull();
    expect(e.clockOut! > "00:00").toBe(true);
  });

  it("quem não é funcionário não marca ponto", async () => {
    who = { employeeId: null, can: () => false, name: "Encarregado" };
    const r = await clockInAction(null, fd({}));
    expect(r?.ok).toBe(false);
  });
});

describe("direção confirma, recusa, corrige e lança", () => {
  it("não confirma uma marcação sem saída", async () => {
    const [row] = await db.insert(t.timeEntries).values({ employeeId, date: "2025-06-01", clockIn: "08:00" }).returning();
    const r = await decideTimeEntryAction(null, fd({ entryId: row.id, decision: "CONFIRMED" }));
    expect(r?.ok).toBe(false);
  });

  it("confirma e recusa marcações completas", async () => {
    const [row] = await db.insert(t.timeEntries).values({ employeeId, date: "2025-06-02", clockIn: "08:00", clockOut: "12:00" }).returning();
    expect((await decideTimeEntryAction(null, fd({ entryId: row.id, decision: "CONFIRMED" })))?.ok).toBe(true);
    expect((await db.query.timeEntries.findFirst({ where: eq(t.timeEntries.id, row.id) }))?.status).toBe("CONFIRMED");
    expect((await decideTimeEntryAction(null, fd({ entryId: row.id, decision: "REJECTED" })))?.ok).toBe(true);
    expect((await db.query.timeEntries.findFirst({ where: eq(t.timeEntries.id, row.id) }))?.status).toBe("REJECTED");
  });

  it("decisão inválida é recusada", async () => {
    const [row] = await db.insert(t.timeEntries).values({ employeeId, date: "2025-06-03", clockIn: "08:00", clockOut: "12:00" }).returning();
    expect((await decideTimeEntryAction(null, fd({ entryId: row.id, decision: "TALVEZ" })))?.ok).toBe(false);
  });

  it("corrige horas e confirma; saída antes da entrada é recusada", async () => {
    const [row] = await db.insert(t.timeEntries).values({ employeeId, date: "2025-06-04", clockIn: "08:00", clockOut: "12:00" }).returning();
    expect((await correctTimeEntryAction(null, fd({ entryId: row.id, clockIn: "09:00", clockOut: "08:00" })))?.ok).toBe(false);
    expect((await correctTimeEntryAction(null, fd({ entryId: row.id, clockIn: "07:30", clockOut: "15:30" })))?.ok).toBe(true);
    const e = await db.query.timeEntries.findFirst({ where: eq(t.timeEntries.id, row.id) });
    expect([e?.clockIn, e?.clockOut, e?.status]).toEqual(["07:30", "15:30", "CONFIRMED"]);
    expect(e?.correctedByName).toBe("Teste");
  });

  it("lança marcação esquecida já confirmada; data futura é recusada", async () => {
    expect((await addTimeEntryAction(null, fd({ employeeId, date: "2025-06-05", clockIn: "08:00", clockOut: "13:00" })))?.ok).toBe(true);
    const e = (await openEntries()).find((x) => x.date === "2025-06-05");
    expect(e?.source).toBe("MANAGER");
    expect(e?.status).toBe("CONFIRMED");
    expect((await addTimeEntryAction(null, fd({ employeeId, date: "2099-01-01", clockIn: "08:00", clockOut: "13:00" })))?.ok).toBe(false);
  });
});
