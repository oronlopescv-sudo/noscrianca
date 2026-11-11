import Link from "next/link";
import { desc, inArray, isNull } from "drizzle-orm";
import { t } from "@/db/tenant";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/kit";
import { fmtDate, money, periodLabel } from "@/lib/format";
import { INVOICE_STATUS } from "@/lib/labels";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { guardianChildIds, requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function GuardianFinance({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireTenant((await params).slug, { panel: "GUARDIAN" });
  const ids = await guardianChildIds(ctx);
  const cur = ctx.settings.currency;
  const invoices = ids.length ? await ctx.db.query.invoices.findMany({ where: inArray(t.invoices.childId, ids), orderBy: [desc(t.invoices.issueDate)], with: { child: true, payments: { where: isNull(t.payments.reversedAt), with: { receipt: true } } } }) : [];
  const open = invoices.filter((i) => i.status === "OPEN" || i.status === "PARTIAL");
  const owed = open.reduce((s, i) => s + (i.totalCents - i.paidCents), 0);
  const bank = ctx.settings.paymentInfo;

  return (
    <>
      <PageHeader title="Pagamentos" subtitle="Faturas, pagamentos e recibos" />
      <div className="space-y-5">
        <Card>
          <p className="text-sm text-ink-soft">Em dívida</p>
          <p className="text-3xl font-semibold">{money(owed, cur)}</p>
          {bank && <p className="mt-3 whitespace-pre-wrap rounded-btn bg-surface p-3 text-sm">{bank}</p>}
        </Card>
        {invoices.length === 0 ? <EmptyState title="Sem faturas" text="As faturas das crianças aparecem aqui." /> : (
          <div className="space-y-3">
            {invoices.map((i) => (
              <Card key={i.id} pad={false}>
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{i.child.firstName} · {i.kind === "MONTHLY" ? periodLabel(i.period) : "Fatura avulsa"}</p>
                    <p className="text-xs text-ink-soft">Nº {i.number} · vencimento {fmtDate(i.dueDate)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{money(i.totalCents, cur)}</span>
                    <Badge tone={INVOICE_STATUS[i.status]?.tone ?? "gray"}>{INVOICE_STATUS[i.status]?.label ?? i.status}</Badge>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
                  <a href={`${ctx.base}/fatura/${i.id}`} target="_blank" rel="noopener" className="btn btn-secondary btn-sm">Fatura PDF</a>
                  {i.payments.map((p) => (
                    <a key={p.id} href={`${ctx.base}/recibo/${p.id}`} target="_blank" rel="noopener" className="btn btn-ghost btn-sm">
                      Recibo · {money(p.amountCents, cur)} ({PAYMENT_METHODS[p.method] ?? p.method})
                    </a>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
        <p className="text-center text-xs text-ink-soft">Para dúvidas sobre pagamentos, <Link href={`${ctx.base}/pais/mensagens`} className="link">envie uma mensagem</Link>.</p>
      </div>
    </>
  );
}
