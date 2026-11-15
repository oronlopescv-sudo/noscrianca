import "../../scripts/_env";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { central, c, closeCentral } from "@/db/central";
import { closeAllTenantPools, getTenantDb, t, type TenantDb } from "@/db/tenant";
import { decideJustificationAction, submitJustificationAction } from "@/server/justifications";

let db: TenantDb;
let childId: string;
let who: { isGuardian: boolean; can: (p: string) => boolean };
const DIA = "2025-02-03";
let attId: string;

vi.mock("@/lib/tenant", async (orig) => ({
  ...(await orig<object>()),
  tenantAction: async () => ({ db, institution: { id: "x" }, settings: { timezone: "Atlantic/Cape_Verde" }, user: { name: "Teste" }, isGuardian: who.isGuardian, can: who.can, readOnly: false }),
  canAccessChild: async () => true,
  audit: async () => undefined,
}));

const fd = (o: Record<string, string>) => { const f = new FormData(); f.set("slug", "creche-sol"); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

beforeAll(async () => {
  const row = await central().query.institutions.findFirst({ where: eq(c.institutions.slug, "creche-sol") });
  if (!row) throw new Error("Execute npm run seed:demo antes de correr os testes.");
  db = await getTenantDb(row.id);
  childId = (await db.query.children.findFirst())!.id;
});

beforeEach(async () => {
  await db.delete(t.attendance).where(eq(t.attendance.childId, childId));
  const [a] = await db.insert(t.attendance).values({ childId, date: DIA, status: "ABSENT", absenceReason: "" }).returning();
  attId = a.id;
  who = { isGuardian: true, can: () => true };
});

afterAll(async () => {
  await db.delete(t.attendance).where(eq(t.attendance.childId, childId));
  await closeAllTenantPools();
  await closeCentral();
});

const get = () => db.query.attendance.findFirst({ where: eq(t.attendance.id, attId) });

describe("encarregado justifica a falta", () => {
  it("recusa justificação vazia sem documento", async () => {
    const r = await submitJustificationAction(null, fd({ childId, attendanceId: attId, justification: "" }));
    expect(r?.ok).toBe(false);
    expect((await get())?.justificationStatus).toBe("NONE");
  });

  it("guarda o motivo e fica pendente", async () => {
    const r = await submitJustificationAction(null, fd({ childId, attendanceId: attId, justification: "Consulta médica" }));
    expect(r?.ok).toBe(true);
    const a = await get();
    expect(a?.justificationStatus).toBe("PENDING");
    expect(a?.justificationText).toBe("Consulta médica");
    expect(a?.justifiedByName).toBe("Teste");
  });

  it("pode corrigir enquanto está pendente", async () => {
    await submitJustificationAction(null, fd({ childId, attendanceId: attId, justification: "Motivo inicial" }));
    await submitJustificationAction(null, fd({ childId, attendanceId: attId, justification: "Motivo corrigido" }));
    expect((await get())?.justificationText).toBe("Motivo corrigido");
  });

  it("só o encarregado pode justificar", async () => {
    who = { isGuardian: false, can: () => true };
    const r = await submitJustificationAction(null, fd({ childId, attendanceId: attId, justification: "Teste" }));
    expect(r?.ok).toBe(false);
  });

  it("não justifica uma presença", async () => {
    await db.update(t.attendance).set({ status: "PRESENT" }).where(eq(t.attendance.id, attId));
    const r = await submitJustificationAction(null, fd({ childId, attendanceId: attId, justification: "Teste" }));
    expect(r?.ok).toBe(false);
  });
});

describe("direção aceita ou recusa", () => {
  it("aceita uma justificação pendente e bloqueia novas alterações", async () => {
    await submitJustificationAction(null, fd({ childId, attendanceId: attId, justification: "Atestado" }));
    who = { isGuardian: false, can: () => true };
    expect((await decideJustificationAction(null, fd({ slug: "creche-sol", attendanceId: attId, decision: "JUSTIFIED" })))?.ok).toBe(true);
    expect((await get())?.justificationStatus).toBe("JUSTIFIED");
    who = { isGuardian: true, can: () => true };
    const r = await submitJustificationAction(null, fd({ childId, attendanceId: attId, justification: "Outra coisa" }));
    expect(r?.ok).toBe(false);
  });

  it("recusa e o encarregado pode voltar a enviar", async () => {
    await submitJustificationAction(null, fd({ childId, attendanceId: attId, justification: "Sem prova" }));
    who = { isGuardian: false, can: () => true };
    await decideJustificationAction(null, fd({ slug: "creche-sol", attendanceId: attId, decision: "UNJUSTIFIED" }));
    expect((await get())?.justificationStatus).toBe("UNJUSTIFIED");
    who = { isGuardian: true, can: () => true };
    const r = await submitJustificationAction(null, fd({ childId, attendanceId: attId, justification: "Com declaração" }));
    expect(r?.ok).toBe(true);
    expect((await get())?.justificationStatus).toBe("PENDING");
  });

  it("não decide sem justificação por rever", async () => {
    who = { isGuardian: false, can: () => true };
    const r = await decideJustificationAction(null, fd({ slug: "creche-sol", attendanceId: attId, decision: "JUSTIFIED" }));
    expect(r?.ok).toBe(false);
  });
});
