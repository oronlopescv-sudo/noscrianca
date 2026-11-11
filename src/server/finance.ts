"use server";

import { and, count, eq, ne } from "drizzle-orm";
import { t } from "@/db/tenant";
import type { PaymentMethod } from "@/db/tenant/schema";
import { isIsoDate, isPeriod, money, parseMoney, periodLabel, todayIn } from "@/lib/format";
import { bool, fail, file, run, str, type ActionResult } from "@/lib/result";
import { createExtraInvoice, generateMonthlyInvoices, METHOD_LABELS, recordPayment, reversePayment, voidInvoice } from "@/lib/services/finance";
import { saveUpload } from "@/lib/storage";
import { audit, notify, tenantAction, type TenantCtx } from "@/lib/tenant";

type S = ActionResult | null;

async function guardianUsersOfChild(ctx: TenantCtx, childId: string): Promise<string[]> {
  const rows = await ctx.db.select({ userId: t.guardians.userId }).from(t.childGuardians)
    .innerJoin(t.guardians, eq(t.guardians.id, t.childGuardians.guardianId))
    .innerJoin(t.users, eq(t.users.id, t.guardians.userId))
    .where(and(eq(t.childGuardians.childId, childId), eq(t.users.status, "ACTIVE")));
  return rows.map((r) => r.userId);
}

export async function saveFeePlanAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "finance.manage" });
    const id = str(fd, "feePlanId");
    const name = str(fd, "name");
    if (name.length < 2 || name.length > 80) fail("Indique o nome da mensalidade.");
    const amountCents = parseMoney(str(fd, "amount"));
    if (amountCents === null || amountCents <= 0) fail("Valor inválido.");
    const dup = await ctx.db.query.feePlans.findFirst({ where: and(eq(t.feePlans.name, name), id ? ne(t.feePlans.id, id) : undefined) });
    if (dup) fail("Já existe uma mensalidade com este nome.");
    if (id) await ctx.db.update(t.feePlans).set({ name, amountCents: amountCents!, active: bool(fd, "active") }).where(eq(t.feePlans.id, id));
    else await ctx.db.insert(t.feePlans).values({ name, amountCents: amountCents! });
    await audit(ctx, id ? "Mensalidade editada" : "Mensalidade criada", { entity: "feePlan", details: { nome: name, valor: money(amountCents!, ctx.settings.currency) } });
    return { ok: true, message: "Mensalidade guardada." };
  });
}

export async function deleteFeePlanAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "finance.manage" });
    const id = str(fd, "feePlanId");
    const [{ n }] = await ctx.db.select({ n: count() }).from(t.children).where(eq(t.children.feePlanId, id));
    if (n > 0) fail("Existem crianças com esta mensalidade. Desative-a em vez de a eliminar.");
    const [row] = await ctx.db.delete(t.feePlans).where(eq(t.feePlans.id, id)).returning();
    if (!row) fail("Mensalidade não encontrada.");
    await audit(ctx, "Mensalidade eliminada", { entity: "feePlan", details: { nome: row.name } });
    return { ok: true, message: "Mensalidade eliminada." };
  });
}

export async function generateInvoicesAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "finance.manage" });
    const period = str(fd, "period");
    if (!isPeriod(period)) fail("Mês inválido.");
    const before = new Date();
    const r = await generateMonthlyInvoices(ctx.db, period, todayIn(ctx.settings.timezone));
    if (r.created > 0) {
      const fresh = await ctx.db.query.invoices.findMany({ where: and(eq(t.invoices.period, period), eq(t.invoices.kind, "MONTHLY")) });
      for (const inv of fresh.filter((i) => i.createdAt >= before)) {
        await notify(ctx.db, await guardianUsersOfChild(ctx, inv.childId), {
          title: `Mensalidade de ${periodLabel(period)}`, body: `${money(inv.totalCents, ctx.settings.currency)} · vence a ${inv.dueDate.split("-").reverse().join("/")}`, href: `${ctx.base}/pais/financeiro`,
        });
      }
    }
    await audit(ctx, "Mensalidades geradas", { entity: "invoice", details: { mes: period, criadas: r.created } });
    return { ok: true, message: r.created ? `${r.created} mensalidade(s) gerada(s) para ${periodLabel(period)}.` : `Nenhuma mensalidade nova: já estavam geradas ou as crianças não têm mensalidade atribuída.` };
  });
}

export async function createExtraInvoiceAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "finance.manage" });
    const childId = str(fd, "childId");
    const child = await ctx.db.query.children.findFirst({ where: eq(t.children.id, childId) });
    if (!child) fail("Escolha a criança.");
    const description = str(fd, "description");
    if (description.length < 2 || description.length > 160) fail("Indique a descrição.");
    const amountCents = parseMoney(str(fd, "amount"));
    if (amountCents === null || amountCents <= 0) fail("Valor inválido.");
    const dueDate = str(fd, "dueDate");
    if (!isIsoDate(dueDate)) fail("Data de vencimento inválida.");
    const inv = await createExtraInvoice(ctx.db, { childId, description, amountCents: amountCents!, dueDate, today: todayIn(ctx.settings.timezone), notes: str(fd, "notes").slice(0, 500) });
    await notify(ctx.db, await guardianUsersOfChild(ctx, childId), { title: `Nova fatura: ${description}`, body: money(inv.totalCents, ctx.settings.currency), href: `${ctx.base}/pais/financeiro` });
    await audit(ctx, "Fatura avulsa criada", { entity: "invoice", entityId: inv.id, details: { numero: inv.number } });
    return { ok: true, redirect: `${ctx.base}/gestao/mensalidades/${inv.id}`, message: `Fatura ${inv.number} criada.` };
  });
}

export async function recordPaymentAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "finance.manage" });
    const invoiceId = str(fd, "invoiceId");
    const amountCents = parseMoney(str(fd, "amount"));
    if (amountCents === null) fail("Valor inválido.");
    const method = str(fd, "method") as PaymentMethod;
    if (!(method in METHOD_LABELS)) fail("Escolha o método de pagamento.");
    const paidAt = str(fd, "paidAt");
    if (!isIsoDate(paidAt) || paidAt > todayIn(ctx.settings.timezone)) fail("Data de pagamento inválida.");
    const proof = file(fd, "proof");
    const saved = proof ? await saveUpload(ctx.institution.id, `payments/${invoiceId}`, proof, { kind: "document", maxMb: 8 }) : null;
    const r = await recordPayment(ctx.db, {
      invoiceId, amountCents: amountCents!, method, reference: str(fd, "reference").slice(0, 120), paidAt, proofPath: saved?.path, userId: ctx.user.id, userName: ctx.user.name,
    });
    await notify(ctx.db, await guardianUsersOfChild(ctx, r.invoice.childId), {
      title: "Pagamento registado", body: `${money(amountCents!, ctx.settings.currency)} · recibo ${r.receipt.number}`, href: `${ctx.base}/pais/financeiro`,
    });
    await audit(ctx, "Pagamento registado", { entity: "payment", entityId: r.payment.id, details: { fatura: r.invoice.number, recibo: r.receipt.number, valor: money(amountCents!, ctx.settings.currency), metodo: METHOD_LABELS[method] } });
    return { ok: true, message: `Pagamento registado. Recibo ${r.receipt.number} emitido.` };
  });
}

export async function reversePaymentAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "finance.manage" });
    const p = await reversePayment(ctx.db, str(fd, "paymentId"), str(fd, "reason"), ctx.user.name);
    await audit(ctx, "Pagamento estornado", { entity: "payment", entityId: p.id, details: { motivo: str(fd, "reason"), valor: money(p.amountCents, ctx.settings.currency) } });
    return { ok: true, message: "Pagamento estornado. O registo e o recibo ficam no histórico como anulados." };
  });
}

export async function voidInvoiceAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "finance.manage" });
    const inv = await voidInvoice(ctx.db, str(fd, "invoiceId"), str(fd, "reason"));
    await audit(ctx, "Fatura anulada", { entity: "invoice", entityId: inv.id, details: { numero: inv.number, motivo: str(fd, "reason") } });
    return { ok: true, message: `Fatura ${inv.number} anulada.` };
  });
}
