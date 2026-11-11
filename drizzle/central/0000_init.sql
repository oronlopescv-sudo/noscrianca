CREATE TYPE "public"."backup_status" AS ENUM('RUNNING', 'DONE', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."billing_cycle" AS ENUM('MONTHLY', 'YEARLY');--> statement-breakpoint
CREATE TYPE "public"."institution_status" AS ENUM('PENDING', 'PROVISIONING', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'FAILED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('PENDING', 'RUNNING', 'DONE', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."platform_invoice_status" AS ENUM('OPEN', 'PAID', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."session_scope" AS ENUM('PLATFORM', 'TENANT');--> statement-breakpoint
CREATE TYPE "public"."signup_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "backup_records" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"file_name" text NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"manual" boolean DEFAULT false NOT NULL,
	"status" "backup_status" DEFAULT 'RUNNING' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"country" text DEFAULT 'Cabo Verde' NOT NULL,
	"currency" text DEFAULT 'CVE' NOT NULL,
	"timezone" text DEFAULT 'Atlantic/Cape_Verde' NOT NULL,
	"status" "institution_status" DEFAULT 'PENDING' NOT NULL,
	"plan_id" text,
	"billing_cycle" "billing_cycle" DEFAULT 'MONTHLY' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"suspend_reason" text,
	"director_name" text NOT NULL,
	"director_email" text NOT NULL,
	"director_phone" text DEFAULT '' NOT NULL,
	"max_directors" integer DEFAULT 2 NOT NULL,
	"children_count" integer DEFAULT 0 NOT NULL,
	"users_count" integer DEFAULT 0 NOT NULL,
	"db_size_bytes" bigint DEFAULT 0 NOT NULL,
	"stats_updated_at" timestamp with time zone,
	"last_backup_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institutions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_monthly_cents" integer NOT NULL,
	"price_yearly_cents" integer NOT NULL,
	"max_children" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "platform_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"user_name" text DEFAULT 'Sistema' NOT NULL,
	"action" text NOT NULL,
	"entity" text DEFAULT '' NOT NULL,
	"entity_id" text,
	"institution_id" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"institution_id" text NOT NULL,
	"description" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"status" "platform_invoice_status" DEFAULT 'OPEN' NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"payment_method" text,
	"payment_reference" text,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"notes" text DEFAULT '' NOT NULL,
	CONSTRAINT "platform_invoices_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"saas_name" text DEFAULT 'NosCriança' NOT NULL,
	"support_email" text DEFAULT '' NOT NULL,
	"support_phone" text DEFAULT '' NOT NULL,
	"billing_currency" text DEFAULT 'CVE' NOT NULL,
	"bank_details" text DEFAULT '' NOT NULL,
	"trial_days" integer DEFAULT 14 NOT NULL,
	"invoice_due_days" integer DEFAULT 10 NOT NULL,
	"grace_days" integer DEFAULT 7 NOT NULL,
	"invoice_counter" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "provisioning_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"status" "job_status" DEFAULT 'PENDING' NOT NULL,
	"step" integer DEFAULT 0 NOT NULL,
	"log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"invite_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "scheduler_locks" (
	"key" text PRIMARY KEY NOT NULL,
	"run_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"scope" "session_scope" NOT NULL,
	"user_id" text NOT NULL,
	"institution_id" text,
	"impersonator_id" text,
	"ip" text,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "signup_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_name" text NOT NULL,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"children_estimate" integer,
	"message" text DEFAULT '' NOT NULL,
	"status" "signup_status" DEFAULT 'PENDING' NOT NULL,
	"institution_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tenant_database_registry" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"db_name" text NOT NULL,
	"db_user" text NOT NULL,
	"password_enc" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_database_registry_institution_id_unique" UNIQUE("institution_id"),
	CONSTRAINT "tenant_database_registry_db_name_unique" UNIQUE("db_name"),
	CONSTRAINT "tenant_database_registry_db_user_unique" UNIQUE("db_user")
);
--> statement-breakpoint
ALTER TABLE "backup_records" ADD CONSTRAINT "backup_records_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_invoices" ADD CONSTRAINT "platform_invoices_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioning_jobs" ADD CONSTRAINT "provisioning_jobs_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_database_registry" ADD CONSTRAINT "tenant_database_registry_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backup_inst_idx" ON "backup_records" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "institutions_status_idx" ON "institutions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "paudit_created_idx" ON "platform_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "paudit_inst_idx" ON "platform_audit_logs" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "pinv_inst_idx" ON "platform_invoices" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "pinv_status_idx" ON "platform_invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_inst_idx" ON "provisioning_jobs" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "provisioning_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_inst_idx" ON "sessions" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "sessions_exp_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "signup_status_idx" ON "signup_requests" USING btree ("status");