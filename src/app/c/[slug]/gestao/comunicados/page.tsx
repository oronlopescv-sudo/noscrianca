import { desc } from "drizzle-orm";
import { t } from "@/db/tenant";
import { AnnouncementForm, AnnouncementList } from "@/components/tenant/announcements";
import { Modal } from "@/components/ui/client";
import { PageHeader } from "@/components/ui/kit";
import { requireTenant, visibleClassrooms } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function AnnouncementsPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireTenant((await params).slug, { panel: "MANAGEMENT", permission: "announcements.manage" });
  const [rows, classrooms] = await Promise.all([
    ctx.db.query.announcements.findMany({ orderBy: [desc(t.announcements.createdAt)], limit: 100, with: { classroom: true } }),
    visibleClassrooms(ctx),
  ]);
  const items = rows.map((r) => ({ id: r.id, title: r.title, body: r.body, classroomName: r.classroom?.name ?? null, createdByName: r.createdByName, createdAt: r.createdAt, audience: r.audience }));
  const canWrite = !ctx.readOnly;
  return (
    <>
      <PageHeader
        title="Comunicados"
        subtitle="Avisos para os pais, por instituição ou por turma"
        actions={canWrite && <Modal title="Novo comunicado" trigger="Novo comunicado" wide><AnnouncementForm slug={ctx.institution.slug} classrooms={classrooms} /></Modal>}
      />
      <AnnouncementList items={items} timezone={ctx.settings.timezone} slug={ctx.institution.slug} canDelete={canWrite} />
    </>
  );
}
