import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { central, centralPool, c } from "@/db/central";
import type { JobLogEntry } from "@/db/central/schema";
import { migrateTenant } from "@/db/migrate";
import { dropTenantPool, getTenantDb, t, tenantUrl } from "@/db/tenant";
import { decrypt, encrypt, randomToken } from "@/lib/crypto";
import { sendMail } from "@/lib/mail";
import { DIRECTOR_KEY, SYSTEM_ROLES } from "@/lib/permissions";
import { createAuthToken, inviteMail, inviteUrl } from "./accounts";

export const PROVISION_STEPS = [
  "Gerar identificador e credenciais",
  "Criar base de dados PostgreSQL independente",
  "Executar migrations e criar tabelas",
  "Configurar cargos e permissões iniciais",
  "Criar e associar a conta do diretor",
  "Registar a instituição na base central",
  "Enviar convite ao diretor",
] as const;

export const RESERVED_SLUGS = new Set([
  "admin", "api", "c", "www", "app", "entrar", "login", "pedir-adesao", "offline", "suporte", "static", "central", "template", "postgres", "noscrianca",
]);

export function slugProblem(slug: string): string | null {
  if (!/^[a-z][a-z0-9-]{2,29}$/.test(slug) || slug.endsWith("-") || slug.includes("--")) {
    return "O endereço deve ter 3 a 30 caracteres: letras minúsculas, números e hífenes, começando por letra.";
  }
  if (RESERVED_SLUGS.has(slug)) return "Este endereço está reservado.";
  return null;
}

export function slugify(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/^[^a-z]+/, "").slice(0, 30).replace(/-+$/, "");
}

export function dbNameForSlug(slug: string): string {
  return `nc_t_${slug.replace(/-/g, "_")}`;
}

const IDENT = /^[a-z][a-z0-9_]{2,62}$/;
function ident(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Identificador inválido: ${name}`);
  return `"${name}"`;
}

export type NewInstitution = {
  slug: string; name: string; email: string; phone: string; address: string; city: string;
  currency: string; timezone: string;
  directorName: string; directorEmail: string; directorPhone: string;
  planId: string; billingCycle: "MONTHLY" | "YEARLY"; trialDays: number | null;
};

/** Cria o registo da instituição + job. Impede duplicações de slug. */
export async function createInstitution(input: NewInstitution): Promise<{ institutionId: string; jobId: string }> {
  const problem = slugProblem(input.slug);
  if (problem) throw new Error(problem);
  return central().transaction(async (tx) => {
    const exists = await tx.query.institutions.findFirst({ where: eq(c.institutions.slug, input.slug) });
    if (exists) throw new Error("Já existe uma instituição com este endereço.");
    const now = new Date();
    const [inst] = await tx.insert(c.institutions).values({
      slug: input.slug, name: input.name, email: input.email, phone: input.phone, address: input.address, city: input.city,
      currency: input.currency, timezone: input.timezone, status: "PROVISIONING",
      planId: input.planId, billingCycle: input.billingCycle,
      trialEndsAt: input.trialDays ? new Date(now.getTime() + input.trialDays * 86_400_000) : null,
      currentPeriodEnd: input.trialDays ? null : now,
      directorName: input.directorName, directorEmail: input.directorEmail.toLowerCase(), directorPhone: input.directorPhone,
    }).returning();
    const [job] = await tx.insert(c.provisioningJobs).values({ institutionId: inst.id }).returning();
    return { institutionId: inst.id, jobId: job.id };
  });
}

async function setStep(jobId: string, log: JobLogEntry[], step: number, status: JobLogEntry["status"], message?: string) {
  const entry: JobLogEntry = { step, label: PROVISION_STEPS[step - 1], status, at: new Date().toISOString(), message };
  const next = [...log.filter((l) => l.step !== step), entry].sort((a, b) => a.step - b.step);
  log.splice(0, log.length, ...next);
  await central().update(c.provisioningJobs)
    .set({ log: next, step: status === "done" ? step : step - 1, lockedAt: new Date() })
    .where(eq(c.provisioningJobs.id, jobId));
}

/**
 * Executa (ou retoma) o provisionamento. Cada passo é idempotente: pode ser
 * repetido em segurança depois de uma falha ou de um reinício do servidor.
 * Um lock atómico impede que o mesmo job corra duas vezes em paralelo.
 */
export async function runProvisioning(jobId: string): Promise<{ ok: boolean; error?: string }> {
  const staleBefore = new Date(Date.now() - 5 * 60_000);
  const [job] = await central().update(c.provisioningJobs)
    .set({ status: "RUNNING", lockedAt: new Date(), error: null, attempts: sql`${c.provisioningJobs.attempts} + 1` })
    .where(and(
      eq(c.provisioningJobs.id, jobId),
      or(inArray(c.provisioningJobs.status, ["PENDING", "FAILED"]), and(eq(c.provisioningJobs.status, "RUNNING"), lt(c.provisioningJobs.lockedAt, staleBefore))),
    )).returning();
  if (!job) return { ok: false, error: "O provisionamento já está em curso ou concluído." };

  const log: JobLogEntry[] = [...(job.log ?? [])];
  let current = 0;
  try {
    const inst = await central().query.institutions.findFirst({ where: eq(c.institutions.id, job.institutionId) });
    if (!inst) throw new Error("Instituição não encontrada.");
    await central().update(c.institutions).set({ status: "PROVISIONING" }).where(eq(c.institutions.id, inst.id));

    // 1. Identificador único + credenciais (registo cifrado na central)
    current = 1;
    await setStep(jobId, log, 1, "running");
    let reg = await central().query.tenantDatabases.findFirst({ where: eq(c.tenantDatabases.institutionId, inst.id) });
    if (!reg) {
      const dbName = dbNameForSlug(inst.slug);
      [reg] = await central().insert(c.tenantDatabases)
        .values({ institutionId: inst.id, dbName, dbUser: dbName, passwordEnc: encrypt(randomToken(24)) }).returning();
    }
    const password = decrypt(reg.passwordEnc);
    if (!/^[A-Za-z0-9_-]+$/.test(password)) throw new Error("Credencial gerada inválida.");
    await setStep(jobId, log, 1, "done", `ID ${inst.id}`);

    // 2. Role + base de dados independente
    current = 2;
    await setStep(jobId, log, 2, "running");
    const admin = centralPool();
    const roleExists = (await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [reg.dbUser])).rowCount;
    if (roleExists) await admin.query(`ALTER ROLE ${ident(reg.dbUser)} LOGIN PASSWORD '${password}'`);
    else await admin.query(`CREATE ROLE ${ident(reg.dbUser)} LOGIN PASSWORD '${password}'`);
    await admin.query(`GRANT ${ident(reg.dbUser)} TO CURRENT_USER`).catch(() => {});
    const dbExists = (await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [reg.dbName])).rowCount;
    if (!dbExists) await admin.query(`CREATE DATABASE ${ident(reg.dbName)} OWNER ${ident(reg.dbUser)} ENCODING 'UTF8' TEMPLATE template0`);
    await admin.query(`REVOKE ALL ON DATABASE ${ident(reg.dbName)} FROM PUBLIC`);
    await setStep(jobId, log, 2, "done", reg.dbName);

    // 3. Migrations
    current = 3;
    await setStep(jobId, log, 3, "running");
    await dropTenantPool(inst.id);
    await migrateTenant(tenantUrl(reg.dbName, reg.dbUser, password));
    await setStep(jobId, log, 3, "done");

    // 4. Cargos, permissões e definições iniciais
    current = 4;
    await setStep(jobId, log, 4, "running");
    const db = await getTenantDb(inst.id);
    for (const r of SYSTEM_ROLES) {
      await db.insert(t.roles).values({
        key: r.key, name: r.name, description: r.description, panel: r.panel,
        allClassrooms: r.allClassrooms, isSystem: true, permissions: r.permissions,
      }).onConflictDoNothing({ target: t.roles.key });
    }
    await db.insert(t.settings).values({
      id: 1, name: inst.name, email: inst.email, phone: inst.phone, address: [inst.address, inst.city].filter(Boolean).join(", "),
      currency: inst.currency, timezone: inst.timezone,
    }).onConflictDoNothing({ target: t.settings.id });
    await setStep(jobId, log, 4, "done", `${SYSTEM_ROLES.length} cargos`);

    // 5. Conta do diretor, associada à instituição
    current = 5;
    await setStep(jobId, log, 5, "running");
    const directorRole = await db.query.roles.findFirst({ where: eq(t.roles.key, DIRECTOR_KEY) });
    if (!directorRole) throw new Error("Cargo de diretor em falta.");
    let director = await db.query.users.findFirst({ where: eq(t.users.email, inst.directorEmail) });
    if (!director) {
      [director] = await db.insert(t.users).values({
        email: inst.directorEmail, name: inst.directorName, phone: inst.directorPhone, kind: "STAFF", status: "INVITED", roleId: directorRole.id,
      }).returning();
    }
    await db.insert(t.employees).values({ userId: director.id, jobTitle: "Diretor(a)" }).onConflictDoNothing({ target: t.employees.userId });
    await setStep(jobId, log, 5, "done", inst.directorEmail);

    // 6. Registo final na central
    current = 6;
    await setStep(jobId, log, 6, "running");
    await central().update(c.institutions)
      .set({ status: inst.trialEndsAt ? "TRIAL" : "ACTIVE", usersCount: 1, statsUpdatedAt: new Date() })
      .where(eq(c.institutions.id, inst.id));
    await setStep(jobId, log, 6, "done");

    // 7. Convite seguro ao diretor
    current = 7;
    await setStep(jobId, log, 7, "running");
    let url: string | null = job.inviteUrl;
    let mailed = false;
    if (director.status === "INVITED") {
      const token = await createAuthToken(db, director.id, "INVITE");
      url = inviteUrl(inst.slug, token);
      mailed = await sendMail({ to: director.email, ...inviteMail(inst.name, director.name, url) });
    }
    await setStep(jobId, log, 7, "done", mailed ? "Email enviado" : "Email não configurado — copie o link do convite");

    await central().update(c.provisioningJobs)
      .set({ status: "DONE", step: PROVISION_STEPS.length, finishedAt: new Date(), inviteUrl: url, lockedAt: null })
      .where(eq(c.provisioningJobs.id, jobId));
    await central().insert(c.platformAuditLogs).values({ action: "Provisionamento concluído", entity: "institution", entityId: inst.id, institutionId: inst.id });
    return { ok: true };
  } catch (e) {
    const message = (e as Error).message || "Erro desconhecido";
    console.error(`[provisioning ${jobId}] passo ${current}:`, message);
    if (current > 0) await setStep(jobId, log, current, "failed", message).catch(() => {});
    await central().update(c.provisioningJobs).set({ status: "FAILED", error: message, lockedAt: null }).where(eq(c.provisioningJobs.id, jobId));
    await central().update(c.institutions).set({ status: "FAILED" })
      .where(and(eq(c.institutions.id, job.institutionId), eq(c.institutions.status, "PROVISIONING")));
    return { ok: false, error: message };
  }
}

/** Retoma jobs pendentes ou interrompidos (ex.: reinício do servidor a meio). */
export async function resumePendingJobs() {
  const staleBefore = new Date(Date.now() - 5 * 60_000);
  const jobs = await central().query.provisioningJobs.findMany({
    where: or(eq(c.provisioningJobs.status, "PENDING"), and(eq(c.provisioningJobs.status, "RUNNING"), lt(c.provisioningJobs.lockedAt, staleBefore))),
  });
  for (const j of jobs) await runProvisioning(j.id);
}

/** Rollback / eliminação definitiva: apaga a BD e a role do tenant. */
export async function dropTenantDatabase(institutionId: string) {
  const reg = await central().query.tenantDatabases.findFirst({ where: eq(c.tenantDatabases.institutionId, institutionId) });
  if (!reg) return;
  await dropTenantPool(institutionId);
  const admin = centralPool();
  await admin.query(`DROP DATABASE IF EXISTS ${ident(reg.dbName)} WITH (FORCE)`);
  await admin.query(`DROP ROLE IF EXISTS ${ident(reg.dbUser)}`);
  await central().delete(c.tenantDatabases).where(eq(c.tenantDatabases.id, reg.id));
}
