CREATE TABLE "staff_absences" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"date" text NOT NULL,
	"deductible" boolean DEFAULT true NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"recorded_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "salary_payments" ADD COLUMN "base_cents" integer;--> statement-breakpoint
ALTER TABLE "salary_payments" ADD COLUMN "absent_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "salary_payments" ADD COLUMN "absence_discount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_absences" ADD CONSTRAINT "staff_absences_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_absence_employee_date_uq" ON "staff_absences" USING btree ("employee_id","date");--> statement-breakpoint
CREATE INDEX "staff_absence_date_idx" ON "staff_absences" USING btree ("date");