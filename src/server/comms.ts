"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { t } from "@/db/tenant";
import { fail, run, str, type ActionResult } from "@/lib/result";
import { audit, guardianChildIds, notify, staffCanSeeGuardian, tenantAction, type TenantCtx } from "@/lib/tenant";

type S = ActionResult | null;

/** IDs de utilizador dos encarregados com contas ativas (de uma turma ou de toda a instituição). */
async function guardianUserIds(ctx: TenantCtx, classroomId: string | null): Promise<string[]> {
  const kids = await ctx.db.select({ id: t.children.id }).from(t.children)
    .where(and(eq(t.children.status, "ACTIVE"), classroomId ? eq(t.children.classroomId, classroomId) : undefined));
  if (!kids.length) return [];
  const rows = await ctx.db.select({ userId: t.guardians.userId }).from(t.childGuardians)
    .innerJoin(t.guardians, eq(t.guardians.id, t.childGuardians.guardianId))
    .innerJoin(t.users, eq(t.users.id, t.guardians.userId))
    .where(and(inArray(t.childGuardians.childId, kids.map((k) => k.id)), eq(t.users.status, "ACTIVE")));
  return [...new Set(rows.map((r) => r.userId))];
}

export async function createAnnouncementAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "announcements.manage" });
    const title = str(fd, "title"), body = str(fd, "body");
    if (title.length < 3 || title.length > 140) fail("Indique um título (3 a 140 caracteres).");
    if (body.length < 3 || body.length > 5000) fail("Escreva a mensagem do comunicado.");
    const classroomId = str(fd, "classroomId") || null;
    if (classroomId && !(await ctx.db.query.classrooms.findFirst({ where: eq(t.classrooms.id, classroomId) }))) fail("Turma inválida.");
    const [a] = await ctx.db.insert(t.announcements).values({ title, body, classroomId, createdById: ctx.user.id, createdByName: ctx.user.name }).returning();
    const recipients = await guardianUserIds(ctx, classroomId);
    await notify(ctx.db, recipients, { title: `Comunicado: ${title}`, body: body.slice(0, 140), href: `${ctx.base}/pais/comunicados` });
    await audit(ctx, "Comunicado enviado", { entity: "announcement", entityId: a.id, details: { titulo: title, destinatarios: recipients.length } });
    return { ok: true, message: `Comunicado enviado a ${recipients.length} encarregado(s).` };
  });
}

export async function deleteAnnouncementAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "announcements.manage" });
    const [row] = await ctx.db.delete(t.announcements).where(eq(t.announcements.id, str(fd, "id"))).returning();
    if (!row) fail("Comunicado não encontrado.");
    await audit(ctx, "Comunicado eliminado", { entity: "announcement", details: { titulo: row.title } });
    return { ok: true, message: "Comunicado eliminado." };
  });
}

/** Funcionários que devem ser avisados de uma mensagem de um encarregado. */
async function staffRecipients(ctx: TenantCtx, guardianId: string): Promise<string[]> {
  const staff = await ctx.db.query.users.findMany({ where: and(eq(t.users.kind, "STAFF"), eq(t.users.status, "ACTIVE"), isNull(t.users.deletedAt)), with: { role: true, employee: { with: { classrooms: true } } } });
  const kidRooms = (await ctx.db.select({ room: t.children.classroomId }).from(t.childGuardians)
    .innerJoin(t.children, eq(t.children.id, t.childGuardians.childId)).where(eq(t.childGuardians.guardianId, guardianId))).map((r) => r.room);
  return staff.filter((u) => {
    if (!u.role) return false;
    if (u.role.key !== "DIRECTOR" && !u.role.permissions.includes("messages.reply")) return false;
    if (u.role.key === "DIRECTOR" || u.role.allClassrooms) return true;
    const mine = u.employee?.classrooms.map((cl) => cl.classroomId) ?? [];
    return kidRooms.some((r) => r && mine.includes(r));
  }).map((u) => u.id);
}

export async function sendMessageAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"));
    const body = str(fd, "body");
    if (body.length < 1 || body.length > 3000) fail("Escreva a mensagem (até 3000 caracteres).");

    if (ctx.isGuardian) {
      if (!ctx.guardianId) fail("Conta de encarregado inválida.");
      if (!(await guardianChildIds(ctx)).length) fail("Ainda não está associado a nenhuma criança.");
      await ctx.db.insert(t.messages).values({ guardianId: ctx.guardianId!, fromGuardian: true, senderId: ctx.user.id, senderName: ctx.user.name, body });
      await notify(ctx.db, await staffRecipients(ctx, ctx.guardianId!), { title: `Mensagem de ${ctx.user.name}`, body: body.slice(0, 140), href: `${ctx.base}/mensagens/${ctx.guardianId}` });
      return { ok: true };
    }

    if (!ctx.can("messages.reply")) fail("Não tem permissão para responder a mensagens.");
    const guardianId = str(fd, "guardianId");
    const guardian = await ctx.db.query.guardians.findFirst({ where: eq(t.guardians.id, guardianId) });
    if (!guardian || !(await staffCanSeeGuardian(ctx, guardianId))) fail("Encarregado não encontrado.");
    await ctx.db.insert(t.messages).values({ guardianId, fromGuardian: false, senderId: ctx.user.id, senderName: ctx.user.name, body });
    await ctx.db.update(t.messages).set({ readAt: new Date() }).where(and(eq(t.messages.guardianId, guardianId), eq(t.messages.fromGuardian, true), isNull(t.messages.readAt)));
    await notify(ctx.db, [guardian!.userId], { title: `Mensagem de ${ctx.settings.name}`, body: body.slice(0, 140), href: `${ctx.base}/pais/mensagens` });
    return { ok: true };
  });
}
