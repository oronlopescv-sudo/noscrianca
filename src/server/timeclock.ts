"use server";

import { and, eq, isNull } from "drizzle-orm";
import { t } from "@/db/tenant";
import { isIsoDate, todayIn } from "@/lib/format";
import { HM, nowHM } from "@/lib/timeclock";
import { fail, run, str, type ActionResult } from "@/lib/result";
import { audit, tenantAction, type TenantCtx } from "@/lib/tenant";

type S = ActionResult | null;

function assertEmployee(ctx: TenantCtx): string {
  if (!ctx.employeeId) fail("Só os funcionários podem marcar ponto.");
  return ctx.employeeId!;
}

/** Entrada: o funcionário marca a hora de chegada. */
export async function clockInAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"));
    const employeeId = assertEmployee(ctx);
    const today = todayIn(ctx.settings.timezone);
    const open = await ctx.db.query.timeEntries.findFirst({ where: and(eq(t.timeEntries.employeeId, employeeId), isNull(t.timeEntries.clockOut)) });
    if (open) fail(`Já tem uma entrada aberta desde as ${open.clockIn} de ${open.date.split("-").reverse().join("/")}. Marque primeiro a saída.`);
    const clockIn = nowHM(ctx.settings.timezone);
    await ctx.db.insert(t.timeEntries).values({ employeeId, date: today, clockIn, source: "EMPLOYEE", status: "PENDING" });
    return { ok: true, message: `Entrada marcada às ${clockIn}. Fica à espera de confirmação da direção.` };
  });
}

/** Saída: fecha a entrada aberta do próprio funcionário. */
export async function clockOutAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"));
    const employeeId = assertEmployee(ctx);
    const open = await ctx.db.query.timeEntries.findFirst({ where: and(eq(t.timeEntries.employeeId, employeeId), isNull(t.timeEntries.clockOut)) });
    if (!open) fail("Não tem nenhuma entrada aberta para fechar.");
    const clockOut = nowHM(ctx.settings.timezone);
    if (clockOut <= open!.clockIn) fail(`A saída (${clockOut}) tem de ser depois da entrada (${open!.clockIn}). Peça à direção para corrigir.`);
    await ctx.db.update(t.timeEntries).set({ clockOut }).where(eq(t.timeEntries.id, open!.id));
    return { ok: true, message: `Saída marcada às ${clockOut}.` };
  });
}

async function loadEntry(ctx: TenantCtx, id: string) {
  const e = await ctx.db.query.timeEntries.findFirst({ where: eq(t.timeEntries.id, id) });
  if (!e) fail("Marcação não encontrada.");
  return e!;
}

/** Diretor: confirma ou recusa uma marcação. */
export async function decideTimeEntryAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "payroll.manage", write: true });
    const e = await loadEntry(ctx, str(fd, "entryId"));
    const decision = str(fd, "decision");
    if (decision !== "CONFIRMED" && decision !== "REJECTED") fail("Decisão inválida.");
    if (decision === "CONFIRMED" && !e.clockOut) fail("A marcação ainda não tem saída. Corrija a saída antes de confirmar.");
    await ctx.db.update(t.timeEntries).set({ status: decision, decidedByName: ctx.user.name, decidedAt: new Date() }).where(eq(t.timeEntries.id, e.id));
    await audit(ctx, decision === "CONFIRMED" ? "Ponto confirmado" : "Ponto recusado", { entity: "employee", entityId: e.employeeId, details: { dia: e.date, entrada: e.clockIn, saida: e.clockOut } });
    return { ok: true, message: decision === "CONFIRMED" ? "Marcação confirmada." : "Marcação recusada." };
  });
}

/** Diretor: corrige horas (ou lança uma marcação esquecida) e confirma. */
export async function correctTimeEntryAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "payroll.manage", write: true });
    const e = await loadEntry(ctx, str(fd, "entryId"));
    const clockIn = str(fd, "clockIn");
    const clockOut = str(fd, "clockOut");
    if (!HM.test(clockIn) || !HM.test(clockOut)) fail("Indique as horas no formato HH:MM.");
    if (clockOut <= clockIn) fail("A saída tem de ser depois da entrada.");
    await ctx.db.update(t.timeEntries).set({ clockIn, clockOut, status: "CONFIRMED", decidedByName: ctx.user.name, decidedAt: new Date(), correctedByName: ctx.user.name })
      .where(eq(t.timeEntries.id, e.id));
    await audit(ctx, "Ponto corrigido", { entity: "employee", entityId: e.employeeId, details: { dia: e.date, de: [e.clockIn, e.clockOut], para: [clockIn, clockOut] } });
    return { ok: true, message: "Marcação corrigida e confirmada." };
  });
}

/** Diretor: lança uma marcação que o funcionário não fez no telemóvel. */
export async function addTimeEntryAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "payroll.manage", write: true });
    const employeeId = str(fd, "employeeId");
    const emp = await ctx.db.query.employees.findFirst({ where: eq(t.employees.id, employeeId), with: { user: true } });
    if (!emp) fail("Funcionário não encontrado.");
    const date = str(fd, "date");
    const clockIn = str(fd, "clockIn");
    const clockOut = str(fd, "clockOut");
    if (!isIsoDate(date) || date > todayIn(ctx.settings.timezone)) fail("Data inválida (não pode ser futura).");
    if (!HM.test(clockIn) || !HM.test(clockOut) || clockOut <= clockIn) fail("Indique entrada e saída no formato HH:MM, com a saída depois da entrada.");
    await ctx.db.insert(t.timeEntries).values({ employeeId, date, clockIn, clockOut, status: "CONFIRMED", source: "MANAGER", decidedByName: ctx.user.name, decidedAt: new Date(), correctedByName: ctx.user.name });
    await audit(ctx, "Ponto lançado pela direção", { entity: "employee", entityId: employeeId, details: { funcionario: emp!.user.name, dia: date, entrada: clockIn, saida: clockOut } });
    return { ok: true, message: `Marcação lançada para ${emp!.user.name}.` };
  });
}
