import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { central, c } from "@/db/central";
import type { Institution } from "@/db/central/schema";

export const BILLING_SUSPEND_REASON = "Fatura da plataforma em atraso";
const DAY = 86_400_000;

function addCycle(d: Date, cycle: "MONTHLY" | "YEARLY"): Date {
  const n = new Date(d);
  if (cycle === "YEARLY") n.setUTCFullYear(n.getUTCFullYear() + 1);
  else n.setUTCMonth(n.getUTCMonth() + 1);
  return n;
}

async function nextInvoiceNumber(): Promise<string> {
  const [row] = await central().update(c.platformSettings)
    .set({ invoiceCounter: sql`${c.platformSettings.invoiceCounter} + 1` })
    .where(eq(c.platformSettings.id, 1)).returning({ n: c.platformSettings.invoiceCounter });
  return `NC-${new Date().getUTCFullYear()}-${String(row.n).padStart(5, "0")}`;
}

/** Emite a próxima fatura de uma instituição, se estiver na altura e ainda não existir. */
export async function issueInvoiceIfDue(inst: Institution, now = new Date()): Promise<boolean> {
  if (!["TRIAL", "ACTIVE", "PAST_DUE"].includes(inst.status) || !inst.planId) return false;
  const start = inst.status === "TRIAL" && !inst.currentPeriodEnd ? inst.trialEndsAt : inst.currentPeriodEnd;
  if (!start || start.getTime() - now.getTime() > 7 * DAY) return false;

  const plan = await central().query.plans.findFirst({ where: eq(c.plans.id, inst.planId) });
  const settings = await central().query.platformSettings.findFirst({ where: eq(c.platformSettings.id, 1) });
  if (!plan || !settings) return false;

  const open = await central().query.platformInvoices.findFirst({
    where: and(eq(c.platformInvoices.institutionId, inst.id), eq(c.platformInvoices.periodStart, start), inArray(c.platformInvoices.status, ["OPEN", "PAID"])),
  });
  if (open) return false;

  const amount = inst.billingCycle === "YEARLY" ? plan.priceYearlyCents : plan.priceMonthlyCents;
  const base = start > now ? start : now;
  // Índice único (institution, periodStart) garante uma fatura por período
  // mesmo em emissões concorrentes (manual + ciclo diário).
  const [made] = await central().insert(c.platformInvoices).values({
    number: await nextInvoiceNumber(),
    institutionId: inst.id,
    description: `Plano ${plan.name} — ${inst.billingCycle === "YEARLY" ? "anual" : "mensal"}`,
    periodStart: start, periodEnd: addCycle(start, inst.billingCycle),
    amountCents: amount, currency: settings.billingCurrency,
    dueDate: new Date(base.getTime() + settings.invoiceDueDays * DAY),
  }).onConflictDoNothing({ target: [c.platformInvoices.institutionId, c.platformInvoices.periodStart] }).returning();
  return !!made;
}

/** Ciclo diário: emite faturas, marca atrasos (PAST_DUE) e suspende após o período de tolerância. */
export async function runBillingCycle(now = new Date()) {
  const settings = await central().query.platformSettings.findFirst({ where: eq(c.platformSettings.id, 1) });
  if (!settings) return;
  const list = await central().query.institutions.findMany({ where: inArray(c.institutions.status, ["TRIAL", "ACTIVE", "PAST_DUE"]) });
  for (const inst of list) {
    await issueInvoiceIfDue(inst, now);
    const overdue = await central().query.platformInvoices.findMany({
      where: and(eq(c.platformInvoices.institutionId, inst.id), eq(c.platformInvoices.status, "OPEN"), lt(c.platformInvoices.dueDate, now)),
    });
    if (!overdue.length) continue;
    const oldest = overdue.reduce((a, b) => (a.dueDate < b.dueDate ? a : b));
    if (now.getTime() - oldest.dueDate.getTime() > settings.graceDays * DAY) {
      await central().update(c.institutions)
        .set({ status: "SUSPENDED", suspendedAt: now, suspendReason: BILLING_SUSPEND_REASON }).where(eq(c.institutions.id, inst.id));
      await central().insert(c.platformAuditLogs).values({ action: "Instituição suspensa por fatura em atraso", entity: "institution", entityId: inst.id, institutionId: inst.id });
    } else if (inst.status !== "PAST_DUE") {
      await central().update(c.institutions).set({ status: "PAST_DUE" }).where(eq(c.institutions.id, inst.id));
    }
  }
}

/** Regista manualmente o pagamento de uma fatura e renova/reativa a instituição. */
export async function payPlatformInvoice(invoiceId: string, input: { method: string; reference: string; paidAt: Date }) {
  return central().transaction(async (tx) => {
    const [inv] = await tx.select().from(c.platformInvoices).where(eq(c.platformInvoices.id, invoiceId)).for("update");
    if (!inv) throw new Error("Fatura não encontrada.");
    if (inv.status !== "OPEN") throw new Error("Esta fatura já não está em aberto.");
    await tx.update(c.platformInvoices)
      .set({ status: "PAID", paidAt: input.paidAt, paymentMethod: input.method, paymentReference: input.reference })
      .where(eq(c.platformInvoices.id, inv.id));
    const inst = await tx.query.institutions.findFirst({ where: eq(c.institutions.id, inv.institutionId) });
    if (!inst) return inv;
    const stillOverdue = await tx.query.platformInvoices.findFirst({
      where: and(eq(c.platformInvoices.institutionId, inst.id), eq(c.platformInvoices.status, "OPEN"), lt(c.platformInvoices.dueDate, new Date())),
    });
    const periodEnd = !inst.currentPeriodEnd || inv.periodEnd > inst.currentPeriodEnd ? inv.periodEnd : inst.currentPeriodEnd;
    const billingSuspended = inst.status === "SUSPENDED" && inst.suspendReason === BILLING_SUSPEND_REASON;
    const canActivate = !stillOverdue && (inst.status === "TRIAL" || inst.status === "PAST_DUE" || billingSuspended);
    await tx.update(c.institutions).set({
      currentPeriodEnd: periodEnd,
      ...(canActivate ? { status: "ACTIVE" as const, suspendedAt: null, suspendReason: null } : {}),
    }).where(eq(c.institutions.id, inst.id));
    return inv;
  });
}

export async function voidPlatformInvoice(invoiceId: string, reason: string) {
  const [inv] = await central().update(c.platformInvoices)
    .set({ status: "VOID", voidedAt: new Date(), voidReason: reason })
    .where(and(eq(c.platformInvoices.id, invoiceId), eq(c.platformInvoices.status, "OPEN"))).returning();
  if (!inv) throw new Error("Só é possível anular faturas em aberto.");
  return inv;
}
