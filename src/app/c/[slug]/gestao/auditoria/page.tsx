import { desc } from "drizzle-orm";
import { t } from "@/db/tenant";
import { Card, EmptyState, PageHeader } from "@/components/ui/kit";
import { fmtDateTime } from "@/lib/format";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function AuditPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireTenant((await params).slug, { panel: "MANAGEMENT", permission: "audit.view" });
  const logs = await ctx.db.select().from(t.auditLogs).orderBy(desc(t.auditLogs.createdAt)).limit(300);
  return (
    <>
      <PageHeader title="Auditoria" subtitle="Últimas 300 ações relevantes da instituição" />
      {logs.length === 0 ? <EmptyState title="Sem registos" text="As ações de gestão aparecem aqui." /> : (
        <Card pad={false}>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhes</th></tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap">{fmtDateTime(l.createdAt, ctx.settings.timezone)}</td>
                    <td>{l.userName}</td>
                    <td>{l.action}</td>
                    <td className="max-w-md truncate text-xs text-ink-soft">{l.details ? JSON.stringify(l.details) : "—"}</td>
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
