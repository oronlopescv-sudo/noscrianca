import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { and, asc, eq, inArray } from "drizzle-orm";
import { t } from "@/db/tenant";
import { Avatar, Badge, EmptyState, Notice } from "@/components/ui/kit";
import { AttendanceActions, attState } from "@/components/tenant/attendance";
import { addDays, fmtDate, todayIn } from "@/lib/format";
import { childScope, type TenantCtx } from "@/lib/tenant";

const STATE_LABEL = { none: ["Por registar", "gray"], in: ["Presente", "green"], out: ["Saiu", "blue"], absent: ["Falta", "red"] } as const;

/** Lista de presenças de um dia para as crianças visíveis ao utilizador (usada na gestão e na sala). */
export async function AttendanceBoard({ ctx, date, classroomId, basePath }: { ctx: TenantCtx; date: string; classroomId?: string | null; basePath: string }) {
  const today = todayIn(ctx.settings.timezone);
  const isToday = date === today;
  const scope = childScope(ctx);
  const kids = await ctx.db.query.children.findMany({
    where: and(eq(t.children.status, "ACTIVE"), scope, classroomId ? eq(t.children.classroomId, classroomId) : undefined),
    orderBy: [asc(t.children.firstName), asc(t.children.lastName)],
    with: { classroom: true, pickups: true, guardians: { with: { guardian: { with: { user: true } } } } },
  });
  const ids = kids.map((k) => k.id);
  const rows = ids.length ? await ctx.db.select().from(t.attendance).where(and(eq(t.attendance.date, date), inArray(t.attendance.childId, ids))) : [];
  const byChild = new Map(rows.map((r) => [r.childId, r]));
  const canRecord = ctx.can("attendance.record") && !ctx.readOnly;
  const counts = { none: 0, in: 0, out: 0, absent: 0 };
  kids.forEach((k) => counts[attState(byChild.get(k.id))]++);
  const nav = (d: string) => `${basePath}?${new URLSearchParams({ ...(classroomId ? { turma: classroomId } : {}), data: d }).toString()}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={nav(addDays(date, -1))} aria-label="Dia anterior" className="flex h-11 w-11 items-center justify-center rounded-btn border border-line bg-white hover:bg-surface"><ChevronLeft size={18} /></Link>
          <p className="min-w-[10rem] text-center text-[15px] font-semibold">{fmtDate(date)}{isToday && <span className="ml-2 text-xs font-medium text-accent">Hoje</span>}</p>
          <Link href={nav(addDays(date, 1))} aria-label="Dia seguinte" className="flex h-11 w-11 items-center justify-center rounded-btn border border-line bg-white hover:bg-surface"><ChevronRight size={18} /></Link>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge tone="green">{counts.in + counts.out} presentes</Badge>
          <Badge tone="gray">{counts.none} por registar</Badge>
          <Badge tone="red">{counts.absent} faltas</Badge>
        </div>
      </div>
      {!canRecord && <Notice tone="blue">Pode consultar as presenças. Para registar, é necessário o perfil com permissão de registo.</Notice>}
      {kids.length === 0 ? (
        <EmptyState title="Sem crianças" text="Não há crianças ativas nesta seleção." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {kids.map((k) => {
            const row = byChild.get(k.id);
            const state = attState(row);
            const [label, tone] = STATE_LABEL[state];
            const pickupNames = [...k.pickups.map((p) => p.name), ...k.guardians.map((g) => g.guardian.user.name)];
            return (
              <li key={k.id} className="card card-pad space-y-3">
                <div className="flex items-center gap-3">
                  <Avatar name={`${k.firstName} ${k.lastName}`} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{k.firstName} {k.lastName}</p>
                    <p className="truncate text-xs text-ink-soft">{k.classroom?.name ?? "Sem turma"}</p>
                  </div>
                  <Badge tone={tone}>{label}</Badge>
                </div>
                {row?.checkInAt && <p className="text-xs text-ink-soft">Entrada às {new Date(row.checkInAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: ctx.settings.timezone })}{row.droppedBy && ` · entregue por ${row.droppedBy}`}{row.pickedBy && ` · recolhido por ${row.pickedBy}`}</p>}
                {row?.status === "ABSENT" && row.absenceReason && <p className="text-xs text-ink-soft">Motivo: {row.absenceReason}</p>}
                {canRecord && (
                  <AttendanceActions slug={ctx.institution.slug} childId={k.id} childName={`${k.firstName} ${k.lastName}`} date={date} isToday={isToday} row={row} pickupNames={pickupNames} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Turmas que o utilizador pode escolher no filtro. */
export function classroomFilterLinks(basePath: string, classrooms: { id: string; name: string }[], current: string | null, date: string) {
  return classrooms.map((c) => ({ id: c.id, name: c.name, href: `${basePath}?${new URLSearchParams({ turma: c.id, data: date }).toString()}`, active: c.id === current }));
}

