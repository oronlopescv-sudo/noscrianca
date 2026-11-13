ALTER TABLE "invoices" ADD CONSTRAINT "invoices_paid_ck" CHECK ("invoices"."paid_cents" >= 0 and "invoices"."paid_cents" <= "invoices"."total_cents");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_void_ck" CHECK (("invoices"."status" = 'VOID') = ("invoices"."voided_at" is not null));--> statement-breakpoint
-- Faturas emitidas: a aplicação só muda paid_cents, status, voided_at, void_reason
-- e updated_at; o resto (número, criança, tipo, período, datas, total, notas)
-- fica congelado — anular e reemitir em vez de reescrever.
-- Linhas de fatura: nenhum UPDATE de forma alguma (a aplicação nunca o faz).
CREATE OR REPLACE FUNCTION nc_invoice_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.number <> OLD.number OR NEW.child_id <> OLD.child_id OR NEW.kind <> OLD.kind
     OR NEW.period <> OLD.period OR NEW.total_cents <> OLD.total_cents
     OR NEW.issue_date <> OLD.issue_date OR NEW.due_date <> OLD.due_date
     OR NEW.notes <> OLD.notes OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Uma fatura emitida não pode ser alterada (anule e reemita).';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE OR REPLACE FUNCTION nc_forbid_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Linhas de fatura emitidas não podem ser alteradas.';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER invoices_immutable BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION nc_invoice_immutable();--> statement-breakpoint
CREATE TRIGGER invoice_items_immutable BEFORE UPDATE ON invoice_items FOR EACH ROW EXECUTE FUNCTION nc_forbid_update();
