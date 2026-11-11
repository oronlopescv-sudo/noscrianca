import { asc } from "drizzle-orm";
import { t } from "@/db/tenant";
import { ActionButton, ActionForm, Modal, Submit } from "@/components/ui/client";
import { Badge, Card, EmptyState, Field, PageHeader } from "@/components/ui/kit";
import { USER_STATUS } from "@/lib/labels";
import { DIRECTOR_KEY } from "@/lib/permissions";
import { accessLinkAction, createEmployeeAction, setUserStatusAction, updateEmployeeAction } from "@/server/people";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function EmployeesPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireTenant((await params).slug, { permission: "employees.manage" });
  const slug = ctx.institution.slug;
  const [employees, roles, classrooms] = await Promise.all([
    ctx.db.query.employees.findMany({ with: { user: { with: { role: true } }, classrooms: { with: {} } }, orderBy: (e, { asc }) => asc(e.createdAt) }),
    ctx.db.query.roles.findMany({ orderBy: [asc(t.roles.name)] }),
    ctx.db.query.classrooms.findMany({ orderBy: [asc(t.classrooms.name)] }),
  ]);
  const assignable = roles.filter((r) => r.key !== DIRECTOR_KEY);
  const canManage = !ctx.readOnly;
  const classroomIdsOf = (e: (typeof employees)[number]) => new Set(e.classrooms.map((c) => c.classroomId));

  const Fields = ({ e }: { e?: (typeof employees)[number] }) => (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Nome completo"><input name="name" className="input" required minLength={2} maxLength={120} defaultValue={e?.user.name} /></Field>
      {!e && <Field label="Email" hint="Enviamos um convite para criar a palavra-passe"><input name="email" type="email" className="input" required maxLength={160} /></Field>}
      <Field label="Telefone"><input name="phone" type="tel" className="input" maxLength={40} defaultValue={e?.user.phone} /></Field>
      <Field label="Cargo">
        <select name="roleId" className="input" required defaultValue={e?.user.roleId ?? assignable[0]?.id}>
          {assignable.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </Field>
      <Field label="Função" hint="Ex.: Educadora de infância"><input name="jobTitle" className="input" maxLength={80} defaultValue={e?.jobTitle} /></Field>
      <Field label="Data de admissão"><input name="hireDate" type="date" className="input" defaultValue={e?.hireDate ?? ""} /></Field>
      <Field label="Horário"><input name="schedule" className="input" maxLength={200} defaultValue={e?.schedule} placeholder="8h–16h" /></Field>
      {e && <Field label="Morada"><input name="address" className="input" maxLength={200} defaultValue={e.address} /></Field>}
      {e && <Field label="Notas internas" className="sm:col-span-2"><textarea name="notes" className="input min-h-[70px]" maxLength={1000} defaultValue={e.notes} /></Field>}
      <fieldset className="sm:col-span-2">
        <legend className="label">Turmas atribuídas <span className="hint">(sem seleção, o cargo decide o acesso)</span></legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {classrooms.map((c) => (
            <label key={c.id} className="flex min-h-[40px] items-center gap-3 text-sm">
              <input type="checkbox" name="classroomIds" value={c.id} defaultChecked={e ? classroomIdsOf(e).has(c.id) : false} className="h-5 w-5 accent-[rgb(var(--accent))]" />
              {c.name}
            </label>
          ))}
        </div>
        {classrooms.length === 0 && <p className="text-sm text-ink-soft">Crie primeiro uma turma.</p>}
      </fieldset>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Funcionários"
        subtitle={`${employees.length} colaboradores`}
        actions={canManage && (
          <Modal title="Novo funcionário" trigger="Novo funcionário" wide>
            <ActionForm action={createEmployeeAction} hidden={{ slug }} className="space-y-4">
              <Fields />
              <div className="flex justify-end"><Submit>Criar e enviar convite</Submit></div>
            </ActionForm>
          </Modal>
        )}
      />
      {employees.length === 0 ? <EmptyState title="Sem funcionários" text="Adicione a equipa e atribua cargos e turmas." /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {employees.map((e) => (
            <Card key={e.id} title={e.user.name} actions={<Badge tone={USER_STATUS[e.user.status]?.tone ?? "gray"}>{USER_STATUS[e.user.status]?.label ?? e.user.status}</Badge>}>
              <p className="text-sm text-ink-soft">{e.user.email}{e.user.phone ? ` · ${e.user.phone}` : ""}</p>
              <p className="mt-2 text-sm"><span className="font-medium">{e.user.role?.name ?? "Sem cargo"}</span>{e.jobTitle ? ` · ${e.jobTitle}` : ""}</p>
              <p className="text-xs text-ink-soft">{e.schedule || "Horário não definido"}{e.hireDate ? ` · admitido em ${e.hireDate.split("-").reverse().join("/")}` : ""}</p>
              <p className="mt-1 text-xs text-ink-soft">Turmas: {e.classrooms.length ? classrooms.filter((c) => classroomIdsOf(e).has(c.id)).map((c) => c.name).join(", ") : "todas (conforme o cargo)"}</p>
              {canManage && e.user.role?.key !== DIRECTOR_KEY && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
                  <Modal title={`Editar ${e.user.name}`} trigger="Editar" triggerClass="btn-secondary btn-sm" wide>
                    <ActionForm action={updateEmployeeAction} hidden={{ slug, employeeId: e.id }} className="space-y-4">
                      <Fields e={e} />
                      <div className="flex justify-end"><Submit>Guardar</Submit></div>
                    </ActionForm>
                  </Modal>
                  {e.user.status === "INVITED" && <ActionButton action={accessLinkAction} hidden={{ slug, userId: e.userId }}>Reenviar convite</ActionButton>}
                  {e.user.status !== "INVITED" && <ActionButton action={accessLinkAction} hidden={{ slug, userId: e.userId }}>Redefinir palavra-passe</ActionButton>}
                  <ActionButton action={setUserStatusAction} hidden={{ slug, userId: e.userId, status: e.user.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED" }}>
                    {e.user.status === "SUSPENDED" ? "Reativar" : "Suspender"}
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
