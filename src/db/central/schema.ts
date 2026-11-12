// BD CENTRAL — instituições, utilizadores da plataforma, planos, faturas do
// SaaS, registo das BDs dos tenants, jobs de provisionamento e sessões.
import { relations, sql } from "drizzle-orm";
import { bigint, boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

const id = () => text("id").primaryKey().$defaultFn(() => createId());
const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date());

export const institutionStatus = pgEnum("institution_status", [
  "PENDING", "PROVISIONING", "TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "FAILED", "ARCHIVED",
]);
export const billingCycle = pgEnum("billing_cycle", ["MONTHLY", "YEARLY"]);
export const jobStatus = pgEnum("job_status", ["PENDING", "RUNNING", "DONE", "FAILED"]);
export const platformInvoiceStatus = pgEnum("platform_invoice_status", ["OPEN", "PAID", "VOID"]);
export const signupStatus = pgEnum("signup_status", ["PENDING", "APPROVED", "REJECTED"]);
export const sessionScope = pgEnum("session_scope", ["PLATFORM", "TENANT"]);
export const backupStatus = pgEnum("backup_status", ["RUNNING", "DONE", "FAILED"]);

export const platformUsers = pgTable("platform_users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  active: boolean("active").notNull().default(true),
  lastLoginAt: ts("last_login_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable("sessions", {
  id: id(),
  tokenHash: text("token_hash").notNull().unique(),
  scope: sessionScope("scope").notNull(),
  userId: text("user_id").notNull(),
  institutionId: text("institution_id"),
  impersonatorId: text("impersonator_id"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
}, (t) => [index("sessions_user_idx").on(t.userId), index("sessions_inst_idx").on(t.institutionId), index("sessions_exp_idx").on(t.expiresAt)]);

export const loginAttempts = pgTable("login_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  lockedUntil: ts("locked_until"),
  updatedAt: updatedAt(),
});

export const plans = pgTable("subscription_plans", {
  id: id(),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  priceMonthlyCents: integer("price_monthly_cents").notNull(),
  priceYearlyCents: integer("price_yearly_cents").notNull(),
  maxChildren: integer("max_children"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const institutions = pgTable("institutions", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  address: text("address").notNull().default(""),
  city: text("city").notNull().default(""),
  country: text("country").notNull().default("Cabo Verde"),
  currency: text("currency").notNull().default("CVE"),
  timezone: text("timezone").notNull().default("Atlantic/Cape_Verde"),
  status: institutionStatus("status").notNull().default("PENDING"),
  planId: text("plan_id").references(() => plans.id, { onDelete: "set null" }),
  billingCycle: billingCycle("billing_cycle").notNull().default("MONTHLY"),
  trialEndsAt: ts("trial_ends_at"),
  currentPeriodEnd: ts("current_period_end"),
  suspendedAt: ts("suspended_at"),
  suspendReason: text("suspend_reason"),
  directorName: text("director_name").notNull(),
  directorEmail: text("director_email").notNull(),
  directorPhone: text("director_phone").notNull().default(""),
  maxDirectors: integer("max_directors").notNull().default(2),
  childrenCount: integer("children_count").notNull().default(0),
  usersCount: integer("users_count").notNull().default(0),
  dbSizeBytes: bigint("db_size_bytes", { mode: "number" }).notNull().default(0),
  statsUpdatedAt: ts("stats_updated_at"),
  lastBackupAt: ts("last_backup_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("institutions_status_idx").on(t.status)]);

export const tenantDatabases = pgTable("tenant_database_registry", {
  id: id(),
  institutionId: text("institution_id").notNull().unique().references(() => institutions.id, { onDelete: "cascade" }),
  dbName: text("db_name").notNull().unique(),
  dbUser: text("db_user").notNull().unique(),
  passwordEnc: text("password_enc").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type JobLogEntry = { step: number; label: string; status: "done" | "failed" | "running"; at: string; message?: string };

export const provisioningJobs = pgTable("provisioning_jobs", {
  id: id(),
  institutionId: text("institution_id").notNull().references(() => institutions.id, { onDelete: "cascade" }),
  status: jobStatus("status").notNull().default("PENDING"),
  step: integer("step").notNull().default(0),
  log: jsonb("log").$type<JobLogEntry[]>().notNull().default([]),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
  lockedAt: ts("locked_at"),
  inviteUrl: text("invite_url"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  finishedAt: ts("finished_at"),
}, (t) => [index("jobs_inst_idx").on(t.institutionId), index("jobs_status_idx").on(t.status)]);

export const platformInvoices = pgTable("platform_invoices", {
  id: id(),
  number: text("number").notNull().unique(),
  institutionId: text("institution_id").notNull().references(() => institutions.id, { onDelete: "restrict" }),
  description: text("description").notNull(),
  periodStart: ts("period_start").notNull(),
  periodEnd: ts("period_end").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  status: platformInvoiceStatus("status").notNull().default("OPEN"),
  dueDate: ts("due_date").notNull(),
  issuedAt: ts("issued_at").notNull().defaultNow(),
  paidAt: ts("paid_at"),
  paymentMethod: text("payment_method"),
  paymentReference: text("payment_reference"),
  voidedAt: ts("voided_at"),
  voidReason: text("void_reason"),
  notes: text("notes").notNull().default(""),
// Uma única fatura ATIVA (aberta/paga) por instituição e período: o ciclo
// diário e a emissão manual podiam, em concorrência, emitir duas faturas do
// mesmo período. Parcial: faturas ANULADAS não contam (permitem re-emitir).
}, (t) => [index("pinv_inst_idx").on(t.institutionId), index("pinv_status_idx").on(t.status), uniqueIndex("pinv_inst_period_uq").on(t.institutionId, t.periodStart).where(sql`status <> 'VOID'`)]);

export const backupRecords = pgTable("backup_records", {
  id: id(),
  institutionId: text("institution_id").notNull().references(() => institutions.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
  manual: boolean("manual").notNull().default(false),
  status: backupStatus("status").notNull().default("RUNNING"),
  error: text("error"),
  createdAt: createdAt(),
}, (t) => [index("backup_inst_idx").on(t.institutionId)]);

export const signupRequests = pgTable("signup_requests", {
  id: id(),
  institutionName: text("institution_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull().default(""),
  city: text("city").notNull().default(""),
  childrenEstimate: integer("children_estimate"),
  message: text("message").notNull().default(""),
  status: signupStatus("status").notNull().default("PENDING"),
  institutionId: text("institution_id"),
  createdAt: createdAt(),
  handledAt: ts("handled_at"),
}, (t) => [index("signup_status_idx").on(t.status)]);

export const platformAuditLogs = pgTable("platform_audit_logs", {
  id: id(),
  userId: text("user_id"),
  userName: text("user_name").notNull().default("Sistema"),
  action: text("action").notNull(),
  entity: text("entity").notNull().default(""),
  entityId: text("entity_id"),
  institutionId: text("institution_id"),
  details: jsonb("details"),
  createdAt: createdAt(),
}, (t) => [index("paudit_created_idx").on(t.createdAt), index("paudit_inst_idx").on(t.institutionId)]);

export const platformSettings = pgTable("platform_settings", {
  id: integer("id").primaryKey().default(1),
  saasName: text("saas_name").notNull().default("NosCriança"),
  supportEmail: text("support_email").notNull().default(""),
  supportPhone: text("support_phone").notNull().default(""),
  billingCurrency: text("billing_currency").notNull().default("CVE"),
  bankDetails: text("bank_details").notNull().default(""),
  trialDays: integer("trial_days").notNull().default(14),
  invoiceDueDays: integer("invoice_due_days").notNull().default(10),
  graceDays: integer("grace_days").notNull().default(7),
  invoiceCounter: integer("invoice_counter").notNull().default(0),
  updatedAt: updatedAt(),
});

export const schedulerLocks = pgTable("scheduler_locks", {
  key: text("key").primaryKey(),
  runAt: ts("run_at").notNull(),
});

export const institutionsRelations = relations(institutions, ({ one, many }) => ({
  plan: one(plans, { fields: [institutions.planId], references: [plans.id] }),
  database: one(tenantDatabases, { fields: [institutions.id], references: [tenantDatabases.institutionId] }),
  jobs: many(provisioningJobs),
  invoices: many(platformInvoices),
  backups: many(backupRecords),
}));
export const tenantDatabasesRelations = relations(tenantDatabases, ({ one }) => ({
  institution: one(institutions, { fields: [tenantDatabases.institutionId], references: [institutions.id] }),
}));
export const jobsRelations = relations(provisioningJobs, ({ one }) => ({
  institution: one(institutions, { fields: [provisioningJobs.institutionId], references: [institutions.id] }),
}));
export const platformInvoicesRelations = relations(platformInvoices, ({ one }) => ({
  institution: one(institutions, { fields: [platformInvoices.institutionId], references: [institutions.id] }),
}));
export const backupsRelations = relations(backupRecords, ({ one }) => ({
  institution: one(institutions, { fields: [backupRecords.institutionId], references: [institutions.id] }),
}));

export type Institution = typeof institutions.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type PlatformUser = typeof platformUsers.$inferSelect;
export type PlatformInvoice = typeof platformInvoices.$inferSelect;
export type ProvisioningJob = typeof provisioningJobs.$inferSelect;
export type InstitutionStatus = (typeof institutionStatus.enumValues)[number];
