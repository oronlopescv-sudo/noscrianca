import { and, eq, isNull, sql } from "drizzle-orm";
import { t, type TenantDb, type TenantExecutor } from "@/db/tenant";
import type { PaymentMethod } from "@/db/tenant/schema";
import { ActionError } from "@/lib/result";
import { periodLabel } from "@/lib/format";

async function nextNumber(tx: TenantExecutor, kind: "invoice" | "receipt"): Promise<string> {
  const col = kind === "invoice" ? t.settings.invoiceCounter : t.settings.receiptCounter;
  const [row] = await tx.update(t.settings)
    .set(kind === "invoice" ? { invoiceCounter: sql`${col} + 1` } : { receiptCounter: sql`${col} + 1` })
    .where(eq(t.settings.id, 1)).returning({ n: col });
  if (!row) throw new ActionError("Definições da instituição em falta.");
  return `${kind === "invoice" ? "F" : "R"}${new Date().getUTCFullYear()}/${String(row.n).padStart(5, "0")}`;
}

function dueDateFor(period: string, dueDay: number): string {
  const [y, m] = period.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${period}-${String(Math.min(Math.max(dueDay, 1), last)).padStart(2, "0")}`;
}

/**
 * Gera as mensalidades de um mês para todas as crianças ativas com plano de
 * preço. Idempotente: nunca cria duas mensalidades para a mesma criança/mês.
 * Os meses em que a criança esteve desistente (períodos de ausência) não são
 * faturados; o mês da saída e o mês do regresso mantêm-se faturáveis.
 * Uma mensalidade anulada só volta a ser criada com `recreateVoided` (pedido
 * manual da direção); a geração automática diária respeita a anulação.
 */
export async function generateMonthlyInvoices(db: TenantDb, period: string, today: string, opts: { recreateVoided?: boolean; childId?: string } = {}): Promise<{ created: number; skipped: number }> {
  const settings = await db.query.settings.findFirst({ where: eq(t.settings.id, 1) });
  const kids = await db.query.children.findMany({ where: and(eq(t.children.status, "ACTIVE"), opts.childId ? eq(t.children.id, opts.childId) : undefined), with: { feePlan: true, inactivePeriods: true } });
  let created = 0, skipped = 0;
  for (const kid of kids) {
    if (!kid.feePlan || !kid.feePlan.active || kid.enrolledAt.slice(0, 7) > period) { skipped++; continue; }
    const away = kid.inactivePeriods.some((p) => {
      const from = p.fromDate.slice(0, 7), to = (p.toDate ?? "9999-12").slice(0, 7);
      return period > from && period < to;
    });
    if (away) { skipped++; continue; }
    const made = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`inv:${kid.id}:${period}`}))`);
      const existing = await tx.query.invoices.findFirst({
        where: and(eq(t.invoices.childId, kid.id), eq(t.invoices.period, period), eq(t.invoices.kind, "MONTHLY"), opts.recreateVoided ? isNull(t.invoices.voidedAt) : undefined),
      });
      if (existing) return false;
      const [inv] = await tx.insert(t.invoices).values({
        number: await nextNumber(tx, "invoice"), childId: kid.id, kind: "MONTHLY", period,
        issueDate: today, dueDate: dueDateFor(period, settings?.invoiceDueDay ?? 8), totalCents: kid.feePlan!.amountCents,
      }).returning();
      await tx.insert(t.invoiceItems).values({
        invoiceId: inv.id, description: `Mensalidade ${periodLabel(period)} — ${kid.feePlan!.name}`, amountCents: kid.feePlan!.amountCents,
      });
      return true;
    });
    if (made) created++; else skipped++;
  }
  return { created, skipped };
}

export async function createExtraInvoice(db: TenantDb, input: { childId: string; description: string; amountCents: number; dueDate: string; today: string; notes?: string }) {
  if (input.amountCents <= 0) throw new ActionError("O valor deve ser superior a zero.");
  return db.transaction(async (tx) => {
    const [inv] = await tx.insert(t.invoices).values({
      number: await nextNumber(tx, "invoice"), childId: input.childId, kind: "EXTRA", period: input.dueDate.slice(0, 7),
      issueDate: input.today, dueDate: input.dueDate, totalCents: input.amountCents, notes: input.notes ?? "",
    }).returning();
    await tx.insert(t.invoiceItems).values({ invoiceId: inv.id, description: input.description, amountCents: input.amountCents });
    return inv;
  });
}

async function recalc(tx: TenantExecutor, invoiceId: string) {
  const [{ paid }] = await tx.select({ paid: sql<number>`coalesce(sum(${t.payments.amountCents}), 0)::int` }).from(t.payments)
    .where(and(eq(t.payments.invoiceId, invoiceId), isNull(t.payments.reversedAt)));
  const [inv] = await tx.select().from(t.invoices).where(eq(t.invoices.id, invoiceId));
  if (inv.status === "VOID") return;
  const status = paid <= 0 ? "OPEN" : paid >= inv.totalCents ? "PAID" : "PARTIAL";
  await tx.update(t.invoices).set({ paidCents: paid, status }).where(eq(t.invoices.id, invoiceId));
}

/** Regista um pagamento manual (total ou parcial) e emite o recibo numerado. */
export async function recordPayment(db: TenantDb, input: {
  invoiceId: string; amountCents: number; method: PaymentMethod; reference: string; paidAt: string;
  proofPath?: string | null; userId: string; userName: string;
}) {
  if (input.amountCents <= 0) throw new ActionError("O valor deve ser superior a zero.");
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(t.invoices).where(eq(t.invoices.id, input.invoiceId)).for("update");
    if (!inv) throw new ActionError("Fatura não encontrada.");
    if (inv.status === "VOID") throw new ActionError("Esta fatura foi anulada.");
    const remaining = inv.totalCents - inv.paidCents;
    if (remaining <= 0) throw new ActionError("Esta fatura já está paga.");
    if (input.amountCents > remaining) throw new ActionError("O valor é superior ao montante em dívida.");
    const [payment] = await tx.insert(t.payments).values({
      invoiceId: inv.id, amountCents: input.amountCents, method: input.method, reference: input.reference, paidAt: input.paidAt,
      proofPath: input.proofPath ?? null, recordedById: input.userId, recordedByName: input.userName,
    }).returning();
    const [receipt] = await tx.insert(t.receipts).values({ number: await nextNumber(tx, "receipt"), paymentId: payment.id }).returning();
    await recalc(tx, inv.id);
    return { payment, receipt, invoice: inv };
  });
}

/** Estorno: o pagamento e o recibo ficam no histórico, marcados como anulados. */
export async function reversePayment(db: TenantDb, paymentId: string, reason: string, userName: string) {
  if (reason.trim().length < 3) throw new ActionError("Indique o motivo do estorno.");
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(t.payments).where(eq(t.payments.id, paymentId)).for("update");
    if (!p) throw new ActionError("Pagamento não encontrado.");
    if (p.reversedAt) throw new ActionError("Este pagamento já foi estornado.");
    await tx.update(t.payments).set({ reversedAt: new Date(), reversedByName: userName, reversalReason: reason.trim() }).where(eq(t.payments.id, p.id));
    await tx.update(t.receipts).set({ voidedAt: new Date() }).where(eq(t.receipts.paymentId, p.id));
    await recalc(tx, p.invoiceId);
    return p;
  });
}

export async function voidInvoice(db: TenantDb, invoiceId: string, reason: string) {
  if (reason.trim().length < 3) throw new ActionError("Indique o motivo da anulação.");
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(t.invoices).where(eq(t.invoices.id, invoiceId)).for("update");
    if (!inv) throw new ActionError("Fatura não encontrada.");
    if (inv.status === "VOID") throw new ActionError("Esta fatura já está anulada.");
    if (inv.paidCents > 0) throw new ActionError("Estorne primeiro os pagamentos desta fatura.");
    await tx.update(t.invoices).set({ status: "VOID", voidedAt: new Date(), voidReason: reason.trim() }).where(eq(t.invoices.id, inv.id));
    return inv;
  });
}

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Dinheiro", TRANSFER: "Transferência", CHEQUE: "Cheque", DEPOSIT: "Depósito", OTHER: "Outro",
};
