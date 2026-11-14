import { desc } from "drizzle-orm";
import { ActionButton } from "@/components/ui/client";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/kit";
import { t } from "@/db/tenant";
import { ageLabel, fmtDate, fmtDateTime, todayIn } from "@/lib/format";
import { requireTenant } from "@/lib/tenant";
import { setEnrollmentStatusAction } from "@/server/extras";

export const dynamic = "force-dynamic";
const STATUS: Record<string, { label: string; tone: "red" | "amber" | "gray" }> = {
  NEW: { label: "Por tratar", tone: "red" }, CONTACTED: { label: "Em contacto", tone: "amber" }, CLOSED: { label: "Fechado", tone: "gray" },
};
const wa = (phone: string) => phone.replace(/[^0-9]/g, "");

export default async function EnrollmentRequests({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireTenant((await params).slug, { panel: "MANAGEMENT", permission: "children.manage" });
  const slug = ctx.institution.slug;
  const today = todayIn(ctx.settings.timezone);
  const rows = await ctx.db.query.enrollmentRequests.findMany({ orderBy: [desc(t.enrollmentRequests.createdAt)], limit: 200 });
  const open = rows.filter((r) => r.status === "NEW").length;
  const canWrite = !ctx.readOnly;
  return (
    <>
      <PageHeader title="Pedidos de vaga" subtitle={`${open} por tratar · recebidos pela página pública da creche`}
        actions={<a href={`/creche/${slug}`} target="_blank" rel="noopener" className="btn btn-secondary">Ver página pública</a>} />
      {rows.length === 0 ? <EmptyState title="Sem pedidos" text="Quando alguém pedir inscrição na página pública, o pedido aparece aqui." /> : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{r.childName} <Badge tone={STATUS[r.status]?.tone ?? "gray"}>{STATUS[r.status]?.label ?? r.status}</Badge></p>
                    <p className="text-xs text-ink-soft">{r.childBirthDate ? `Nascimento: ${fmtDate(r.childBirthDate)} (${ageLabel(r.childBirthDate, today)}) · ` : ""}pedido em {fmtDateTime(r.createdAt, ctx.settings.timezone)}</p>
                  </div>
                  {canWrite && (
                    <div className="flex flex-wrap gap-1.5">
                      {r.status !== "CONTACTED" && <ActionButton action={setEnrollmentStatusAction} hidden={{ slug, id: r.id, status: "CONTACTED" }} className="btn-secondary btn-sm">Marcar em contacto</ActionButton>}
                      {r.status !== "CLOSED" && <ActionButton action={setEnrollmentStatusAction} hidden={{ slug, id: r.id, status: "CLOSED" }} className="btn-ghost btn-sm">Fechar</ActionButton>}
                      {r.status === "CLOSED" && <ActionButton action={setEnrollmentStatusAction} hidden={{ slug, id: r.id, status: "NEW" }} className="btn-ghost btn-sm">Reabrir</ActionButton>}
                    </div>
                  )}
                </div>
                <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                  <div><dt className="text-xs text-ink-soft">Encarregado</dt><dd>{r.guardianName}</dd></div>
                  <div><dt className="text-xs text-ink-soft">Telefone</dt><dd>{r.phone ? <><a href={`tel:${r.phone}`} className="link">{r.phone}</a>{wa(r.phone).length >= 7 && <> · <a href={`https://wa.me/${wa(r.phone)}`} target="_blank" rel="noopener" className="link">WhatsApp</a></>}</> : "—"}</dd></div>
                  <div><dt className="text-xs text-ink-soft">Email</dt><dd>{r.email ? <a href={`mailto:${r.email}`} className="link">{r.email}</a> : "—"}</dd></div>
                </dl>
                {r.message && <p className="mt-3 whitespace-pre-wrap rounded-btn bg-surface p-3 text-sm">{r.message}</p>}
                {r.handledByName && r.status !== "NEW" && <p className="mt-2 text-xs text-ink-soft">Tratado por {r.handledByName}</p>}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
