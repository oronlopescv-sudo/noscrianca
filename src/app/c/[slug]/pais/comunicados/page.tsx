import { desc, inArray, isNull, or } from "drizzle-orm";
import { t } from "@/db/tenant";
import { AnnouncementList } from "@/components/tenant/announcements";
import { PageHeader } from "@/components/ui/kit";
import { guardianChildIds, requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function GuardianAnnouncements({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireTenant((await params).slug, { panel: "GUARDIAN" });
  const ids = await guardianChildIds(ctx);
  const kids = ids.length ? await ctx.db.query.children.findMany({ where: inArray(t.children.id, ids), columns: { classroomId: true } }) : [];
  const classroomIds = [...new Set(kids.map((k) => k.classroomId).filter((x): x is string => !!x))];
  const rows = await ctx.db.query.announcements.findMany({
    where: classroomIds.length ? or(isNull(t.announcements.classroomId), inArray(t.announcements.classroomId, classroomIds)) : isNull(t.announcements.classroomId),
    orderBy: [desc(t.announcements.createdAt)], limit: 100, with: { classroom: true },
  });
  return (
    <>
      <PageHeader title="Avisos" subtitle="Comunicados da instituição e das turmas dos seus filhos" />
      <AnnouncementList items={rows.map((r) => ({ id: r.id, title: r.title, body: r.body, classroomName: r.classroom?.name ?? null, createdByName: r.createdByName, createdAt: r.createdAt }))} timezone={ctx.settings.timezone} />
    </>
  );
}
