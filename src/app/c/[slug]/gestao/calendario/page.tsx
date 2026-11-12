import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/kit";
import { t } from "@/db/tenant";
import { money, todayIn } from "@/lib/format";
import { childScope, requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WEEK = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function MonthlyCalendar({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ mes?: string }> }) {
  const ctx = await requireTenant((await params).slug, { panel: "MANAGEMENT" });
  const canAttendance = ctx.can("attendance.view");
  const canFinance = ctx.can("finance.view");
  if (!canAttendance && !canFinance) notFound();

  const sp = await searchParams;
  const today = todayIn(ctx.settings.timezone);
  const ym = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : today.slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // segunda = 0
  const from = `${ym}-01`;
  const to = `${ym}-${String(daysInMonth).padStart(2, "0")}`;

  const kids = await ctx.db.query.children.findMany({
    where: and(eq(t.children.status, "ACTIVE"), childScope(ctx)),
    columns: { id: true, firstName: true, lastName: true },
    orderBy: (k, { asc }) => asc(k.firstName),
  });
  const ids = kids.map((k) => k.id);

  const att = canAttendance && ids.length
    ? await ctx.db.select({ childId: t.attendance.childId, date: t.attendance.date, status: t.attendance.status })
        .from(t.attendance).where(and(inArray(t.attendance.childId, ids), inArray(t.attendance.date, dateList(from, daysInMonth))))
    : [];
  const invoices = canFinance && ids.length
    ? await ctx.db.query.invoices.findMany({
        where: and(inArray(t.invoices.childId, ids), eq(t.invoices.period, ym), eq(t.invoices.kind, "MONTHLY"), isNull(t.invoices.voidedAt)),
      })
    : [];

  // Contagem por dia (presentes e faltas) e por criança (dias de presença e faltas).
  const perDay = new Map<string, { present: number; absent: number }>();
  const perKid = new Map<string, { present: number; absent: number }>();
  for (const r of att) {
    const d = perDay.get(r.date) ?? { present: 0, absent: 0 };
    const k = perKid.get(r.childId) ?? { present: 0, absent: 0 };
    if (r.status === "PRESENT") { d.present++; k.present++; } else { d.absent++; k.absent++; }
    perDay.set(r.date, d);
    perKid.set(r.childId, k);
  }
  const invByKid = new Map(invoices.map((i) => [i.childId, i]));

  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  const prev = shiftMonth(ym, -1);
  const next = shiftMonth(ym, 1);
  const base = `${ctx.base}/gestao/calendario`;

  return (
    <>
      <PageHeader title="Calendário mensal" subtitle={`${MONTHS[m - 1]} de ${y}`} />

      <div className="mb-5 flex items-center justify-between gap-3">
        <Link href={`${base}?mes=${prev}`} className="btn btn-secondary btn-sm">← {MONTHS[Number(prev.split("-")[1]) - 1]}</Link>
        <Link href={base} className="btn btn-secondary btn-sm">Mês atual</Link>
        <Link href={`${base}?mes=${next}`} className="btn btn-secondary btn-sm">{MONTHS[Number(next.split("-")[1]) - 1]} →</Link>
      </div>

      {canAttendance && (
        <Card title="Presenças do mês" pad={false} className="mb-5">
          <div className="grid grid-cols-7 gap-px bg-line/60 text-center text-xs">
            {WEEK.map((w) => <div key={w} className="bg-surface px-1 py-2 font-medium text-ink-soft">{w}</div>)}
            {cells.map((day, i) => {
              if (day === null) return <div key={i} className="bg-white/60" />;
              const key = `${ym}-${String(day).padStart(2, "0")}`;
              const d = perDay.get(key);
              const isToday = key === today;
              return (
                <div key={i} className={`min-h-[64px] bg-white p-1.5 text-left ${isToday ? "ring-2 ring-accent ring-inset" : ""}`}>
                  <p className={`text-xs font-semibold ${isToday ? "text-accent" : ""}`}>{day}</p>
                  {d && (
                    <div className="mt-1 space-y-0.5 text-[11px] leading-tight">
                      <p className="text-emerald-700">{d.present} presentes</p>
                      {d.absent > 0 && <p className="text-red-700">{d.absent} faltas</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card title="Crianças neste mês" pad={false}>
        {kids.length === 0 ? (
          <EmptyState title="Sem crianças" text="Não há crianças ativas visíveis para o seu perfil." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-soft">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Criança</th>
                  {canAttendance && <th className="px-3 py-2.5 font-medium">Presenças</th>}
                  {canAttendance && <th className="px-3 py-2.5 font-medium">Faltas</th>}
                  {canFinance && <th className="px-3 py-2.5 font-medium">Mensalidade</th>}
                  {canFinance && <th className="px-5 py-2.5 text-right font-medium">Em dívida</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {kids.map((k) => {
                  const a = perKid.get(k.id) ?? { present: 0, absent: 0 };
                  const inv = invByKid.get(k.id);
                  const owed = inv ? inv.totalCents - inv.paidCents : 0;
                  const overdue = inv && (inv.status === "OPEN" || inv.status === "PARTIAL") && inv.dueDate < today;
                  return (
                    <tr key={k.id}>
                      <td className="px-5 py-3 font-medium">{k.firstName} {k.lastName}</td>
                      {canAttendance && <td className="px-3 py-3">{a.present}</td>}
                      {canAttendance && <td className="px-3 py-3">{a.absent}</td>}
                      {canFinance && (
                        <td className="px-3 py-3">
                          {!inv ? <Badge>Sem fatura</Badge>
                            : inv.status === "PAID" ? <Badge tone="green">Paga</Badge>
                            : overdue ? <Badge tone="red">Em atraso</Badge>
                            : inv.status === "PARTIAL" ? <Badge tone="accent">Parcial</Badge>
                            : <Badge>Em aberto</Badge>}
                        </td>
                      )}
                      {canFinance && <td className="px-5 py-3 text-right">{owed > 0 ? money(owed, ctx.settings.currency) : "—"}</td>}
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

function dateList(from: string, days: number): string[] {
  const [y, m] = from.split("-").map(Number);
  return Array.from({ length: days }, (_, i) => `${y}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`);
}
