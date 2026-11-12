"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { and, count, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { central, c } from "@/db/central";
import { getTenantDb, t } from "@/db/tenant";
import { clearFailures, createSession, destroySession, destroyUserSessions, lockedFor, passwordProblem, recordFailure } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { parseMoney } from "@/lib/format";
import { sendMail } from "@/lib/mail";
import { DIRECTOR_KEY } from "@/lib/permissions";
import { getPlatformSettings, platformAction, platformAudit } from "@/lib/platform";
import { bool, fail, run, str, type ActionResult } from "@/lib/result";
import { createAuthToken, inviteMail, inviteUrl, resetUrl } from "@/lib/services/accounts";
import { backupInstitution, liveInstitutions, migrateAllTenants, refreshStats, restoreInstitution } from "@/lib/services/ops";
import { issueInvoiceIfDue, payPlatformInvoice, runBillingCycle, voidPlatformInvoice } from "@/lib/services/platform-billing";
import { createInstitution, dropTenantDatabase, runProvisioning, slugProblem } from "@/lib/services/provisioning";

type S = ActionResult | null;
const email = z.string().trim().toLowerCase().email("Email inválido.").max(160);
const CURRENCIES = ["CVE", "EUR", "USD"];

// ---------- sessão ----------
export async function adminLoginAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const mail = str(fd, "email").toLowerCase();
    const key = `platform:${mail}`;
    const mins = await lockedFor(key);
    if (mins) fail(`Demasiadas tentativas. Tente novamente dentro de ${mins} min.`);
    const user = await central().query.platformUsers.findFirst({ where: eq(c.platformUsers.email, mail) });
    const ok = await verifyPassword(str(fd, "password"), user?.passwordHash);
    if (!user || !ok || !user.active) {
      await recordFailure(key);
      fail("Email ou palavra-passe incorretos.");
    }
    await clearFailures(key);
    await central().update(c.platformUsers).set({ lastLoginAt: new Date() }).where(eq(c.platformUsers.id, user!.id));
    await createSession({ scope: "PLATFORM", userId: user!.id });
    await platformAudit(user!, "Início de sessão");
    return { ok: true, redirect: "/admin" };
  });
}

export async function adminLogoutAction() {
  await destroySession("PLATFORM");
  redirect("/admin/entrar");
}

// ---------- instituições ----------
export async function checkSlugAction(slug: string): Promise<{ ok: boolean; message: string }> {
  await platformAction();
  const problem = slugProblem(slug);
  if (problem) return { ok: false, message: problem };
  const exists = await central().query.institutions.findFirst({ where: eq(c.institutions.slug, slug), columns: { id: true } });
  return exists ? { ok: false, message: "Este endereço já está a ser usado." } : { ok: true, message: "Endereço disponível." };
}

const institutionSchema = z.object({
  name: z.string().trim().min(2, "Indique o nome da instituição.").max(120),
  slug: z.string().trim().toLowerCase(),
  email: z.union([email, z.literal("")]),
  phone: z.string().trim().max(40),
  address: z.string().trim().max(200),
  city: z.string().trim().max(80),
  currency: z.string().refine((v) => CURRENCIES.includes(v), "Moeda inválida."),
  directorName: z.string().trim().min(2, "Indique o nome do diretor.").max(120),
  directorEmail: email,
  directorPhone: z.string().trim().max(40),
  planId: z.string().min(1, "Escolha um plano."),
  billingCycle: z.enum(["MONTHLY", "YEARLY"]),
});

export async function createInstitutionAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await platformAction();
    const d = institutionSchema.parse(Object.fromEntries(["name", "slug", "email", "phone", "address", "city", "currency", "directorName", "directorEmail", "directorPhone", "planId", "billingCycle"].map((k) => [k, str(fd, k)])));
    const plan = await central().query.plans.findFirst({ where: and(eq(c.plans.id, d.planId), eq(c.plans.active, true)) });
    if (!plan) fail("Plano inválido.");
    const settings = await getPlatformSettings();
    const startMode = str(fd, "startMode");
    let trialDays: number | null = null;
    if (startMode === "trial") {
      trialDays = Number(str(fd, "trialDays") || settings.trialDays);
      if (!Number.isInteger(trialDays) || trialDays < 1 || trialDays > 365) fail("Período de teste inválido (1 a 365 dias).");
    }
    let created;
    try {
      created = await createInstitution({ ...d, timezone: "Atlantic/Cape_Verde", trialDays });
    } catch (e) {
      fail((e as Error).message);
    }
    const requestId = str(fd, "requestId");
    if (requestId) {
      await central().update(c.signupRequests).set({ status: "APPROVED", institutionId: created.institutionId, handledAt: new Date() }).where(eq(c.signupRequests.id, requestId));
    }
    await platformAudit(admin, "Instituição criada", { entity: "institution", entityId: created.institutionId, institutionId: created.institutionId, details: { slug: d.slug, plano: plan!.name } });
    after(() => runProvisioning(created.jobId));
    return { ok: true, redirect: `/admin/instituicoes/${created.institutionId}?tab=provisionamento`, message: "Instituição criada. A preparar a base de dados…" };
  });
}

export async function retryProvisionAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await platformAction();
    const institutionId = str(fd, "institutionId");
    const job = await central().query.provisioningJobs.findFirst({
      where: eq(c.provisioningJobs.institutionId, institutionId), orderBy: (j, { desc }) => desc(j.createdAt),
    });
    if (!job) fail("Job de provisionamento não encontrado.");
    if (job!.status === "DONE") fail("O provisionamento já está concluído.");
    await platformAudit(admin, "Provisionamento retomado", { entity: "institution", entityId: institutionId, institutionId });
    after(() => runProvisioning(job!.id));
    return { ok: true, message: "A retomar o provisionamento…" };
  });
}

export async function updateInstitutionAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await platformAction();
    const id = str(fd, "institutionId");
    const d = z.object({
      name: z.string().trim().min(2, "Indique o nome.").max(120),
      email: z.union([email, z.literal("")]),
      phone: z.string().trim().max(40), address: z.string().trim().max(200), city: z.string().trim().max(80),
      planId: z.string().min(1, "Escolha um plano."), billingCycle: z.enum(["MONTHLY", "YEARLY"]),
      maxDirectors: z.coerce.number().int().min(1, "Mínimo de 1 diretor.").max(10),
    }).parse(Object.fromEntries(["name", "email", "phone", "address", "city", "planId", "billingCycle", "maxDirectors"].map((k) => [k, str(fd, k)])));
    const [row] = await central().update(c.institutions).set(d).where(eq(c.institutions.id, id)).returning();
    if (!row) fail("Instituição não encontrada.");
    await platformAudit(admin, "Instituição editada", { entity: "institution", entityId: id, institutionId: id });
    return { ok: true, message: "Alterações guardadas." };
  });
}

export async function suspendInstitutionAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await platformAction();
    const id = str(fd, "institutionId");
    const reason = str(fd, "reason");
    if (reason.length < 3) fail("Indique o motivo da suspensão.");
    const [row] = await central().update(c.institutions)
      .set({ status: "SUSPENDED", suspendedAt: new Date(), suspendReason: reason })
      .where(and(eq(c.institutions.id, id), inArray(c.institutions.status, ["TRIAL", "ACTIVE", "PAST_DUE"]))).returning();
    if (!row) fail("Só é possível suspender instituições em funcionamento.");
    await platformAudit(admin, "Instituição suspensa", { entity: "institution", entityId: id, institutionId: id, details: { motivo: reason } });
    return { ok: true, message: "Instituição suspensa." };
  });
}

export async function activateInstitutionAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await platformAction();
    const id = str(fd, "institutionId");
    const [row] = await central().update(c.institutions)
      .set({ status: "ACTIVE", suspendedAt: null, suspendReason: null })
      .where(and(eq(c.institutions.id, id), inArray(c.institutions.status, ["SUSPENDED", "PAST_DUE", "TRIAL", "ARCHIVED"]))).returning();
    if (!row) fail("Esta instituição não pode ser ativada neste estado.");
    if (!row.currentPeriodEnd) await central().update(c.institutions).set({ currentPeriodEnd: row.trialEndsAt && row.trialEndsAt > new Date() ? row.trialEndsAt : new Date() }).where(eq(c.institutions.id, id));
    await platformAudit(admin, "Instituição ativada", { entity: "institution", entityId: id, institutionId: id });
    return { ok: true, message: "Instituição ativada." };
  });
}

export async function archiveInstitutionAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await platformAction();
    const id = str(fd, "institutionId");
    const inst = await central().query.institutions.findFirst({ where: eq(c.institutions.id, id) });
    if (!inst) fail("Instituição não encontrada.");
    if (str(fd, "confirm") !== inst!.slug) fail("Escreva o código da instituição para confirmar.");
    if (!["SUSPENDED", "TRIAL", "ACTIVE", "PAST_DUE"].includes(inst!.status)) fail("Esta instituição não pode ser arquivada neste estado.");
    await central().update(c.institutions).set({ status: "ARCHIVED", suspendedAt: new Date(), suspendReason: "Arquivada" }).where(eq(c.institutions.id, id));
    await central().delete(c.sessions).where(eq(c.sessions.institutionId, id));
    await platformAudit(admin, "Instituição arquivada", { entity: "institution", entityId: id, institutionId: id });
    return { ok: true, message: "Instituição arquivada. Os dados foram mantidos." };
  });
}

/** Rollback de uma criação falhada: apaga BD/role parciais e o registo. */
export async function deleteFailedInstitutionAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await platformAction();
    const id = str(fd, "institutionId");
    const inst = await central().query.institutions.findFirst({ where: eq(c.institutions.id, id) });
    if (!inst) fail("Instituição não encontrada.");
    if (inst!.status !== "FAILED") fail("Só é possível eliminar instituições cuja criação falhou.");
    await dropTenantDatabase(id);
    await central().update(c.signupRequests).set({ status: "PENDING", institutionId: null, handledAt: null }).where(eq(c.signupRequests.institutionId, id));
    await central().delete(c.institutions).where(eq(c.institutions.id, id));
    await platformAudit(admin, "Criação falhada eliminada (rollback)", { entity: "institution", entityId: id, details: { slug: inst!.slug } });
    return { ok: true, redirect: "/admin/instituicoes", message: "Instituição eliminada." };
  });
}

async function liveInstitution(id: string) {
  const inst = await central().query.institutions.findFirst({ where: eq(c.institutions.id, id) });
  if (!inst) fail("Instituição não encontrada.");
  if (!["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED"].includes(inst!.status)) fail("A base de dados desta instituição não está disponível.");
  return inst!;
}

// ---------- diretores (primeiro acesso, alteração, recuperação) ----------
export async function addDirectorAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await platformAction();
    const inst = await liveInstitution(str(fd, "institutionId"));
    const d = z.object({ name: z.string().trim().min(2, "Indique o nome.").max(120), email, phone: z.string().trim().max(40) })
      .parse({ name: str(fd, "name"), email: str(fd, "email"), phone: str(fd, "phone") });
    const db = await getTenantDb(inst.id);
    const role = await db.query.roles.findFirst({ where: eq(t.roles.key, DIRECTOR_KEY) });
    if (!role) fail("Cargo de diretor em falta nesta instituição.");
    const [{ n }] = await db.select({ n: count() }).from(t.users).where(and(eq(t.users.roleId, role!.id), ne(t.users.status, "SUSPENDED")));
    if (n >= inst.maxDirectors) fail(`Esta instituição só pode ter ${inst.maxDirectors} diretor(es). Aumente o limite ou remova um diretor.`);
    const existing = await db.query.users.findFirst({ where: eq(t.users.email, d.email) });
    // Um diretor cujo acesso foi removido pode voltar: a conta suspensa é reativada com novo convite.
    const returning = existing && existing.roleId === role!.id && existing.status === "SUSPENDED" && !existing.deletedAt;
    if (existing && !returning) fail("Já existe um utilizador com este email nesta instituição.");
    let user;
    if (returning) {
      [user] = await db.update(t.users).set({ name: d.name, phone: d.phone, status: "INVITED", passwordHash: null }).where(eq(t.users.id, existing.id)).returning();
    } else {
      [user] = await db.insert(t.users).values({ ...d, kind: "STAFF", status: "INVITED", roleId: role!.id }).returning();
      await db.insert(t.employees).values({ userId: user.id, jobTitle: "Diretor(a)" });
    }
    const url = inviteUrl(inst.slug, await createAuthToken(db, user.id, "INVITE"));
    const mailed = await sendMail({ to: user.email, ...inviteMail(inst.name, user.name, url) });
    if (bool(fd, "makePrimary")) {
      await central().update(c.institutions).set({ directorName: d.name, directorEmail: d.email, directorPhone: d.phone }).where(eq(c.institutions.id, inst.id));
    }
    await platformAudit(admin, "Diretor adicionado", { entity: "institution", entityId: inst.id, institutionId: inst.id, details: { email: d.email } });
    return { ok: true, message: mailed ? "Convite enviado por email." : "Diretor criado. Copie o link do convite.", data: { url } };
  });
}

export async function removeDirectorAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await platformAction();
    const inst = await liveInstitution(str(fd, "institutionId"));
    const userId = str(fd, "userId");
    const db = await getTenantDb(inst.id);
    const role = await db.query.roles.findFirst({ where: eq(t.roles.key, DIRECTOR_KEY) });
    const others = await db.select({ n: count() }).from(t.users)
      .where(and(eq(t.users.roleId, role!.id), ne(t.users.status, "SUSPENDED"), ne(t.users.id, userId)));
    if (others[0].n < 1) fail("A instituição tem de ficar com pelo menos um diretor. Adicione primeiro o novo diretor.");
    const [user] = await db.update(t.users).set({ status: "SUSPENDED" }).where(and(eq(t.users.id, userId), eq(t.users.roleId, role!.id))).returning();
    if (!user) fail("Diretor não encontrado.");
    await destroyUserSessions("TENANT", userId, inst.id);
    if (inst.directorEmail === user.email) {
      const next = await db.query.users.findFirst({ where: and(eq(t.users.roleId, role!.id), ne(t.users.status, "SUSPENDED")) });
      if (next) await central().update(c.institutions).set({ directorName: next.name, directorEmail: next.email, directorPhone: next.phone }).where(eq(c.institutions.id, inst.id));
    }
    await platformAudit(admin, "Acesso de diretor removido", { entity: "institution", entityId: inst.id, institutionId: inst.id, details: { email: user.email } });
    return { ok: true, message: "Acesso do diretor suspenso." };
  });
}

export async function setPrimaryDirectorAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await platformAction();
    const inst = await liveInstitution(str(fd, "institutionId"));
    const db = await getTenantDb(inst.id);
    const user = await db.query.users.findFirst({ where: eq(t.users.id, str(fd, "userId")), with: { role: true } });
    if (!user || user.role?.key !== DIRECTOR_KEY || user.status === "SUSPENDED") fail("Diretor inválido.");
    await central().update(c.institutions).set({ directorName: user!.name, directorEmail: user!.email, directorPhone: user!.phone }).where(eq(c.institutions.id, inst.id));
    await platformAudit(admin, "Diretor responsável alterado", { entity: "institution", entityId: inst.id, institutionId: inst.id, details: { email: user!.email } });
    return { ok: true, message: "Diretor responsável atualizado." };
  });
}

/** Suporte: gera um novo link de convite (conta por ativar) ou de recuperação (conta ativa). */
export async function directorAccessLinkAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await platformAction();
    const inst = await liveInstitution(str(fd, "institutionId"));
    const db = await getTenantDb(inst.id);
    const user = await db.query.users.findFirst({ where: eq(t.users.id, str(fd, "userId")), with: { role: true } });
    if (!user || user.role?.key !== DIRECTOR_KEY) fail("Diretor não encontrado.");
    if (user!.status === "SUSPENDED") fail("Este acesso está suspenso.");
    const invited = user!.status === "INVITED";
    const token = await createAuthToken(db, user!.id, invited ? "INVITE" : "RESET");
    const url = invited ? inviteUrl(inst.slug, token) : resetUrl(inst.slug, token);
    await platformAudit(admin, invited ? "Convite de diretor reenviado" : "Link de recuperação gerado para diretor", { entity: "institution", entityId: inst.id, institutionId: inst.id, details: { email: user!.email } });
    return { ok: true, message: "Link gerado.", data: { url } };
  });
}

export async function impersonateAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await platformAction();
    const inst = await liveInstitution(str(fd, "institutionId"));
    const db = await getTenantDb(inst.id);
    const role = await db.query.roles.findFirst({ where: eq(t.roles.key, DIRECTOR_KEY) });
    const director = await db.query.users.findFirst({ where: and(eq(t.users.roleId, role!.id), eq(t.users.status, "ACTIVE")) });
    if (!director) fail("Ainda nenhum diretor ativou a conta nesta instituição.");
    await createSession({ scope: "TENANT", userId: director!.id, institutionId: inst.id, impersonatorId: admin.id });
    await platformAudit(admin, "Entrou como diretor (suporte)", { entity: "institution", entityId: inst.id, institutionId: inst.id, details: { diretor: director!.email } });
    await db.insert(t.auditLogs).values({ userName: `Suporte da plataforma (${admin.name})`, action: "Sessão de suporte iniciada" });
    return { ok: true, redirect: `/c/${inst.slug}/gestao` };
  });
}

// ---------- operações: backups, restauro, estatísticas, migrations ----------
export async function backupNowAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await platformAction();
    const inst = await liveInstitution(str(fd, "institutionId"));
    try {
      await backupInstitution(inst.id, true);
    } catch (e) {
      fail(`Falha no backup: ${(e as Error).message}`);
    }
    await platformAudit(admin, "Backup manual", { entity: "institution", entityId: inst.id, institutionId: inst.id });
    return { ok: true, message: "Backup concluído." };
  });
}

export async function restoreBackupAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await platformAction();
    const inst = await liveInstitution(str(fd, "institutionId"));
    if (str(fd, "confirm") !== inst.slug) fail("Escreva o código da instituição para confirmar o restauro.");
    try {
      await restoreInstitution(inst.id, str(fd, "backupId"));
    } catch (e) {
      fail(`Falha no restauro: ${(e as Error).message}`);
    }
    await refreshStats(inst.id).catch(() => {});
    await platformAudit(admin, "Backup restaurado", { entity: "institution", entityId: inst.id, institutionId: inst.id, details: { backupId: str(fd, "backupId") } });
    return { ok: true, message: "Base de dados restaurada a partir do backup." };
  });
}

export async function refreshStatsAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await platformAction();
    const inst = await liveInstitution(str(fd, "institutionId"));
    await refreshStats(inst.id);
    return { ok: true, message: "Estatísticas atualizadas." };
  });
}

export async function backupAllAction(_p: S, _fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await platformAction();
    let ok = 0, failed = 0;
    for (const inst of await liveInstitutions()) {
      try { await backupInstitution(inst.id, true); ok++; } catch { failed++; }
    }
    await platformAudit(admin, "Backup de todas as instituições", { details: { ok, falhas: failed } });
    return { ok: true, message: `Backups concluídos: ${ok}${failed ? ` · falhas: ${failed}` : ""}.` };
  });
}

export async function migrateAllAction(_p: S, _fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await platformAction();
    const report = await migrateAllTenants();
    const failed = report.filter((r) => !r.ok);
    await platformAudit(admin, "Migrations aplicadas a todas as BDs", { details: { total: report.length, falhas: failed.map((f) => `${f.slug}: ${f.error}`) } });
    if (failed.length) fail(`Migrations falharam em: ${failed.map((f) => f.slug).join(", ")}. Veja a auditoria.`);
    return { ok: true, message: `Migrations aplicadas em ${report.length} base(s) de dados.` };
  });
}

// ---------- planos ----------
export async function savePlanAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await platformAction();
    const id = str(fd, "id");
    const name = str(fd, "name");
    if (name.length < 2) fail("Indique o nome do plano.");
    const monthly = parseMoney(str(fd, "priceMonthly"));
    const yearly = parseMoney(str(fd, "priceYearly"));
    if (monthly === null || yearly === null) fail("Preços inválidos.");
    const maxRaw = str(fd, "maxChildren");
    if (maxRaw && !/^\d{1,6}$/.test(maxRaw)) fail("Limite de crianças inválido.");
    const values = { name, description: str(fd, "description"), priceMonthlyCents: monthly!, priceYearlyCents: yearly!, maxChildren: maxRaw ? Number(maxRaw) : null, active: bool(fd, "active") };
    const dup = await central().query.plans.findFirst({ where: and(eq(c.plans.name, name), id ? ne(c.plans.id, id) : undefined) });
    if (dup) fail("Já existe um plano com este nome.");
    if (id) await central().update(c.plans).set(values).where(eq(c.plans.id, id));
    else await central().insert(c.plans).values(values);
    await platformAudit(admin, id ? "Plano editado" : "Plano criado", { entity: "plan", details: { nome: name } });
    return { ok: true, message: "Plano guardado." };
  });
}

export async function deletePlanAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await platformAction();
    const id = str(fd, "id");
    const [{ n }] = await central().select({ n: count() }).from(c.institutions).where(eq(c.institutions.planId, id));
    if (n > 0) fail("Este plano está atribuído a instituições. Desative-o em vez de o eliminar.");
    await central().delete(c.plans).where(eq(c.plans.id, id));
    await platformAudit(admin, "Plano eliminado", { entity: "plan", entityId: id });
    return { ok: true, message: "Plano eliminado." };
  });
}

// ---------- faturas da plataforma (pagamentos manuais) ----------
export async function issueInvoiceAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await platformAction();
    const id = str(fd, "institutionId");
    const inst = await central().query.institutions.findFirst({ where: eq(c.institutions.id, id) });
    if (!inst) fail("Instituição não encontrada.");
    if (!inst!.planId) fail("Atribua primeiro um plano à instituição.");
    if (!["TRIAL", "ACTIVE", "PAST_DUE"].includes(inst!.status)) fail("Só é possível faturar instituições em funcionamento.");
    // Antecipa a próxima fatura: trata o início do próximo período como "agora".
    const forced = { ...inst!, currentPeriodEnd: inst!.currentPeriodEnd ?? new Date(), trialEndsAt: inst!.trialEndsAt };
    const start = inst!.status === "TRIAL" && !inst!.currentPeriodEnd ? inst!.trialEndsAt : forced.currentPeriodEnd;
    const made = await issueInvoiceIfDue(forced, start && start > new Date() ? start : new Date());
    if (!made) fail("Já existe uma fatura para o próximo período desta instituição.");
    await platformAudit(admin, "Fatura emitida manualmente", { entity: "institution", entityId: id, institutionId: id });
    return { ok: true, message: "Fatura emitida." };
  });
}

export async function payInvoiceAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await platformAction();
    const method = str(fd, "method");
    if (!["Dinheiro", "Transferência", "Cheque", "Depósito", "Outro"].includes(method)) fail("Escolha o método de pagamento.");
    const paidAt = new Date(`${str(fd, "paidAt")}T12:00:00Z`);
    if (Number.isNaN(paidAt.getTime()) || paidAt.getTime() > Date.now() + 86_400_000) fail("Data de pagamento inválida.");
    let inv;
    try {
      inv = await payPlatformInvoice(str(fd, "invoiceId"), { method, reference: str(fd, "reference"), paidAt });
    } catch (e) {
      fail((e as Error).message);
    }
    await platformAudit(admin, "Pagamento de fatura registado", { entity: "invoice", entityId: inv.id, institutionId: inv.institutionId, details: { numero: inv.number, metodo: method } });
    return { ok: true, message: `Fatura ${inv.number} marcada como paga.` };
  });
}

export async function voidInvoiceAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await platformAction();
    const reason = str(fd, "reason");
    if (reason.length < 3) fail("Indique o motivo da anulação.");
    let inv;
    try {
      inv = await voidPlatformInvoice(str(fd, "invoiceId"), reason);
    } catch (e) {
      fail((e as Error).message);
    }
    await platformAudit(admin, "Fatura anulada", { entity: "invoice", entityId: inv.id, institutionId: inv.institutionId, details: { numero: inv.number, motivo: reason } });
    return { ok: true, message: "Fatura anulada." };
  });
}

export async function runBillingAction(_p: S, _fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await platformAction();
    await runBillingCycle();
    return { ok: true, message: "Faturação verificada: faturas emitidas e atrasos atualizados." };
  });
}

// ---------- pedidos de adesão ----------
export async function rejectSignupAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await platformAction();
    const [row] = await central().update(c.signupRequests).set({ status: "REJECTED", handledAt: new Date() })
      .where(and(eq(c.signupRequests.id, str(fd, "id")), eq(c.signupRequests.status, "PENDING"))).returning();
    if (!row) fail("Pedido não encontrado ou já tratado.");
    await platformAudit(admin, "Pedido de adesão rejeitado", { entity: "signup", entityId: row.id, details: { instituicao: row.institutionName } });
    return { ok: true, message: "Pedido rejeitado." };
  });
}

export async function reopenSignupAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await platformAction();
    const [row] = await central().update(c.signupRequests).set({ status: "PENDING", handledAt: null })
      .where(and(eq(c.signupRequests.id, str(fd, "id")), eq(c.signupRequests.status, "REJECTED"))).returning();
    if (!row) fail("Pedido não encontrado.");
    return { ok: true, message: "Pedido reaberto." };
  });
}

// ---------- definições e contas da plataforma ----------
export async function savePlatformSettingsAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await platformAction();
    const d = z.object({
      saasName: z.string().trim().min(2, "Indique o nome da plataforma.").max(60),
      supportEmail: z.union([email, z.literal("")]),
      supportPhone: z.string().trim().max(40),
      billingCurrency: z.string().refine((v) => CURRENCIES.includes(v), "Moeda inválida."),
      bankDetails: z.string().trim().max(1000),
      trialDays: z.coerce.number().int().min(1, "Mínimo 1 dia.").max(365),
      invoiceDueDays: z.coerce.number().int().min(1, "Mínimo 1 dia.").max(90),
      graceDays: z.coerce.number().int().min(0).max(90),
    }).parse(Object.fromEntries(["saasName", "supportEmail", "supportPhone", "billingCurrency", "bankDetails", "trialDays", "invoiceDueDays", "graceDays"].map((k) => [k, str(fd, k)])));
    await getPlatformSettings();
    await central().update(c.platformSettings).set(d).where(eq(c.platformSettings.id, 1));
    await platformAudit(admin, "Definições da plataforma alteradas");
    return { ok: true, message: "Definições guardadas." };
  });
}

export async function changeAdminPasswordAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await platformAction();
    if (!(await verifyPassword(str(fd, "current"), admin.passwordHash))) fail("A palavra-passe atual está incorreta.");
    const next = str(fd, "password");
    const problem = passwordProblem(next);
    if (problem) fail(problem);
    if (next !== str(fd, "confirm")) fail("As palavras-passe não coincidem.");
    await central().update(c.platformUsers).set({ passwordHash: await hashPassword(next) }).where(eq(c.platformUsers.id, admin.id));
    await platformAudit(admin, "Palavra-passe alterada");
    return { ok: true, message: "Palavra-passe alterada." };
  });
}

export async function addAdminAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await platformAction();
    const d = z.object({ name: z.string().trim().min(2, "Indique o nome.").max(120), email }).parse({ name: str(fd, "name"), email: str(fd, "email") });
    const password = str(fd, "password");
    const problem = passwordProblem(password);
    if (problem) fail(problem);
    if (await central().query.platformUsers.findFirst({ where: eq(c.platformUsers.email, d.email) })) fail("Já existe um administrador com este email.");
    await central().insert(c.platformUsers).values({ ...d, passwordHash: await hashPassword(password) });
    await platformAudit(admin, "Administrador da plataforma criado", { details: { email: d.email } });
    return { ok: true, message: "Administrador criado." };
  });
}

export async function toggleAdminAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await platformAction();
    const id = str(fd, "id");
    if (id === admin.id) fail("Não pode desativar a sua própria conta.");
    const target = await central().query.platformUsers.findFirst({ where: eq(c.platformUsers.id, id) });
    if (!target) fail("Administrador não encontrado.");
    await central().update(c.platformUsers).set({ active: !target!.active }).where(eq(c.platformUsers.id, id));
    if (target!.active) await destroyUserSessions("PLATFORM", id);
    await platformAudit(admin, target!.active ? "Administrador desativado" : "Administrador reativado", { details: { email: target!.email } });
    return { ok: true, message: target!.active ? "Conta desativada." : "Conta reativada." };
  });
}
