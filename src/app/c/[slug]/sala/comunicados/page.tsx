import { desc, isNull, or, inArray } from "drizzle-orm";
import { t } from "@/db/tenant";
import { AnnouncementList } from "@/components/tenant/announcements";
import { PageHeader } from "@/components/ui/kit";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function ClassroomAnnouncements({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireTenant((await params).slug, { panel: "CLASSROOM" });
  const turmas = ctx.classroomIds;
  const scope = turmas === null ? undefined : or(isNull(t.announcements.classroomId), turmas.length ? inArray(t.announcements.classroomId, turmas) : isNull(t.announcements.classroomId));
  const rows = await ctx.db.query.announcements.findMany({ where: scope, orderBy: [desc(t.announcements.createdAt)], limit: 50, with: { classroom: true } });
  return (
    <>
      <PageHeader title="Avisos" subtitle="Comunicados da instituição e das suas turmas" />
      <AnnouncementList items={rows.map((r) => ({ id: r.id, title: r.title, body: r.body, classroomName: r.classroom?.name ?? null, createdByName: r.createdByName, createdAt: r.createdAt }))} timezone={ctx.settings.timezone} />
    </>
  );
}
