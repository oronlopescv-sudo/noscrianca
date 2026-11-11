import { ActionForm, ConfirmAction, FormFooter, Modal } from "@/components/ui/client";
import { Field } from "@/components/ui/kit";
import { todayIn } from "@/lib/format";
import { payInvoiceAction, voidInvoiceAction } from "../actions";

export function InvoiceRowActions({ id, number, open }: { id: string; number: string; open: boolean }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <a href={`/admin/faturas/${id}/pdf`} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">PDF</a>
      {open && (
        <>
          <Modal trigger="Registar pagamento" triggerClass="btn-primary btn-sm" title={`Registar pagamento — ${number}`}>
            <ActionForm action={payInvoiceAction} hidden={{ invoiceId: id }} className="space-y-4">
              <Field label="Método de pagamento">
                <select name="method" className="input" required defaultValue="Transferência">
                  {["Transferência", "Depósito", "Dinheiro", "Cheque", "Outro"].map((m) => <option key={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Referência / comprovativo" hint="Opcional: n.º da transferência, talão, cheque…"><input name="reference" className="input" maxLength={120} /></Field>
              <Field label="Data do pagamento"><input name="paidAt" type="date" className="input" required defaultValue={todayIn("UTC")} /></Field>
              <FormFooter submit="Marcar como paga" />
            </ActionForm>
          </Modal>
          <ConfirmAction action={voidInvoiceAction} hidden={{ invoiceId: id }} label="Anular" danger title={`Anular fatura ${number}`} confirmLabel="Anular fatura">
            <Field label="Motivo"><input name="reason" className="input" required minLength={3} maxLength={200} /></Field>
          </ConfirmAction>
        </>
      )}
    </div>
  );
}

