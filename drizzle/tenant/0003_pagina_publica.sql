CREATE TABLE "public_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "public_description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "public_hours" text DEFAULT '' NOT NULL;