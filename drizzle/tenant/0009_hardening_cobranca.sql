ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reminders_user_idx" ON "invoice_reminders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reminders_sent_idx" ON "invoice_reminders" USING btree ("sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_child_period_uq" ON "invoices" USING btree ("child_id","period") WHERE kind = 'MONTHLY' AND voided_at IS NULL;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_audience_ck" CHECK ("announcements"."audience" in ('ALL', 'GUARDIANS', 'STAFF'));--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_salary_ck" CHECK ("employees"."salary_cents" is null or "employees"."salary_cents" > 0);--> statement-breakpoint
ALTER TABLE "enrollment_requests" ADD CONSTRAINT "enrollment_status_ck" CHECK ("enrollment_requests"."status" in ('NEW', 'CONTACTED', 'CLOSED'));--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_audience_ck" CHECK ("events"."audience" in ('ALL', 'GUARDIANS', 'STAFF'));--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "proofs_status_ck" CHECK ("payment_proofs"."status" in ('PENDING', 'ACCEPTED', 'REJECTED'));--> statement-breakpoint
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_amount_ck" CHECK ("salary_payments"."amount_cents" >= 0);--> statement-breakpoint
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_base_ck" CHECK ("salary_payments"."base_cents" is null or "salary_payments"."base_cents" >= 0);--> statement-breakpoint
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_absence_ck" CHECK ("salary_payments"."absence_discount_cents" >= 0 and "salary_payments"."absent_days" >= 0 and "salary_payments"."absence_discount_cents" <= coalesce("salary_payments"."base_cents", "salary_payments"."amount_cents"));--> statement-breakpoint
ALTER TABLE "staff_leaves" ADD CONSTRAINT "leaves_type_ck" CHECK ("staff_leaves"."type" in ('VACATION', 'SICK', 'OTHER'));--> statement-breakpoint
ALTER TABLE "staff_leaves" ADD CONSTRAINT "leaves_status_ck" CHECK ("staff_leaves"."status" in ('PENDING', 'APPROVED', 'REJECTED'));