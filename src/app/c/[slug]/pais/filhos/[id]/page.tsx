import { notFound } from "next/navigation";
import { and, desc, eq, gte } from "drizzle-orm";
import { t } from "@/db/tenant";
import { ChildCalendar, calendarMonth } from "@/components/tenant/child-calendar";
import { DiaryFeed, type FeedEntry } from "@/components/tenant/diary";
import { Avatar, Badge, Card, DL, PageHeader } from "@/components/ui/kit";
import { addDays, ageLabel, fmtDate, fmtTime, todayIn } from "@/lib/format";
import { canAccessChild, fileUrl, requireTenant } from "@/lib/tenant";
import { attState } from "@/components/tenant/attendance";

export const dynamic = "force-dynamic";

const ATT = { none: "Sem registo", in: "Presente", out: "Saiu", absent: "Falta" } as const;

export default async function GuardianChild({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ mes?: string }> }) {
  const { slug, id } = await params;
  const ctx = await requireTenant(slug, { panel: "GUARDIAN" });
  if (!(await canAccessChild(ctx, id))) notFound();
  const child = await ctx.db.query.children.findFirst({ where: eq(t.children.id, id), with: { classroom: true } });
  if (!child) notFound();
  const today = todayIn(ctx.settings.timezone);
  const from = addDays(today, -13);
  const [att, diary] = await Promise.all([
    ctx.db.select().from(t.attendance).where(and(eq(t.attendance.childId, id), gte(t.attendance.date, from))).orderBy(desc(t.attendance.date)),
    ctx.db.query.diaryEntries.findMany({
      where: and(eq(t.diaryEntries.childId, id), eq(t.diaryEntries.visible, true), gte(t.diaryEntries.date, from)),
      orderBy: [desc(t.diaryEntries.occurredAt)], limit: 60,
    }),
  ]);
  const feed: FeedEntry[] = diary.map((e) => ({
    id: e.id, type: e.type, title: e.title, details: e.details, occurredAt: e.occurredAt,
    photoUrl: child.photoConsent ? fileUrl(ctx, e.photoPath) : null,
    createdByName: e.createdByName, createdById: e.createdById, groupId: e.groupId, visible: e.visible,
  }));

  return (
    <>
      <PageHeader back={{ href: `${ctx.base}/pais`, label: "Os meus filhos" }} title={`${child.firstName} ${child.lastName}`} subtitle={`${ageLabel(child.birthDate, today)} · ${child.classroom?.name ?? "Sem turma"}`} />
      <div className="space-y-5">
        <Card>
          <div className="flex items-center gap-4">
            {child.photoPath && child.photoConsent
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={fileUrl(ctx, child.photoPath) ?? ""} alt={`Foto de ${child.firstName}`} className="h-24 w-24 rounded-3xl object-cover" />
              : <Avatar name={`${child.firstName} ${child.lastName}`} size={96} />}
            <DL items={[["Nascimento", fmtDate(child.birthDate)], ["Inscrição", fmtDate(child.enrolledAt)], ["Turma", child.classroom?.name ?? "—"]]} />
          </div>
        </Card>
        <ChildCalendar ctx={ctx} childId={id} month={calendarMonth((await searchParams).mes, today)} basePath={`${ctx.base}/pais/filhos/${id}`}
          showFinance showAttendance manage={false} />
        <Card title="Presenças (últimos 14 dias)" pad={false}>
          {att.length === 0 ? <div className="card-pad text-sm text-ink-soft">Sem registos neste período.</div> : (
            <ul className="divide-y divide-line">
              {att.map((a) => {
                const s = attState(a);
                return (
                  <li key={a.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span>{fmtDate(a.date)}</span>
                    <span className="flex items-center gap-2">
                      {a.checkInAt && <span className="text-xs text-ink-soft">{fmtTime(a.checkInAt, ctx.settings.timezone)}</span>}
                      <Badge tone={s === "absent" ? "red" : s === "in" ? "green" : s === "out" ? "blue" : "gray"}>{ATT[s]}</Badge>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card title="Diário" pad={false}>
          <DiaryFeed entries={feed} timezone={ctx.settings.timezone} emptyText="Ainda sem registos nos últimos 14 dias." />
        </Card>
      </div>
    </>
  );
}
