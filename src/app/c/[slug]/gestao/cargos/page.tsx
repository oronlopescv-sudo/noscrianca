import { asc, count } from "drizzle-orm";
import { t } from "@/db/tenant";
import { ActionForm, ConfirmAction, Modal, Submit } from "@/components/ui/client";
import { Badge, Card, EmptyState, Field, PageHeader, Notice } from "@/components/ui/kit";
import { DIRECTOR_KEY, PERMISSIONS, PERMISSION_GROUPS, type Permission } from "@/lib/permissions";
import { deleteRoleAction, saveRoleAction } from "@/server/people";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function RolesPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireTenant((await params).slug, { permission: "roles.manage" });
  const slug = ctx.institution.slug;
  const roles = await ctx.db.query.roles.findMany({ orderBy: [asc(t.roles.name)] });
  const usage = await ctx.db.select({ roleId: t.users.roleId, n: count() }).from(t.users).groupBy(t.users.roleId);
  const usageOf = new Map(usage.map((u) => [u.roleId, u.n]));
  const canWrite = !ctx.readOnly;

  const Form = ({ r }: { r?: (typeof roles)[number] }) => (
    <ActionForm action={saveRoleAction} hidden={{ slug, roleId: r?.id }} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome do cargo"><input name="name" className="input" required minLength={2} maxLength={60} defaultValue={r?.name} placeholder="Ex.: Cozinheira" /></Field>
        <Field label="Descrição"><input name="description" className="input" maxLength={200} defaultValue={r?.description} /></Field>
        <Field label="Painel" hint="Sala: tablet para educadores. Gestão: computador e telemóvel.">
          <select name="panel" className="input" defaultValue={r?.panel ?? "MANAGEMENT"}>
            <option value="MANAGEMENT">Gestão</option><option value="CLASSROOM">Sala</option>
          </select>
        </Field>
        <Field label="Turmas acessíveis">
          <select name="scope" className="input" defaultValue={r?.allClassrooms === false ? "ASSIGNED" : "ALL"}>
            <option value="ALL">Todas as turmas</option><option value="ASSIGNED">Apenas as turmas atribuídas</option>
          </select>
        </Field>
      </div>
      <fieldset className="space-y-4">
        <legend className="label">Permissões</legend>
        {PERMISSION_GROUPS.map((g) => (
          <div key={g.label}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-soft">{g.label}</p>
            <div className="grid gap-1 sm:grid-cols-2">
              {g.items.map((p) => (
                <label key={p} className="flex min-h-[40px] items-center gap-3 text-sm">
                  <input type="checkbox" name="permissions" value={p} defaultChecked={r ? (r.permissions as Permission[]).includes(p) : false} className="h-5 w-5 accent-[rgb(var(--accent))]" />
                  {PERMISSIONS[p]}
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>
      <div className="flex justify-end"><Submit>{r ? "Guardar cargo" : "Criar cargo"}</Submit></div>
    </ActionForm>
  );

  return (
    <>
      <PageHeader title="Cargos e permissões" subtitle="Defina o que cada perfil da equipa pode ver e fazer" actions={canWrite && <Modal title="Novo cargo" trigger="Novo cargo" wide><Form /></Modal>} />
      <Notice tone="blue">O cargo de diretor(a) tem sempre acesso total e não pode ser alterado. Os restantes cargos aplicam-se a quem os tiver atribuído.</Notice>
      <div className="mt-5">
        {roles.length === 0 ? <EmptyState title="Sem cargos" text="Os cargos padrão são criados com a instituição." /> : (
          <div className="grid gap-4 md:grid-cols-2">
            {roles.map((r) => {
              const locked = r.key === DIRECTOR_KEY;
              return (
                <Card key={r.id} title={r.name} actions={<div className="flex gap-1">{r.isSystem && <Badge tone="blue">Padrão</Badge>}<Badge tone="gray">{r.panel === "CLASSROOM" ? "Sala" : "Gestão"}</Badge></div>}>
                  <p className="text-sm text-ink-soft">{r.description || "Sem descrição"}</p>
                  <p className="mt-2 text-xs text-ink-soft">{locked ? "Acesso total" : `${(r.permissions as string[]).length} permissões`} · {usageOf.get(r.id) ?? 0} utilizadores · {r.allClassrooms ? "todas as turmas" : "turmas atribuídas"}</p>
                  {canWrite && (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
                      {!locked && <Modal title={`Editar ${r.name}`} trigger="Editar" triggerClass="btn-secondary btn-sm" wide><Form r={r} /></Modal>}
                      {!locked && !r.isSystem && <ConfirmAction action={deleteRoleAction} hidden={{ slug, roleId: r.id }} label="Eliminar" title="Eliminar cargo" text="Só é possível se nenhum utilizador o tiver." confirmLabel="Eliminar" danger />}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
