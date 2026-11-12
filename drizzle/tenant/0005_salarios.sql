CREATE TABLE "salary_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"period" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"paid_at" text NOT NULL,
	"method" "payment_method" NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"recorded_by_id" text NOT NULL,
	"recorded_by_name" text NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "salary_cents" integer;--> statement-breakpoint
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "salary_employee_period_uq" ON "salary_payments" USING btree ("employee_id","period") WHERE "salary_payments"."voided_at" is null;--> statement-breakpoint
CREATE INDEX "salary_period_idx" ON "salary_payments" USING btree ("period");