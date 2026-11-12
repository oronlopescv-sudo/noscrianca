CREATE TABLE "enrollment_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"guardian_name" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"child_name" text NOT NULL,
	"child_birth_date" text,
	"message" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'NEW' NOT NULL,
	"handled_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"date" text NOT NULL,
	"end_date" text,
	"classroom_id" text,
	"audience" text DEFAULT 'ALL' NOT NULL,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_proofs" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text NOT NULL,
	"path" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"reviewed_by_name" text,
	"review_note" text DEFAULT '' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_leaves" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"type" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"decided_by_name" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_leaves" ADD CONSTRAINT "staff_leaves_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enrollment_status_idx" ON "enrollment_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "events_date_idx" ON "events" USING btree ("date");--> statement-breakpoint
CREATE INDEX "proofs_invoice_idx" ON "payment_proofs" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "proofs_status_idx" ON "payment_proofs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "leaves_employee_idx" ON "staff_leaves" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "leaves_status_idx" ON "staff_leaves" USING btree ("status");