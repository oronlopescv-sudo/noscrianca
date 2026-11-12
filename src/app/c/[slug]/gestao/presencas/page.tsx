import Link from "next/link";
import { AttendanceBoard, classroomFilterLinks } from "@/components/tenant/attendance-board";
import { PageHeader } from "@/components/ui/kit";
import { todayIn } from "@/lib/format";
import { requireTenant, visibleClassrooms } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function ManagementAttendance({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ turma?: string; data?: string }> }) {
  const ctx = await requireTenant((await params).slug, { panel: "MANAGEMENT", permission: "attendance.view" });
  const sp = await searchParams;
  const classrooms = await visibleClassrooms(ctx);
  const turma = classrooms.find((c) => c.id === sp.turma)?.id ?? null;
  const date = sp.data && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) ? sp.data : todayIn(ctx.settings.timezone);
  const base = `${ctx.base}/gestao/presencas`;
  return (
    <>
      <PageHeader title="Presenças" subtitle="Todas as crianças ativas, por turma" />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href={`${base}?data=${date}`} className={!turma ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}>Todas</Link>
        {classroomFilterLinks(base, classrooms, turma, date).map((c) => (
          <Link key={c.id} href={c.href} className={c.active ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}>{c.name}</Link>
        ))}
      </div>
      <AttendanceBoard ctx={ctx} date={date} classroomId={turma} basePath={base} />
    </>
  );
}
