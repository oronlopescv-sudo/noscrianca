import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { t } from "@/db/tenant";
import { ActionForm, ConfirmAction, Submit } from "@/components/ui/client";
import { Badge, Card, DL, EmptyState, Field, PageHeader } from "@/components/ui/kit";
import { fmtDate, money, periodLabel, todayIn } from "@/lib/format";
import { INVOICE_STATUS } from "@/lib/labels";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { recordPaymentAction, reversePaymentAction, voidInvoiceAction } from "@/server/finance";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await requireTenant(slug, { permission: "finance.view" });
  const inv = await ctx.db.query.invoices.findFirst({
    where: eq(t.invoices.id, id),
    with: { child: true, items: { orderBy: [asc(t.invoiceItems.id)] }, payments: { with: { receipt: true }, orderBy: [asc(t.payments.createdAt)] } },
  });
  if (!inv) notFound();
  const cur = ctx.settings.currency;
  const due = inv.totalCents - inv.paidCents;
  const canManage = ctx.can("finance.manage") && !ctx.readOnly;
  const open = inv.status !== "VOID" && due > 0;
  const hidden = { slug, invoiceId: id };

  return (
    <>
      <PageHeader
        back={{ href: `${ctx.base}/gestao/mensalidades`, label: "Mensalidades" }}
        title={`Fatura ${inv.number}`}
        subtitle={<><Link href={`${ctx.base}/gestao/criancas/${inv.childId}`} className="link">{inv.child.firstName} {inv.child.lastName}</Link> · {inv.kind === "MONTHLY" ? periodLabel(inv.period) : "Fatura avulsa"} · <Badge tone={INVOICE_STATUS[inv.status]?.tone ?? "gray"}>{INVOICE_STATUS[inv.status]?.label}</Badge></>}
        actions={<a href={`${ctx.base}/fatura/${inv.id}`} target="_blank" rel="noopener" className="btn btn-secondary">Abrir PDF</a>}
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Itens" pad={false}>
            <table className="table">
              <thead><tr><th>Descrição</th><th className="text-right">Valor</th></tr></thead>
              <tbody>
                {inv.items.map((i) => <tr key={i.id}><td>{i.description}</td><td className="text-right">{money(i.amountCents, cur)}</td></tr>)}
                <tr><td className="font-semibold">Total</td><td className="text-right font-semibold">{money(inv.totalCents, cur)}</td></tr>
                <tr><td>Pago</td><td className="text-right">{money(inv.paidCents, cur)}</td></tr>
                <tr><td className="font-semibold">Em dívida</td><td className="text-right font-semibold">{money(Math.max(due, 0), cur)}</td></tr>
              </tbody>
            </table>
          </Card>
          <Card title="Pagamentos" pad={false}>
            {inv.payments.length === 0 ? <div className="card-pad"><EmptyState title="Sem pagamentos" text="Registe o pagamento quando for recebido." /></div> : (
              <ul className="divide-y divide-line">
                {inv.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0">
                      <p className="font-medium">{money(p.amountCents, cur)} · {PAYMENT_METHODS[p.method] ?? p.method}</p>
                      <p className="text-xs text-ink-soft">{fmtDate(p.paidAt)} · registado por {p.recordedByName}{p.reference ? ` · ref. ${p.reference}` : ""}</p>
                      {p.reversedAt && <p className="text-xs text-red-700">Estornado em {fmtDate(p.reversedAt.toISOString().slice(0, 10))}: {p.reversalReason}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {p.receipt && !p.reversedAt && <a href={`${ctx.base}/recibo/${p.id}`} target="_blank" rel="noopener" className="btn btn-ghost btn-sm">Recibo {p.receipt.number}</a>}
                      {canManage && !p.reversedAt && <ConfirmAction action={reversePaymentAction} hidden={{ slug, paymentId: p.id }} label="Estornar" title="Estornar pagamento" text="O pagamento fica registado como estornado e o recibo deixa de ser válido." confirmLabel="Estornar" danger />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-5">
          {canManage && open && (
            <Card title="Registar pagamento">
              <ActionForm action={recordPaymentAction} hidden={hidden} className="space-y-4" resetOnSuccess>
                <Field label={`Valor (${cur})`} hint={`Em dívida: ${money(due, cur)}`}><input name="amount" className="input" required inputMode="decimal" defaultValue={(due / 100).toFixed(2)} /></Field>
                <Field label="Método">
                  <select name="method" className="input" required defaultValue="CASH">
                    {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Data do pagamento"><input name="paidAt" type="date" className="input" required defaultValue={todayIn(ctx.settings.timezone)} /></Field>
                <Field label="Referência" hint="Nº do cheque, da transferência…"><input name="reference" className="input" maxLength={80} /></Field>
                <Field label="Comprovativo (opcional)"><input name="proof" type="file" accept="application/pdf,image/*" className="input" /></Field>
                <div className="flex justify-end"><Submit>Registar pagamento</Submit></div>
              </ActionForm>
            </Card>
          )}
          <Card title="Dados">
            <DL items={[["Emitida em", fmtDate(inv.issueDate)], ["Vencimento", fmtDate(inv.dueDate)], ["Notas", inv.notes || "—"]]} />
          </Card>
          {canManage && inv.status !== "VOID" && (
            <Card title="Anular fatura">
              <p className="mb-3 text-sm text-ink-soft">Só é possível anular faturas sem pagamentos ativos. A anulação fica registada na auditoria.</p>
              <ActionForm action={voidInvoiceAction} hidden={hidden} className="space-y-3">
                <Field label="Motivo"><input name="reason" className="input" required minLength={3} maxLength={200} /></Field>
                <div className="flex justify-end"><Submit className="btn-danger">Anular fatura</Submit></div>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
