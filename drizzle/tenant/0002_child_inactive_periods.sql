CREATE TABLE "child_inactive_periods" (
	"child_id" text NOT NULL,
	"from_date" text NOT NULL,
	"to_date" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "child_inactive_periods_child_id_from_date_pk" PRIMARY KEY("child_id","from_date")
);
--> statement-breakpoint
ALTER TABLE "child_inactive_periods" ADD CONSTRAINT "child_inactive_periods_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Histórico existente: as crianças INACTIVE com data de saída passam a ter o
-- período de ausência registado (regressos anteriores a esta versão não
-- deixaram histórico — nada a repor para esses meses).
INSERT INTO "child_inactive_periods" ("child_id", "from_date", "created_at")
SELECT "id", "left_at", now() FROM "children"
WHERE "status" = 'INACTIVE' AND "left_at" IS NOT NULL
ON CONFLICT DO NOTHING;
