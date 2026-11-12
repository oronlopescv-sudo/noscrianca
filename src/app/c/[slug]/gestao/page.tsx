import Link from "next/link";
import { and, count, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { t } from "@/db/tenant";
import { BarChart } from "@/components/ui/chart";
import { UpcomingEvents } from "@/components/tenant/agenda";
import { Badge, Card, EmptyState, PageHeader, Stat } from "@/components/ui/kit";
import { addMonths, money, periodLabel, todayIn } from "@/lib/format";
import { requireTenant, childScope } from "@/lib/tenant";
import { Baby, CalendarCheck, Users, Wallet } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ManagementDashboard({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireTenant((await params).slug, { permission: "children.view" });
  const today = todayIn(ctx.settings.timezone);
  const period = today.slice(0, 7);
  const scope = childScope(ctx);
  const cur = ctx.settings.currency;

  const [[{ n: kids }], [{ n: guardians }], [{ n: staff }], [{ n: present }], [{ open }], revenue, [{ n: absent }]] = await Promise.all([
    ctx.db.select({ n: count() }).from(t.children).where(and(eq(t.children.status, "ACTIVE"), scope)),
    ctx.db.select({ n: count() }).from(t.guardians),
    ctx.db.select({ n: count() }).from(t.employees),
    ctx.db.select({ n: count() }).from(t.attendance).innerJoin(t.children, eq(t.children.id, t.attendance.childId))
      .where(and(eq(t.attendance.date, today), eq(t.attendance.status, "PRESENT"), scope)),
    ctx.can("finance.view")
      ? ctx.db.select({ open: sql<number>`coalesce(sum(${t.invoices.totalCents} - ${t.invoices.paidCents}), 0)::int` }).from(t.invoices)
          .where(inArray(t.invoices.status, ["OPEN", "PARTIAL"]))
      : Promise.resolve([{ open: 0 }]),
    ctx.can("finance.view")
      ? ctx.db.select({ m: sql<string>`substring(${t.payments.paidAt}, 1, 7)`, v: sql<number>`coalesce(sum(${t.payments.amountCents}), 0)::int` })
          .from(t.payments).where(and(isNull(t.payments.reversedAt), gte(t.payments.paidAt, `${addMonths(period, -5)}-01`))).groupBy(sql`1`)
      : Promise.resolve([] as { m: string; v: number }[]),
    ctx.db.select({ n: count() }).from(t.attendance).innerJoin(t.children, eq(t.children.id, t.attendance.childId))
      .where(and(eq(t.attendance.date, today), eq(t.attendance.status, "ABSENT"), scope)),
  ]);

  const months = Array.from({ length: 6 }, (_, i) => addMonths(period, i - 5));
  const byMonth = new Map(revenue.map((r) => [r.m, r.v]));
  const chart = months.map((m) => ({ label: periodLabel(m).split(" ")[0], value: byMonth.get(m) ?? 0 }));
  const recent = ctx.can("finance.view")
    ? await ctx.db.query.payments.findMany({ where: isNull(t.payments.reversedAt), orderBy: (p, { desc }) => desc(p.createdAt), limit: 5, with: { invoice: { with: { child: true } } } })
    : [];

  // ---- O que há para tratar hoje (cada bloco só para quem tem a permissão) ----
  const canFin = ctx.can("finance.view");
  const [unpaid, [{ n: proofs }], [{ n: requests }], [{ n: leaves }], absentKids, payroll] = await Promise.all([
    canFin
      ? ctx.db.query.invoices.findMany({ where: and(eq(t.invoices.period, period), eq(t.invoices.kind, "MONTHLY"), inArray(t.invoices.status, ["OPEN", "PARTIAL"])), with: { child: true }, orderBy: (i, { asc }) => asc(i.dueDate) })
      : Promise.resolve([]),
    canFin ? ctx.db.select({ n: count() }).from(t.paymentProofs).where(eq(t.paymentProofs.status, "PENDING")) : Promise.resolve([{ n: 0 }]),
    ctx.can("children.manage") ? ctx.db.select({ n: count() }).from(t.enrollmentRequests).where(eq(t.enrollmentRequests.status, "NEW")) : Promise.resolve([{ n: 0 }]),
    ctx.can("employees.manage") ? ctx.db.select({ n: count() }).from(t.staffLeaves).where(eq(t.staffLeaves.status, "PENDING")) : Promise.resolve([{ n: 0 }]),
    ctx.can("attendance.view")
      ? ctx.db.select({ id: t.children.id, firstName: t.children.firstName, lastName: t.children.lastName, reason: t.attendance.absenceReason }).from(t.attendance)
          .innerJoin(t.children, eq(t.children.id, t.attendance.childId)).where(and(eq(t.attendance.date, today), eq(t.attendance.status, "ABSENT"), scope))
      : Promise.resolve([]),
    ctx.can("payroll.manage")
      ? Promise.all([
          ctx.db.query.employees.findMany({ with: { user: true } }),
          ctx.db.query.salaryPayments.findMany({ where: and(eq(t.salaryPayments.period, period), isNull(t.salaryPayments.voidedAt)), columns: { employeeId: true } }),
        ]).then(([emps, pays]) => {
          const paidIds = new Set(pays.map((p) => p.employeeId));
          return emps.filter((e) => e.salaryCents && !e.user.deletedAt && e.user.status !== "SUSPENDED" && !paidIds.has(e.id)).length;
        })
      : Promise.resolve(0),
  ]);
  const unpaidTotal = unpaid.reduce((a, i) => a + (i.totalCents - i.paidCents), 0);
  const todo = [
    proofs > 0 && { href: `${ctx.base}/gestao/mensalidades`, text: `${proofs} comprovativo(s) de pagamento por confirmar` },
    requests > 0 && { href: `${ctx.base}/gestao/inscricoes`, text: `${requests} pedido(s) de inscrição por tratar` },
    leaves > 0 && { href: `${ctx.base}/gestao/funcionarios`, text: `${leaves} pedido(s) de férias ou falta por decidir` },
    payroll > 0 && { href: `${ctx.base}/gestao/salarios`, text: `${payroll} salário(s) de ${periodLabel(period)} por pagar` },
  ].filter(Boolean) as { href: string; text: string }[];

  return (
    <>
      <PageHeader title="Painel" subtitle={`Resumo de ${today.split("-").reverse().join("/")}`} />
      {todo.length > 0 && (
        <Card title="Para tratar" className="mb-5" pad={false}>
          <ul className="divide-y divide-line">
            {todo.map((x) => <li key={x.href + x.text}><Link href={x.href} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-surface sm:px-5"><span>{x.text}</span><span aria-hidden className="text-accent">→</span></Link></li>)}
          </ul>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Crianças ativas" value={kids} icon={<Baby size={18} />} hint={`${guardians} encarregados`} />
        <Stat label="Presentes hoje" value={present} icon={<CalendarCheck size={18} />} tone="green" hint={`${absent} faltas`} />
        <Stat label="Equipa" value={staff} icon={<Users size={18} />} tone="blue" />
        {ctx.can("finance.view") && <Stat label="Por receber" value={money(open, cur)} icon={<Wallet size={18} />} tone="amber" hint={<Link href={`${ctx.base}/gestao/mensalidades`} className="link">Ver mensalidades</Link>} />}
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {ctx.can("finance.view") && (
          <Card title="Recebido nos últimos 6 meses" className="lg:col-span-2">
            <BarChart data={chart} format={(v) => money(v, cur)} caption="Valor recebido por mês, líquido de estornos" />
          </Card>
        )}
        <Card title="Acesso rápido" className={ctx.can("finance.view") ? "" : "lg:col-span-3"}>
          <div className="grid gap-2">
            <Link href={`${ctx.base}/gestao/criancas`} className="btn btn-secondary justify-start">Crianças e inscrições</Link>
            {ctx.can("attendance.view") && <Link href={`${ctx.base}/gestao/presencas`} className="btn btn-secondary justify-start">Presenças de hoje</Link>}
            {ctx.can("announcements.manage") && <Link href={`${ctx.base}/gestao/comunicados`} className="btn btn-secondary justify-start">Publicar comunicado</Link>}
            {ctx.can("messages.reply") && <Link href={`${ctx.base}/gestao/mensagens`} className="btn btn-secondary justify-start">Mensagens dos pais</Link>}
          </div>
        </Card>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {canFin && (
          <Card title={`Mensalidades de ${periodLabel(period)} por pagar`} pad={false} actions={unpaid.length > 0 ? <Badge tone="red">{unpaid.length} · {money(unpaidTotal, cur)}</Badge> : <Badge tone="green">Tudo pago</Badge>}>
            {unpaid.length === 0 ? <p className="card-pad text-sm text-ink-soft">Não há mensalidades deste mês por pagar.</p> : (
              <ul className="divide-y divide-line">
                {unpaid.slice(0, 8).map((i) => (
                  <li key={i.id}>
                    <Link href={`${ctx.base}/gestao/criancas/${i.childId}#calendario`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-surface sm:px-5">
                      <span className="truncate">{i.child.firstName} {i.child.lastName}</span>
                      <span className="flex shrink-0 items-center gap-2"><span>{money(i.totalCents - i.paidCents, cur)}</span><Badge tone="red">{i.dueDate < today ? "Em atraso" : "Não pago"}</Badge></span>
                    </Link>
                  </li>
                ))}
                {unpaid.length > 8 && <li className="px-4 py-2.5 text-sm sm:px-5"><Link href={`${ctx.base}/gestao/criancas`} className="link">Ver as {unpaid.length} crianças</Link></li>}
              </ul>
            )}
          </Card>
        )}
        {ctx.can("attendance.view") && (
          <Card title="Faltas de hoje" pad={false} actions={<Badge tone={absentKids.length ? "red" : "green"}>{absentKids.length}</Badge>}>
            {absentKids.length === 0 ? <p className="card-pad text-sm text-ink-soft">Nenhuma falta registada hoje.</p> : (
              <ul className="divide-y divide-line">
                {absentKids.map((k) => (
                  <li key={k.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                    <Link href={`${ctx.base}/gestao/criancas/${k.id}`} className="truncate hover:text-accent">{k.firstName} {k.lastName}</Link>
                    <span className="shrink-0 text-xs text-ink-soft">{k.reason || "Sem motivo indicado"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
      <div className="mt-5"><UpcomingEvents ctx={ctx} viewer="STAFF" classroomIds={ctx.classroomIds} /></div>
      {ctx.can("finance.view") && (
        <Card title="Últimos pagamentos" className="mt-5" pad={false}>
          {recent.length === 0 ? <div className="card-pad"><EmptyState title="Sem pagamentos" text="Os pagamentos registados aparecem aqui." /></div> : (
            <ul className="divide-y divide-line">
              {recent.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.invoice.child.firstName} {p.invoice.child.lastName}</p>
                    <p className="text-xs text-ink-soft">Fatura {p.invoice.number} · {p.paidAt.split("-").reverse().join("/")}</p>
                  </div>
                  <p className="font-semibold">{money(p.amountCents, cur)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
