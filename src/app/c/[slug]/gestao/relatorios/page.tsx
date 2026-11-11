import { and, count, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { t } from "@/db/tenant";
import { Card, PageHeader, Field } from "@/components/ui/kit";
import { money, todayIn } from "@/lib/format";
import { childScope, requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const REPORTS = [
  { kind: "criancas", title: "Crianças", text: "Lista de crianças com turma, mensalidade e encarregados.", perm: "children.view" as const },
  { kind: "encarregados", title: "Encarregados", text: "Contactos e crianças associadas a cada família.", perm: "children.view" as const },
  { kind: "faturas", title: "Faturas", text: "Faturas emitidas no intervalo, com total e valor pago.", perm: "finance.view" as const },
  { kind: "pagamentos", title: "Pagamentos", text: "Pagamentos ativos recebidos no intervalo (sem estornos).", perm: "finance.view" as const },
  { kind: "presencas", title: "Presenças", text: "Entradas, saídas e faltas por dia no intervalo.", perm: "reports.view" as const },
];

export default async function ReportsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ de?: string; ate?: string }> }) {
  const ctx = await requireTenant((await params).slug, { permission: ["reports.view", "finance.view", "children.view"] });
  const sp = await searchParams;
  const today = todayIn(ctx.settings.timezone);
  const monthStart = `${today.slice(0, 8)}01`;
  const de = sp.de && /^\d{4}-\d{2}-\d{2}$/.test(sp.de) ? sp.de : monthStart;
  const ate = sp.ate && /^\d{4}-\d{2}-\d{2}$/.test(sp.ate) ? sp.ate : today;
  const qs = `de=${de}&ate=${ate}`;
  const available = REPORTS.filter((r) => ctx.can(r.perm));

  let summary: { received: number; invoiced: number; presentDays: number; kids: number } | null = null;
  if (ctx.can("finance.view") || ctx.can("reports.view")) {
    const [[{ received }], [{ invoiced }], [{ n: presentDays }], [{ n: kids }]] = await Promise.all([
      ctx.db.select({ received: sql<number>`coalesce(sum(${t.payments.amountCents}), 0)::int` }).from(t.payments)
        .where(and(isNull(t.payments.reversedAt), gte(t.payments.paidAt, de), lte(t.payments.paidAt, ate))),
      ctx.db.select({ invoiced: sql<number>`coalesce(sum(${t.invoices.totalCents}), 0)::int` }).from(t.invoices)
        .where(and(gte(t.invoices.issueDate, de), lte(t.invoices.issueDate, ate), sql`${t.invoices.status} <> 'VOID'`)),
      ctx.db.select({ n: count() }).from(t.attendance).innerJoin(t.children, eq(t.children.id, t.attendance.childId))
        .where(and(eq(t.attendance.status, "PRESENT"), gte(t.attendance.date, de), lte(t.attendance.date, ate), childScope(ctx))),
      ctx.db.select({ n: count() }).from(t.children).where(and(eq(t.children.status, "ACTIVE"), childScope(ctx))),
    ]);
    summary = { received, invoiced, presentDays, kids };
  }

  return (
    <>
      <PageHeader title="Relatórios" subtitle="Exportações em CSV, abertas diretamente no Excel" />
      <form className="mb-5 flex flex-wrap items-end gap-3" role="search">
        <Field label="De"><input type="date" name="de" defaultValue={de} className="input" /></Field>
        <Field label="Até"><input type="date" name="ate" defaultValue={ate} className="input" /></Field>
        <button className="btn btn-secondary" type="submit">Atualizar</button>
      </form>
      {summary && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {ctx.can("finance.view") && <Card title="Recebido"><p className="text-xl font-semibold">{money(summary.received, ctx.settings.currency)}</p></Card>}
          {ctx.can("finance.view") && <Card title="Faturado"><p className="text-xl font-semibold">{money(summary.invoiced, ctx.settings.currency)}</p></Card>}
          {ctx.can("reports.view") && <Card title="Presenças"><p className="text-xl font-semibold">{summary.presentDays}</p><p className="text-xs text-ink-soft">registos no período</p></Card>}
          <Card title="Crianças ativas"><p className="text-xl font-semibold">{summary.kids}</p></Card>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {available.map((r) => (
          <Card key={r.kind} title={r.title}>
            <p className="mb-4 text-sm text-ink-soft">{r.text}</p>
            <a href={`${ctx.base}/exportar/${r.kind}?${qs}`} className="btn btn-primary btn-sm">Descarregar CSV</a>
          </Card>
        ))}
      </div>
    </>
  );
}
