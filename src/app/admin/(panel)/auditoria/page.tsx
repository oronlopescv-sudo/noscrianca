import Link from "next/link";
import { desc, ilike, or } from "drizzle-orm";
import { History } from "lucide-react";
import { Card, EmptyState, PageHeader } from "@/components/ui/kit";
import { central, c } from "@/db/central";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Auditoria" };
const PAGE = 50;

export default async function Audit({ searchParams }: { searchParams: Promise<{ q?: string; p?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.p) || 1);
  const rows = await central().query.platformAuditLogs.findMany({
    where: q ? or(ilike(c.platformAuditLogs.action, `%${q}%`), ilike(c.platformAuditLogs.userName, `%${q}%`)) : undefined,
    orderBy: desc(c.platformAuditLogs.createdAt), limit: PAGE + 1, offset: (page - 1) * PAGE,
  });
  const hasMore = rows.length > PAGE;
  const insts = await central().query.institutions.findMany({ columns: { id: true, name: true } });
  const name = (id: string | null) => insts.find((i) => i.id === id)?.name;
  const link = (p: number) => `/admin/auditoria?${new URLSearchParams({ ...(q ? { q } : {}), p: String(p) })}`;

  return (
    <>
      <PageHeader title="Auditoria" subtitle="Histórico de atividades administrativas da plataforma" />
      <form className="mb-4 flex gap-2" method="get">
        <input name="q" defaultValue={q} placeholder="Pesquisar por ação ou utilizador" className="input max-w-sm" aria-label="Pesquisar" />
        <button className="btn-ghost" type="submit">Pesquisar</button>
        {q && <Link href="/admin/auditoria" className="btn-ghost">Limpar</Link>}
      </form>
      <Card pad={false}>
        {rows.length === 0 ? <EmptyState icon={<History size={24} />} title="Sem registos" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Data</th><th>Utilizador</th><th>Ação</th><th>Instituição</th><th>Detalhes</th></tr></thead>
              <tbody>
                {rows.slice(0, PAGE).map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-ink-soft">{fmtDateTime(r.createdAt)}</td>
                    <td>{r.userName}</td>
                    <td className="font-medium">{r.action}</td>
                    <td>{r.institutionId && name(r.institutionId) ? <Link className="hover:text-accent" href={`/admin/instituicoes/${r.institutionId}`}>{name(r.institutionId)}</Link> : "—"}</td>
                    <td className="max-w-xs break-words text-xs text-ink-soft">{r.details ? Object.entries(r.details as Record<string, unknown>).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join("; ") : String(v)}`).join(" · ") : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <div className="mt-4 flex justify-between">
        {page > 1 ? <Link href={link(page - 1)} className="btn-ghost btn-sm">← Mais recentes</Link> : <span />}
        {hasMore && <Link href={link(page + 1)} className="btn-ghost btn-sm">Mais antigos →</Link>}
      </div>
    </>
  );
}
