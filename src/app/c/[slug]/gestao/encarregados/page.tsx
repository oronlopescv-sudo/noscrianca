import Link from "next/link";
import { asc } from "drizzle-orm";
import { t } from "@/db/tenant";
import { ActionButton, ActionForm, Modal, Submit } from "@/components/ui/client";
import { Badge, Card, EmptyState, Field, PageHeader } from "@/components/ui/kit";
import { USER_STATUS } from "@/lib/labels";
import { createGuardianAction, accessLinkAction, setUserStatusAction } from "@/server/people";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function GuardiansPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireTenant((await params).slug, { permission: "children.view" });
  const guardians = await ctx.db.query.guardians.findMany({
    with: { user: true, children: { with: { child: true } } },
    orderBy: (g, { asc }) => asc(g.createdAt),
  });
  const canManage = ctx.can("guardians.manage") && !ctx.readOnly;
  const slug = ctx.institution.slug;

  return (
    <>
      <PageHeader
        title="Encarregados de educação"
        subtitle={`${guardians.length} contas de família`}
        actions={canManage && (
          <Modal title="Novo encarregado" trigger="Novo encarregado">
            <ActionForm action={createGuardianAction} hidden={{ slug }} className="space-y-4">
              <Field label="Nome completo"><input name="name" className="input" required minLength={2} maxLength={120} /></Field>
              <Field label="Email" hint="Enviamos um convite para criar a palavra-passe"><input name="email" type="email" className="input" required maxLength={160} /></Field>
              <Field label="Telefone"><input name="phone" type="tel" className="input" maxLength={40} /></Field>
              <Field label="Morada"><input name="address" className="input" maxLength={200} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Profissão"><input name="occupation" className="input" maxLength={80} /></Field>
                <Field label="Documento de identificação"><input name="idDocument" className="input" maxLength={60} /></Field>
              </div>
              <div className="flex justify-end"><Submit>Criar e enviar convite</Submit></div>
            </ActionForm>
          </Modal>
        )}
      />
      {guardians.length === 0 ? <EmptyState title="Sem encarregados" text="Crie um encarregado e associe-o a uma criança." /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {guardians.map((g) => (
            <Card key={g.id} title={g.user.name} actions={<Badge tone={USER_STATUS[g.user.status]?.tone ?? "gray"}>{USER_STATUS[g.user.status]?.label ?? g.user.status}</Badge>}>
              <p className="text-sm text-ink-soft">{g.user.email}{g.user.phone ? ` · ${g.user.phone}` : ""}</p>
              <p className="mt-3 text-sm font-medium">Crianças</p>
              {g.children.length === 0 ? <p className="text-sm text-ink-soft">Sem crianças associadas.</p> : (
                <ul className="mt-1 space-y-1">
                  {g.children.map((cg) => (
                    <li key={cg.childId} className="text-sm"><Link href={`${ctx.base}/gestao/criancas/${cg.childId}`} className="link">{cg.child.firstName} {cg.child.lastName}</Link> <span className="text-ink-soft">· {cg.relationship}</span></li>
                  ))}
                </ul>
              )}
              {canManage && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
                  {g.user.status === "INVITED" && <ActionButton action={accessLinkAction} hidden={{ slug, userId: g.user.id }}>Reenviar convite</ActionButton>}
                  {g.user.status !== "INVITED" && <ActionButton action={accessLinkAction} hidden={{ slug, userId: g.user.id }}>Enviar redefinição de palavra-passe</ActionButton>}
                  <ActionButton action={setUserStatusAction} hidden={{ slug, userId: g.user.id, status: g.user.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED" }}>
                    {g.user.status === "SUSPENDED" ? "Reativar conta" : "Suspender conta"}
                  </ActionButton>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

