-- Uma única fatura (não anulada/aberta) por instituição e período: o ciclo
-- diário e a emissão manual podiam, em concorrência, emitir duas faturas do
-- mesmo período.
UPDATE "platform_invoices" SET "status" = 'VOID', "voided_at" = now(), "void_reason" = 'Duplicado do mesmo período'
WHERE "status" = 'OPEN' AND "id" NOT IN (
  SELECT DISTINCT ON ("institution_id", "period_start") "id" FROM "platform_invoices"
  ORDER BY "institution_id", "period_start", "issued_at", "id"
);
--> statement-breakpoint
CREATE UNIQUE INDEX "pinv_inst_period_uq" ON "platform_invoices" USING btree ("institution_id","period_start");
