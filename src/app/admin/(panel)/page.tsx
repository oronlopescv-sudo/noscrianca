import Link from "next/link";
import { and, count, desc, eq, gte, inArray, lt, sql, sum } from "drizzle-orm";
import { AlertTriangle, Baby, Building2, Inbox, Plus, Wallet } from "lucide-react";
import { BarChart } from "@/components/ui/chart";
import { Badge, Card, EmptyState, Notice, PageHeader, Stat } from "@/components/ui/kit";
import { central, c } from "@/db/central";
import { fmtDateObj, money } from "@/lib/format";
import { INSTITUTION_STATUS } from "@/lib/labels";
import { getPlatformSettings } from "@/lib/platform";

export const metadata = { title: "Painel" };
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default async function AdminDashboard() {
  const settings = await getPlatformSettings();
  const now = new Date();
  const byStatus = await central().select({ status: c.institutions.status, n: count() }).from(c.institutions).groupBy(c.institutions.status);
  const total = byStatus.reduce((a, b) => a + b.n, 0);
  const n = (s: string) => byStatus.find((b) => b.status === s)?.n ?? 0;
  const [{ kids }] = await central().select({ kids: sum(c.institutions.childrenCount) }).from(c.institutions)
    .where(inArray(c.institutions.status, ["TRIAL", "ACTIVE", "PAST_DUE"]));
  const [{ pending }] = await central().select({ pending: count() }).from(c.signupRequests).where(eq(c.signupRequests.status, "PENDING"));
  const [{ overdue, overdueAmount }] = await central().select({ overdue: count(), overdueAmount: sum(c.platformInvoices.amountCents) }).from(c.platformInvoices)
    .where(and(eq(c.platformInvoices.status, "OPEN"), lt(c.platformInvoices.dueDate, now)));
  const failed = await central().query.institutions.findMany({ where: eq(c.institutions.status, "FAILED") });

  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const paid = await central().select({ m: sql<string>`to_char(${c.platformInvoices.paidAt}, 'YYYY-MM')`, v: sum(c.platformInvoices.amountCents) })
    .from(c.platformInvoices).where(and(eq(c.platformInvoices.status, "PAID"), gte(c.platformInvoices.paidAt, from))).groupBy(sql`1`);
  const chart = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    return { label: MONTHS[d.getUTCMonth()], value: Number(paid.find((p) => p.m === key)?.v ?? 0) };
  });
  const recent = await central().query.institutions.findMany({ orderBy: desc(c.institutions.createdAt), limit: 6, with: { plan: true } });

  return (
    <>
      <PageHeader title="Painel da plataforma" subtitle="Visão geral de todas as instituições"
        actions={<Link href="/admin/instituicoes/nova" className="btn-primary"><Plus size={16} /> Nova creche</Link>} />
      {failed.length > 0 && (
        <div className="mb-4">
          <Notice tone="red">
            <span className="font-semibold">Criação falhada:</span>{" "}
            {failed.map((f, i) => <span key={f.id}>{i > 0 && ", "}<Link className="underline" href={`/admin/instituicoes/${f.id}?tab=provisionamento`}>{f.name}</Link></span>)} — abra para tentar de novo.
          </Notice>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Instituições" value={total} hint={`${n("ACTIVE")} ativas · ${n("TRIAL")} em teste · ${n("SUSPENDED")} suspensas`} icon={<Building2 size={20} />} />
        <Stat label="Crianças inscritas" value={Number(kids ?? 0)} hint="Em instituições em funcionamento" icon={<Baby size={20} />} tone="green" />
        <Stat label="Faturas em atraso" value={overdue} hint={overdue ? money(Number(overdueAmount ?? 0), settings.billingCurrency) : "Nenhuma em atraso"} icon={<AlertTriangle size={20} />} tone={overdue ? "red" : "gray"} />
        <Stat label="Pedidos de adesão" value={pending} hint={pending ? <Link href="/admin/pedidos" className="link">Ver pedidos</Link> : "Nenhum pendente"} icon={<Inbox size={20} />} tone="purple" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <Card title={<span className="flex items-center gap-2"><Wallet size={16} /> Valor recebido — últimos 6 meses</span>} className="lg:col-span-2">
          <BarChart data={chart} format={(v) => money(v, settings.billingCurrency)} caption="Valor recebido das instituições por mês, últimos 6 meses" />
        </Card>
        <Card title="Instituições recentes" className="lg:col-span-3" pad={false} actions={<Link href="/admin/instituicoes" className="link text-sm">Ver todas</Link>}>
          {recent.length === 0 ? (
            <EmptyState icon={<Building2 size={24} />} title="Ainda não há instituições" text="Crie a primeira creche para começar."
              action={<Link href="/admin/instituicoes/nova" className="btn-primary">Nova creche</Link>} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Instituição</th><th>Plano</th><th>Crianças</th><th>Estado</th><th>Criada</th></tr></thead>
                <tbody>
                  {recent.map((i) => (
                    <tr key={i.id}>
                      <td><Link href={`/admin/instituicoes/${i.id}`} className="font-medium hover:text-accent">{i.name}</Link><p className="text-xs text-ink-soft">/c/{i.slug}</p></td>
                      <td>{i.plan?.name ?? "—"}</td>
                      <td>{i.childrenCount}</td>
                      <td><Badge tone={INSTITUTION_STATUS[i.status].tone}>{INSTITUTION_STATUS[i.status].label}</Badge></td>
                      <td className="whitespace-nowrap text-ink-soft">{fmtDateObj(i.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
