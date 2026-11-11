import Link from "next/link";
import { desc } from "drizzle-orm";
import { Inbox } from "lucide-react";
import { ActionButton, ConfirmAction } from "@/components/ui/client";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/kit";
import { central, c } from "@/db/central";
import { fmtDateTime } from "@/lib/format";
import { rejectSignupAction, reopenSignupAction } from "../../actions";

export const metadata = { title: "Pedidos de adesão" };
const STATUS = { PENDING: { label: "Pendente", tone: "amber" }, APPROVED: { label: "Aprovado", tone: "green" }, REJECTED: { label: "Rejeitado", tone: "gray" } } as const;

export default async function SignupRequests() {
  const rows = await central().query.signupRequests.findMany({ orderBy: desc(c.signupRequests.createdAt), limit: 200 });
  return (
    <>
      <PageHeader title="Pedidos de adesão" subtitle="Pedidos enviados pelo formulário público. Converta um pedido em creche com um clique." />
      {rows.length === 0 ? (
        <Card><EmptyState icon={<Inbox size={24} />} title="Sem pedidos" text="Quando alguém pedir adesão no site, o pedido aparece aqui." /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((r) => (
            <div key={r.id} className="card card-pad">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base">{r.institutionName}</h2>
                  <p className="text-sm text-ink-soft">{r.contactName} · {r.email}{r.phone ? ` · ${r.phone}` : ""}</p>
                </div>
                <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
              </div>
              <p className="mt-2 text-xs text-ink-soft">
                {[r.city, r.childrenEstimate ? `~${r.childrenEstimate} crianças` : null, fmtDateTime(r.createdAt)].filter(Boolean).join(" · ")}
              </p>
              {r.message && <p className="mt-3 whitespace-pre-wrap rounded-btn bg-surface px-3 py-2 text-sm">{r.message}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {r.status === "PENDING" && (
                  <>
                    <Link href={`/admin/instituicoes/nova?pedido=${r.id}`} className="btn-primary btn-sm">Criar creche</Link>
                    <ConfirmAction action={rejectSignupAction} hidden={{ id: r.id }} label="Rejeitar" danger title="Rejeitar pedido" text={`O pedido de ${r.institutionName} fica marcado como rejeitado.`} confirmLabel="Rejeitar" />
                  </>
                )}
                {r.status === "APPROVED" && r.institutionId && <Link href={`/admin/instituicoes/${r.institutionId}`} className="btn-ghost btn-sm">Ver instituição</Link>}
                {r.status === "REJECTED" && <ActionButton action={reopenSignupAction} hidden={{ id: r.id }}>Reabrir pedido</ActionButton>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
