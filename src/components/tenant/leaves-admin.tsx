import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { ActionButton } from "@/components/ui/client";
import { Badge, Card } from "@/components/ui/kit";
import { t } from "@/db/tenant";
import { fmtDate } from "@/lib/format";
import type { TenantCtx } from "@/lib/tenant";
import { decideLeaveAction } from "@/server/extras";
import { LEAVE_STATUS, LEAVE_TYPE, leaveDays } from "./my-leaves";

/** Pedidos de férias e faltas: todos os pendentes, ou o histórico de um funcionário. */
export async function LeavesAdmin({ ctx, employeeId }: { ctx: TenantCtx; employeeId?: string }) {
  const slug = ctx.institution.slug;
  const rows = await ctx.db.query.staffLeaves.findMany({
    where: employeeId ? eq(t.staffLeaves.employeeId, employeeId) : and(eq(t.staffLeaves.status, "PENDING")),
    orderBy: [desc(t.staffLeaves.startDate)], limit: 60, with: { employee: { with: { user: true } } },
  });
  if (!rows.length && !employeeId) return null;
  const canDecide = ctx.can("employees.manage") && !ctx.readOnly;
  return (
    <Card pad={false} title={employeeId ? "Férias e faltas" : `Pedidos de férias e faltas por decidir (${rows.length})`} className={employeeId ? undefined : "mb-5 border-amber-300"}>
      {rows.length === 0 ? <p className="px-4 py-4 text-sm text-ink-soft sm:px-5">Sem pedidos.</p> : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
              <div className="min-w-0">
                <p className="font-medium">
                  {!employeeId && <><Link href={`${ctx.base}/gestao/funcionarios/${r.employeeId}`} className="hover:text-accent">{r.employee.user.name}</Link> · </>}
                  {LEAVE_TYPE[r.type] ?? r.type} · {fmtDate(r.startDate)}{r.endDate !== r.startDate ? ` a ${fmtDate(r.endDate)}` : ""} <span className="font-normal text-ink-soft">({leaveDays(r.startDate, r.endDate)} dia(s))</span>
                </p>
                {(r.notes || r.decidedByName) && <p className="text-xs text-ink-soft">{r.notes}{r.notes && r.decidedByName ? " · " : ""}{r.decidedByName ? `decidido por ${r.decidedByName}` : ""}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={LEAVE_STATUS[r.status]?.tone ?? "amber"}>{LEAVE_STATUS[r.status]?.label ?? r.status}</Badge>
                {canDecide && r.status === "PENDING" && <ActionButton action={decideLeaveAction} hidden={{ slug, id: r.id, decision: "APPROVE" }} className="btn-primary btn-sm">Aprovar</ActionButton>}
                {canDecide && r.status === "PENDING" && <ActionButton action={decideLeaveAction} hidden={{ slug, id: r.id, decision: "REJECT" }} className="btn-ghost btn-sm">Recusar</ActionButton>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
