import { ConfirmAction, ActionForm, Modal, Submit } from "@/components/ui/client";
import { Badge, Check, Field } from "@/components/ui/kit";
import { fmtDate, todayIn } from "@/lib/format";
import type { TenantCtx } from "@/lib/tenant";
import type { AbsenceRow } from "@/lib/services/staff-absences";
import { registerStaffAbsenceAction, removeStaffAbsenceAction } from "@/server/staff-absences";

/** Botão com formulário para registar faltas. Sem employeeId, escolhe-se o funcionário. */
export function RegisterAbsenceModal({ ctx, employees, employeeId, defaultDate }: {
  ctx: TenantCtx; employees?: { id: string; name: string }[]; employeeId?: string; defaultDate?: string;
}) {
  const today = todayIn(ctx.settings.timezone);
  return (
    <Modal title="Registar falta" trigger="Registar falta" triggerClass="btn-primary btn-sm">
      <ActionForm action={registerStaffAbsenceAction} hidden={{ slug: ctx.institution.slug, ...(employeeId ? { employeeId } : {}) }} className="space-y-4">
        {!employeeId && (
          <Field label="Funcionário">
            <select name="employeeId" className="input" required defaultValue="">
              <option value="" disabled>Escolher…</option>
              {employees?.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dia da falta"><input name="date" type="date" className="input" required defaultValue={defaultDate ?? today} max={today} /></Field>
          <Field label="Até (opcional)" hint="Para vários dias seguidos"><input name="endDate" type="date" className="input" max={today} /></Field>
        </div>
        <Check name="deductible" label="Desconta do salário deste mês" defaultChecked hint="Cada dia descontado vale 1/30 do salário base." />
        <Field label="Motivo (opcional)"><input name="reason" className="input" maxLength={200} /></Field>
        <div className="flex justify-end"><Submit>Registar falta</Submit></div>
      </ActionForm>
    </Modal>
  );
}

/** Lista de faltas com remoção (só enquanto o mês não estiver pago). */
export function AbsenceList({ ctx, rows, showEmployee, canWrite }: { ctx: TenantCtx; rows: AbsenceRow[]; showEmployee: boolean; canWrite: boolean }) {
  if (rows.length === 0) return <p className="px-4 py-4 text-sm text-ink-soft sm:px-5">Sem faltas registadas.</p>;
  return (
    <ul className="divide-y divide-line text-sm">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-5">
          <div className="min-w-0">
            <p className="font-medium">
              {fmtDate(r.date)}
              {showEmployee && <> · <a href={`${ctx.base}/gestao/funcionarios/${r.employeeId}`} className="hover:text-accent">{r.employee.user.name}</a></>}
            </p>
            <p className="text-xs text-ink-soft">{r.reason || "Sem motivo indicado"} · lançado por {r.recordedByName}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={r.deductible ? "red" : "gray"}>{r.deductible ? "Desconta" : "Não desconta"}</Badge>
            {canWrite && (
              <ConfirmAction action={removeStaffAbsenceAction} hidden={{ slug: ctx.institution.slug, id: r.id }} label="Remover" title="Remover falta"
                text={`A falta de ${fmtDate(r.date)} deixa de constar do calendário e do cálculo do salário.`} confirmLabel="Remover" danger />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
