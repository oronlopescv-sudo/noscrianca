import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { Badge, Card } from "@/components/ui/kit";
import { t } from "@/db/tenant";
import { fmtDate, money, todayIn } from "@/lib/format";
import type { TenantCtx } from "@/lib/tenant";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** Salários do PRÓPRIO funcionário: usa sempre o funcionário da sessão, nunca um id vindo do pedido. */
export async function MySalary({ ctx, yearParam }: { ctx: TenantCtx; yearParam?: string }) {
  if (!ctx.employeeId) return null;
  const today = todayIn(ctx.settings.timezone);
  const thisYear = Number(today.slice(0, 4));
  const year = yearParam && /^\d{4}$/.test(yearParam) && Number(yearParam) <= thisYear && Number(yearParam) >= thisYear - 10 ? Number(yearParam) : thisYear;
  const cur = ctx.settings.currency;
  const [emp, payments] = await Promise.all([
    ctx.db.query.employees.findFirst({ where: eq(t.employees.id, ctx.employeeId) }),
    ctx.db.query.salaryPayments.findMany({ where: and(eq(t.salaryPayments.employeeId, ctx.employeeId), isNull(t.salaryPayments.voidedAt)) }),
  ]);
  if (!emp) return null;
  const paid = new Map(payments.map((p) => [p.period, p]));
  // Um mês conta como "não pago" a partir da admissão (ou da criação da ficha) e até ao mês atual.
  const start = (emp.hireDate ?? emp.createdAt.toISOString().slice(0, 10)).slice(0, 7);
  const current = today.slice(0, 7);
  const base = `${ctx.base}/perfil`;
  const yearTotal = payments.filter((p) => p.period.startsWith(String(year))).reduce((a, p) => a + p.amountCents, 0);

  return (
    <Card pad={false} title={<span id="salarios">Os meus salários · {year}</span>}
      actions={<span className="flex gap-1.5">
        <Link href={`${base}?ano=${year - 1}#salarios`} scroll={false} className="btn btn-secondary btn-sm">← {year - 1}</Link>
        {year < thisYear && <Link href={`${base}?ano=${year + 1}#salarios`} scroll={false} className="btn btn-secondary btn-sm">{year + 1} →</Link>}
      </span>}>
      <p className="border-b border-line px-4 py-3 text-sm sm:px-5">
        Salário base: <span className="font-semibold">{emp.salaryCents ? money(emp.salaryCents, cur) : "por definir pela direção"}</span>
        <span className="text-ink-soft"> · recebido em {year}: {money(yearTotal, cur)}</span>
      </p>
      <ul className="grid grid-cols-2 gap-px bg-line/60 sm:grid-cols-3 lg:grid-cols-4">
        {MONTHS.map((label, idx) => {
          const ym = `${year}-${String(idx + 1).padStart(2, "0")}`;
          const p = paid.get(ym);
          const due = !p && !!emp.salaryCents && ym >= start && ym <= current;
          return (
            <li key={ym} className={`p-3 ${p ? "bg-emerald-50" : due ? "bg-red-50" : "bg-white"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{label}</span>
                {p ? <Badge tone="green">Pago</Badge> : due ? <Badge tone="red">Não pago</Badge> : <Badge>—</Badge>}
              </div>
              <p className="mt-1.5 text-xs text-ink-soft">{p ? `${money(p.amountCents, cur)} · pago a ${fmtDate(p.paidAt)}` : due ? "A aguardar pagamento" : ym > current ? "Ainda não chegou" : "Sem registo"}</p>
            </li>
          );
        })}
      </ul>
      <p className="px-4 py-3 text-xs text-ink-soft sm:px-5">Só você e a direção veem esta informação.</p>
    </Card>
  );
}
