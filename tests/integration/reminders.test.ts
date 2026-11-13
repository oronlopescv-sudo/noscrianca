import "../../scripts/_env";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { central, c, closeCentral } from "@/db/central";
import { closeAllTenantPools, getTenantDb, t, type TenantDb } from "@/db/tenant";
import { addDays, todayIn } from "@/lib/format";
import { sendOverdueReminders } from "@/lib/services/reminders";

// O envio real não é testado aqui: o email é capturado em memória.
const sent: { to: string; subject: string }[] = [];
vi.mock("@/lib/mail", () => ({
  mailConfigured: () => true,
  sendMail: async (m: { to: string; subject: string }) => { sent.push({ to: m.to, subject: m.subject }); return true; },
}));

let inst: { id: string; slug: string; timezone: string };
let db: TenantDb;
let invoiceId: string;
let number: string;
let originalSettings: { reminderEnabled: boolean; reminderDays: string };

beforeAll(async () => {
  const row = await central().query.institutions.findFirst({ where: eq(c.institutions.slug, "creche-sol") });
  if (!row) throw new Error("Execute npm run seed:demo antes de correr os testes de integração.");
  inst = { id: row.id, slug: row.slug, timezone: row.timezone };
  db = await getTenantDb(inst.id);
  const s = await db.query.settings.findFirst({ where: eq(t.settings.id, 1) });
  originalSettings = { reminderEnabled: s!.reminderEnabled, reminderDays: s!.reminderDays };
  await db.update(t.settings).set({ reminderEnabled: true, reminderDays: "1,7" }).where(eq(t.settings.id, 1));

  // Fatura de teste vencida há 1 dia, numa criança com encarregado com email.
  const link = await db.query.childGuardians.findFirst();
  if (!link) throw new Error("A criança de demonstração não tem encarregados.");
  const today = todayIn(inst.timezone);
  number = `TST-AVISO-${Date.now()}`;
  const [inv] = await db.insert(t.invoices).values({
    number, childId: link.childId, kind: "EXTRA", period: "2031-02", issueDate: addDays(today, -10),
    dueDate: addDays(today, -1), totalCents: 500000, paidCents: 0, status: "OPEN", notes: "teste de avisos",
  }).returning();
  invoiceId = inv.id;
});

afterAll(async () => {
  // Anula a fatura de teste e repõe as definições.
  for (const id of [invoiceId, ...extras]) {
    await db.update(t.invoices).set({ status: "VOID", voidedAt: new Date(), voidReason: "teste" }).where(eq(t.invoices.id, id));
  }
  await db.update(t.settings).set(originalSettings).where(eq(t.settings.id, 1));
  await closeAllTenantPools();
  await closeCentral();
});

async function novaFatura(diasEmAtraso: number, status: "OPEN" | "PAID" = "OPEN", anulada = false) {
  const link = await db.query.childGuardians.findFirst();
  const today = todayIn(inst.timezone);
  const num = `TST-${diasEmAtraso}-${status}-${anulada ? "V" : "N"}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  // Uma fatura anulada é VOID (não OPEN com data de anulação) — a base garante
  // a coerência e a aplicação nunca cria a forma incoerente.
  const statusReal = anulada ? "VOID" : status;
  const [inv] = await db.insert(t.invoices).values({
    number: num, childId: link!.childId, kind: "EXTRA", period: "2031-03", issueDate: addDays(today, -20),
    dueDate: addDays(today, -diasEmAtraso), totalCents: 100000, paidCents: statusReal === "PAID" ? 100000 : 0, status: statusReal,
    notes: "teste de avisos", voidedAt: anulada ? new Date() : null, voidReason: anulada ? "teste" : null,
  }).returning();
  extras.push(inv.id);
  return { id: inv.id, num };
}
const extras: string[] = [];

describe("avisos de faturas em atraso", () => {
  it("fatura paga ou anulada nunca gera aviso", async () => {
    const paga = await novaFatura(3, "PAID");
    const anulada = await novaFatura(3, "OPEN", true);
    sent.length = 0;
    await sendOverdueReminders(inst);
    const rows = await db.select().from(t.invoiceReminders);
    expect(rows.filter((r) => r.invoiceId === paga.id || r.invoiceId === anulada.id)).toHaveLength(0);
    expect(sent.filter((m) => m.subject.includes(paga.num) || m.subject.includes(anulada.num))).toHaveLength(0);
  });

  it("aos 7 dias de atraso envia a etapa 7 (e não a etapa 1)", async () => {
    const f = await novaFatura(7);
    sent.length = 0;
    await sendOverdueReminders(inst);
    const rows = await db.select().from(t.invoiceReminders).where(eq(t.invoiceReminders.invoiceId, f.id));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.stage === 7)).toBe(true);
  });

  it("não se repete: a etapa 7 não volta a sair no dia seguinte", async () => {
    const f = await novaFatura(8);
    await sendOverdueReminders(inst);
    const antes = await db.select().from(t.invoiceReminders).where(eq(t.invoiceReminders.invoiceId, f.id));
    sent.length = 0;
    await sendOverdueReminders(inst);
    const depois = await db.select().from(t.invoiceReminders).where(eq(t.invoiceReminders.invoiceId, f.id));
    expect(depois.length).toBe(antes.length);
    expect(sent.filter((m) => m.subject.includes(f.num))).toHaveLength(0);
  });

  it("envia um aviso a cada encarregado da criança, uma só vez", async () => {
    // Os testes correm em sequência: a fatura pode já ter sido avisada noutro teste.
    await sendOverdueReminders(inst);
    const rows = await db.select().from(t.invoiceReminders).where(eq(t.invoiceReminders.invoiceId, invoiceId));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.stage === 1)).toBe(true);

    // Segunda execução no mesmo dia: nenhum registo novo para esta fatura.
    const antes = rows.length;
    await sendOverdueReminders(inst);
    const depois = await db.select().from(t.invoiceReminders).where(eq(t.invoiceReminders.invoiceId, invoiceId));
    expect(depois.length).toBe(antes);
  });

  it("cria notificação no portal do encarregado", async () => {
    const rows = await db.select().from(t.invoiceReminders).where(eq(t.invoiceReminders.invoiceId, invoiceId));
    const [first] = rows;
    const notes = await db.select().from(t.notifications).where(and(eq(t.notifications.userId, first.userId), eq(t.notifications.title, `Fatura ${number} em atraso`)));
    expect(notes.length).toBeGreaterThan(0);
  });

  it("não envia nada quando os avisos estão desligados", async () => {
    await db.update(t.settings).set({ reminderEnabled: false }).where(eq(t.settings.id, 1));
    sent.length = 0;
    const r = await sendOverdueReminders(inst);
    expect(r).toEqual({ sent: 0, failed: 0 });
    expect(sent).toHaveLength(0);
    await db.update(t.settings).set({ reminderEnabled: true }).where(eq(t.settings.id, 1));
  });
});
