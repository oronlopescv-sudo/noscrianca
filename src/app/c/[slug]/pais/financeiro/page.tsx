import Link from "next/link";
import { desc, inArray, isNull } from "drizzle-orm";
import { t } from "@/db/tenant";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/kit";
import { fmtDate, money, periodLabel, todayIn } from "@/lib/format";
import { INVOICE_STATUS } from "@/lib/labels";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { guardianChildIds, requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default async function GuardianFinance({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ano?: string }> }) {
  const ctx = await requireTenant((await params).slug, { panel: "GUARDIAN" });
  const ids = await guardianChildIds(ctx);
  const today = todayIn(ctx.settings.timezone);
  const thisYear = Number(today.slice(0, 4));
  const sp = await searchParams;
  const year = sp.ano && /^\d{4}$/.test(sp.ano) && Math.abs(Number(sp.ano) - thisYear) <= 10 ? Number(sp.ano) : thisYear;
  const kids = ids.length ? await ctx.db.query.children.findMany({ where: inArray(t.children.id, ids), columns: { id: true, firstName: true, lastName: true }, orderBy: (k, { asc }) => asc(k.firstName) }) : [];
  const cur = ctx.settings.currency;
  const invoices = ids.length ? await ctx.db.query.invoices.findMany({ where: inArray(t.invoices.childId, ids), orderBy: [desc(t.invoices.issueDate)], with: { child: true, payments: { where: isNull(t.payments.reversedAt), with: { receipt: true } } } }) : [];
  const open = invoices.filter((i) => i.status === "OPEN" || i.status === "PARTIAL");
  const owed = open.reduce((s, i) => s + (i.totalCents - i.paidCents), 0);
  const bank = ctx.settings.paymentInfo;
  // Mensalidade (não anulada) de cada criança em cada mês do ano escolhido.
  const monthly = new Map(invoices.filter((i) => i.kind === "MONTHLY" && i.status !== "VOID").map((i) => [`${i.childId}|${i.period}`, i]));
  const base = `${ctx.base}/pais/financeiro`;

  return (
    <>
      <PageHeader title="Pagamentos" subtitle="Faturas, pagamentos e recibos" />
      <div className="space-y-5">
        <Card>
          <p className="text-sm text-ink-soft">Em dívida</p>
          <p className="text-3xl font-semibold">{money(owed, cur)}</p>
          {bank && <p className="mt-3 whitespace-pre-wrap rounded-btn bg-surface p-3 text-sm">{bank}</p>}
        </Card>
        {kids.map((k) => (
          <Card key={k.id} title={`Meses de ${year} · ${k.firstName} ${k.lastName}`} pad={false}
            actions={<span className="flex gap-1.5">
              <Link href={`${base}?ano=${year - 1}`} className="btn btn-secondary btn-sm">← {year - 1}</Link>
              {year < thisYear && <Link href={`${base}?ano=${year + 1}`} className="btn btn-secondary btn-sm">{year + 1} →</Link>}
            </span>}>
            <ul className="grid grid-cols-2 gap-px bg-line/60 sm:grid-cols-3 lg:grid-cols-4">
              {MONTHS.map((label, idx) => {
                const inv = monthly.get(`${k.id}|${year}-${String(idx + 1).padStart(2, "0")}`);
                const overdue = inv && (inv.status === "OPEN" || inv.status === "PARTIAL") && inv.dueDate < today;
                const lastPaid = inv?.payments.map((p) => p.paidAt).sort().at(-1);
                return (
                  <li key={label} className="bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{label}</span>
                      {!inv ? <Badge>Sem fatura</Badge>
                        : inv.status === "PAID" ? <Badge tone="green">Pago</Badge>
                        : overdue ? <Badge tone="red">Em atraso</Badge>
                        : inv.status === "PARTIAL" ? <Badge tone="amber">Parcial</Badge>
                        : <Badge tone="blue">Por pagar</Badge>}
                    </div>
                    {inv && (
                      <div className="mt-2 space-y-1.5 text-xs text-ink-soft">
                        <p>{inv.status === "PAID" ? `${money(inv.totalCents, cur)} · pago a ${fmtDate(lastPaid ?? inv.dueDate)}` : `Em falta: ${money(inv.totalCents - inv.paidCents, cur)} · vence a ${fmtDate(inv.dueDate)}`}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {inv.payments.map((p) => (
                            <a key={p.id} href={`${ctx.base}/recibo/${p.id}`} target="_blank" rel="noopener" className="btn btn-secondary btn-sm">Recibo{inv.payments.length > 1 ? ` · ${money(p.amountCents, cur)}` : ""}</a>
                          ))}
                          {inv.payments.length === 0 && <a href={`${ctx.base}/fatura/${inv.id}`} target="_blank" rel="noopener" className="btn btn-ghost btn-sm">Ver fatura</a>}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
        {invoices.length > 0 && <h2 className="pt-2 text-base">Todas as faturas</h2>}
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
