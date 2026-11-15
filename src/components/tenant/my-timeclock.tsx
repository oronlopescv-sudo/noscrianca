import { and, desc, eq, isNull } from "drizzle-orm";
import { ActionForm } from "@/components/ui/client";
import { Badge, Card } from "@/components/ui/kit";
import { t } from "@/db/tenant";
import { fmtDate, todayIn } from "@/lib/format";
import { horasEntre } from "@/lib/timeclock";
import type { TenantCtx } from "@/lib/tenant";
import { clockInAction, clockOutAction } from "@/server/timeclock";

export const ENTRY_STATUS: Record<string, { label: string; tone: "amber" | "green" | "red" }> = {
  PENDING: { label: "Por confirmar", tone: "amber" }, CONFIRMED: { label: "Confirmado", tone: "green" }, REJECTED: { label: "Recusado", tone: "red" },
};

/** Marcação de entrada e saída do PRÓPRIO funcionário. */
export async function MyTimeclock({ ctx }: { ctx: TenantCtx }) {
  if (!ctx.employeeId) return null;
  const slug = ctx.institution.slug;
  const today = todayIn(ctx.settings.timezone);
  const open = await ctx.db.query.timeEntries.findFirst({ where: and(eq(t.timeEntries.employeeId, ctx.employeeId), isNull(t.timeEntries.clockOut)) });
  const recent = await ctx.db.query.timeEntries.findMany({ where: eq(t.timeEntries.employeeId, ctx.employeeId), orderBy: [desc(t.timeEntries.date), desc(t.timeEntries.clockIn)], limit: 15 });
  return (
    <Card pad={false} title="O meu ponto"
      actions={!ctx.readOnly && (open
        ? <ActionForm action={clockOutAction} hidden={{ slug }}><button type="submit" className="btn btn-primary btn-sm">Marcar saída</button></ActionForm>
        : <ActionForm action={clockInAction} hidden={{ slug }}><button type="submit" className="btn btn-primary btn-sm">Marcar entrada</button></ActionForm>)}>
      <p className="border-b border-line px-4 py-3 text-sm sm:px-5">
        {open ? <>Entrada aberta desde as <span className="font-semibold">{open.clockIn}</span> ({fmtDate(open.date)}).</> : "Sem entrada aberta neste momento."}
      </p>
      {recent.length === 0 ? <p className="px-4 py-4 text-sm text-ink-soft sm:px-5">Ainda não marcou nenhum ponto.</p> : (
        <ul className="divide-y divide-line">
          {recent.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm sm:px-5">
              <div>
                <p className="font-medium">{fmtDate(r.date)} · {r.clockIn} – {r.clockOut ?? "em aberto"}
                  {r.clockOut && <span className="font-normal text-ink-soft"> ({horasEntre(r.clockIn, r.clockOut).toFixed(2).replace(".", ",")} h)</span>}</p>
                {r.source === "MANAGER" && <p className="text-xs text-ink-soft">Lançado pela direção</p>}
              </div>
              <Badge tone={ENTRY_STATUS[r.status]?.tone ?? "amber"}>{ENTRY_STATUS[r.status]?.label ?? r.status}</Badge>
            </li>
          ))}
        </ul>
      )}
      <p className="sr-only">Hoje: {today}</p>
    </Card>
  );
}
