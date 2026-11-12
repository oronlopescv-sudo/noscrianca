"use server";

import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getTenantDb, t } from "@/db/tenant";
import { clearFailures, createSession, destroySession, destroyUserSessions, lockedFor, passwordProblem, readSession, recordFailure } from "@/lib/auth";
import { burnPasswordCheck, hashPassword, sha256, verifyPassword } from "@/lib/crypto";
import { sendMail } from "@/lib/mail";
import { DIRECTOR_KEY } from "@/lib/permissions";
import { fail, run, str, type ActionResult } from "@/lib/result";
import { createAuthToken, resetUrl } from "@/lib/services/accounts";
import { audit, getInstitutionBySlug, institutionUsable, tenantAction } from "@/lib/tenant";

type S = ActionResult | null;

async function usableInstitution(slug: string) {
  const inst = await getInstitutionBySlug(slug);
  if (!inst || !institutionUsable(inst.status)) fail("Esta instituição não está disponível.");
  return inst!;
}

export async function tenantLoginAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const inst = await usableInstitution(str(fd, "slug"));
    const email = str(fd, "email").toLowerCase();
    const key = `tenant:${inst.id}:${email}`;
    const mins = await lockedFor(key);
    if (mins) fail(`Demasiadas tentativas. Tente novamente dentro de ${mins} min.`);
    const db = await getTenantDb(inst.id);
    const user = await db.query.users.findFirst({ where: and(eq(t.users.email, email), isNull(t.users.deletedAt)), with: { role: true } });
    const password = str(fd, "password");
    const ok = await verifyPassword(password, user?.passwordHash);
    if (!user || !ok) {
      await recordFailure(key);
      if (!user) await burnPasswordCheck(password);
      fail("Email ou palavra-passe incorretos.");
    }
    if (user!.status === "INVITED") fail("A sua conta ainda não foi ativada. Use o link do convite que recebeu.");
    if (user!.status === "SUSPENDED") fail("A sua conta está suspensa. Contacte a direção da instituição.");
    if (inst.status === "SUSPENDED" && user!.role?.key !== DIRECTOR_KEY) fail("O acesso a esta instituição está temporariamente suspenso. Contacte a direção.");
    await clearFailures(key);
    await db.update(t.users).set({ lastLoginAt: new Date() }).where(eq(t.users.id, user!.id));
    await createSession({ scope: "TENANT", userId: user!.id, institutionId: inst.id });
    return { ok: true, redirect: `/c/${inst.slug}` };
  });
}

export async function tenantLogoutAction(slug: string) {
  await destroySession("TENANT");
  redirect(`/c/${slug}/entrar`);
}

async function consumeToken(slug: string, token: string, purpose: "INVITE" | "RESET", password: string, confirm: string) {
  const inst = await usableInstitution(slug);
  const problem = passwordProblem(password);
  if (problem) fail(problem);
  if (password !== confirm) fail("As palavras-passe não coincidem.");
  const db = await getTenantDb(inst.id);
  const row = await db.query.authTokens.findFirst({
    where: and(eq(t.authTokens.tokenHash, sha256(token)), eq(t.authTokens.purpose, purpose), isNull(t.authTokens.usedAt), gt(t.authTokens.expiresAt, new Date())),
  });
  if (!row) fail("Este link já não é válido. Peça um novo à instituição.");
  const user = await db.query.users.findFirst({ where: eq(t.users.id, row!.userId), with: { role: true } });
  if (!user || user.deletedAt || user.status === "SUSPENDED") fail("Esta conta não está disponível.");
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const [used] = await tx.update(t.authTokens).set({ usedAt: new Date() }).where(and(eq(t.authTokens.id, row!.id), isNull(t.authTokens.usedAt))).returning();
    if (!used) fail("Este link já foi utilizado.");
    await tx.update(t.users).set({ passwordHash, status: "ACTIVE", lastLoginAt: new Date() }).where(eq(t.users.id, user!.id));
    await tx.insert(t.auditLogs).values({ userId: user!.id, userName: user!.name, action: purpose === "INVITE" ? "Conta ativada por convite" : "Palavra-passe redefinida" });
  });
  await destroyUserSessions("TENANT", user!.id, inst.id);
  if (inst.status === "SUSPENDED" && user!.role?.key !== DIRECTOR_KEY) return { ok: true, redirect: `/c/${inst.slug}/entrar`, message: "Palavra-passe definida." };
  await createSession({ scope: "TENANT", userId: user!.id, institutionId: inst.id });
  return { ok: true, redirect: `/c/${inst.slug}`, message: purpose === "INVITE" ? "Conta ativada. Bem-vindo(a)!" : "Palavra-passe alterada." };
}

export async function acceptInviteAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(() => consumeToken(str(fd, "slug"), str(fd, "token"), "INVITE", str(fd, "password"), str(fd, "confirm")));
}

export async function resetPasswordAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(() => consumeToken(str(fd, "slug"), str(fd, "token"), "RESET", str(fd, "password"), str(fd, "confirm")));
}

export async function requestResetAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const inst = await usableInstitution(str(fd, "slug"));
    const email = str(fd, "email").toLowerCase();
    const key = `reset:${inst.id}:${email}`;
    if (await lockedFor(key)) fail("Demasiados pedidos. Tente novamente mais tarde.");
    await recordFailure(key);
    const db = await getTenantDb(inst.id);
    const user = await db.query.users.findFirst({ where: and(eq(t.users.email, email), eq(t.users.status, "ACTIVE"), isNull(t.users.deletedAt)) });
    if (user) {
      const url = resetUrl(inst.slug, await createAuthToken(db, user.id, "RESET"));
      await sendMail({
        to: user.email, subject: `Recuperar acesso — ${inst.name}`,
        text: `Olá ${user.name},\n\nPara definir uma nova palavra-passe, abra este link (válido por 1 hora):\n\n${url}\n\nSe não pediu esta alteração, ignore este email.`,
      });
    }
    // Resposta igual quer o email exista ou não (não revela contas).
    return { ok: true, redirect: `/c/${inst.slug}/recuperar?enviado=1` };
  });
}

export async function changePasswordAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { write: false });
    if (ctx.impersonating) fail("Não é possível alterar a palavra-passe numa sessão de suporte.");
    if (!(await verifyPassword(str(fd, "current"), ctx.user.passwordHash))) fail("A palavra-passe atual está incorreta.");
    const next = str(fd, "password");
    const problem = passwordProblem(next);
    if (problem) fail(problem);
    if (next !== str(fd, "confirm")) fail("As palavras-passe não coincidem.");
    await ctx.db.update(t.users).set({ passwordHash: await hashPassword(next) }).where(eq(t.users.id, ctx.user.id));
    // Fecha as outras sessões do utilizador (a atual mantém-se).
    await destroyUserSessions("TENANT", ctx.user.id, ctx.institution.id, (await readSession("TENANT"))?.tokenHash);
    await audit(ctx, "Palavra-passe alterada");
    return { ok: true, message: "Palavra-passe alterada." };
  });
}

export async function updateProfileAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { write: false });
    const name = str(fd, "name");
    const phone = str(fd, "phone");
    if (name.length < 2 || name.length > 120) fail("Indique o seu nome.");
    if (phone.length > 40) fail("Telefone inválido.");
    await ctx.db.update(t.users).set({ name, phone }).where(eq(t.users.id, ctx.user.id));
    return { ok: true, message: "Perfil atualizado." };
  });
}

export async function markNotificationsReadAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { write: false });
    await ctx.db.update(t.notifications).set({ readAt: new Date() }).where(and(eq(t.notifications.userId, ctx.user.id), isNull(t.notifications.readAt)));
    return { ok: true };
  });
}
