"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { t } from "@/db/tenant";
import { isIsoDate, periodLabel, todayIn } from "@/lib/format";
import { bool, fail, run, str, type ActionResult } from "@/lib/result";
import { dateRange } from "@/lib/date-range";
import { audit, tenantAction, type TenantCtx } from "@/lib/tenant";

type S = ActionResult | null;

/** Dias úteis (segunda a sexta): uma creche fechada ao fim de semana não regista faltas lá. */
function isWeekday(dateIso: string): boolean {
  const dow = new Date(`${dateIso}T00:00:00Z`).getUTCDay();
  return dow >= 1 && dow <= 5;
}

/** Um mês já pago não muda de faltas: o recibo deixaria de bater certo com o registo. */
async function assertMonthsOpen(ctx: TenantCtx, employeeId: string, months: string[]) {
  const [paid] = await ctx.db.select({ period: t.salaryPayments.period }).from(t.salaryPayments)
    .where(and(eq(t.salaryPayments.employeeId, employeeId), isNull(t.salaryPayments.voidedAt), inArray(t.salaryPayments.period, months)))
    .limit(1);
  if (paid) fail(`O salário de ${periodLabel(paid.period)} já está pago. Anule o pagamento antes de alterar as faltas desse mês.`);
}

/** Regista faltas de um funcionário: um dia, ou vários dias seguidos já passados. */
export async function registerStaffAbsenceAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "payroll.manage" });
    const emp = await ctx.db.query.employees.findFirst({ where: eq(t.employees.id, str(fd, "employeeId")), with: { user: true } });
    if (!emp || emp.user.deletedAt) fail("Funcionário não encontrado.");
    const today = todayIn(ctx.settings.timezone);
    const from = str(fd, "date") || today;
    const to = str(fd, "endDate") || from;
    if (!isIsoDate(from) || !isIsoDate(to) || to < from) fail("Datas inválidas.");
    if (to > today) fail("Não é possível registar faltas em datas futuras.");
    const days = dateRange(from, to).filter(isWeekday); // as creches fecham ao fim de semana: uma baixa ao sábado não é falta
    if (days.length > 31) fail("Registe no máximo 31 dias de cada vez.");
    await assertMonthsOpen(ctx, emp!.id, [...new Set(days.map((d) => d.slice(0, 7)))]);
    const deductible = bool(fd, "deductible");
    const reason = str(fd, "reason").slice(0, 200);
    const rows = await ctx.db.insert(t.staffAbsences)
      .values(days.map((date) => ({ employeeId: emp!.id, date, deductible, reason, recordedByName: ctx.user.name })))
      .onConflictDoNothing({ target: [t.staffAbsences.employeeId, t.staffAbsences.date] })
      .returning({ id: t.staffAbsences.id });
    if (rows.length === 0) fail("Esses dias já têm falta registada.");
    await audit(ctx, "Falta da equipa registada", {
      entity: "employee", entityId: emp!.id,
      details: { funcionario: emp!.user.name, de: from, ate: to, dias: rows.length, desconta: deductible, motivo: reason },
    });
    const skipped = days.length - rows.length;
    return { ok: true, message: `${rows.length} falta(s) registada(s) para ${emp!.user.name}.${skipped ? ` ${skipped} dia(s) já tinham falta.` : ""}` };
  });
}

/** Remove uma falta lançada por engano (só se o mês ainda não estiver pago). */
export async function removeStaffAbsenceAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "payroll.manage" });
    const row = await ctx.db.query.staffAbsences.findFirst({ where: eq(t.staffAbsences.id, str(fd, "id")), with: { employee: { with: { user: true } } } });
    if (!row) fail("Falta não encontrada.");
    await assertMonthsOpen(ctx, row!.employeeId, [row!.date.slice(0, 7)]);
    await ctx.db.delete(t.staffAbsences).where(eq(t.staffAbsences.id, row!.id));
    await audit(ctx, "Falta da equipa removida", { entity: "employee", entityId: row!.employeeId, details: { funcionario: row!.employee.user.name, data: row!.date } });
    return { ok: true, message: "Falta removida." };
  });
}
