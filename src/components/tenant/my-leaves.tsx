import { desc, eq } from "drizzle-orm";
import { ActionButton, ActionForm, Modal, Submit } from "@/components/ui/client";
import { Badge, Card, Field } from "@/components/ui/kit";
import { t } from "@/db/tenant";
import { fmtDate, todayIn } from "@/lib/format";
import type { TenantCtx } from "@/lib/tenant";
import { cancelLeaveAction, requestLeaveAction } from "@/server/extras";

export const LEAVE_TYPE: Record<string, string> = { VACATION: "Férias", SICK: "Doença", OTHER: "Falta" };
export const LEAVE_STATUS: Record<string, { label: string; tone: "amber" | "green" | "red" }> = {
  PENDING: { label: "Por decidir", tone: "amber" }, APPROVED: { label: "Aprovado", tone: "green" }, REJECTED: { label: "Recusado", tone: "red" },
};
export const leaveDays = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;

/** Férias e faltas do PRÓPRIO funcionário (usa sempre o funcionário da sessão). */
export async function MyLeaves({ ctx }: { ctx: TenantCtx }) {
  if (!ctx.employeeId) return null;
  const slug = ctx.institution.slug;
  const today = todayIn(ctx.settings.timezone);
  const rows = await ctx.db.query.staffLeaves.findMany({ where: eq(t.staffLeaves.employeeId, ctx.employeeId), orderBy: [desc(t.staffLeaves.startDate)], limit: 40 });
  const year = today.slice(0, 4);
  const vacation = rows.filter((r) => r.type === "VACATION" && r.status === "APPROVED" && r.startDate.startsWith(year)).reduce((a, r) => a + leaveDays(r.startDate, r.endDate), 0);
  return (
    <Card pad={false} title={<span id="ferias">As minhas férias e faltas</span>}
      actions={!ctx.readOnly && (
        <Modal title="Pedir férias ou comunicar falta" trigger="Novo pedido" triggerClass="btn-primary btn-sm">
          <ActionForm action={requestLeaveAction} hidden={{ slug }} className="space-y-4">
            <Field label="Tipo">
              <select name="type" className="input" defaultValue="VACATION"><option value="VACATION">Férias</option><option value="SICK">Doença</option><option value="OTHER">Outra falta</option></select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="De"><input name="startDate" type="date" className="input" required defaultValue={today} /></Field>
              <Field label="Até" hint="Deixe igual para um só dia"><input name="endDate" type="date" className="input" /></Field>
            </div>
            <Field label="Notas (opcional)"><input name="notes" className="input" maxLength={300} /></Field>
            <div className="flex justify-end"><Submit>Enviar pedido</Submit></div>
          </ActionForm>
        </Modal>
      )}>
      <p className="border-b border-line px-4 py-3 text-sm sm:px-5">Dias de férias aprovados em {year}: <span className="font-semibold">{vacation}</span></p>
      {rows.length === 0 ? <p className="px-4 py-4 text-sm text-ink-soft sm:px-5">Ainda não fez nenhum pedido.</p> : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
              <div>
                <p className="font-medium">{LEAVE_TYPE[r.type] ?? r.type} · {fmtDate(r.startDate)}{r.endDate !== r.startDate ? ` a ${fmtDate(r.endDate)}` : ""} <span className="font-normal text-ink-soft">({leaveDays(r.startDate, r.endDate)} dia(s))</span></p>
                {(r.notes || r.decidedByName) && <p className="text-xs text-ink-soft">{r.notes}{r.notes && r.decidedByName ? " · " : ""}{r.decidedByName ? `decidido por ${r.decidedByName}` : ""}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={LEAVE_STATUS[r.status]?.tone ?? "amber"}>{LEAVE_STATUS[r.status]?.label ?? r.status}</Badge>
                {r.status === "PENDING" && !ctx.readOnly && <ActionButton action={cancelLeaveAction} hidden={{ slug, id: r.id }}>Cancelar</ActionButton>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
