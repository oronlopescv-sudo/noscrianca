import Link from "next/link";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { ActionButton, ConfirmAction } from "@/components/ui/client";
import { Badge, Card } from "@/components/ui/kit";
import { t } from "@/db/tenant";
import { fmtDate, money, todayIn } from "@/lib/format";
import type { TenantCtx } from "@/lib/tenant";
import { issueChildInvoiceAction, markInvoicePaidAction, markInvoiceUnpaidAction, sendPaymentReminderAction } from "@/server/finance";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WEEK = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** Lê ?mes=AAAA-MM (com limite de ±10 anos); por omissão, o mês atual. */
export function calendarMonth(raw: string | undefined, today: string): string {
  if (raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) && Math.abs(Number(raw.slice(0, 4)) - Number(today.slice(0, 4))) <= 10) return raw;
  return today.slice(0, 7);
}

function shift(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Calendário de pagamentos e presenças de UMA criança: os 12 meses do ano
 * (estado da mensalidade) e os dias do mês escolhido (presença e pagamentos).
 * Quem chama garante o acesso à criança; aqui só se escolhe o que mostrar.
 */
export async function ChildCalendar({ ctx, childId, month, basePath, showFinance, showAttendance, manage, canPay = false }: {
  ctx: TenantCtx; childId: string; month: string; basePath: string;
  showFinance: boolean; showAttendance: boolean;
  /** Gestão: os meses ligam à fatura, onde se regista o pagamento. */
  manage: boolean;
  /** Pode marcar pago / não pago e enviar cobranças (permissão financeira de escrita). */
  canPay?: boolean;
}) {
  if (!showFinance && !showAttendance) return null;
  const today = todayIn(ctx.settings.timezone);
  const cur = ctx.settings.currency;
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // segunda = 0
  const pad = (n: number) => String(n).padStart(2, "0");

  const [att, invoices] = await Promise.all([
    showAttendance
      ? ctx.db.select({ date: t.attendance.date, status: t.attendance.status }).from(t.attendance)
          .where(and(eq(t.attendance.childId, childId), gte(t.attendance.date, `${month}-01`), lte(t.attendance.date, `${month}-${pad(days)}`)))
      : Promise.resolve([]),
    showFinance
      ? ctx.db.query.invoices.findMany({ where: eq(t.invoices.childId, childId), with: { payments: { where: isNull(t.payments.reversedAt) } } })
      : Promise.resolve([]),
  ]);

  const live = invoices.filter((i) => i.status !== "VOID");
  const monthly = new Map(live.filter((i) => i.kind === "MONTHLY").map((i) => [i.period, i]));
  const attByDay = new Map(att.map((a) => [a.date, a.status]));
  const paidByDay = new Map<string, number>();
  const dueByDay = new Map<string, number>();
  for (const inv of live) {
    for (const p of inv.payments) if (p.paidAt.startsWith(month)) paidByDay.set(p.paidAt, (paidByDay.get(p.paidAt) ?? 0) + p.amountCents);
    const owed = inv.totalCents - inv.paidCents;
    if (owed > 0 && inv.dueDate.startsWith(month)) dueByDay.set(inv.dueDate, (dueByDay.get(inv.dueDate) ?? 0) + owed);
  }

  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const present = att.filter((a) => a.status === "PRESENT").length;
  const absent = att.length - present;
  const href = (ym: string) => `${basePath}?mes=${ym}#calendario`;

  return (
    <Card pad={false} title={<span id="calendario">Calendário de pagamentos{showAttendance ? " e presenças" : ""}</span>}
      actions={<span className="flex gap-1.5">
        <Link href={href(`${y - 1}-${pad(m)}`)} scroll={false} className="btn btn-secondary btn-sm">← {y - 1}</Link>
        <Link href={href(`${y + 1}-${pad(m)}`)} scroll={false} className="btn btn-secondary btn-sm">{y + 1} →</Link>
      </span>}>
      {showFinance && (
        <ul className="grid grid-cols-3 gap-px border-b border-line bg-line/60 sm:grid-cols-4 lg:grid-cols-6">
          {MONTHS.map((label, idx) => {
            const ym = `${y}-${pad(idx + 1)}`;
            const inv = monthly.get(ym);
            const overdue = inv && (inv.status === "OPEN" || inv.status === "PARTIAL") && inv.dueDate < today;
            const lastPaid = inv?.payments.map((p) => p.paidAt).sort().at(-1);
            return (
              <li key={ym} className={!inv ? "bg-white" : inv.status === "PAID" ? "bg-emerald-50" : "bg-red-50"}>
                <Link href={href(ym)} scroll={false} className={`block p-2.5 hover:brightness-95 ${ym === month ? "ring-2 ring-inset ring-accent" : ""}`}>
                  <p className={`text-xs font-semibold ${ym === month ? "text-accent" : ""}`}>{label.slice(0, 3)} {y}</p>
                  <p className="mt-1.5">
                    {!inv ? <Badge>Sem fatura</Badge>
                      : inv.status === "PAID" ? <Badge tone="green">Pago</Badge>
                      : <Badge tone="red">{overdue ? "Em atraso" : inv.status === "PARTIAL" ? "Parcial" : "Não pago"}</Badge>}
                  </p>
                  <p className="mt-1 text-[11px] leading-tight text-ink-soft">
                    {!inv ? "—" : inv.status === "PAID" ? `Pago a ${fmtDate(lastPaid ?? inv.dueDate)}` : `Falta ${money(inv.totalCents - inv.paidCents, cur)}`}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <Link href={href(shift(month, -1))} scroll={false} className="btn btn-secondary btn-sm" aria-label="Mês anterior">←</Link>
          <p className="min-w-[9.5rem] text-center text-sm font-semibold">{MONTHS[m - 1]} de {y}</p>
          <Link href={href(shift(month, 1))} scroll={false} className="btn btn-secondary btn-sm" aria-label="Mês seguinte">→</Link>
        </div>
        <p className="text-xs text-ink-soft">
          {showAttendance && <>{present} presença(s) · {absent} falta(s)</>}
          {showAttendance && showFinance && " · "}
          {showFinance && <>pago neste mês: {money([...paidByDay.values()].reduce((a, b) => a + b, 0), cur)}</>}
        </p>
      </div>

      <div className="grid grid-cols-7 gap-px border-t border-line bg-line/60 text-center text-xs">
        {WEEK.map((w) => <div key={w} className="bg-surface px-1 py-2 font-medium text-ink-soft">{w}</div>)}
        {cells.map((day, i) => {
          if (day === null) return <div key={i} className="bg-white/60" />;
          const key = `${month}-${pad(day)}`;
          const a = attByDay.get(key);
          const paid = paidByDay.get(key);
          const due = dueByDay.get(key);
          const isToday = key === today;
          return (
            <div key={i} className={`min-h-[62px] bg-white p-1.5 text-left ${isToday ? "ring-2 ring-inset ring-accent" : ""}`}>
              <p className={`text-xs font-semibold ${isToday ? "text-accent" : ""}`}>{day}</p>
              <div className="mt-0.5 space-y-0.5 text-[11px] leading-tight">
                {a === "PRESENT" && <p className="text-emerald-700">Presente</p>}
                {a === "ABSENT" && <p className="text-red-700">Falta</p>}
                {paid !== undefined && <p className="font-medium text-emerald-800">Pagou {money(paid, cur)}</p>}
                {due !== undefined && <p className="text-red-700">Vence {money(due, cur)}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {showFinance && (() => {
        const inv = monthly.get(month);
        const slug = ctx.institution.slug;
        if (!inv) {
          return (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm sm:px-5">
              <p className="text-ink-soft">Sem mensalidade emitida para {MONTHS[m - 1].toLowerCase()} de {y}.</p>
              {manage && canPay && <ActionButton action={issueChildInvoiceAction} hidden={{ slug, childId, period: month }} className="btn-primary btn-sm">Emitir mensalidade deste mês</ActionButton>}
            </div>
          );
        }
        const owed = inv.totalCents - inv.paidCents;
        return (
          <div className="space-y-3 border-t border-line px-4 py-3 text-sm sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              {inv.status === "PAID" ? <Badge tone="green">Mês pago</Badge> : <Badge tone="red">{inv.dueDate < today ? "Mês em atraso" : "Mês não pago"}</Badge>}
              <p>Mensalidade {inv.number}: <span className="font-medium">{money(inv.totalCents, cur)}</span> · pago {money(inv.paidCents, cur)} · vence a {fmtDate(inv.dueDate)}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {manage && canPay && owed > 0 && (
                <ConfirmAction action={markInvoicePaidAction} hidden={{ slug, invoiceId: inv.id }} label="Marcar como pago" triggerClass="btn-primary btn-sm"
                  title="Marcar como pago" text={`Regista o pagamento de ${money(owed, cur)} com a data de hoje e emite o recibo.`} confirmLabel="Marcar como pago">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Forma de pagamento</span>
                    <select name="method" className="input" defaultValue="CASH">
                      <option value="CASH">Dinheiro</option><option value="TRANSFER">Transferência</option><option value="DEPOSIT">Depósito</option><option value="CHEQUE">Cheque</option><option value="OTHER">Outro</option>
                    </select>
                  </label>
                </ConfirmAction>
              )}
              {manage && canPay && owed > 0 && (
                <ConfirmAction action={sendPaymentReminderAction} hidden={{ slug, invoiceId: inv.id }} label="Enviar cobrança aos pais" triggerClass="btn-secondary btn-sm"
                  title="Enviar cobrança" text={`Os encarregados recebem um email e um aviso na aplicação com o valor em falta (${money(owed, cur)}).`} confirmLabel="Enviar cobrança" />
              )}
              {manage && canPay && inv.payments.length > 0 && (
                <ConfirmAction action={markInvoiceUnpaidAction} hidden={{ slug, invoiceId: inv.id }} label="Marcar como não pago" danger
                  title="Marcar como não pago" text="Os pagamentos deste mês são estornados e os recibos anulados. Ficam no histórico." confirmLabel="Marcar como não pago" />
              )}
              {manage && <Link href={`${ctx.base}/gestao/mensalidades/${inv.id}`} className="btn btn-ghost btn-sm">{owed > 0 ? "Pagamento parcial / detalhes" : "Ver fatura"}</Link>}
              {!manage && <a href={`${ctx.base}/fatura/${inv.id}`} target="_blank" rel="noopener" className="btn btn-secondary btn-sm">Fatura PDF</a>}
              {inv.payments.map((p) => (
                <a key={p.id} href={`${ctx.base}/recibo/${p.id}`} target="_blank" rel="noopener" className="btn btn-secondary btn-sm">Recibo{inv.payments.length > 1 ? ` · ${money(p.amountCents, cur)}` : ""}</a>
              ))}
            </div>
          </div>
        );
      })()}
    </Card>
  );
}
