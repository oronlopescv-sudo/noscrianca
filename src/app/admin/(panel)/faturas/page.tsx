import Link from "next/link";
import { and, desc, eq, lt, sum } from "drizzle-orm";
import { FileText } from "lucide-react";
import { ActionButton } from "@/components/ui/client";
import { Badge, Card, EmptyState, PageHeader, Stat, Tabs } from "@/components/ui/kit";
import { central, c } from "@/db/central";
import { fmtDateObj, money } from "@/lib/format";
import { PLATFORM_INVOICE_STATUS } from "@/lib/labels";
import { getPlatformSettings } from "@/lib/platform";
import { runBillingAction } from "../../actions";
import { InvoiceRowActions } from "../invoice-actions";

export const metadata = { title: "Faturas" };
const FILTERS = { todas: "Todas", abertas: "Em aberto", atraso: "Em atraso", pagas: "Pagas", anuladas: "Anuladas" } as const;

export default async function PlatformInvoices({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const f = ((await searchParams).f ?? "abertas") as keyof typeof FILTERS;
  const filter = f in FILTERS ? f : "abertas";
  const settings = await getPlatformSettings();
  const now = new Date();
  const where = filter === "abertas" ? eq(c.platformInvoices.status, "OPEN")
    : filter === "atraso" ? and(eq(c.platformInvoices.status, "OPEN"), lt(c.platformInvoices.dueDate, now))
    : filter === "pagas" ? eq(c.platformInvoices.status, "PAID")
    : filter === "anuladas" ? eq(c.platformInvoices.status, "VOID") : undefined;
  const rows = await central().query.platformInvoices.findMany({ where, orderBy: desc(c.platformInvoices.issuedAt), limit: 300, with: { institution: true } });
  const [{ open }] = await central().select({ open: sum(c.platformInvoices.amountCents) }).from(c.platformInvoices).where(eq(c.platformInvoices.status, "OPEN"));
  const [{ late }] = await central().select({ late: sum(c.platformInvoices.amountCents) }).from(c.platformInvoices).where(and(eq(c.platformInvoices.status, "OPEN"), lt(c.platformInvoices.dueDate, now)));
  const [{ paid }] = await central().select({ paid: sum(c.platformInvoices.amountCents) }).from(c.platformInvoices).where(eq(c.platformInvoices.status, "PAID"));
  const cur = settings.billingCurrency;

  return (
    <>
      <PageHeader title="Faturas" subtitle="Assinaturas das instituições — pagamentos registados manualmente"
        actions={<ActionButton action={runBillingAction} hidden={{}} className="btn-ghost">Verificar faturação agora</ActionButton>} />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat label="Em aberto" value={money(Number(open ?? 0), cur)} tone="amber" />
        <Stat label="Em atraso" value={money(Number(late ?? 0), cur)} tone="red" />
        <Stat label="Total recebido" value={money(Number(paid ?? 0), cur)} tone="green" />
      </div>
      <Tabs current={filter} tabs={Object.entries(FILTERS).map(([k, label]) => ({ key: k, label, href: `/admin/faturas?f=${k}` }))} />
      <Card pad={false}>
        {rows.length === 0 ? <EmptyState icon={<FileText size={24} />} title="Sem faturas neste filtro" text="As faturas são emitidas automaticamente no fim do período de teste e em cada renovação." /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>N.º</th><th>Instituição</th><th>Descrição</th><th>Valor</th><th>Vencimento</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {rows.map((v) => {
                  const isLate = v.status === "OPEN" && v.dueDate < now;
                  return (
                    <tr key={v.id}>
                      <td className="whitespace-nowrap font-medium">{v.number}</td>
                      <td><Link href={`/admin/instituicoes/${v.institutionId}?tab=faturas`} className="hover:text-accent">{v.institution.name}</Link></td>
                      <td>{v.description}<p className="text-xs text-ink-soft">{fmtDateObj(v.periodStart)} – {fmtDateObj(v.periodEnd)}</p></td>
                      <td className="whitespace-nowrap font-medium">{money(v.amountCents, v.currency)}</td>
                      <td className="whitespace-nowrap">{fmtDateObj(v.dueDate)}</td>
                      <td>
                        <Badge tone={isLate ? "red" : PLATFORM_INVOICE_STATUS[v.status].tone}>{isLate ? "Em atraso" : PLATFORM_INVOICE_STATUS[v.status].label}</Badge>
                        {v.status === "PAID" && <p className="mt-0.5 text-xs text-ink-soft">{v.paymentMethod} · {fmtDateObj(v.paidAt)}</p>}
                      </td>
                      <td><InvoiceRowActions id={v.id} number={v.number} open={v.status === "OPEN"} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
