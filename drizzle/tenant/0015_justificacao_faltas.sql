ALTER TABLE "attendance" ADD COLUMN "justification_status" text DEFAULT 'NONE' NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "justification_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "justification_file_path" text;--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "justified_by_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "justified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "justification_decided_by_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "justification_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_justification_ck" CHECK ("attendance"."justification_status" in ('NONE', 'PENDING', 'JUSTIFIED', 'UNJUSTIFIED'));