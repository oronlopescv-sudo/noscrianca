import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { t } from "@/db/tenant";
import { DiaryForm } from "@/components/tenant/diary-form";
import { DiaryFeed, type FeedEntry } from "@/components/tenant/diary";
import { Card, EmptyState, PageHeader } from "@/components/ui/kit";
import { fileUrl, requireTenant, visibleClassrooms } from "@/lib/tenant";
import { todayIn } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ClassroomDiary({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ turma?: string }> }) {
  const ctx = await requireTenant((await params).slug, { permission: "diary.view" });
  const sp = await searchParams;
  const classrooms = await visibleClassrooms(ctx);
  const turma = classrooms.find((c) => c.id === sp.turma)?.id ?? classrooms[0]?.id ?? null;
  const today = todayIn(ctx.settings.timezone);
  if (!turma) return <><PageHeader title="Diário" /><EmptyState title="Sem turma atribuída" text="Peça à direção para lhe atribuir uma turma." /></>;

  const kids = await ctx.db.query.children.findMany({
    where: and(eq(t.children.status, "ACTIVE"), eq(t.children.classroomId, turma)),
    orderBy: [asc(t.children.firstName)],
  });
  const ids = kids.map((k) => k.id);
  const entries = ids.length ? await ctx.db.query.diaryEntries.findMany({
    where: and(inArray(t.diaryEntries.childId, ids), eq(t.diaryEntries.date, today)),
    orderBy: [desc(t.diaryEntries.occurredAt)], limit: 200,
  }) : [];
  const nameOf = new Map(kids.map((k) => [k.id, `${k.firstName} ${k.lastName}`]));
  const feed: FeedEntry[] = entries.map((e) => ({
    id: e.id, type: e.type, title: e.title, details: e.details, occurredAt: e.occurredAt,
    photoUrl: kids.find((k) => k.id === e.childId)?.photoConsent ? fileUrl(ctx, e.photoPath) : null,
    createdByName: e.createdByName, createdById: e.createdById, childName: nameOf.get(e.childId), groupId: e.groupId, visible: e.visible,
  }));
  const canRecord = ctx.can("diary.record") && !ctx.readOnly;

  return (
    <>
      <PageHeader title="Diário" subtitle={`Registos de hoje · ${classrooms.find((c) => c.id === turma)?.name ?? ""}`} />
      {classrooms.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {classrooms.map((c) => <a key={c.id} href={`${ctx.base}/sala/diario?turma=${c.id}`} className={c.id === turma ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}>{c.name}</a>)}
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        {canRecord && (
          <Card title="Novo registo">
            {kids.length === 0 ? <p className="text-sm text-ink-soft">Não há crianças ativas nesta turma.</p> : (
              <DiaryForm slug={ctx.institution.slug} date={today} kids={kids.map((k) => ({ id: k.id, name: `${k.firstName} ${k.lastName}`, photoConsent: k.photoConsent }))} />
            )}
          </Card>
        )}
        <Card title="Registos de hoje" pad={false} className={canRecord ? "" : "lg:col-span-2"}>
          <DiaryFeed entries={feed} timezone={ctx.settings.timezone} slug={ctx.institution.slug} canDelete={canRecord} userId={ctx.user.id} isDirector={ctx.isDirector} />
        </Card>
      </div>
    </>
  );
}
