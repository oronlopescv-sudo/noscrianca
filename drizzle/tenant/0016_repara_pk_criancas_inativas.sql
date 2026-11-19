-- Reparar o índice único de que o upsert de períodos de inatividade precisa.
-- Se uma base de tenant chegou a produção sem a PK composta (restauração,
-- migração parcial), "Marcar como inativa" falha com erro genérico. Este passo
-- garante a chave em qualquer base, idempotentemente.
ALTER TABLE "child_inactive_periods"
	DROP CONSTRAINT IF EXISTS "child_inactive_periods_child_id_from_date_pk";--> statement-breakpoint
ALTER TABLE "child_inactive_periods"
	ADD CONSTRAINT "child_inactive_periods_child_id_from_date_pk" PRIMARY KEY ("child_id","from_date");
