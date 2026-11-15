import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { AttendanceBoard, classroomFilterLinks } from "@/components/tenant/attendance-board";
import { ActionButton } from "@/components/ui/client";
import { Card, EmptyState, PageHeader } from "@/components/ui/kit";
import { t } from "@/db/tenant";
import { fmtDate, todayIn } from "@/lib/format";
import { childScope, fileUrl, requireTenant, visibleClassrooms } from "@/lib/tenant";
import { decideJustificationAction } from "@/server/justifications";

export const dynamic = "force-dynamic";

export default async function ManagementAttendance({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ turma?: string; data?: string }> }) {
  const ctx = await requireTenant((await params).slug, { panel: "MANAGEMENT", permission: "attendance.view" });
  const sp = await searchParams;
  const classrooms = await visibleClassrooms(ctx);
  const turma = classrooms.find((c) => c.id === sp.turma)?.id ?? null;
  const date = sp.data && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) ? sp.data : todayIn(ctx.settings.timezone);
  const base = `${ctx.base}/gestao/presencas`;
  const pendentes = await ctx.db.select({ a: t.attendance, nome: t.children.firstName, apelido: t.children.lastName }).from(t.attendance)
    .innerJoin(t.children, eq(t.children.id, t.attendance.childId))
    .where(and(eq(t.attendance.justificationStatus, "PENDING"), childScope(ctx)))
    .orderBy(asc(t.attendance.date)).limit(50);
  const podeDecidir = ctx.can("attendance.record") && !ctx.readOnly;
  return (
    <>
      <PageHeader title="Presenças" subtitle="Todas as crianças ativas, por turma" />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href={`${base}?data=${date}`} className={!turma ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}>Todas</Link>
        {classroomFilterLinks(base, classrooms, turma, date).map((c) => (
          <Link key={c.id} href={c.href} className={c.active ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}>{c.name}</Link>
        ))}
      </div>
      <Card title={`Justificações por rever (${pendentes.length})`} pad={false} className="mb-5">
        {pendentes.length === 0 ? <div className="card-pad"><EmptyState title="Nada por rever" text="Quando um encarregado justificar uma falta, aparece aqui." /></div> : (
          <ul className="divide-y divide-line">
            {pendentes.map(({ a, nome, apelido }) => (
              <li key={a.id} className="space-y-2 px-4 py-3 text-sm sm:px-5">
                <p className="font-medium">{nome} {apelido} · falta de {fmtDate(a.date)}</p>
                <p className="whitespace-pre-wrap text-slate-600">{a.justificationText || "Sem motivo escrito."}</p>
                <p className="text-xs text-ink-soft">Enviada por {a.justifiedByName || "encarregado"}{a.justifiedAt ? ` · ${fmtDate(a.justifiedAt.toISOString().slice(0, 10))}` : ""}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {fileUrl(ctx, a.justificationFilePath) && <a href={fileUrl(ctx, a.justificationFilePath)!} target="_blank" rel="noopener" className="btn btn-secondary btn-sm">Ver documento</a>}
                  {podeDecidir && <>
                    <ActionButton action={decideJustificationAction} hidden={{ slug: ctx.institution.slug, attendanceId: a.id, decision: "JUSTIFIED" }} className="btn btn-primary btn-sm">Aceitar</ActionButton>
                    <ActionButton action={decideJustificationAction} hidden={{ slug: ctx.institution.slug, attendanceId: a.id, decision: "UNJUSTIFIED" }} className="btn btn-ghost btn-sm">Recusar</ActionButton>
                  </>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <AttendanceBoard ctx={ctx} date={date} classroomId={turma} basePath={base} />
    </>
  );
}
