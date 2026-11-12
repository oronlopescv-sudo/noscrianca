import Link from "next/link";
import { and, desc, eq, gte, inArray, isNull, ne, or } from "drizzle-orm";
import { t } from "@/db/tenant";
import { AnnouncementList } from "@/components/tenant/announcements";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui/kit";
import { ageLabel, money, todayIn } from "@/lib/format";
import { attState } from "@/components/tenant/attendance";
import { fileUrl, guardianChildIds, requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const STATE = { none: "Ainda sem registo", in: "Presente", out: "Já saiu", absent: "Falta hoje" } as const;

export default async function GuardianHome({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireTenant((await params).slug, { panel: "GUARDIAN" });
  const today = todayIn(ctx.settings.timezone);
  const ids = await guardianChildIds(ctx);
  const kids = ids.length ? await ctx.db.query.children.findMany({ where: inArray(t.children.id, ids), with: { classroom: true } }) : [];
  const att = ids.length ? await ctx.db.select().from(t.attendance).where(and(inArray(t.attendance.childId, ids), eq(t.attendance.date, today))) : [];
  const attOf = new Map(att.map((a) => [a.childId, a]));
  const invoices = ids.length ? await ctx.db.query.invoices.findMany({ where: and(inArray(t.invoices.childId, ids), inArray(t.invoices.status, ["OPEN", "PARTIAL"])), with: { child: true } }) : [];
  const owed = invoices.reduce((s, i) => s + (i.totalCents - i.paidCents), 0);
  const classroomIds = kids.map((k) => k.classroomId).filter((x): x is string => !!x);
  const news = await ctx.db.query.announcements.findMany({
    where: and(ne(t.announcements.audience, "STAFF"), classroomIds.length ? or(isNull(t.announcements.classroomId), inArray(t.announcements.classroomId, classroomIds)) : isNull(t.announcements.classroomId)),
    orderBy: [desc(t.announcements.createdAt)], limit: 3, with: { classroom: true },
  });

  return (
    <>
      <PageHeader title={`Olá, ${ctx.user.name.split(" ")[0]}`} subtitle={ctx.settings.name} />
      {kids.length === 0 ? (
        <EmptyState title="Ainda sem crianças associadas" text="Quando a instituição associar as suas crianças à sua conta, verá aqui a presença, o diário e os pagamentos." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {kids.map((k) => {
            const a = attOf.get(k.id);
            const state = attState(a);
            return (
              <Link key={k.id} href={`${ctx.base}/pais/filhos/${k.id}`} className="card card-pad flex items-center gap-4 hover:shadow-md">
                {k.photoPath && k.photoConsent
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={fileUrl(ctx, k.photoPath) ?? ""} alt="" className="h-16 w-16 rounded-2xl object-cover" />
                  : <Avatar name={`${k.firstName} ${k.lastName}`} size={64} />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold">{k.firstName} {k.lastName}</p>
                  <p className="text-xs text-ink-soft">{ageLabel(k.birthDate, today)} · {k.classroom?.name ?? "Sem turma"}</p>
                  <div className="mt-2"><Badge tone={state === "absent" ? "red" : state === "in" ? "green" : state === "out" ? "blue" : "gray"}>{STATE[state]}</Badge></div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      {owed > 0 && (
        <Card title="Por pagar" className="mt-5">
          <p className="text-2xl font-semibold">{money(owed, ctx.settings.currency)}</p>
          <p className="mt-1 text-sm text-ink-soft">{invoices.length} {invoices.length === 1 ? "fatura em aberto" : "faturas em aberto"}</p>
          <Link href={`${ctx.base}/pais/financeiro`} className="btn btn-primary btn-sm mt-4">Ver pagamentos</Link>
        </Card>
      )}
      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base">Últimos avisos</h2>
          <Link href={`${ctx.base}/pais/comunicados`} className="link text-sm">Ver todos</Link>
        </div>
        <AnnouncementList items={news.map((r) => ({ id: r.id, title: r.title, body: r.body, classroomName: r.classroom?.name ?? null, createdByName: r.createdByName, createdAt: r.createdAt }))} timezone={ctx.settings.timezone} />
      </section>
    </>
  );
}
