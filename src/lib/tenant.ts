import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { central, c } from "@/db/central";
import type { Institution } from "@/db/central/schema";
import { getTenantDb, t, type TenantDb } from "@/db/tenant";
import type { Role, Setting, User } from "@/db/tenant/schema";
import { readSession } from "./auth";
import { ALL_PERMISSIONS, DIRECTOR_KEY, type Permission } from "./permissions";
import { ActionError } from "./result";
import { readableTextColorOn } from "./contrast";

export type PanelKind = "MANAGEMENT" | "CLASSROOM" | "GUARDIAN";

export type TenantCtx = {
  institution: Institution;
  db: TenantDb;
  settings: Setting;
  user: User;
  role: Role | null;
  isDirector: boolean;
  isGuardian: boolean;
  permissions: Set<Permission>;
  panel: PanelKind;
  employeeId: string | null;
  guardianId: string | null;
  /** Turmas a que o funcionário tem acesso. null = todas. */
  classroomIds: string[] | null;
  readOnly: boolean;
  impersonating: boolean;
  base: string;
  can: (p: Permission) => boolean;
};

type Loaded =
  | { ok: true; ctx: TenantCtx }
  | { ok: false; reason: "not_found" | "unavailable" | "anonymous" | "blocked"; institution?: Institution };

export const getInstitutionBySlug = cache(async (slug: string) => {
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(slug)) return null;
  return (await central().query.institutions.findFirst({ where: eq(c.institutions.slug, slug) })) ?? null;
});

export function institutionUsable(status: Institution["status"]): boolean {
  return status === "TRIAL" || status === "ACTIVE" || status === "PAST_DUE" || status === "SUSPENDED";
}

/**
 * Resolve o contexto do tenant NO SERVIDOR: a instituição vem do slug, mas só
 * é aceite se a sessão pertencer a essa mesma instituição. A BD usada é
 * sempre a registada na central para essa instituição.
 */
export const loadTenant = cache(async (slug: string): Promise<Loaded> => {
  const institution = await getInstitutionBySlug(slug);
  if (!institution) return { ok: false, reason: "not_found" };
  if (!institutionUsable(institution.status)) return { ok: false, reason: "unavailable", institution };

  const session = await readSession("TENANT");
  if (!session || session.institutionId !== institution.id) return { ok: false, reason: "anonymous", institution };

  const db = await getTenantDb(institution.id);
  const user = await db.query.users.findFirst({ where: eq(t.users.id, session.userId), with: { role: true, employee: true, guardian: true } });
  if (!user || user.status !== "ACTIVE" || user.deletedAt) return { ok: false, reason: "anonymous", institution };

  const isGuardian = user.kind === "GUARDIAN";
  const isDirector = !isGuardian && user.role?.key === DIRECTOR_KEY;
  const suspended = institution.status === "SUSPENDED";
  if (suspended && !isDirector) return { ok: false, reason: "blocked", institution };

  const permissions = new Set<Permission>(
    isGuardian ? [] : isDirector ? ALL_PERMISSIONS : ((user.role?.permissions ?? []) as Permission[]).filter((p) => ALL_PERMISSIONS.includes(p)),
  );

  let classroomIds: string[] | null = null;
  if (!isGuardian && !isDirector && user.role && !user.role.allClassrooms) {
    classroomIds = user.employee
      ? (await db.select({ id: t.classroomEmployees.classroomId }).from(t.classroomEmployees)
          .where(eq(t.classroomEmployees.employeeId, user.employee.id))).map((r) => r.id)
      : [];
  }

  let settings = await db.query.settings.findFirst({ where: eq(t.settings.id, 1) });
  if (!settings) {
    [settings] = await db.insert(t.settings).values({ id: 1, name: institution.name, currency: institution.currency, timezone: institution.timezone }).returning();
  }

  const { role, employee, guardian, ...plainUser } = user;
  const ctx: TenantCtx = {
    institution, db, settings, user: plainUser, role: role ?? null,
    isDirector, isGuardian, permissions,
    panel: isGuardian ? "GUARDIAN" : (role?.panel ?? "MANAGEMENT"),
    employeeId: employee?.id ?? null,
    guardianId: guardian?.id ?? null,
    classroomIds,
    readOnly: suspended,
    impersonating: !!session.impersonatorId,
    base: `/c/${institution.slug}`,
    can: (p) => permissions.has(p),
  };
  return { ok: true, ctx };
});

type Need = { permission?: Permission | Permission[]; panel?: PanelKind | PanelKind[] };

function allowed(ctx: TenantCtx, need: Need): boolean {
  if (need.panel) {
    const panels = Array.isArray(need.panel) ? need.panel : [need.panel];
    if (!panels.includes(ctx.panel)) return false;
  }
  if (need.permission) {
    const perms = Array.isArray(need.permission) ? need.permission : [need.permission];
    if (!perms.some((p) => ctx.permissions.has(p))) return false;
  }
  return true;
}

/** Para páginas: redireciona se não houver sessão/permissão. */
export async function requireTenant(slug: string, need: Need = {}): Promise<TenantCtx> {
  const r = await loadTenant(slug);
  if (!r.ok) {
    if (r.reason === "not_found") notFound();
    if (r.reason === "anonymous") redirect(`/c/${slug}/entrar`);
    redirect(`/c/${slug}/indisponivel`);
  }
  if (!allowed(r.ctx, need)) redirect(`/c/${slug}/sem-acesso`);
  return r.ctx;
}

/** Para Server Actions e Route Handlers: lança erro em vez de redirecionar. */
export async function tenantAction(slug: string, need: Need & { write?: boolean } = {}): Promise<TenantCtx> {
  const r = await loadTenant(slug);
  if (!r.ok) {
    throw new ActionError(r.reason === "anonymous" ? "Sessão expirada. Inicie sessão novamente." : "Instituição indisponível.");
  }
  if (!allowed(r.ctx, need)) throw new ActionError("Não tem permissão para esta ação.");
  if (need.write !== false && r.ctx.readOnly) throw new ActionError("Instituição suspensa: apenas consulta é permitida.");
  return r.ctx;
}

// ---------- âmbito de dados (proteção contra acesso horizontal) ----------

/** IDs das crianças a que um encarregado está formalmente associado. */
export async function guardianChildIds(ctx: TenantCtx): Promise<string[]> {
  if (!ctx.guardianId) return [];
  const rows = await ctx.db.select({ id: t.childGuardians.childId }).from(t.childGuardians)
    .where(eq(t.childGuardians.guardianId, ctx.guardianId));
  return rows.map((r) => r.id);
}

/** Verifica se o utilizador da sessão pode aceder a uma criança concreta. */
export async function canAccessChild(ctx: TenantCtx, childId: string): Promise<boolean> {
  if (ctx.isGuardian) {
    if (!ctx.guardianId) return false;
    const link = await ctx.db.query.childGuardians.findFirst({
      where: and(eq(t.childGuardians.childId, childId), eq(t.childGuardians.guardianId, ctx.guardianId)),
    });
    return !!link;
  }
  const child = await ctx.db.query.children.findFirst({ where: eq(t.children.id, childId), columns: { id: true, classroomId: true } });
  if (!child) return false;
  if (ctx.classroomIds === null) return true;
  return !!child.classroomId && ctx.classroomIds.includes(child.classroomId);
}

export async function assertChildAccess(ctx: TenantCtx, childId: string) {
  if (!(await canAccessChild(ctx, childId))) throw new ActionError("Não tem acesso a esta criança.");
}

/** Turmas visíveis para o utilizador (respeita turmas autorizadas). */
export async function visibleClassrooms(ctx: TenantCtx, onlyActive = true) {
  const rows = await ctx.db.query.classrooms.findMany({ orderBy: (cl, { asc }) => asc(cl.name) });
  return rows.filter((r) => (!onlyActive || r.active) && (ctx.classroomIds === null || ctx.classroomIds.includes(r.id)));
}

/** Condição SQL para limitar crianças às turmas autorizadas do funcionário. */
export function childScope(ctx: TenantCtx) {
  if (ctx.classroomIds === null) return undefined;
  if (ctx.classroomIds.length === 0) return eq(t.children.id, "__none__");
  return inArray(t.children.classroomId, ctx.classroomIds);
}

/** Verifica se um funcionário pode ver a conversa de um encarregado. */
export async function staffCanSeeGuardian(ctx: TenantCtx, guardianId: string): Promise<boolean> {
  if (ctx.classroomIds === null) return true;
  if (!ctx.classroomIds.length) return false;
  const rows = await ctx.db.select({ id: t.children.id }).from(t.childGuardians)
    .innerJoin(t.children, eq(t.children.id, t.childGuardians.childId))
    .where(and(eq(t.childGuardians.guardianId, guardianId), inArray(t.children.classroomId, ctx.classroomIds)));
  return rows.length > 0;
}

export async function audit(ctx: TenantCtx, action: string, extra: { entity?: string; entityId?: string; details?: unknown } = {}) {
  await ctx.db.insert(t.auditLogs).values({
    userId: ctx.user.id,
    userName: ctx.impersonating ? `${ctx.user.name} (suporte da plataforma)` : ctx.user.name,
    action, entity: extra.entity ?? "", entityId: extra.entityId ?? null,
    details: (extra.details ?? null) as object | null,
  });
}

export async function notify(db: TenantDb, userIds: string[], n: { title: string; body?: string; href?: string }) {
  const unique = [...new Set(userIds)];
  if (!unique.length) return;
  await db.insert(t.notifications).values(unique.map((userId) => ({ userId, title: n.title, body: n.body ?? "", href: n.href ?? "" })));
}

/** IDs dos funcionários ativos com uma permissão (os diretores têm sempre todas). */
export async function staffWithPermission(db: TenantDb, permission: Permission): Promise<string[]> {
  const staff = await db.query.users.findMany({ where: and(eq(t.users.kind, "STAFF"), eq(t.users.status, "ACTIVE"), isNull(t.users.deletedAt)), with: { role: true } });
  return staff.filter((u) => u.role && (u.role.key === DIRECTOR_KEY || u.role.permissions.includes(permission))).map((u) => u.id);
}

export function panelHome(ctx: TenantCtx): string {
  return `${ctx.base}/${ctx.panel === "GUARDIAN" ? "pais" : ctx.panel === "CLASSROOM" ? "sala" : "gestao"}`;
}

/** Cor de texto por cima do accent (triplet) — por contraste, para chips,
 * bolhas e selos ficarem legíveis mesmo com accents claros. */
function accentInkTriplet(hex: string): string {
  const rgb = hexToRgbTriplet(hex).split(" ").map(Number);
  const hexDe = (n: number) => Math.min(255, Math.max(0, n)).toString(16).padStart(2, "0");
  return hexToRgbTriplet(readableTextColorOn(`#${rgb.map((n) => hexDe(n)).join("")}`));
}

export function hexToRgbTriplet(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}` : "194 65 12";
}

/** Marca da instituição para páginas sem sessão (login, convite). */
export const tenantBranding = cache(async (slug: string) => {
  const institution = await getInstitutionBySlug(slug);
  if (!institution || !institutionUsable(institution.status)) return { institution, name: institution?.name ?? "", accent: "194 65 12", accentInk: "255 255 255", logoSrc: null as string | null };
  try {
    const db = await getTenantDb(institution.id);
    const s = await db.query.settings.findFirst({ where: eq(t.settings.id, 1) });
    return {
      institution, name: s?.name ?? institution.name, accent: hexToRgbTriplet(s?.accentColor ?? ""),
      accentInk: accentInkTriplet(s?.accentColor ?? ""),
      logoSrc: s?.logoPath ? `/c/${slug}/logo?v=${encodeURIComponent(s.logoPath.slice(-24))}` : null,
    };
  } catch {
    return { institution, name: institution.name, accent: "194 65 12", accentInk: "255 255 255", logoSrc: null as string | null };
  }
});

export function fileUrl(ctx: { base: string }, relPath: string | null | undefined): string | null {
  return relPath ? `${ctx.base}/ficheiro/${relPath}` : null;
}

export async function unreadNotifications(ctx: TenantCtx): Promise<number> {
  const rows = await ctx.db.select({ id: t.notifications.id }).from(t.notifications)
    .where(and(eq(t.notifications.userId, ctx.user.id), isNull(t.notifications.readAt))).limit(10);
  return rows.length;
}
