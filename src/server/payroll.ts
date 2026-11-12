"use server";

import { and, eq, isNull } from "drizzle-orm";
import { t } from "@/db/tenant";
import type { PaymentMethod } from "@/db/tenant/schema";
import { isIsoDate, isPeriod, money, parseMoney, periodLabel, todayIn } from "@/lib/format";
import { fail, run, str, type ActionResult } from "@/lib/result";
import { METHOD_LABELS } from "@/lib/services/finance";
import { audit, notify, tenantAction } from "@/lib/tenant";

type S = ActionResult | null;

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
    const raw = str(fd, "amount");
    const amountCents = raw ? parseMoney(raw) : emp!.salaryCents;
    if (amountCents === null || amountCents === undefined || amountCents <= 0) fail("Indique o valor pago (ou defina primeiro o salário base).");
    const method = (str(fd, "method") || "TRANSFER") as PaymentMethod;
    if (!(method in METHOD_LABELS)) fail("Forma de pagamento inválida.");
    const today = todayIn(ctx.settings.timezone);
    const paidAt = str(fd, "paidAt") || today;
    if (!isIsoDate(paidAt) || paidAt > today) fail("Data de pagamento inválida.");
    const existing = await ctx.db.query.salaryPayments.findFirst({ where: and(eq(t.salaryPayments.employeeId, emp!.id), eq(t.salaryPayments.period, period), isNull(t.salaryPayments.voidedAt)) });
    if (existing) fail(`O salário de ${periodLabel(period)} já está marcado como pago.`);
    const [pay] = await ctx.db.insert(t.salaryPayments).values({
      employeeId: emp!.id, period, amountCents: amountCents!, paidAt, method, notes: str(fd, "notes").slice(0, 300), recordedById: ctx.user.id, recordedByName: ctx.user.name,
    }).returning();
    const value = money(amountCents!, ctx.settings.currency);
    if (emp!.user.status === "ACTIVE") await notify(ctx.db, [emp!.userId], { title: `Salário de ${periodLabel(period)} pago`, body: value, href: `${ctx.base}/perfil` });
    await audit(ctx, "Salário pago", { entity: "salaryPayment", entityId: pay.id, details: { funcionario: emp!.user.name, mes: period, valor: value, metodo: METHOD_LABELS[method] } });
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
