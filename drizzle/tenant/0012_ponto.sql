CREATE TABLE "time_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"date" text NOT NULL,
	"clock_in" text NOT NULL,
	"clock_out" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"source" text DEFAULT 'EMPLOYEE' NOT NULL,
	"decided_by_name" text,
	"decided_at" timestamp with time zone,
	"corrected_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_entries_status_ck" CHECK ("time_entries"."status" in ('PENDING', 'CONFIRMED', 'REJECTED')),
	CONSTRAINT "time_entries_source_ck" CHECK ("time_entries"."source" in ('EMPLOYEE', 'MANAGER')),
	CONSTRAINT "time_entries_hours_ck" CHECK ("time_entries"."clock_in" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and ("time_entries"."clock_out" is null or ("time_entries"."clock_out" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and "time_entries"."clock_out" > "time_entries"."clock_in")))
);
--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "time_entries_employee_date_idx" ON "time_entries" USING btree ("employee_id","date");--> statement-breakpoint
CREATE INDEX "time_entries_status_idx" ON "time_entries" USING btree ("status");