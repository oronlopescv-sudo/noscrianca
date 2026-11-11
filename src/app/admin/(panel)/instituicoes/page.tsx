import Link from "next/link";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { Building2, Plus, Search } from "lucide-react";
import { ActionButton } from "@/components/ui/client";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/kit";
import { central, c } from "@/db/central";
import type { InstitutionStatus } from "@/db/central/schema";
import { bytes, fmtDateObj } from "@/lib/format";
import { INSTITUTION_STATUS } from "@/lib/labels";
import { impersonateAction } from "../../actions";

export const metadata = { title: "Instituições" };

export default async function Institutions({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string; plano?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = sp.estado && sp.estado in INSTITUTION_STATUS ? (sp.estado as InstitutionStatus) : null;
  const plans = await central().query.plans.findMany({ orderBy: (p, { asc }) => asc(p.priceMonthlyCents) });
  const planId = plans.find((p) => p.id === sp.plano)?.id ?? null;
  const rows = await central().query.institutions.findMany({
    where: and(
      q ? or(ilike(c.institutions.name, `%${q}%`), ilike(c.institutions.slug, `%${q}%`), ilike(c.institutions.directorEmail, `%${q}%`), ilike(c.institutions.city, `%${q}%`)) : undefined,
      status ? eq(c.institutions.status, status) : undefined,
      planId ? eq(c.institutions.planId, planId) : undefined,
    ),
    orderBy: desc(c.institutions.createdAt), with: { plan: true, invoices: true },
  });
  const now = new Date();
  const filtered = !!(q || status || planId);

  return (
    <>
      <PageHeader title="Instituições" subtitle={`${rows.length} ${rows.length === 1 ? "instituição" : "instituições"}${filtered ? " (filtradas)" : ""}`}
        actions={<Link href="/admin/instituicoes/nova" className="btn-primary"><Plus size={16} /> Nova creche</Link>} />
      <form className="card card-pad mb-4 grid gap-3 sm:grid-cols-[1fr_180px_180px_auto]" method="get">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input name="q" defaultValue={q} placeholder="Pesquisar por nome, código, cidade ou email" className="input pl-9" aria-label="Pesquisar" />
        </div>
        <select name="estado" defaultValue={status ?? ""} className="input" aria-label="Estado">
          <option value="">Todos os estados</option>
          {Object.entries(INSTITUTION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select name="plano" defaultValue={planId ?? ""} className="input" aria-label="Plano">
          <option value="">Todos os planos</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary flex-1">Filtrar</button>
          {filtered && <Link href="/admin/instituicoes" className="btn-ghost">Limpar</Link>}
        </div>
      </form>
      <Card pad={false}>
        {rows.length === 0 ? (
          <EmptyState icon={<Building2 size={24} />} title={filtered ? "Nenhuma instituição corresponde aos filtros" : "Ainda não há instituições"}
            text={filtered ? "Altere a pesquisa ou limpe os filtros." : "Crie a primeira creche: a base de dados é preparada automaticamente."}
            action={filtered ? <Link href="/admin/instituicoes" className="btn-ghost">Limpar filtros</Link> : <Link href="/admin/instituicoes/nova" className="btn-primary">Nova creche</Link>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Instituição</th><th>Estado</th><th>Plano</th><th>Crianças</th><th>Utilizadores</th><th>BD</th><th>Último backup</th><th>Fatura</th><th></th></tr></thead>
              <tbody>
                {rows.map((i) => {
                  const open = i.invoices.filter((v) => v.status === "OPEN");
                  const late = open.some((v) => v.dueDate < now);
                  const live = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED"].includes(i.status);
                  return (
                    <tr key={i.id}>
                      <td>
                        <Link href={`/admin/instituicoes/${i.id}`} className="font-medium hover:text-accent">{i.name}</Link>
                        <p className="text-xs text-ink-soft">/c/{i.slug}{i.city ? ` · ${i.city}` : ""}</p>
                      </td>
                      <td><Badge tone={INSTITUTION_STATUS[i.status].tone}>{INSTITUTION_STATUS[i.status].label}</Badge></td>
                      <td>{i.plan?.name ?? "—"}</td>
                      <td>{i.childrenCount}</td>
                      <td>{i.usersCount}</td>
                      <td className="whitespace-nowrap">{i.dbSizeBytes ? bytes(i.dbSizeBytes) : "—"}</td>
                      <td className="whitespace-nowrap text-ink-soft">{fmtDateObj(i.lastBackupAt)}</td>
                      <td>{late ? <Badge tone="red">Em atraso</Badge> : open.length ? <Badge tone="amber">Em aberto</Badge> : <Badge tone="gray">Em dia</Badge>}</td>
                      <td>
                        <div className="flex justify-end gap-2">
                          {live && i.status !== "SUSPENDED" && <ActionButton action={impersonateAction} hidden={{ institutionId: i.id }}>Entrar</ActionButton>}
                          <Link href={`/admin/instituicoes/${i.id}`} className="btn-ghost btn-sm">Gerir</Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
