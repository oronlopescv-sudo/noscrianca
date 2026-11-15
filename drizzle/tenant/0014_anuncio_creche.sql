ALTER TABLE "settings" ADD COLUMN "ad_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "ad_title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "ad_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "ad_link" text DEFAULT '' NOT NULL;