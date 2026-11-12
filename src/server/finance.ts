"use server";

import { after } from "next/server";
import { and, count, eq, inArray, isNull, lt, ne } from "drizzle-orm";
import { t } from "@/db/tenant";
import type { PaymentMethod } from "@/db/tenant/schema";
import { isIsoDate, isPeriod, money, parseMoney, periodLabel, todayIn } from "@/lib/format";
import { bool, fail, file, run, str, type ActionResult } from "@/lib/result";
import { createExtraInvoice, generateMonthlyInvoices, METHOD_LABELS, recordPayment, reversePayment, voidInvoice } from "@/lib/services/finance";
import { mailConfigured, sendMail } from "@/lib/mail";
import { saveUpload } from "@/lib/storage";
import { assertChildAccess, audit, notify, tenantAction, type TenantCtx } from "@/lib/tenant";

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
    const r = await generateMonthlyInvoices(ctx.db, period, todayIn(ctx.settings.timezone), { recreateVoided: true });
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
    await assertChildAccess(ctx, childId);
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

// ======================= GESTÃO RÁPIDA (ficha da criança) =======================

/** Emite a mensalidade de um mês só para uma criança (quando ainda não existe). */
export async function issueChildInvoiceAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "finance.manage" });
    const childId = str(fd, "childId"), period = str(fd, "period");
    if (!isPeriod(period)) fail("Mês inválido.");
    await assertChildAccess(ctx, childId);
    const r = await generateMonthlyInvoices(ctx.db, period, todayIn(ctx.settings.timezone), { recreateVoided: true, childId });
    if (!r.created) fail("Não foi possível emitir: a criança não está ativa, não tem mensalidade atribuída ou já tem fatura neste mês.");
    await audit(ctx, "Mensalidade emitida", { entity: "invoice", details: { mes: period, childId } });
    return { ok: true, message: `Mensalidade de ${periodLabel(period)} emitida.` };
  });
}

/** Marca a fatura como paga: regista o valor em falta e emite o recibo. */
export async function markInvoicePaidAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "finance.manage" });
    const inv = await ctx.db.query.invoices.findFirst({ where: eq(t.invoices.id, str(fd, "invoiceId")) });
    if (!inv) fail("Fatura não encontrada.");
    await assertChildAccess(ctx, inv!.childId);
    const remaining = inv!.totalCents - inv!.paidCents;
    if (inv!.status === "VOID" || remaining <= 0) fail("Esta fatura já está paga ou foi anulada.");
    const method = (str(fd, "method") || "CASH") as PaymentMethod;
    if (!(method in METHOD_LABELS)) fail("Método de pagamento inválido.");
    const r = await recordPayment(ctx.db, {
      invoiceId: inv!.id, amountCents: remaining, method, reference: "", paidAt: todayIn(ctx.settings.timezone), userId: ctx.user.id, userName: ctx.user.name,
    });
    await notify(ctx.db, await guardianUsersOfChild(ctx, inv!.childId), {
      title: "Pagamento registado", body: `${money(remaining, ctx.settings.currency)} · recibo ${r.receipt.number}`, href: `${ctx.base}/pais/financeiro`,
    });
    await audit(ctx, "Fatura marcada como paga", { entity: "payment", entityId: r.payment.id, details: { fatura: inv!.number, recibo: r.receipt.number, valor: money(remaining, ctx.settings.currency), metodo: METHOD_LABELS[method] } });
    return { ok: true, message: `Marcada como paga. Recibo ${r.receipt.number} emitido.` };
  });
}

/** Marca a fatura como não paga: estorna os pagamentos (ficam no histórico como anulados). */
export async function markInvoiceUnpaidAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "finance.manage" });
    const inv = await ctx.db.query.invoices.findFirst({ where: eq(t.invoices.id, str(fd, "invoiceId")), with: { payments: { where: isNull(t.payments.reversedAt) } } });
    if (!inv) fail("Fatura não encontrada.");
    await assertChildAccess(ctx, inv!.childId);
    if (!inv!.payments.length) fail("Esta fatura não tem pagamentos.");
    for (const p of inv!.payments) await reversePayment(ctx.db, p.id, "Marcada como não paga", ctx.user.name);
    await audit(ctx, "Fatura marcada como não paga", { entity: "invoice", entityId: inv!.id, details: { numero: inv!.number, pagamentosEstornados: inv!.payments.length } });
    return { ok: true, message: "Marcada como não paga. Os pagamentos ficam no histórico como estornados." };
  });
}

/** Botão de cobrança: avisa os encarregados por email e na aplicação. */
export async function sendPaymentReminderAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "finance.manage" });
    const inv = await ctx.db.query.invoices.findFirst({ where: eq(t.invoices.id, str(fd, "invoiceId")), with: { child: true } });
    if (!inv) fail("Fatura não encontrada.");
    await assertChildAccess(ctx, inv!.childId);
    const owed = inv!.totalCents - inv!.paidCents;
    if (inv!.status === "VOID" || owed <= 0) fail("Esta fatura não tem valor em dívida.");
    const rows = await ctx.db.select({ userId: t.users.id, name: t.users.name, email: t.users.email, status: t.users.status, deletedAt: t.users.deletedAt })
      .from(t.childGuardians)
      .innerJoin(t.guardians, eq(t.guardians.id, t.childGuardians.guardianId))
      .innerJoin(t.users, eq(t.users.id, t.guardians.userId))
      .where(eq(t.childGuardians.childId, inv!.childId));
    const recipients = rows.filter((r) => r.status !== "SUSPENDED" && !r.deletedAt && r.email);
    if (!recipients.length) fail("Esta criança não tem encarregados com email para avisar.");
    const due = money(owed, ctx.settings.currency);
    const today = todayIn(ctx.settings.timezone);
    const late = inv!.dueDate < today;
    const s = ctx.settings;
    let mailed = 0;
    if (mailConfigured()) {
      for (const g of recipients) {
        const ok = await sendMail({
          to: g.email, replyTo: s.email || undefined,
          subject: `${late ? "Pagamento em atraso" : "Pagamento por regularizar"}: ${inv!.child.firstName} (fatura ${inv!.number})`,
          text: [
            `Olá ${g.name},`, "",
            `A fatura ${inv!.number} de ${inv!.child.firstName} ${late ? "está em atraso" : "aguarda pagamento"}.`,
            `Valor em falta: ${due}. Vencimento: ${inv!.dueDate.split("-").reverse().join("/")}.`, "",
            s.paymentInfo ? `Como pagar:\n${s.paymentInfo}` : "Contacte a creche para saber como pagar.", "",
            "Se já pagou, pode ignorar esta mensagem. Obrigado.", s.name,
          ].join("\n"),
        });
        if (ok) mailed++;
      }
    }
    await notify(ctx.db, recipients.filter((r) => r.status === "ACTIVE").map((r) => r.userId), {
      title: `Fatura ${inv!.number} por pagar`, body: `Valor em falta: ${due}`, href: `${ctx.base}/pais/financeiro`,
    });
    await audit(ctx, "Cobrança enviada", { entity: "invoice", entityId: inv!.id, details: { numero: inv!.number, emails: mailed, destinatarios: recipients.length } });
    if (!mailConfigured()) return { ok: true, message: "Aviso enviado na aplicação. O email não está configurado no servidor, por isso não foi enviado email." };
    if (mailed < recipients.length) return { ok: true, message: `Aviso enviado: ${mailed} de ${recipients.length} email(s) entregues ao serviço de envio.` };
    return { ok: true, message: `Cobrança enviada por email a ${mailed} encarregado(s).` };
  });
}

/** Cobrança em lote: avisa os encarregados de TODAS as faturas em atraso. Os emails seguem depois da resposta. */
export async function sendBulkRemindersAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "finance.manage" });
    const today = todayIn(ctx.settings.timezone);
    const overdue = await ctx.db.query.invoices.findMany({
      where: and(inArray(t.invoices.status, ["OPEN", "PARTIAL"]), isNull(t.invoices.voidedAt), lt(t.invoices.dueDate, today)), with: { child: true },
    });
    if (!overdue.length) fail("Não há faturas em atraso.");
    const s = ctx.settings;
    const mails: { to: string; subject: string; text: string }[] = [];
    let families = 0;
    for (const inv of overdue) {
      const rows = await ctx.db.select({ userId: t.users.id, name: t.users.name, email: t.users.email, status: t.users.status, deletedAt: t.users.deletedAt })
        .from(t.childGuardians)
        .innerJoin(t.guardians, eq(t.guardians.id, t.childGuardians.guardianId))
        .innerJoin(t.users, eq(t.users.id, t.guardians.userId))
        .where(eq(t.childGuardians.childId, inv.childId));
      const recipients = rows.filter((r) => r.status !== "SUSPENDED" && !r.deletedAt);
      if (!recipients.length) continue;
      families++;
      const due = money(inv.totalCents - inv.paidCents, s.currency);
      await notify(ctx.db, recipients.filter((r) => r.status === "ACTIVE").map((r) => r.userId), {
        title: `Fatura ${inv.number} em atraso`, body: `Valor em falta: ${due}`, href: `${ctx.base}/pais/financeiro`,
      });
      for (const g of recipients.filter((r) => r.email)) {
        mails.push({
          to: g.email, subject: `Pagamento em atraso: ${inv.child.firstName} (fatura ${inv.number})`,
          text: [
            `Olá ${g.name},`, "", `A fatura ${inv.number} de ${inv.child.firstName} está em atraso.`,
            `Valor em falta: ${due}. Vencimento: ${inv.dueDate.split("-").reverse().join("/")}.`, "",
            s.paymentInfo ? `Como pagar:\n${s.paymentInfo}` : "Contacte a creche para saber como pagar.", "",
            "Se já pagou, pode ignorar esta mensagem. Obrigado.", s.name,
          ].join("\n"),
        });
      }
    }
    const configured = mailConfigured();
    if (configured && mails.length) {
      const replyTo = s.email || undefined;
      after(async () => {
        let sent = 0;
        for (const m of mails) if (await sendMail({ ...m, replyTo })) sent++;
        if (sent < mails.length) console.error(`[cobrança em lote] ${mails.length - sent} de ${mails.length} emails falharam`);
      });
    }
    await audit(ctx, "Cobrança em lote enviada", { entity: "invoice", details: { faturas: overdue.length, familias: families, emails: configured ? mails.length : 0 } });
    return { ok: true, message: `Cobrança enviada para ${families} de ${overdue.length} fatura(s) em atraso.${configured ? ` A enviar ${mails.length} email(s).` : " O email não está configurado no servidor: seguiu só o aviso na aplicação."}` };
  });
}
