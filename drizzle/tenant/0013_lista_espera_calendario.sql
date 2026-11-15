ALTER TABLE "enrollment_requests" DROP CONSTRAINT "enrollment_status_ck";--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "kind" text DEFAULT 'EVENTO' NOT NULL;--> statement-breakpoint
ALTER TABLE "enrollment_requests" ADD CONSTRAINT "enrollment_status_ck" CHECK ("enrollment_requests"."status" in ('NEW', 'CONTACTED', 'WAITLIST', 'CLOSED'));--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_kind_ck" CHECK ("events"."kind" in ('EVENTO', 'FERIADO', 'FERIAS', 'REUNIAO'));