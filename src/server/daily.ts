"use server";

import { and, eq, inArray } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { t } from "@/db/tenant";
import type { DiaryType } from "@/db/tenant/schema";
import { fmtTime, isIsoDate, todayIn } from "@/lib/format";
import { bool, fail, file, run, str, type ActionResult } from "@/lib/result";
import { deleteTenantFile, saveUpload } from "@/lib/storage";
import { assertChildAccess, childScope, tenantAction, type TenantCtx } from "@/lib/tenant";

type S = ActionResult | null;

/** Presença já registada neste dia (se existir). Evita sobrepor horas registadas sem aviso. */
async function todayRow(ctx: TenantCtx, childId: string, date: string) {
  return ctx.db.query.attendance.findFirst({ where: and(eq(t.attendance.childId, childId), eq(t.attendance.date, date)) });
}

const DIARY_TYPES: DiaryType[] = ["MEAL", "SLEEP", "HYGIENE", "ACTIVITY", "INCIDENT", "NOTE", "PHOTO"];

function attendanceDate(ctx: TenantCtx, raw: string): string {
  const today = todayIn(ctx.settings.timezone);
  const date = raw || today;
  if (!isIsoDate(date) || date > today) fail("Data inválida.");
  // No painel de sala só se regista o próprio dia.
  if (ctx.panel === "CLASSROOM" && date !== today) fail("Só é possível registar presenças do dia de hoje.");
  return date;
}

/** Hora do registo: agora (hoje) ou a hora indicada para correções de dias anteriores. */
function moment(date: string, time: string, ctx: TenantCtx): Date {
  if (!time) return date === todayIn(ctx.settings.timezone) ? new Date() : new Date(`${date}T12:00:00Z`);
  if (!/^\d{2}:\d{2}$/.test(time)) fail("Hora inválida.");
  // Converte a hora local da instituição para UTC.
  const guess = new Date(`${date}T${time}:00Z`);
  const local = new Intl.DateTimeFormat("en-GB", { timeZone: ctx.settings.timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(guess);
  const [lh, lm] = local.split(":").map(Number);
  const [h, m] = time.split(":").map(Number);
  let diff = (h * 60 + m) - (lh * 60 + lm);
  if (diff > 720) diff -= 1440;
  if (diff < -720) diff += 1440;
  return new Date(guess.getTime() + diff * 60_000);
}

async function activeChild(ctx: TenantCtx, childId: string) {
  await assertChildAccess(ctx, childId);
  const child = await ctx.db.query.children.findFirst({ where: eq(t.children.id, childId) });
  if (!child || child.status !== "ACTIVE") fail("Esta criança não está ativa.");
  return child!;
}

export async function checkInAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "attendance.record" });
    const child = await activeChild(ctx, str(fd, "childId"));
    const date = attendanceDate(ctx, str(fd, "date"));
    const prev = await todayRow(ctx, child.id, date);
    if (prev?.checkInAt) fail(`${child.firstName} já tem entrada registada às ${fmtTime(prev.checkInAt, ctx.settings.timezone)}. Para corrigir, limpe a presença primeiro.`);
    const at = moment(date, str(fd, "time"), ctx);
    const values = { status: "PRESENT" as const, checkInAt: at, checkInBy: ctx.user.name, droppedBy: str(fd, "droppedBy").slice(0, 120), absenceReason: "" };
    await ctx.db.insert(t.attendance).values({ childId: child.id, date, ...values })
      .onConflictDoUpdate({ target: [t.attendance.childId, t.attendance.date], set: values });
    return { ok: true, message: `Entrada de ${child.firstName} registada.` };
  });
}

export async function checkOutAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "attendance.record" });
    const child = await activeChild(ctx, str(fd, "childId"));
    const date = attendanceDate(ctx, str(fd, "date"));
    const row = await ctx.db.query.attendance.findFirst({ where: and(eq(t.attendance.childId, child.id), eq(t.attendance.date, date)) });
    if (!row || row.status !== "PRESENT" || !row.checkInAt) fail("Registe primeiro a entrada.");
    if (row.checkOutAt) fail(`${child.firstName} já tem saída registada às ${fmtTime(row.checkOutAt, ctx.settings.timezone)}. Para corrigir, limpe a presença primeiro.`);
    const at = moment(date, str(fd, "time"), ctx);
    if (at < row!.checkInAt!) fail("A saída não pode ser anterior à entrada.");
    await ctx.db.update(t.attendance).set({ checkOutAt: at, checkOutBy: ctx.user.name, pickedBy: str(fd, "pickedBy").slice(0, 120) }).where(eq(t.attendance.id, row!.id));
    return { ok: true, message: `Saída de ${child.firstName} registada.` };
  });
}

export async function markAbsentAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "attendance.record" });
    const child = await activeChild(ctx, str(fd, "childId"));
    const date = attendanceDate(ctx, str(fd, "date"));
    const prev = await todayRow(ctx, child.id, date);
    if (prev?.checkInAt) fail(`${child.firstName} tem entrada registada às ${fmtTime(prev.checkInAt, ctx.settings.timezone)}. Limpe a presença antes de marcar falta.`);
    const values = { status: "ABSENT" as const, checkInAt: null, checkInBy: null, droppedBy: "", checkOutAt: null, checkOutBy: null, pickedBy: "", absenceReason: str(fd, "reason").slice(0, 200) };
    await ctx.db.insert(t.attendance).values({ childId: child.id, date, ...values })
      .onConflictDoUpdate({ target: [t.attendance.childId, t.attendance.date], set: values });
    return { ok: true, message: `Falta de ${child.firstName} registada.` };
  });
}

/** Anula o registo do dia (corrigir um toque errado). */
export async function clearAttendanceAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "attendance.record" });
    const childId = str(fd, "childId");
    await assertChildAccess(ctx, childId);
    const date = attendanceDate(ctx, str(fd, "date"));
    const row = await ctx.db.query.attendance.findFirst({ where: and(eq(t.attendance.childId, childId), eq(t.attendance.date, date)) });
    if (!row) fail("Não existe registo para anular.");
    if (row!.checkOutAt && str(fd, "what") !== "all") {
      await ctx.db.update(t.attendance).set({ checkOutAt: null, checkOutBy: null, pickedBy: "" }).where(eq(t.attendance.id, row!.id));
      return { ok: true, message: "Saída anulada." };
    }
    await ctx.db.delete(t.attendance).where(eq(t.attendance.id, row!.id));
    return { ok: true, message: "Registo anulado." };
  });
}

/** Regista uma entrada de diário para uma ou várias crianças (ou a turma inteira). */
export async function addDiaryAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "diary.record" });
    const type = str(fd, "type") as DiaryType;
    if (!DIARY_TYPES.includes(type)) fail("Tipo de registo inválido.");
    const title = str(fd, "title");
    if (title.length < 2 || title.length > 120) fail("Indique um título (2 a 120 caracteres).");
    const today = todayIn(ctx.settings.timezone);
    const date = str(fd, "date") || today;
    if (!isIsoDate(date) || date > today) fail("Data inválida.");
    if (ctx.panel === "CLASSROOM" && date !== today) fail("Só é possível registar o dia de hoje.");

    let ids = fd.getAll("childIds").map(String).filter(Boolean);
    const classroomId = str(fd, "classroomId");
    if (!ids.length && classroomId) {
      if (ctx.classroomIds !== null && !ctx.classroomIds.includes(classroomId)) fail("Não tem acesso a esta turma.");
      ids = (await ctx.db.select({ id: t.children.id }).from(t.children).where(and(eq(t.children.classroomId, classroomId), eq(t.children.status, "ACTIVE")))).map((r) => r.id);
    }
    if (!ids.length) fail("Escolha pelo menos uma criança.");
    const kids = await ctx.db.select().from(t.children).where(and(inArray(t.children.id, ids), eq(t.children.status, "ACTIVE"), childScope(ctx)));
    if (kids.length !== new Set(ids).size) fail("Não tem acesso a todas as crianças escolhidas.");

    const photo = file(fd, "photo");
    if (type === "PHOTO" && !photo) fail("Escolha uma fotografia.");
    if (photo) {
      const blocked = kids.filter((k) => !k.photoConsent);
      if (blocked.length) fail(`Sem autorização de fotografias: ${blocked.map((k) => k.firstName).join(", ")}. Retire essas crianças ou registe sem fotografia.`);
    }
    const groupId = kids.length > 1 ? createId() : null;
    const saved = photo ? await saveUpload(ctx.institution.id, "diary", photo, { kind: "image", maxMb: 8 }) : null;
    const occurredAt = moment(date, str(fd, "time"), ctx);
    await ctx.db.insert(t.diaryEntries).values(kids.map((k) => ({
      childId: k.id, date, occurredAt, type, title, details: str(fd, "details").slice(0, 2000), photoPath: saved?.path ?? null,
      groupId, visible: type === "INCIDENT" ? bool(fd, "visible") : true, createdById: ctx.user.id, createdByName: ctx.user.name,
    })));
    return { ok: true, message: kids.length > 1 ? `Registo adicionado a ${kids.length} crianças.` : "Registo adicionado." };
  });
}

export async function deleteDiaryAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "diary.record" });
    const entry = await ctx.db.query.diaryEntries.findFirst({ where: eq(t.diaryEntries.id, str(fd, "id")) });
    if (!entry) fail("Registo não encontrado.");
    await assertChildAccess(ctx, entry!.childId);
    if (!ctx.isDirector && entry!.createdById !== ctx.user.id) fail("Só pode eliminar registos criados por si.");
    const all = bool(fd, "group") && entry!.groupId;
    const removed = all
      ? await ctx.db.delete(t.diaryEntries).where(eq(t.diaryEntries.groupId, entry!.groupId!)).returning()
      : await ctx.db.delete(t.diaryEntries).where(eq(t.diaryEntries.id, entry!.id)).returning();
    if (entry!.photoPath) {
      const stillUsed = await ctx.db.query.diaryEntries.findFirst({ where: eq(t.diaryEntries.photoPath, entry!.photoPath) });
      if (!stillUsed) await deleteTenantFile(ctx.institution.id, entry!.photoPath);
    }
    return { ok: true, message: removed.length > 1 ? `${removed.length} registos eliminados.` : "Registo eliminado." };
  });
}
