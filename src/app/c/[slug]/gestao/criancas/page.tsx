import Link from "next/link";
import { and, asc, eq, ilike, or } from "drizzle-orm";
import { t } from "@/db/tenant";
import { ChildForm } from "@/components/tenant/child-form";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui/kit";
import { Modal } from "@/components/ui/client";
import { ageLabel, todayIn } from "@/lib/format";
import { childScope, fileUrl, requireTenant, visibleClassrooms } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function ChildrenPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; estado?: string; turma?: string }> }) {
  const ctx = await requireTenant((await params).slug, { permission: "children.view" });
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const estado = sp.estado === "INACTIVE" ? "INACTIVE" : "ACTIVE";
  const today = todayIn(ctx.settings.timezone);
  const search = q ? or(ilike(t.children.firstName, `%${q}%`), ilike(t.children.lastName, `%${q}%`)) : undefined;
  const kids = await ctx.db.query.children.findMany({
    where: and(eq(t.children.status, estado), childScope(ctx), search, sp.turma ? eq(t.children.classroomId, sp.turma) : undefined),
    orderBy: [asc(t.children.firstName), asc(t.children.lastName)],
    with: { classroom: true, guardians: { with: { guardian: { with: { user: true } } } } },
  });
  const classrooms = await visibleClassrooms(ctx, false);
  const feePlans = await ctx.db.query.feePlans.findMany({ orderBy: (f, { asc }) => asc(f.name) });
  const canManage = ctx.can("children.manage") && !ctx.readOnly;

  return (
    <>
      <PageHeader
        title="Crianças"
        subtitle={`${kids.length} ${estado === "ACTIVE" ? "ativas" : "inativas"}`}
        actions={canManage && (
          <Modal title="Inscrever criança" trigger="Nova inscrição" wide>
            <ChildForm slug={ctx.institution.slug} classrooms={classrooms} feePlans={feePlans} today={today} />
          </Modal>
        )}
      />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Pesquisar por nome" className="input max-w-xs" aria-label="Pesquisar por nome" />
        <select name="turma" defaultValue={sp.turma ?? ""} className="input max-w-[200px]" aria-label="Filtrar por turma">
          <option value="">Todas as turmas</option>
          {classrooms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="estado" defaultValue={estado} className="input max-w-[160px]" aria-label="Estado">
          <option value="ACTIVE">Ativas</option><option value="INACTIVE">Inativas</option>
        </select>
        <button className="btn btn-secondary" type="submit">Filtrar</button>
      </form>
      {kids.length === 0 ? (
        <EmptyState title="Nenhuma criança encontrada" text="Ajuste os filtros ou inscreva uma nova criança." />
      ) : (
        <Card pad={false}>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Criança</th><th>Idade</th><th>Turma</th><th>Encarregados</th><th>Estado</th></tr></thead>
              <tbody>
                {kids.map((k) => (
                  <tr key={k.id}>
                    <td>
                      <Link href={`${ctx.base}/gestao/criancas/${k.id}`} className="flex items-center gap-3 font-medium hover:text-accent">
                        {k.photoPath ? <img src={fileUrl(ctx, k.photoPath) ?? ""} alt="" className="h-9 w-9 rounded-full object-cover" /> : <Avatar name={`${k.firstName} ${k.lastName}`} size={36} />}
                        {k.firstName} {k.lastName}
                      </Link>
                    </td>
                    <td>{ageLabel(k.birthDate, today)}</td>
                    <td>{k.classroom?.name ?? <span className="text-ink-soft">Sem turma</span>}</td>
                    <td className="text-ink-soft">{k.guardians.map((g) => g.guardian.user.name).join(", ") || "—"}</td>
                    <td><Badge tone={k.status === "ACTIVE" ? "green" : "gray"}>{k.status === "ACTIVE" ? "Ativa" : "Inativa"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
