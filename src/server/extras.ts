"use server";

import { and, count, eq } from "drizzle-orm";
import { t } from "@/db/tenant";
import type { PaymentMethod } from "@/db/tenant/schema";
import { isIsoDate, money, parseMoney, todayIn } from "@/lib/format";
import { fail, file, run, str, type ActionResult } from "@/lib/result";
import { METHOD_LABELS, recordPayment } from "@/lib/services/finance";
import { saveUpload } from "@/lib/storage";
import { assertChildAccess, audit, notify, staffWithPermission, tenantAction } from "@/lib/tenant";

type S = ActionResult | null;

// ======================= PEDIDOS DE INSCRIÇÃO =======================
export async function setEnrollmentStatusAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "children.manage" });
    const status = str(fd, "status");
    if (!["NEW", "CONTACTED", "CLOSED"].includes(status)) fail("Estado inválido.");
    const [row] = await ctx.db.update(t.enrollmentRequests).set({ status, handledByName: ctx.user.name }).where(eq(t.enrollmentRequests.id, str(fd, "id"))).returning();
    if (!row) fail("Pedido não encontrado.");
    await audit(ctx, "Pedido de inscrição atualizado", { entity: "enrollmentRequest", entityId: row.id, details: { crianca: row.childName, estado: status } });
    return { ok: true, message: "Pedido atualizado." };
  });
}

// ======================= COMPROVATIVOS DE PAGAMENTO =======================
/** O encarregado envia o comprovativo (foto ou PDF) de uma fatura dos seus filhos. */
export async function submitPaymentProofAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { panel: "GUARDIAN" });
    const inv = await ctx.db.query.invoices.findFirst({ where: eq(t.invoices.id, str(fd, "invoiceId")), with: { child: true } });
    if (!inv) fail("Fatura não encontrada.");
    await assertChildAccess(ctx, inv!.childId);
    if (inv!.status !== "OPEN" && inv!.status !== "PARTIAL") fail("Esta fatura já está paga ou foi anulada.");
    const f = file(fd, "proof");
    if (!f) fail("Escolha o comprovativo (foto ou PDF).");
    const [{ n }] = await ctx.db.select({ n: count() }).from(t.paymentProofs).where(and(eq(t.paymentProofs.invoiceId, inv!.id), eq(t.paymentProofs.status, "PENDING")));
    if (n >= 3) fail("Já existem comprovativos por confirmar para esta fatura. Aguarde a resposta da creche.");
    const saved = await saveUpload(ctx.institution.id, `proofs/${inv!.id}`, f!, { kind: "document", maxMb: 8 });
    await ctx.db.insert(t.paymentProofs).values({ invoiceId: inv!.id, userId: ctx.user.id, userName: ctx.user.name, path: saved.path, note: str(fd, "note").slice(0, 300) });
    await notify(ctx.db, await staffWithPermission(ctx.db, "finance.manage"), {
      title: "Comprovativo de pagamento recebido", body: `${inv!.child.firstName} · fatura ${inv!.number} · enviado por ${ctx.user.name}`, href: `${ctx.base}/gestao/mensalidades`,
    });
    return { ok: true, message: "Comprovativo enviado. A creche vai confirmar o pagamento." };
  });
}

/** A direção confirma (regista o pagamento e emite o recibo) ou recusa um comprovativo. */
export async function reviewPaymentProofAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "finance.manage" });
    const proof = await ctx.db.query.paymentProofs.findFirst({ where: eq(t.paymentProofs.id, str(fd, "proofId")), with: { invoice: true } });
    if (!proof) fail("Comprovativo não encontrado.");
    if (proof!.status !== "PENDING") fail("Este comprovativo já foi tratado.");
    const inv = proof!.invoice;
    const reviewed = { reviewedByName: ctx.user.name, reviewedAt: new Date() };

    if (str(fd, "decision") !== "ACCEPT") {
      const reason = str(fd, "reason").slice(0, 300);
      if (reason.length < 3) fail("Indique o motivo da recusa, para o encarregado saber o que corrigir.");
      await ctx.db.update(t.paymentProofs).set({ status: "REJECTED", reviewNote: reason, ...reviewed }).where(eq(t.paymentProofs.id, proof!.id));
      await notify(ctx.db, [proof!.userId], { title: `Comprovativo recusado (fatura ${inv.number})`, body: reason, href: `${ctx.base}/pais/financeiro` });
      await audit(ctx, "Comprovativo de pagamento recusado", { entity: "invoice", entityId: inv.id, details: { fatura: inv.number, motivo: reason } });
      return { ok: true, message: "Comprovativo recusado. O encarregado foi avisado." };
    }

    const remaining = inv.totalCents - inv.paidCents;
    if (inv.status === "VOID" || remaining <= 0) fail("Esta fatura já não tem valor em dívida. Recuse o comprovativo.");
    const raw = str(fd, "amount");
    const amountCents = raw ? parseMoney(raw) : remaining;
    if (amountCents === null || amountCents <= 0) fail("Valor inválido.");
    const method = (str(fd, "method") || "TRANSFER") as PaymentMethod;
    if (!(method in METHOD_LABELS)) fail("Forma de pagamento inválida.");
    const today = todayIn(ctx.settings.timezone);
    const paidAt = str(fd, "paidAt") || today;
    if (!isIsoDate(paidAt) || paidAt > today) fail("Data de pagamento inválida.");
    const r = await recordPayment(ctx.db, {
      invoiceId: inv.id, amountCents: amountCents!, method, reference: "Comprovativo enviado pelo encarregado", paidAt, proofPath: proof!.path, userId: ctx.user.id, userName: ctx.user.name,
    });
    await ctx.db.update(t.paymentProofs).set({ status: "ACCEPTED", ...reviewed }).where(eq(t.paymentProofs.id, proof!.id));
    const value = money(amountCents!, ctx.settings.currency);
    await notify(ctx.db, [proof!.userId], { title: "Pagamento confirmado", body: `${value} · recibo ${r.receipt.number}`, href: `${ctx.base}/pais/financeiro` });
    await audit(ctx, "Comprovativo confirmado e pagamento registado", { entity: "payment", entityId: r.payment.id, details: { fatura: inv.number, recibo: r.receipt.number, valor: value } });
    return { ok: true, message: `Pagamento de ${value} registado. Recibo ${r.receipt.number} emitido.` };
  });
}

// ======================= AGENDA =======================
export async function saveEventAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "announcements.manage" });
    const title = str(fd, "title");
    if (title.length < 2 || title.length > 120) fail("Indique o título (2 a 120 caracteres).");
    const date = str(fd, "date"), endDate = str(fd, "endDate") || null;
    if (!isIsoDate(date)) fail("Data inválida.");
    if (endDate && (!isIsoDate(endDate) || endDate < date)) fail("A data de fim não pode ser anterior à de início.");
    const audience = str(fd, "audience") || "ALL";
    if (!["ALL", "GUARDIANS", "STAFF"].includes(audience)) fail("Destinatários inválidos.");
    const classroomId = str(fd, "classroomId") || null;
    if (classroomId && !(await ctx.db.query.classrooms.findFirst({ where: eq(t.classrooms.id, classroomId) }))) fail("Turma inválida.");
    if (ctx.classroomIds !== null && (!classroomId || !ctx.classroomIds.includes(classroomId))) fail("Só pode criar eventos para as suas turmas.");
    const [ev] = await ctx.db.insert(t.events).values({ title, description: str(fd, "description").slice(0, 1000), date, endDate, classroomId, audience, createdByName: ctx.user.name }).returning();
    await audit(ctx, "Evento adicionado à agenda", { entity: "event", entityId: ev.id, details: { titulo: title, data: date } });
    return { ok: true, message: "Evento adicionado à agenda." };
  });
}

export async function deleteEventAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "announcements.manage" });
    const [row] = await ctx.db.delete(t.events).where(eq(t.events.id, str(fd, "id"))).returning();
    if (!row) fail("Evento não encontrado.");
    await audit(ctx, "Evento removido da agenda", { entity: "event", details: { titulo: row.title } });
    return { ok: true, message: "Evento removido." };
  });
}

// ======================= FÉRIAS E FALTAS DA EQUIPA =======================
const LEAVE_TYPES = ["VACATION", "SICK", "OTHER"];

/** O funcionário pede férias ou comunica uma falta (sempre em nome próprio). */
export async function requestLeaveAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"));
    if (ctx.isGuardian || !ctx.employeeId) fail("Só os funcionários podem fazer este pedido.");
    if (ctx.impersonating) fail("Indisponível numa sessão de suporte.");
    const type = str(fd, "type");
    if (!LEAVE_TYPES.includes(type)) fail("Tipo de pedido inválido.");
    const startDate = str(fd, "startDate"), endDate = str(fd, "endDate") || startDate;
    if (!isIsoDate(startDate) || !isIsoDate(endDate)) fail("Datas inválidas.");
    if (endDate < startDate) fail("A data de fim não pode ser anterior à de início.");
    const days = Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000) + 1;
    if (days > 90) fail("O pedido não pode ter mais de 90 dias.");
    const [{ n }] = await ctx.db.select({ n: count() }).from(t.staffLeaves).where(and(eq(t.staffLeaves.employeeId, ctx.employeeId!), eq(t.staffLeaves.status, "PENDING")));
    if (n >= 5) fail("Tem demasiados pedidos por decidir. Aguarde a resposta da direção.");
    await ctx.db.insert(t.staffLeaves).values({ employeeId: ctx.employeeId!, type, startDate, endDate, notes: str(fd, "notes").slice(0, 300) });
    const others = (await staffWithPermission(ctx.db, "employees.manage")).filter((id) => id !== ctx.user.id);
    await notify(ctx.db, others, { title: `Pedido de ${type === "VACATION" ? "férias" : "falta"}: ${ctx.user.name}`, body: `${startDate.split("-").reverse().join("/")} a ${endDate.split("-").reverse().join("/")}`, href: `${ctx.base}/gestao/funcionarios` });
    return { ok: true, message: "Pedido enviado à direção." };
  });
}

/** O funcionário cancela um pedido seu que ainda não foi decidido. */
export async function cancelLeaveAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"));
    if (!ctx.employeeId) fail("Pedido não encontrado.");
    const [row] = await ctx.db.delete(t.staffLeaves)
      .where(and(eq(t.staffLeaves.id, str(fd, "id")), eq(t.staffLeaves.employeeId, ctx.employeeId!), eq(t.staffLeaves.status, "PENDING"))).returning();
    if (!row) fail("Só pode cancelar pedidos seus que ainda não foram decididos.");
    return { ok: true, message: "Pedido cancelado." };
  });
}

/** A direção aprova ou recusa um pedido. */
export async function decideLeaveAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "employees.manage" });
    const status = str(fd, "decision") === "APPROVE" ? "APPROVED" : "REJECTED";
    const leave = await ctx.db.query.staffLeaves.findFirst({ where: eq(t.staffLeaves.id, str(fd, "id")), with: { employee: { with: { user: true } } } });
    if (!leave) fail("Pedido não encontrado.");
    if (leave!.employee.userId === ctx.user.id && !ctx.isDirector) fail("Não pode decidir o seu próprio pedido.");
    await ctx.db.update(t.staffLeaves).set({ status, decidedByName: ctx.user.name, decidedAt: new Date() }).where(eq(t.staffLeaves.id, leave!.id));
    const range = `${leave!.startDate.split("-").reverse().join("/")} a ${leave!.endDate.split("-").reverse().join("/")}`;
    if (leave!.employee.user.status === "ACTIVE") {
      await notify(ctx.db, [leave!.employee.userId], { title: status === "APPROVED" ? "Pedido aprovado" : "Pedido recusado", body: range, href: `${ctx.base}/perfil#ferias` });
    }
    await audit(ctx, status === "APPROVED" ? "Férias/falta aprovada" : "Férias/falta recusada", { entity: "staffLeave", entityId: leave!.id, details: { funcionario: leave!.employee.user.name, periodo: range } });
    return { ok: true, message: status === "APPROVED" ? "Pedido aprovado." : "Pedido recusado." };
  });
}
