"use server";

import { after } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { t } from "@/db/tenant";
import { mailConfigured, sendMail } from "@/lib/mail";
import { bool, fail, run, str, type ActionResult } from "@/lib/result";
import { env } from "@/lib/env";
import { audit, guardianChildIds, notify, staffCanSeeGuardian, tenantAction, type TenantCtx } from "@/lib/tenant";

type S = ActionResult | null;

type Recipient = { userId: string; name: string; email: string; active: boolean; href: string };
const AUDIENCES = ["ALL", "GUARDIANS", "STAFF"] as const;
type Audience = (typeof AUDIENCES)[number];

/** Encarregados das crianças ativas (de uma turma ou de toda a instituição), sem contas suspensas. */
async function guardianRecipients(ctx: TenantCtx, classroomId: string | null): Promise<Recipient[]> {
  const kids = await ctx.db.select({ id: t.children.id }).from(t.children)
    .where(and(eq(t.children.status, "ACTIVE"), classroomId ? eq(t.children.classroomId, classroomId) : undefined));
  if (!kids.length) return [];
  const rows = await ctx.db.select({ userId: t.users.id, name: t.users.name, email: t.users.email, status: t.users.status, deletedAt: t.users.deletedAt })
    .from(t.childGuardians)
    .innerJoin(t.guardians, eq(t.guardians.id, t.childGuardians.guardianId))
    .innerJoin(t.users, eq(t.users.id, t.guardians.userId))
    .where(inArray(t.childGuardians.childId, kids.map((k) => k.id)));
  return rows.filter((r) => r.status !== "SUSPENDED" && !r.deletedAt)
    .map((r) => ({ userId: r.userId, name: r.name, email: r.email, active: r.status === "ACTIVE", href: `${ctx.base}/pais/comunicados` }));
}

/** Funcionários (educadores, auxiliares, etc.) que acompanham a turma, ou toda a equipa. Não inclui quem envia. */
async function staffAudience(ctx: TenantCtx, classroomId: string | null): Promise<Recipient[]> {
  const staff = await ctx.db.query.users.findMany({
    where: and(eq(t.users.kind, "STAFF"), isNull(t.users.deletedAt)), with: { role: true, employee: { with: { classrooms: true } } },
  });
  return staff.filter((u) => {
    if (u.id === ctx.user.id || u.status === "SUSPENDED" || !u.role) return false;
    if (!classroomId || u.role.key === "DIRECTOR" || u.role.allClassrooms) return true;
    return (u.employee?.classrooms ?? []).some((cl) => cl.classroomId === classroomId);
  }).map((u) => ({
    userId: u.id, name: u.name, email: u.email, active: u.status === "ACTIVE",
    href: u.role!.panel === "CLASSROOM" ? `${ctx.base}/sala/comunicados` : u.role!.key === "DIRECTOR" || u.role!.permissions.includes("announcements.manage") ? `${ctx.base}/gestao/comunicados` : "",
  }));
}

export async function createAnnouncementAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "announcements.manage" });
    const title = str(fd, "title"), body = str(fd, "body");
    if (title.length < 3 || title.length > 140) fail("Indique um título (3 a 140 caracteres).");
    if (body.length < 3 || body.length > 5000) fail("Escreva a mensagem do comunicado.");
    const classroomId = str(fd, "classroomId") || null;
    if (classroomId && !(await ctx.db.query.classrooms.findFirst({ where: eq(t.classrooms.id, classroomId) }))) fail("Turma inválida.");
    // Quem só tem turmas atribuídas não pode enviar para outras turmas nem para toda a instituição.
    if (ctx.classroomIds !== null && (!classroomId || !ctx.classroomIds.includes(classroomId))) fail("Só pode enviar comunicados para as suas turmas.");
    const audience = (str(fd, "audience") || "GUARDIANS") as Audience;
    if (!AUDIENCES.includes(audience)) fail("Destinatários inválidos.");
    const guardians = audience === "STAFF" ? [] : await guardianRecipients(ctx, classroomId);
    const staff = audience === "GUARDIANS" ? [] : await staffAudience(ctx, classroomId);
    const seen = new Set<string>();
    const recipients = [...guardians, ...staff].filter((r) => (seen.has(r.userId) ? false : (seen.add(r.userId), true)));
    const [a] = await ctx.db.insert(t.announcements).values({ title, body, classroomId, audience, createdById: ctx.user.id, createdByName: ctx.user.name }).returning();

    // Aviso dentro da aplicação (só contas já ativadas), com a ligação certa para cada painel.
    for (const href of new Set(recipients.map((r) => r.href))) {
      await notify(ctx.db, recipients.filter((r) => r.active && r.href === href).map((r) => r.userId), { title: `Comunicado: ${title}`, body: body.slice(0, 140), href });
    }

    // Email: enviado depois da resposta, para não prender o ecrã com muitos destinatários.
    const wantEmail = bool(fd, "sendEmail");
    const emails = wantEmail && mailConfigured() ? recipients.filter((r) => r.email) : [];
    if (emails.length) {
      const s = ctx.settings, db = ctx.db, who = { id: ctx.user.id, name: ctx.user.name };
      after(async () => {
        let sent = 0;
        for (const r of emails) {
          const ok = await sendMail({
            to: r.email, replyTo: s.email || undefined, subject: `${s.name}: ${title}`,
            text: [`Olá ${r.name},`, "", body, "", s.name, r.href ? `\nPode ler este comunicado também na aplicação: ${env.appUrl}${r.href}` : ""].join("\n"),
          });
          if (ok) sent++;
        }
        await db.insert(t.auditLogs).values({ userId: who.id, userName: who.name, action: "Comunicado enviado por email", entity: "announcement", entityId: a.id, details: { enviados: sent, destinatarios: emails.length } });
        if (sent < emails.length) console.error(`[comunicado] ${emails.length - sent} de ${emails.length} emails falharam (${title})`);
      });
    }

    await audit(ctx, "Comunicado enviado", { entity: "announcement", entityId: a.id, details: { titulo: title, destinatarios: recipients.length, pais: guardians.length, equipa: staff.length, email: emails.length } });
    const whom = `${guardians.length} encarregado(s)${audience === "GUARDIANS" ? "" : ` e ${staff.length} funcionário(s)`}`;
    const target = audience === "STAFF" ? `${staff.length} funcionário(s)` : whom;
    if (!wantEmail) return { ok: true, message: `Comunicado publicado para ${target}.` };
    if (!mailConfigured()) return { ok: true, message: `Comunicado publicado para ${target}. O email não está configurado no servidor, por isso não foi enviado email.` };
    return { ok: true, message: `Comunicado publicado para ${target}. A enviar ${emails.length} email(s).` };
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
