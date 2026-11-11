-- Histórico financeiro imutável: pagamentos, recibos, faturas e linhas de
-- fatura nunca podem ser apagados; os valores de pagamentos e recibos não
-- podem ser alterados depois de emitidos (anulação = registo de estorno).
CREATE OR REPLACE FUNCTION nc_forbid_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Registos financeiros não podem ser apagados (%).', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION nc_payment_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.amount_cents <> OLD.amount_cents OR NEW.invoice_id <> OLD.invoice_id
     OR NEW.method <> OLD.method OR NEW.paid_at <> OLD.paid_at THEN
    RAISE EXCEPTION 'Um pagamento registado não pode ser alterado.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION nc_receipt_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.number <> OLD.number OR NEW.payment_id <> OLD.payment_id OR NEW.issued_at <> OLD.issued_at THEN
    RAISE EXCEPTION 'Um recibo emitido não pode ser alterado.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER payments_no_delete BEFORE DELETE ON payments FOR EACH ROW EXECUTE FUNCTION nc_forbid_delete();
--> statement-breakpoint
CREATE TRIGGER receipts_no_delete BEFORE DELETE ON receipts FOR EACH ROW EXECUTE FUNCTION nc_forbid_delete();
--> statement-breakpoint
CREATE TRIGGER invoices_no_delete BEFORE DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION nc_forbid_delete();
--> statement-breakpoint
CREATE TRIGGER invoice_items_no_delete BEFORE DELETE ON invoice_items FOR EACH ROW EXECUTE FUNCTION nc_forbid_delete();
--> statement-breakpoint
CREATE TRIGGER payments_immutable BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION nc_payment_immutable();
--> statement-breakpoint
CREATE TRIGGER receipts_immutable BEFORE UPDATE ON receipts FOR EACH ROW EXECUTE FUNCTION nc_receipt_immutable();
