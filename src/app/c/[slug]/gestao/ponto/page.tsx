import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { t } from "@/db/tenant";
import { ENTRY_STATUS } from "@/components/tenant/my-timeclock";
import { ActionButton, ActionForm, FormFooter, Modal } from "@/components/ui/client";
import { Badge, Card, EmptyState, Field, PageHeader } from "@/components/ui/kit";
import { fmtDate, periodLabel, todayIn } from "@/lib/format";
import { horasEntre } from "@/lib/timeclock";
import { requireTenant } from "@/lib/tenant";
import { addTimeEntryAction, correctTimeEntryAction, decideTimeEntryAction } from "@/server/timeclock";

export const dynamic = "force-dynamic";

const hours = (h: number) => h.toFixed(2).replace(".", ",");

export default async function TimeclockManagementPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ mes?: string }> }) {
  const ctx = await requireTenant((await params).slug, { panel: "MANAGEMENT", permission: "payroll.manage" });
  const slug = ctx.institution.slug;
  const today = todayIn(ctx.settings.timezone);
  const mesParam = (await searchParams).mes;
  const mes = mesParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(mesParam) ? mesParam : today.slice(0, 7);
  const readOnly = ctx.readOnly;

  const [pending, rows, employees] = await Promise.all([
    ctx.db.select({ e: t.timeEntries, name: t.users.name }).from(t.timeEntries)
      .innerJoin(t.employees, eq(t.employees.id, t.timeEntries.employeeId))
      .innerJoin(t.users, eq(t.users.id, t.employees.userId))
      .where(eq(t.timeEntries.status, "PENDING")).orderBy(asc(t.timeEntries.date), asc(t.timeEntries.clockIn)),
    ctx.db.select({ e: t.timeEntries, name: t.users.name }).from(t.timeEntries)
      .innerJoin(t.employees, eq(t.employees.id, t.timeEntries.employeeId))
      .innerJoin(t.users, eq(t.users.id, t.employees.userId))
      .where(and(gte(t.timeEntries.date, `${mes}-01`), lte(t.timeEntries.date, `${mes}-31`)))
      .orderBy(desc(t.timeEntries.date), asc(t.timeEntries.clockIn)),
    ctx.db.query.employees.findMany({ with: { user: true }, orderBy: (e, { asc }) => asc(e.createdAt) }),
  ]);

  // Horas confirmadas do mês, por funcionário.
  const totals = new Map<string, { name: string; hours: number; pending: number }>();
  for (const r of rows) {
    const acc = totals.get(r.e.employeeId) ?? { name: r.name, hours: 0, pending: 0 };
    if (r.e.status === "CONFIRMED" && r.e.clockOut) acc.hours += horasEntre(r.e.clockIn, r.e.clockOut);
    if (r.e.status === "PENDING") acc.pending++;
    totals.set(r.e.employeeId, acc);
  }

  const Entry = ({ r, showActions }: { r: (typeof rows)[number]; showActions: boolean }) => (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
      <div className="min-w-0">
        <p className="font-medium">{r.name} · {fmtDate(r.e.date)} · {r.e.clockIn} – {r.e.clockOut ?? "em aberto"}
          {r.e.clockOut && <span className="font-normal text-ink-soft"> ({hours(horasEntre(r.e.clockIn, r.e.clockOut))} h)</span>}</p>
        <p className="text-xs text-ink-soft">
          {r.e.source === "MANAGER" ? "Lançado pela direção" : "Marcado pelo funcionário"}
          {r.e.decidedByName ? ` · decidido por ${r.e.decidedByName}` : ""}
          {r.e.correctedByName ? ` · corrigido por ${r.e.correctedByName}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={ENTRY_STATUS[r.e.status]?.tone ?? "amber"}>{ENTRY_STATUS[r.e.status]?.label ?? r.e.status}</Badge>
        {showActions && !readOnly && (
          <>
            {r.e.status !== "CONFIRMED" && r.e.clockOut && <ActionButton action={decideTimeEntryAction} hidden={{ slug, entryId: r.e.id, decision: "CONFIRMED" }}>Confirmar</ActionButton>}
            {r.e.status !== "REJECTED" && <ActionButton action={decideTimeEntryAction} hidden={{ slug, entryId: r.e.id, decision: "REJECTED" }}>Recusar</ActionButton>}
            <Modal title="Corrigir marcação" trigger="Corrigir" triggerClass="btn-ghost btn-sm">
              <ActionForm action={correctTimeEntryAction} hidden={{ slug, entryId: r.e.id }} className="space-y-4">
                <p className="text-sm text-ink-soft">{r.name} · {fmtDate(r.e.date)}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Entrada"><input name="clockIn" type="time" className="input" required defaultValue={r.e.clockIn} /></Field>
                  <Field label="Saída"><input name="clockOut" type="time" className="input" required defaultValue={r.e.clockOut ?? ""} /></Field>
                </div>
                <FormFooter submit="Guardar e confirmar" />
              </ActionForm>
            </Modal>
          </>
        )}
      </div>
    </li>
  );

  return (
    <>
      <PageHeader title="Ponto da equipa" subtitle="Confirme, recuse ou corrija as marcações dos funcionários" />
      {!readOnly && (
        <div className="mb-5 flex justify-end">
          <Modal title="Lançar marcação" trigger="Lançar marcação esquecida" triggerClass="btn-secondary btn-sm">
            <ActionForm action={addTimeEntryAction} hidden={{ slug }} className="space-y-4">
              <Field label="Funcionário">
                <select name="employeeId" className="input" required defaultValue="">
                  <option value="" disabled>Escolha…</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.user.name}</option>)}
                </select>
              </Field>
              <Field label="Dia"><input name="date" type="date" className="input" required max={today} defaultValue={today} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Entrada"><input name="clockIn" type="time" className="input" required /></Field>
                <Field label="Saída"><input name="clockOut" type="time" className="input" required /></Field>
              </div>
              <FormFooter submit="Lançar e confirmar" />
            </ActionForm>
          </Modal>
        </div>
      )}

      <Card pad={false} title={`Por confirmar (${pending.length})`}>
        {pending.length === 0 ? <div className="card-pad"><EmptyState title="Tudo confirmado" text="Não há marcações à espera de decisão." /></div> : (
          <ul className="divide-y divide-line">{pending.map((r) => <Entry key={r.e.id} r={r} showActions />)}</ul>
        )}
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card pad={false} title={`Marcações de ${periodLabel(mes)}`}
            actions={<form method="get"><input type="month" name="mes" defaultValue={mes} className="input" /> <button className="btn btn-secondary btn-sm" type="submit">Ver</button></form>}>
            {rows.length === 0 ? <div className="card-pad"><EmptyState title="Sem marcações neste mês" /></div> : (
              <ul className="divide-y divide-line">{rows.map((r) => <Entry key={r.e.id} r={r} showActions />)}</ul>
            )}
          </Card>
        </div>
        <Card title="Horas confirmadas no mês" pad={false}>
          {totals.size === 0 ? <div className="card-pad"><p className="text-sm text-ink-soft">Sem marcações.</p></div> : (
            <ul className="divide-y divide-line">
              {[...totals.values()].sort((a, b) => a.name.localeCompare(b.name)).map((x) => (
                <li key={x.name} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                  <span className="min-w-0 truncate">{x.name}{x.pending ? <span className="text-ink-soft"> · {x.pending} por confirmar</span> : ""}</span>
                  <span className="font-semibold">{hours(x.hours)} h</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
