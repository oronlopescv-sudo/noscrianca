"use server";

import { and, eq, isNull } from "drizzle-orm";
import { t } from "@/db/tenant";
import type { PaymentMethod } from "@/db/tenant/schema";
import { isIsoDate, isPeriod, money, parseMoney, periodLabel, todayIn } from "@/lib/format";
import { mailConfigured, sendMail } from "@/lib/mail";
import { bool, fail, run, str, type ActionResult } from "@/lib/result";
import { absenceDiscountCents } from "@/lib/payslip";
import { METHOD_LABELS } from "@/lib/services/finance";
import { countDeductibleAbsences } from "@/lib/services/staff-absences";
import { salaryReceiptPdf } from "@/lib/services/tenant-pdf";
import { audit, notify, tenantAction, type TenantCtx } from "@/lib/tenant";

type S = ActionResult | null;

/** Envia o recibo de vencimento (PDF em anexo) ao funcionário. Devolve a frase que descreve o resultado. */
async function deliverSalaryReceipt(ctx: TenantCtx, paymentId: string): Promise<string> {
  const doc = await salaryReceiptPdf(ctx.db, ctx.settings, paymentId);
  if (!doc) fail("Pagamento não encontrado.");
  const { employee: emp, payment: p, number, bytes } = doc!;
  if (p.voidedAt) fail("Este pagamento foi anulado.");
  const value = money(p.amountCents, ctx.settings.currency);
  if (emp.user.status === "ACTIVE") {
    await notify(ctx.db, [emp.userId], { title: `Recibo de vencimento de ${periodLabel(p.period)}`, body: `${value} · ${number}`, href: `${ctx.base}/perfil#salarios` });
  }
  if (!mailConfigured()) return "O recibo fica disponível no perfil do funcionário. O email não está configurado no servidor, por isso não foi enviado email.";
  const s = ctx.settings;
  const ok = await sendMail({
    to: emp.user.email, replyTo: s.email || undefined,
    subject: `${s.name}: recibo de vencimento de ${periodLabel(p.period)}`,
    text: [`Olá ${emp.user.name},`, "", `Segue em anexo o recibo de vencimento de ${periodLabel(p.period)}.`, `Valor pago: ${value}. Data do pagamento: ${p.paidAt.split("-").reverse().join("/")}.`, "", s.name].join("\n"),
    attachments: [{ filename: `recibo-vencimento-${number}.pdf`, content: bytes }],
  });
  await audit(ctx, ok ? "Recibo de vencimento enviado por email" : "Falha no envio do recibo de vencimento", { entity: "salaryPayment", entityId: p.id, details: { funcionario: emp.user.name, mes: p.period } });
  return ok ? `Recibo enviado por email para ${emp.user.email}.` : "Não foi possível enviar o email. O recibo fica disponível no perfil do funcionário.";
}

/** Reenvia o recibo de vencimento de um pagamento já lançado. */
export async function sendSalaryReceiptAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "payroll.manage" });
    return { ok: true, message: await deliverSalaryReceipt(ctx, str(fd, "paymentId")) };
  });
}

/** Define o salário mensal base de um funcionário. */
export async function setSalaryAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "payroll.manage" });
    const raw = str(fd, "salary");
    const salaryCents = raw ? parseMoney(raw) : null;
    if (raw && (salaryCents === null || salaryCents <= 0)) fail("Salário inválido.");
    const [emp] = await ctx.db.update(t.employees).set({ salaryCents }).where(eq(t.employees.id, str(fd, "employeeId"))).returning();
    if (!emp) fail("Funcionário não encontrado.");
    await audit(ctx, "Salário definido", { entity: "employee", entityId: emp.id, details: { salario: salaryCents === null ? "removido" : money(salaryCents, ctx.settings.currency) } });
    return { ok: true, message: "Salário guardado." };
  });
}

/** Marca o salário de um mês como pago (um pagamento válido por funcionário e mês). */
export async function paySalaryAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "payroll.manage" });
    const period = str(fd, "period");
    if (!isPeriod(period)) fail("Mês inválido.");
    const emp = await ctx.db.query.employees.findFirst({ where: eq(t.employees.id, str(fd, "employeeId")), with: { user: true } });
    if (!emp) fail("Funcionário não encontrado.");
    // Desconto automático: 1/30 do salário base por cada falta que desconta neste mês.
    const baseCents = emp!.salaryCents ?? null;
    const absentDays = await countDeductibleAbsences(ctx.db, emp!.id, period);
    const discountCents = baseCents !== null ? absenceDiscountCents(baseCents, absentDays) : 0;
    const raw = str(fd, "amount");
    const amountCents = raw ? parseMoney(raw) : baseCents !== null ? baseCents - discountCents : null;
    if (amountCents === null || amountCents === undefined || amountCents <= 0) fail("Indique o valor pago (ou defina primeiro o salário base).");
    const method = (str(fd, "method") || "TRANSFER") as PaymentMethod;
    if (!(method in METHOD_LABELS)) fail("Forma de pagamento inválida.");
    const today = todayIn(ctx.settings.timezone);
    const paidAt = str(fd, "paidAt") || today;
    if (!isIsoDate(paidAt) || paidAt > today) fail("Data de pagamento inválida.");
    const existing = await ctx.db.query.salaryPayments.findFirst({ where: and(eq(t.salaryPayments.employeeId, emp!.id), eq(t.salaryPayments.period, period), isNull(t.salaryPayments.voidedAt)) });
    if (existing) fail(`O salário de ${periodLabel(period)} já está marcado como pago.`);
    const [pay] = await ctx.db.insert(t.salaryPayments).values({
      employeeId: emp!.id, period, amountCents: amountCents!, baseCents, absentDays, absenceDiscountCents: discountCents,
      paidAt, method, notes: str(fd, "notes").slice(0, 300), recordedById: ctx.user.id, recordedByName: ctx.user.name,
    }).returning();
    const value = money(amountCents!, ctx.settings.currency);
    await audit(ctx, "Salário pago", { entity: "salaryPayment", entityId: pay.id, details: { funcionario: emp!.user.name, mes: period, valor: value, metodo: METHOD_LABELS[method] } });
    if (bool(fd, "sendReceipt")) {
      return { ok: true, message: `Salário de ${periodLabel(period)} lançado (${value}). ${await deliverSalaryReceipt(ctx, pay.id)}` };
    }
    if (emp!.user.status === "ACTIVE") await notify(ctx.db, [emp!.userId], { title: `Salário de ${periodLabel(period)} pago`, body: value, href: `${ctx.base}/perfil#salarios` });
    return { ok: true, message: `Salário de ${periodLabel(period)} marcado como pago (${value}).` };
  });
}

/** Anula o pagamento de um mês (fica no histórico; o mês volta a "não pago"). */
export async function voidSalaryPaymentAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "payroll.manage" });
    const [pay] = await ctx.db.update(t.salaryPayments).set({ voidedAt: new Date(), voidedByName: ctx.user.name })
      .where(and(eq(t.salaryPayments.id, str(fd, "paymentId")), isNull(t.salaryPayments.voidedAt))).returning();
    if (!pay) fail("Pagamento não encontrado ou já anulado.");
    await audit(ctx, "Pagamento de salário anulado", { entity: "salaryPayment", entityId: pay.id, details: { mes: pay.period, valor: money(pay.amountCents, ctx.settings.currency) } });
    return { ok: true, message: `Pagamento de ${periodLabel(pay.period)} anulado. O mês volta a não pago.` };
  });
}
