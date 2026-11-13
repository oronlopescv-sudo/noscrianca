import { and, asc, gte, inArray, isNull, ne, or } from "drizzle-orm";
import { Badge, Card } from "@/components/ui/kit";
import { t } from "@/db/tenant";
import { fmtDate, todayIn } from "@/lib/format";
import type { TenantCtx } from "@/lib/tenant";

/** Próximos eventos visíveis para quem está a ver (pais: turmas dos filhos; equipa: as suas turmas). */
export async function UpcomingEvents({ ctx, viewer, classroomIds, limit = 6 }: { ctx: TenantCtx; viewer: "GUARDIANS" | "STAFF"; classroomIds: string[] | null; limit?: number }) {
  const today = todayIn(ctx.settings.timezone);
  const room = classroomIds === null ? undefined
    : classroomIds.length ? or(isNull(t.events.classroomId), inArray(t.events.classroomId, classroomIds)) : isNull(t.events.classroomId);
  const rows = await ctx.db.query.events.findMany({
    where: and(ne(t.events.audience, viewer === "GUARDIANS" ? "STAFF" : "GUARDIANS"), room, or(gte(t.events.date, today), gte(t.events.endDate, today))),
    orderBy: [asc(t.events.date)], limit, with: { classroom: true },
  });
  if (!rows.length) return null;
  return (
    <Card title="Agenda" pad={false}>
      <ul className="divide-y divide-line">
        {rows.map((e) => (
          <li key={e.id} className="flex gap-3 px-4 py-3 sm:px-5">
            <div className="w-24 shrink-0 text-sm font-semibold text-accent">{fmtDate(e.date)}{e.endDate && e.endDate !== e.date ? <span className="block text-xs font-normal text-ink-soft">até {fmtDate(e.endDate)}</span> : null}</div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{e.title} {e.classroom && <Badge>{e.classroom.name}</Badge>}</p>
              {e.description && <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-soft">{e.description}</p>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
