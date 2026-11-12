"use server";

import { and, count, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { central, c } from "@/db/central";
import { t } from "@/db/tenant";
import { destroyUserSessions } from "@/lib/auth";
import { isIsoDate, todayIn } from "@/lib/format";
import { ROOM_COLOR_KEYS } from "@/lib/labels";
import { sendMail } from "@/lib/mail";
import { ALL_PERMISSIONS, DIRECTOR_KEY, type Permission } from "@/lib/permissions";
import { bool, fail, file, run, str, type ActionResult } from "@/lib/result";
import { createAuthToken, inviteMail, inviteUrl, resetUrl } from "@/lib/services/accounts";
import { deleteTenantFile, saveUpload } from "@/lib/storage";
import { assertChildAccess, audit, staffCanSeeGuardian, tenantAction, type TenantCtx } from "@/lib/tenant";

type S = ActionResult | null;
const email = z.string().trim().toLowerCase().email("Email inválido.").max(160);
const personName = z.string().trim().min(2, "Indique o nome.").max(120);
const optDate = (v: string, label: string) => {
  if (v && !isIsoDate(v)) fail(`${label}: data inválida.`);
  return v || null;
};

async function createInvitedUser(ctx: TenantCtx, d: { name: string; email: string; phone: string; kind: "STAFF" | "GUARDIAN"; roleId?: string | null }) {
  if (await ctx.db.query.users.findFirst({ where: eq(t.users.email, d.email) })) fail("Já existe uma conta com este email nesta instituição.");
  const [user] = await ctx.db.insert(t.users).values({ name: d.name, email: d.email, phone: d.phone, kind: d.kind, roleId: d.roleId ?? null, status: "INVITED" }).returning();
  return user;
}

async function sendInvite(ctx: TenantCtx, user: { id: string; name: string; email: string }) {
  const url = inviteUrl(ctx.institution.slug, await createAuthToken(ctx.db, user.id, "INVITE"));
  const mailed = await sendMail({ to: user.email, ...inviteMail(ctx.settings.name, user.name, url) });
  return { url, mailed };
}

async function assertChildCapacity(ctx: TenantCtx) {
  if (!ctx.institution.planId) return;
  const plan = await central().query.plans.findFirst({ where: eq(c.plans.id, ctx.institution.planId) });
  if (!plan?.maxChildren) return;
  const [{ n }] = await ctx.db.select({ n: count() }).from(t.children).where(eq(t.children.status, "ACTIVE"));
  if (n >= plan.maxChildren) fail(`O plano ${plan.name} permite até ${plan.maxChildren} crianças ativas. Contacte a plataforma para mudar de plano.`);
}

// ======================= CRIANÇAS =======================
function childInput(fd: FormData, today: string) {
  const firstName = str(fd, "firstName"), lastName = str(fd, "lastName"), birthDate = str(fd, "birthDate");
  if (firstName.length < 1 || firstName.length > 80) fail("Indique o nome próprio.");
  if (lastName.length < 1 || lastName.length > 80) fail("Indique o apelido.");
  if (!isIsoDate(birthDate) || birthDate > today) fail("Data de nascimento inválida.");
  const gender = str(fd, "gender");
  if (!["", "F", "M"].includes(gender)) fail("Sexo inválido.");
  const enrolledAt = str(fd, "enrolledAt") || today;
  if (!isIsoDate(enrolledAt)) fail("Data de inscrição inválida.");
  return {
    firstName, lastName, birthDate, gender, enrolledAt,
    classroomId: str(fd, "classroomId") || null, feePlanId: str(fd, "feePlanId") || null,
    healthNotes: str(fd, "healthNotes").slice(0, 2000), notes: str(fd, "notes").slice(0, 2000),
  };
}

async function assertRefs(ctx: TenantCtx, d: { classroomId: string | null; feePlanId: string | null }) {
  if (d.classroomId && !(await ctx.db.query.classrooms.findFirst({ where: eq(t.classrooms.id, d.classroomId) }))) fail("Turma inválida.");
  if (d.feePlanId && !(await ctx.db.query.feePlans.findFirst({ where: eq(t.feePlans.id, d.feePlanId) }))) fail("Plano de mensalidade inválido.");
}

export async function createChildAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "children.manage" });
    const d = childInput(fd, todayIn(ctx.settings.timezone));
    await assertRefs(ctx, d);
    await assertChildCapacity(ctx);
    const consent = bool(fd, "photoConsent");
    const [child] = await ctx.db.insert(t.children).values({
      ...d, photoConsent: consent, photoConsentAt: consent ? new Date() : null, photoConsentBy: consent ? ctx.user.name : null,
    }).returning();
    await audit(ctx, "Criança registada", { entity: "child", entityId: child.id, details: { nome: `${d.firstName} ${d.lastName}` } });
    return { ok: true, redirect: `${ctx.base}/gestao/criancas/${child.id}?tab=familia`, message: "Criança registada. Associe agora os encarregados." };
  });
}

export async function updateChildAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "children.manage" });
    const id = str(fd, "childId");
    await assertChildAccess(ctx, id);
    const d = childInput(fd, todayIn(ctx.settings.timezone));
    await assertRefs(ctx, d);
    await ctx.db.update(t.children).set(d).where(eq(t.children.id, id));
    await audit(ctx, "Criança editada", { entity: "child", entityId: id });
    return { ok: true, message: "Dados guardados." };
  });
}

export async function setChildStatusAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "children.manage" });
    const id = str(fd, "childId");
    await assertChildAccess(ctx, id);
    const activate = str(fd, "status") === "ACTIVE";
    if (activate) await assertChildCapacity(ctx);
    const today = todayIn(ctx.settings.timezone);
    await ctx.db.update(t.children).set(activate ? { status: "ACTIVE", leftAt: null } : { status: "INACTIVE", leftAt: today }).where(eq(t.children.id, id));
    await audit(ctx, activate ? "Criança reativada" : "Criança marcada como inativa (saída)", { entity: "child", entityId: id });
    return { ok: true, message: activate ? "Criança reativada." : "Criança marcada como inativa. O histórico mantém-se." };
  });
}

export async function uploadChildPhotoAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "children.manage" });
    const id = str(fd, "childId");
    await assertChildAccess(ctx, id);
    const f = file(fd, "photo");
    if (!f) fail("Escolha uma fotografia.");
    const child = await ctx.db.query.children.findFirst({ where: eq(t.children.id, id) });
    const saved = await saveUpload(ctx.institution.id, `children/${id}`, f!, { kind: "image", maxMb: 5 });
    await ctx.db.update(t.children).set({ photoPath: saved.path }).where(eq(t.children.id, id));
    await deleteTenantFile(ctx.institution.id, child?.photoPath);
    return { ok: true, message: "Fotografia atualizada." };
  });
}

export async function setPhotoConsentAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "children.manage" });
    const id = str(fd, "childId");
    await assertChildAccess(ctx, id);
    const consent = str(fd, "consent") === "1";
    await ctx.db.update(t.children).set({ photoConsent: consent, photoConsentAt: new Date(), photoConsentBy: ctx.user.name }).where(eq(t.children.id, id));
    await audit(ctx, consent ? "Autorização de fotografias concedida" : "Autorização de fotografias retirada", { entity: "child", entityId: id });
    return { ok: true, message: consent ? "Fotografias autorizadas." : "Autorização retirada: as fotografias deixam de ser visíveis para os pais." };
  });
}

export async function addPickupAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "children.manage" });
    const childId = str(fd, "childId");
    await assertChildAccess(ctx, childId);
    const name = personName.parse(str(fd, "name"));
    await ctx.db.insert(t.authorizedPickups).values({
      childId, name, phone: str(fd, "phone").slice(0, 40), relationship: str(fd, "relationship").slice(0, 60), idDocument: str(fd, "idDocument").slice(0, 60),
    });
    await audit(ctx, "Pessoa autorizada a recolher adicionada", { entity: "child", entityId: childId, details: { nome: name } });
    return { ok: true, message: "Pessoa autorizada adicionada." };
  });
}

export async function removePickupAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "children.manage" });
    const row = await ctx.db.query.authorizedPickups.findFirst({ where: eq(t.authorizedPickups.id, str(fd, "id")) });
    if (!row) fail("Registo não encontrado.");
    await assertChildAccess(ctx, row!.childId);
    await ctx.db.delete(t.authorizedPickups).where(eq(t.authorizedPickups.id, row!.id));
    await audit(ctx, "Pessoa autorizada a recolher removida", { entity: "child", entityId: row!.childId, details: { nome: row!.name } });
    return { ok: true, message: "Removido." };
  });
}

export async function uploadDocumentAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "documents.manage" });
    const childId = str(fd, "childId");
    await assertChildAccess(ctx, childId);
    const f = file(fd, "file");
    if (!f) fail("Escolha um ficheiro.");
    const name = str(fd, "name") || f!.name;
    const saved = await saveUpload(ctx.institution.id, `children/${childId}/docs`, f!, { kind: "document", maxMb: 10 });
    await ctx.db.insert(t.documents).values({ childId, name: name.slice(0, 160), path: saved.path, mime: saved.mime, sizeBytes: saved.size, uploadedByName: ctx.user.name });
    await audit(ctx, "Documento adicionado", { entity: "child", entityId: childId, details: { nome: name } });
    return { ok: true, message: "Documento guardado." };
  });
}

export async function deleteDocumentAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "documents.manage" });
    const doc = await ctx.db.query.documents.findFirst({ where: eq(t.documents.id, str(fd, "id")) });
    if (!doc) fail("Documento não encontrado.");
    await assertChildAccess(ctx, doc!.childId);
    await ctx.db.delete(t.documents).where(eq(t.documents.id, doc!.id));
    await deleteTenantFile(ctx.institution.id, doc!.path);
    await audit(ctx, "Documento eliminado", { entity: "child", entityId: doc!.childId, details: { nome: doc!.name } });
    return { ok: true, message: "Documento eliminado." };
  });
}

// ======================= ENCARREGADOS =======================
/** Associa um encarregado a uma criança: um já existente ou um novo (com convite). */
export async function linkGuardianAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "guardians.manage" });
    const childId = str(fd, "childId");
    await assertChildAccess(ctx, childId);
    const relationship = str(fd, "relationship").slice(0, 60) || "Encarregado";
    const link = { relationship, isPrimary: bool(fd, "isPrimary"), canPickup: bool(fd, "canPickup") };
    let guardianId = str(fd, "guardianId");
    let invite: { url: string; mailed: boolean } | null = null;

    if (guardianId) {
      if (!(await ctx.db.query.guardians.findFirst({ where: eq(t.guardians.id, guardianId) }))) fail("Encarregado não encontrado.");
    } else {
      const d = z.object({ name: personName, email, phone: z.string().trim().max(40) }).parse({ name: str(fd, "name"), email: str(fd, "email"), phone: str(fd, "phone") });
      const user = await createInvitedUser(ctx, { ...d, kind: "GUARDIAN" });
      const [g] = await ctx.db.insert(t.guardians).values({ userId: user.id }).returning();
      guardianId = g.id;
      invite = await sendInvite(ctx, user);
    }
    const exists = await ctx.db.query.childGuardians.findFirst({ where: and(eq(t.childGuardians.childId, childId), eq(t.childGuardians.guardianId, guardianId)) });
    if (exists) fail("Este encarregado já está associado a esta criança.");
    if (link.isPrimary) await ctx.db.update(t.childGuardians).set({ isPrimary: false }).where(eq(t.childGuardians.childId, childId));
    await ctx.db.insert(t.childGuardians).values({ childId, guardianId, ...link });
    await audit(ctx, "Encarregado associado à criança", { entity: "child", entityId: childId, details: { guardianId } });
    if (invite) return { ok: true, message: invite.mailed ? "Encarregado criado e convite enviado por email." : "Encarregado criado.", data: { url: invite.url } };
    return { ok: true, message: "Encarregado associado." };
  });
}

export async function unlinkGuardianAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "guardians.manage" });
    const childId = str(fd, "childId"), guardianId = str(fd, "guardianId");
    await assertChildAccess(ctx, childId);
    await ctx.db.delete(t.childGuardians).where(and(eq(t.childGuardians.childId, childId), eq(t.childGuardians.guardianId, guardianId)));
    await audit(ctx, "Encarregado desassociado da criança", { entity: "child", entityId: childId, details: { guardianId } });
    return { ok: true, message: "Associação removida. O encarregado deixa de ver esta criança." };
  });
}

export async function createGuardianAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "guardians.manage" });
    const d = z.object({ name: personName, email, phone: z.string().trim().max(40) }).parse({ name: str(fd, "name"), email: str(fd, "email"), phone: str(fd, "phone") });
    const user = await createInvitedUser(ctx, { ...d, kind: "GUARDIAN" });
    const [g] = await ctx.db.insert(t.guardians).values({
      userId: user.id, address: str(fd, "address").slice(0, 200), occupation: str(fd, "occupation").slice(0, 80), idDocument: str(fd, "idDocument").slice(0, 60),
    }).returning();
    const invite = await sendInvite(ctx, user);
    await audit(ctx, "Encarregado registado", { entity: "guardian", entityId: g.id, details: { email: d.email } });
    return { ok: true, message: invite.mailed ? "Encarregado criado e convite enviado por email." : "Encarregado criado.", data: { url: invite.url } };
  });
}

export async function updateGuardianAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "guardians.manage" });
    const g = await ctx.db.query.guardians.findFirst({ where: eq(t.guardians.id, str(fd, "guardianId")) });
    if (!g || !(await staffCanSeeGuardian(ctx, g.id))) fail("Encarregado não encontrado.");
    const d = z.object({ name: personName, phone: z.string().trim().max(40) }).parse({ name: str(fd, "name"), phone: str(fd, "phone") });
    await ctx.db.update(t.users).set(d).where(eq(t.users.id, g!.userId));
    await ctx.db.update(t.guardians).set({
      address: str(fd, "address").slice(0, 200), occupation: str(fd, "occupation").slice(0, 80), idDocument: str(fd, "idDocument").slice(0, 60), notes: str(fd, "notes").slice(0, 1000),
    }).where(eq(t.guardians.id, g!.id));
    await audit(ctx, "Encarregado editado", { entity: "guardian", entityId: g!.id });
    return { ok: true, message: "Dados guardados." };
  });
}

// ======================= CONTAS (convites, suspensão) =======================
async function manageableUser(ctx: TenantCtx, userId: string) {
  const user = await ctx.db.query.users.findFirst({ where: eq(t.users.id, userId), with: { role: true } });
  if (!user || user.deletedAt) fail("Conta não encontrada.");
  if (user!.kind === "GUARDIAN" && !ctx.can("guardians.manage")) fail("Não tem permissão para gerir encarregados.");
  if (user!.kind === "STAFF" && !ctx.can("employees.manage")) fail("Não tem permissão para gerir funcionários.");
  if (user!.role?.key === DIRECTOR_KEY && user!.id !== ctx.user.id) fail("As contas de diretor são geridas pela plataforma.");
  return user!;
}

/** Gera novo link de convite (conta por ativar) ou de recuperação (conta ativa). */
export async function accessLinkAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: ["guardians.manage", "employees.manage"] });
    const user = await manageableUser(ctx, str(fd, "userId"));
    if (user.status === "SUSPENDED") fail("Esta conta está suspensa.");
    const invited = user.status === "INVITED";
    const token = await createAuthToken(ctx.db, user.id, invited ? "INVITE" : "RESET");
    const url = invited ? inviteUrl(ctx.institution.slug, token) : resetUrl(ctx.institution.slug, token);
    await audit(ctx, invited ? "Novo convite gerado" : "Link de recuperação gerado", { entity: "user", entityId: user.id, details: { email: user.email } });
    return { ok: true, message: "Link gerado.", data: { url } };
  });
}

export async function setUserStatusAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: ["guardians.manage", "employees.manage"] });
    const user = await manageableUser(ctx, str(fd, "userId"));
    if (user.id === ctx.user.id) fail("Não pode suspender a sua própria conta.");
    const suspend = str(fd, "status") === "SUSPENDED";
    await ctx.db.update(t.users).set({ status: suspend ? "SUSPENDED" : user.passwordHash ? "ACTIVE" : "INVITED" }).where(eq(t.users.id, user.id));
    if (suspend) await destroyUserSessions("TENANT", user.id, ctx.institution.id);
    await audit(ctx, suspend ? "Conta suspensa" : "Conta reativada", { entity: "user", entityId: user.id, details: { email: user.email } });
    return { ok: true, message: suspend ? "Conta suspensa. O histórico mantém-se." : "Conta reativada." };
  });
}

// ======================= FUNCIONÁRIOS =======================
async function assignableRole(ctx: TenantCtx, roleId: string) {
  const role = await ctx.db.query.roles.findFirst({ where: eq(t.roles.id, roleId) });
  if (!role) fail("Cargo inválido.");
  if (role!.key === DIRECTOR_KEY) fail("O cargo de diretor só pode ser atribuído pela plataforma.");
  return role!;
}

async function setEmployeeClassrooms(ctx: TenantCtx, employeeId: string, ids: string[]) {
  const valid = ids.length ? (await ctx.db.select({ id: t.classrooms.id }).from(t.classrooms).where(inArray(t.classrooms.id, ids))).map((r) => r.id) : [];
  await ctx.db.delete(t.classroomEmployees).where(eq(t.classroomEmployees.employeeId, employeeId));
  if (valid.length) await ctx.db.insert(t.classroomEmployees).values(valid.map((classroomId) => ({ classroomId, employeeId })));
}

export async function createEmployeeAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "employees.manage" });
    const d = z.object({ name: personName, email, phone: z.string().trim().max(40) }).parse({ name: str(fd, "name"), email: str(fd, "email"), phone: str(fd, "phone") });
    const role = await assignableRole(ctx, str(fd, "roleId"));
    const hireDate = optDate(str(fd, "hireDate"), "Data de admissão");
    const user = await createInvitedUser(ctx, { ...d, kind: "STAFF", roleId: role.id });
    const [emp] = await ctx.db.insert(t.employees).values({
      userId: user.id, jobTitle: str(fd, "jobTitle").slice(0, 80) || role.name, hireDate, schedule: str(fd, "schedule").slice(0, 200),
    }).returning();
    await setEmployeeClassrooms(ctx, emp.id, fd.getAll("classroomIds").map(String));
    const invite = await sendInvite(ctx, user);
    await audit(ctx, "Funcionário registado", { entity: "employee", entityId: emp.id, details: { email: d.email, cargo: role.name } });
    return { ok: true, message: invite.mailed ? "Funcionário criado e convite enviado por email." : "Funcionário criado.", data: { url: invite.url } };
  });
}

export async function updateEmployeeAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "employees.manage" });
    const emp = await ctx.db.query.employees.findFirst({ where: eq(t.employees.id, str(fd, "employeeId")), with: { user: { with: { role: true } } } });
    if (!emp) fail("Funcionário não encontrado.");
    const isDirectorAccount = emp!.user.role?.key === DIRECTOR_KEY;
    if (isDirectorAccount && emp!.userId !== ctx.user.id) fail("As contas de diretor são geridas pela plataforma.");
    const d = z.object({ name: personName, phone: z.string().trim().max(40) }).parse({ name: str(fd, "name"), phone: str(fd, "phone") });
    const hireDate = optDate(str(fd, "hireDate"), "Data de admissão");
    const patch: { name: string; phone: string; roleId?: string } = d;
    if (!isDirectorAccount) {
      if (emp!.userId === ctx.user.id && str(fd, "roleId") !== emp!.user.roleId) fail("Não pode alterar o seu próprio cargo.");
      patch.roleId = (await assignableRole(ctx, str(fd, "roleId"))).id;
    }
    await ctx.db.update(t.users).set(patch).where(eq(t.users.id, emp!.userId));
    await ctx.db.update(t.employees).set({
      jobTitle: str(fd, "jobTitle").slice(0, 80), hireDate, schedule: str(fd, "schedule").slice(0, 200), address: str(fd, "address").slice(0, 200), notes: str(fd, "notes").slice(0, 1000),
    }).where(eq(t.employees.id, emp!.id));
    await setEmployeeClassrooms(ctx, emp!.id, fd.getAll("classroomIds").map(String));
    await audit(ctx, "Funcionário editado", { entity: "employee", entityId: emp!.id });
    return { ok: true, message: "Dados guardados." };
  });
}

// ======================= CARGOS E PERMISSÕES =======================
function roleInput(fd: FormData) {
  const name = str(fd, "name");
  if (name.length < 2 || name.length > 60) fail("Indique o nome do cargo.");
  const panel = str(fd, "panel") === "CLASSROOM" ? ("CLASSROOM" as const) : ("MANAGEMENT" as const);
  const permissions = fd.getAll("permissions").map(String).filter((p): p is Permission => (ALL_PERMISSIONS as string[]).includes(p));
  return { name, description: str(fd, "description").slice(0, 200), panel, allClassrooms: str(fd, "scope") !== "ASSIGNED", permissions };
}

export async function saveRoleAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "roles.manage" });
    const id = str(fd, "roleId");
    const d = roleInput(fd);
    // Só o diretor pode alterar o próprio cargo ou conceder permissões que não tem.
    if (!ctx.isDirector) {
      if (id && id === ctx.role?.id) fail("Não pode alterar o seu próprio cargo.");
      if (d.permissions.some((p) => !ctx.can(p))) fail("Não pode conceder permissões que o seu cargo não tem.");
    }
    const dup = await ctx.db.query.roles.findFirst({ where: and(eq(t.roles.name, d.name), id ? ne(t.roles.id, id) : undefined) });
    if (dup) fail("Já existe um cargo com este nome.");
    if (id) {
      const role = await ctx.db.query.roles.findFirst({ where: eq(t.roles.id, id) });
      if (!role) fail("Cargo não encontrado.");
      if (role!.key === DIRECTOR_KEY) fail("O cargo de diretor tem sempre acesso total e não pode ser alterado.");
      await ctx.db.update(t.roles).set(d).where(eq(t.roles.id, id));
    } else {
      await ctx.db.insert(t.roles).values(d);
    }
    await audit(ctx, id ? "Cargo editado" : "Cargo criado", { entity: "role", entityId: id || undefined, details: { nome: d.name, permissoes: d.permissions.length } });
    return { ok: true, message: "Cargo guardado." };
  });
}

export async function deleteRoleAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "roles.manage" });
    const role = await ctx.db.query.roles.findFirst({ where: eq(t.roles.id, str(fd, "roleId")) });
    if (!role) fail("Cargo não encontrado.");
    if (role!.isSystem) fail("Os cargos base não podem ser eliminados.");
    const [{ n }] = await ctx.db.select({ n: count() }).from(t.users).where(eq(t.users.roleId, role!.id));
    if (n > 0) fail("Existem funcionários com este cargo. Atribua-lhes outro cargo primeiro.");
    await ctx.db.delete(t.roles).where(eq(t.roles.id, role!.id));
    await audit(ctx, "Cargo eliminado", { entity: "role", details: { nome: role!.name } });
    return { ok: true, message: "Cargo eliminado." };
  });
}

// ======================= TURMAS E SALAS =======================
function classroomInput(fd: FormData) {
  const name = str(fd, "name");
  if (name.length < 2 || name.length > 60) fail("Indique o nome da turma.");
  const capacity = Number(str(fd, "capacity"));
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) fail("Capacidade inválida.");
  const num = (k: string) => {
    const v = str(fd, k);
    if (!v) return null;
    if (!/^\d{1,3}$/.test(v)) fail("Idade inválida (em meses).");
    return Number(v);
  };
  const color = str(fd, "color");
  const ageMinMonths = num("ageMin"), ageMaxMonths = num("ageMax");
  if (ageMinMonths !== null && ageMaxMonths !== null && ageMinMonths > ageMaxMonths) fail("A idade mínima não pode ser superior à máxima.");
  return { name, capacity, color: ROOM_COLOR_KEYS.includes(color) ? color : "green", ageMinMonths, ageMaxMonths };
}

async function setClassroomEmployees(ctx: TenantCtx, classroomId: string, ids: string[]) {
  const valid = ids.length ? (await ctx.db.select({ id: t.employees.id }).from(t.employees).where(inArray(t.employees.id, ids))).map((r) => r.id) : [];
  await ctx.db.delete(t.classroomEmployees).where(eq(t.classroomEmployees.classroomId, classroomId));
  if (valid.length) await ctx.db.insert(t.classroomEmployees).values(valid.map((employeeId) => ({ classroomId, employeeId })));
}

export async function saveClassroomAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "classrooms.manage" });
    const id = str(fd, "classroomId");
    const d = classroomInput(fd);
    const dup = await ctx.db.query.classrooms.findFirst({ where: and(eq(t.classrooms.name, d.name), id ? ne(t.classrooms.id, id) : undefined) });
    if (dup) fail("Já existe uma turma com este nome.");
    let classroomId = id;
    if (id) {
      const [row] = await ctx.db.update(t.classrooms).set({ ...d, active: bool(fd, "active") }).where(eq(t.classrooms.id, id)).returning();
      if (!row) fail("Turma não encontrada.");
    } else {
      const [row] = await ctx.db.insert(t.classrooms).values(d).returning();
      classroomId = row.id;
    }
    await setClassroomEmployees(ctx, classroomId, fd.getAll("employeeIds").map(String));
    await audit(ctx, id ? "Turma editada" : "Turma criada", { entity: "classroom", entityId: classroomId, details: { nome: d.name } });
    return { ok: true, message: "Turma guardada." };
  });
}

export async function deleteClassroomAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "classrooms.manage" });
    const id = str(fd, "classroomId");
    const [{ n }] = await ctx.db.select({ n: count() }).from(t.children).where(eq(t.children.classroomId, id));
    if (n > 0) fail("Esta turma tem crianças. Mude-as de turma ou desative a turma em vez de a eliminar.");
    const [row] = await ctx.db.delete(t.classrooms).where(eq(t.classrooms.id, id)).returning();
    if (!row) fail("Turma não encontrada.");
    await audit(ctx, "Turma eliminada", { entity: "classroom", details: { nome: row.name } });
    return { ok: true, redirect: `${ctx.base}/gestao/turmas`, message: "Turma eliminada." };
  });
}
