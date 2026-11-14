// BD DE CADA INSTITUIÇÃO — uma base de dados PostgreSQL independente por creche.
import { relations, sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

const id = () => text("id").primaryKey().$defaultFn(() => createId());
const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date());

export const userKind = pgEnum("user_kind", ["STAFF", "GUARDIAN"]);
export const userStatus = pgEnum("user_status", ["INVITED", "ACTIVE", "SUSPENDED"]);
export const panel = pgEnum("panel", ["MANAGEMENT", "CLASSROOM"]);
export const tokenPurpose = pgEnum("token_purpose", ["INVITE", "RESET"]);
export const childStatus = pgEnum("child_status", ["ACTIVE", "INACTIVE"]);
export const attendanceStatus = pgEnum("attendance_status", ["PRESENT", "ABSENT"]);
export const diaryType = pgEnum("diary_type", ["MEAL", "SLEEP", "HYGIENE", "ACTIVITY", "INCIDENT", "NOTE", "PHOTO"]);
export const invoiceStatus = pgEnum("invoice_status", ["OPEN", "PARTIAL", "PAID", "VOID"]);
export const invoiceKind = pgEnum("invoice_kind", ["MONTHLY", "EXTRA"]);
export const paymentMethod = pgEnum("payment_method", ["CASH", "TRANSFER", "CHEQUE", "DEPOSIT", "OTHER"]);

export const roles = pgTable("roles", {
  id: id(),
  key: text("key").unique(),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  panel: panel("panel").notNull().default("MANAGEMENT"),
  allClassrooms: boolean("all_classrooms").notNull().default(true),
  isSystem: boolean("is_system").notNull().default(false),
  permissions: text("permissions").array().notNull().default([]),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  passwordHash: text("password_hash"),
  kind: userKind("kind").notNull(),
  status: userStatus("status").notNull().default("INVITED"),
  roleId: text("role_id").references(() => roles.id, { onDelete: "restrict" }),
  lastLoginAt: ts("last_login_at"),
  deletedAt: ts("deleted_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("users_kind_idx").on(t.kind)]);

export const authTokens = pgTable("invitations", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  purpose: tokenPurpose("purpose").notNull(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
}, (t) => [index("invitations_user_idx").on(t.userId)]);

export const employees = pgTable("employees", {
  id: id(),
  userId: text("user_id").notNull().unique().references(() => users.id, { onDelete: "restrict" }),
  jobTitle: text("job_title").notNull().default(""),
  hireDate: text("hire_date"),
  schedule: text("schedule").notNull().default(""),
  address: text("address").notNull().default(""),
  notes: text("notes").notNull().default(""),
  /** Salário mensal base (em cêntimos). null = ainda não definido. */
  salaryCents: integer("salary_cents"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [check("employees_salary_ck", sql`${t.salaryCents} is null or ${t.salaryCents} > 0`)]);

/** Salários pagos pela instituição a cada funcionário (um pagamento válido por mês). */
export const salaryPayments = pgTable("salary_payments", {
  id: id(),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "restrict" }),
  period: text("period").notNull(),
  amountCents: integer("amount_cents").notNull(),
  /** Salário base do mês no momento do pagamento (null = pagamento anterior a este registo). */
  baseCents: integer("base_cents"),
  /** Dias de falta descontados neste mês e o valor descontado (ficam registados no recibo). */
  absentDays: integer("absent_days").notNull().default(0),
  absenceDiscountCents: integer("absence_discount_cents").notNull().default(0),
  paidAt: text("paid_at").notNull(),
  method: paymentMethod("method").notNull(),
  notes: text("notes").notNull().default(""),
  recordedById: text("recorded_by_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  recordedByName: text("recorded_by_name").notNull(),
  voidedAt: ts("voided_at"),
  voidedByName: text("voided_by_name"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("salary_employee_period_uq").on(t.employeeId, t.period).where(sql`${t.voidedAt} is null`),
  index("salary_period_idx").on(t.period),
  check("salary_amount_ck", sql`${t.amountCents} >= 0`),
  check("salary_base_ck", sql`${t.baseCents} is null or ${t.baseCents} >= 0`),
  check("salary_absence_ck", sql`${t.absenceDiscountCents} >= 0 and ${t.absentDays} >= 0 and ${t.absenceDiscountCents} <= coalesce(${t.baseCents}, ${t.amountCents})`),
]);

export const guardians = pgTable("guardians", {
  id: id(),
  userId: text("user_id").notNull().unique().references(() => users.id, { onDelete: "restrict" }),
  address: text("address").notNull().default(""),
  occupation: text("occupation").notNull().default(""),
  idDocument: text("id_document").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const classrooms = pgTable("classrooms", {
  id: id(),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("green"),
  capacity: integer("capacity").notNull().default(20),
  ageMinMonths: integer("age_min_months"),
  ageMaxMonths: integer("age_max_months"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const classroomEmployees = pgTable("classroom_employees", {
  classroomId: text("classroom_id").notNull().references(() => classrooms.id, { onDelete: "cascade" }),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.classroomId, t.employeeId] })]);

export const feePlans = pgTable("fee_plans", {
  id: id(),
  name: text("name").notNull().unique(),
  amountCents: integer("amount_cents").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const children = pgTable("children", {
  id: id(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  birthDate: text("birth_date").notNull(),
  gender: text("gender").notNull().default(""),
  photoPath: text("photo_path"),
  status: childStatus("status").notNull().default("ACTIVE"),
  enrolledAt: text("enrolled_at").notNull(),
  leftAt: text("left_at"),
  classroomId: text("classroom_id").references(() => classrooms.id, { onDelete: "set null" }),
  feePlanId: text("fee_plan_id").references(() => feePlans.id, { onDelete: "set null" }),
  healthNotes: text("health_notes").notNull().default(""),
  notes: text("notes").notNull().default(""),
  photoConsent: boolean("photo_consent").notNull().default(false),
  photoConsentAt: ts("photo_consent_at"),
  photoConsentBy: text("photo_consent_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("children_classroom_idx").on(t.classroomId), index("children_status_idx").on(t.status)]);

/**
 * Períodos de ausência de uma criança (saída → regresso), para as mensalidades
 * nunca serem geradas para meses em que esteve desistente. O mês da saída e o
 * mês do regresso mantêm-se faturáveis; toDate em aberto significa "ainda fora".
 */
export const childInactivePeriods = pgTable("child_inactive_periods", {
  childId: text("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
  fromDate: text("from_date").notNull(),
  toDate: text("to_date"),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.childId, t.fromDate] })]);

export const childGuardians = pgTable("child_guardians", {
  childId: text("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
  guardianId: text("guardian_id").notNull().references(() => guardians.id, { onDelete: "cascade" }),
  relationship: text("relationship").notNull().default("Encarregado"),
  isPrimary: boolean("is_primary").notNull().default(false),
  canPickup: boolean("can_pickup").notNull().default(true),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.childId, t.guardianId] }), index("cg_guardian_idx").on(t.guardianId)]);

export const authorizedPickups = pgTable("authorized_pickups", {
  id: id(),
  childId: text("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  relationship: text("relationship").notNull().default(""),
  idDocument: text("id_document").notNull().default(""),
  createdAt: createdAt(),
}, (t) => [index("pickups_child_idx").on(t.childId)]);

export const attendance = pgTable("attendance", {
  id: id(),
  childId: text("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  status: attendanceStatus("status").notNull().default("PRESENT"),
  checkInAt: ts("check_in_at"),
  checkInBy: text("check_in_by"),
  droppedBy: text("dropped_by").notNull().default(""),
  checkOutAt: ts("check_out_at"),
  checkOutBy: text("check_out_by"),
  pickedBy: text("picked_by").notNull().default(""),
  absenceReason: text("absence_reason").notNull().default(""),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("attendance_child_date_uq").on(t.childId, t.date), index("attendance_date_idx").on(t.date)]);

export const diaryEntries = pgTable("daily_activities", {
  id: id(),
  childId: text("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  occurredAt: ts("occurred_at").notNull().defaultNow(),
  type: diaryType("type").notNull(),
  title: text("title").notNull(),
  details: text("details").notNull().default(""),
  photoPath: text("photo_path"),
  groupId: text("group_id"),
  visible: boolean("visible").notNull().default(true),
  createdById: text("created_by_id").notNull(),
  createdByName: text("created_by_name").notNull(),
  createdAt: createdAt(),
}, (t) => [index("diary_child_date_idx").on(t.childId, t.date), index("diary_date_idx").on(t.date), index("diary_group_idx").on(t.groupId)]);

export const invoices = pgTable("invoices", {
  id: id(),
  number: text("number").notNull().unique(),
  childId: text("child_id").notNull().references(() => children.id, { onDelete: "restrict" }),
  kind: invoiceKind("kind").notNull().default("MONTHLY"),
  period: text("period").notNull(),
  issueDate: text("issue_date").notNull(),
  dueDate: text("due_date").notNull(),
  totalCents: integer("total_cents").notNull(),
  paidCents: integer("paid_cents").notNull().default(0),
  status: invoiceStatus("status").notNull().default("OPEN"),
  notes: text("notes").notNull().default(""),
  voidedAt: ts("voided_at"),
  voidReason: text("void_reason"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("invoices_child_idx").on(t.childId), index("invoices_period_idx").on(t.period), index("invoices_status_idx").on(t.status), uniqueIndex("invoices_child_period_uq").on(t.childId, t.period).where(sql`kind = 'MONTHLY' AND voided_at IS NULL`)]);

export const invoiceItems = pgTable("invoice_items", {
  id: id(),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "restrict" }),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull(),
}, (t) => [index("items_invoice_idx").on(t.invoiceId)]);

export const payments = pgTable("payments", {
  id: id(),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "restrict" }),
  amountCents: integer("amount_cents").notNull(),
  method: paymentMethod("method").notNull(),
  reference: text("reference").notNull().default(""),
  paidAt: text("paid_at").notNull(),
  proofPath: text("proof_path"),
  recordedById: text("recorded_by_id").notNull(),
  recordedByName: text("recorded_by_name").notNull(),
  reversedAt: ts("reversed_at"),
  reversedByName: text("reversed_by_name"),
  reversalReason: text("reversal_reason"),
  createdAt: createdAt(),
}, (t) => [index("payments_invoice_idx").on(t.invoiceId)]);

export const receipts = pgTable("receipts", {
  id: id(),
  number: text("number").notNull().unique(),
  paymentId: text("payment_id").notNull().unique().references(() => payments.id, { onDelete: "restrict" }),
  issuedAt: ts("issued_at").notNull().defaultNow(),
  voidedAt: ts("voided_at"),
});

export const announcements = pgTable("announcements", {
  id: id(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  classroomId: text("classroom_id").references(() => classrooms.id, { onDelete: "set null" }),
  /** Quem vê o comunicado: ALL (pais e equipa), GUARDIANS (só pais) ou STAFF (só equipa). */
  audience: text("audience").notNull().default("ALL"),
  createdById: text("created_by_id").notNull(),
  createdByName: text("created_by_name").notNull(),
  createdAt: createdAt(),
}, (t) => [index("announcements_created_idx").on(t.createdAt), check("announcements_audience_ck", sql`${t.audience} in ('ALL', 'GUARDIANS', 'STAFF')`)]);

export const messages = pgTable("messages", {
  id: id(),
  guardianId: text("guardian_id").notNull().references(() => guardians.id, { onDelete: "cascade" }),
  fromGuardian: boolean("from_guardian").notNull(),
  senderId: text("sender_id").notNull(),
  senderName: text("sender_name").notNull(),
  body: text("body").notNull(),
  readAt: ts("read_at"),
  createdAt: createdAt(),
}, (t) => [index("messages_guardian_idx").on(t.guardianId, t.createdAt)]);

export const notifications = pgTable("notifications", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  href: text("href").notNull().default(""),
  readAt: ts("read_at"),
  createdAt: createdAt(),
}, (t) => [index("notifications_user_idx").on(t.userId, t.readAt)]);

export const documents = pgTable("documents", {
  id: id(),
  childId: text("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  path: text("path").notNull(),
  mime: text("mime").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  uploadedByName: text("uploaded_by_name").notNull(),
  createdAt: createdAt(),
}, (t) => [index("documents_child_idx").on(t.childId)]);

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  name: text("name").notNull(),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  address: text("address").notNull().default(""),
  taxId: text("tax_id").notNull().default(""),
  logoPath: text("logo_path"),
  /** Fotografia de capa da página pública (a grande do topo). */
  coverPath: text("cover_path"),
  accentColor: text("accent_color").notNull().default("#F0714F"),
  currency: text("currency").notNull().default("CVE"),
  timezone: text("timezone").notNull().default("Atlantic/Cape_Verde"),
  schoolYear: text("school_year").notNull().default(""),
  invoiceDueDay: integer("invoice_due_day").notNull().default(8),
  paymentInfo: text("payment_info").notNull().default(""),
  reminderEnabled: boolean("reminder_enabled").notNull().default(false),
  reminderDays: text("reminder_days").notNull().default("1,7"),
  publicDescription: text("public_description").notNull().default(""),
  publicHours: text("public_hours").notNull().default(""),
  invoiceCounter: integer("invoice_counter").notNull().default(0),
  receiptCounter: integer("receipt_counter").notNull().default(0),
  updatedAt: updatedAt(),
});

/** Pedidos de inscrição feitos por visitantes na página pública. */
export const enrollmentRequests = pgTable("enrollment_requests", {
  id: id(),
  guardianName: text("guardian_name").notNull(),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  childName: text("child_name").notNull(),
  childBirthDate: text("child_birth_date"),
  message: text("message").notNull().default(""),
  /** NEW (por tratar), CONTACTED (em contacto) ou CLOSED (fechado). */
  status: text("status").notNull().default("NEW"),
  handledByName: text("handled_by_name"),
  createdAt: createdAt(),
}, (t) => [index("enrollment_status_idx").on(t.status), check("enrollment_status_ck", sql`${t.status} in ('NEW', 'CONTACTED', 'CLOSED')`)]);

/** Comprovativos de pagamento enviados pelos encarregados, à espera de confirmação. */
export const paymentProofs = pgTable("payment_proofs", {
  id: id(),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "restrict" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  userName: text("user_name").notNull(),
  path: text("path").notNull(),
  note: text("note").notNull().default(""),
  /** PENDING (por confirmar), ACCEPTED (pagamento registado) ou REJECTED (recusado). */
  status: text("status").notNull().default("PENDING"),
  reviewedByName: text("reviewed_by_name"),
  reviewNote: text("review_note").notNull().default(""),
  reviewedAt: ts("reviewed_at"),
  createdAt: createdAt(),
}, (t) => [index("proofs_invoice_idx").on(t.invoiceId), index("proofs_status_idx").on(t.status), check("proofs_status_ck", sql`${t.status} in ('PENDING', 'ACCEPTED', 'REJECTED')`)]);

/** Agenda da instituição: eventos, reuniões, feriados e férias. */
export const events = pgTable("events", {
  id: id(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  date: text("date").notNull(),
  endDate: text("end_date"),
  classroomId: text("classroom_id").references(() => classrooms.id, { onDelete: "set null" }),
  /** ALL (pais e equipa), GUARDIANS (só pais) ou STAFF (só equipa). */
  audience: text("audience").notNull().default("ALL"),
  createdByName: text("created_by_name").notNull(),
  createdAt: createdAt(),
}, (t) => [index("events_date_idx").on(t.date), check("events_audience_ck", sql`${t.audience} in ('ALL', 'GUARDIANS', 'STAFF')`)]);

/** Férias e faltas da equipa, pedidas pelo funcionário e decididas pela direção. */
export const staffLeaves = pgTable("staff_leaves", {
  id: id(),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "restrict" }),
  /** VACATION (férias), SICK (doença) ou OTHER (outra falta). */
  type: text("type").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  notes: text("notes").notNull().default(""),
  /** PENDING (por decidir), APPROVED (aprovado) ou REJECTED (recusado). */
  status: text("status").notNull().default("PENDING"),
  decidedByName: text("decided_by_name"),
  decidedAt: ts("decided_at"),
  createdAt: createdAt(),
}, (t) => [
  index("leaves_employee_idx").on(t.employeeId),
  index("leaves_status_idx").on(t.status),
  check("leaves_type_ck", sql`${t.type} in ('VACATION', 'SICK', 'OTHER')`),
  check("leaves_status_ck", sql`${t.status} in ('PENDING', 'APPROVED', 'REJECTED')`),
]);

/** Faltas da equipa registadas no calendário. As que "descontam" reduzem o salário do mês (1/30 por dia). */
export const staffAbsences = pgTable("staff_absences", {
  id: id(),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "restrict" }),
  date: text("date").notNull(),
  deductible: boolean("deductible").notNull().default(true),
  reason: text("reason").notNull().default(""),
  recordedByName: text("recorded_by_name").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("staff_absence_employee_date_uq").on(t.employeeId, t.date), index("staff_absence_date_idx").on(t.date)]);

/** Fotografias da página pública da instituição (visíveis a qualquer visitante). */
export const publicPhotos = pgTable("public_photos", {
  id: id(),
  path: text("path").notNull(),
  caption: text("caption").notNull().default(""),
  createdAt: createdAt(),
});

/** Avisos de cobrança enviados (um por fatura, etapa e encarregado). */
export const invoiceReminders = pgTable("invoice_reminders", {
  id: id(),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  stage: integer("stage").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  sentAt: ts("sent_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("reminders_unique_idx").on(t.invoiceId, t.stage, t.userId), index("reminders_user_idx").on(t.userId), index("reminders_sent_idx").on(t.sentAt)]);

export const auditLogs = pgTable("audit_logs", {
  id: id(),
  userId: text("user_id"),
  userName: text("user_name").notNull().default("Sistema"),
  action: text("action").notNull(),
  entity: text("entity").notNull().default(""),
  entityId: text("entity_id"),
  details: jsonb("details"),
  createdAt: createdAt(),
}, (t) => [index("audit_created_idx").on(t.createdAt)]);

// ---------- relações ----------
export const rolesRelations = relations(roles, ({ many }) => ({ users: many(users) }));
export const usersRelations = relations(users, ({ one }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  employee: one(employees, { fields: [users.id], references: [employees.userId] }),
  guardian: one(guardians, { fields: [users.id], references: [guardians.userId] }),
}));
export const employeesRelations = relations(employees, ({ one, many }) => ({
  user: one(users, { fields: [employees.userId], references: [users.id] }),
  classrooms: many(classroomEmployees),
}));
export const guardiansRelations = relations(guardians, ({ one, many }) => ({
  user: one(users, { fields: [guardians.userId], references: [users.id] }),
  children: many(childGuardians),
  messages: many(messages),
}));
export const classroomsRelations = relations(classrooms, ({ many }) => ({
  children: many(children),
  employees: many(classroomEmployees),
}));
export const classroomEmployeesRelations = relations(classroomEmployees, ({ one }) => ({
  classroom: one(classrooms, { fields: [classroomEmployees.classroomId], references: [classrooms.id] }),
  employee: one(employees, { fields: [classroomEmployees.employeeId], references: [employees.id] }),
}));
export const childrenRelations = relations(children, ({ one, many }) => ({
  classroom: one(classrooms, { fields: [children.classroomId], references: [classrooms.id] }),
  feePlan: one(feePlans, { fields: [children.feePlanId], references: [feePlans.id] }),
  guardians: many(childGuardians),
  inactivePeriods: many(childInactivePeriods),
  pickups: many(authorizedPickups),
  attendance: many(attendance),
  diary: many(diaryEntries),
  invoices: many(invoices),
  documents: many(documents),
}));
export const childGuardiansRelations = relations(childGuardians, ({ one }) => ({
  child: one(children, { fields: [childGuardians.childId], references: [children.id] }),
  guardian: one(guardians, { fields: [childGuardians.guardianId], references: [guardians.id] }),
}));
export const childInactivePeriodsRelations = relations(childInactivePeriods, ({ one }) => ({
  child: one(children, { fields: [childInactivePeriods.childId], references: [children.id] }),
}));
export const pickupsRelations = relations(authorizedPickups, ({ one }) => ({
  child: one(children, { fields: [authorizedPickups.childId], references: [children.id] }),
}));
export const attendanceRelations = relations(attendance, ({ one }) => ({
  child: one(children, { fields: [attendance.childId], references: [children.id] }),
}));
export const diaryRelations = relations(diaryEntries, ({ one }) => ({
  child: one(children, { fields: [diaryEntries.childId], references: [children.id] }),
}));
export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  child: one(children, { fields: [invoices.childId], references: [children.id] }),
  items: many(invoiceItems),
  payments: many(payments),
}));
export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceItems.invoiceId], references: [invoices.id] }),
}));
export const paymentsRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, { fields: [payments.invoiceId], references: [invoices.id] }),
  receipt: one(receipts, { fields: [payments.id], references: [receipts.paymentId] }),
}));
export const receiptsRelations = relations(receipts, ({ one }) => ({
  payment: one(payments, { fields: [receipts.paymentId], references: [payments.id] }),
}));
export const paymentProofsRelations = relations(paymentProofs, ({ one }) => ({
  invoice: one(invoices, { fields: [paymentProofs.invoiceId], references: [invoices.id] }),
}));
export const eventsRelations = relations(events, ({ one }) => ({
  classroom: one(classrooms, { fields: [events.classroomId], references: [classrooms.id] }),
}));
export const staffLeavesRelations = relations(staffLeaves, ({ one }) => ({
  employee: one(employees, { fields: [staffLeaves.employeeId], references: [employees.id] }),
}));
export const staffAbsencesRelations = relations(staffAbsences, ({ one }) => ({
  employee: one(employees, { fields: [staffAbsences.employeeId], references: [employees.id] }),
}));
export const announcementsRelations = relations(announcements, ({ one }) => ({
  classroom: one(classrooms, { fields: [announcements.classroomId], references: [classrooms.id] }),
}));
export const messagesRelations = relations(messages, ({ one }) => ({
  guardian: one(guardians, { fields: [messages.guardianId], references: [guardians.id] }),
}));
export const documentsRelations = relations(documents, ({ one }) => ({
  child: one(children, { fields: [documents.childId], references: [children.id] }),
}));

export type Role = typeof roles.$inferSelect;
export type User = typeof users.$inferSelect;
export type Child = typeof children.$inferSelect;
export type Classroom = typeof classrooms.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type DiaryEntry = typeof diaryEntries.$inferSelect;
export type DiaryType = (typeof diaryType.enumValues)[number];
export type PaymentMethod = (typeof paymentMethod.enumValues)[number];
