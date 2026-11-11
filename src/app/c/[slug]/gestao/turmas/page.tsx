import { and, asc, count, eq } from "drizzle-orm";
import { t } from "@/db/tenant";
import { ActionForm, ConfirmAction, Modal, Submit } from "@/components/ui/client";
import { Badge, Card, Check, EmptyState, Field, PageHeader } from "@/components/ui/kit";
import { ROOM_COLORS, ROOM_COLOR_KEYS } from "@/lib/labels";
import { deleteClassroomAction, saveClassroomAction } from "@/server/people";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function ClassroomsPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireTenant((await params).slug, { permission: "children.view" });
  const slug = ctx.institution.slug;
  const canManage = ctx.can("classrooms.manage") && !ctx.readOnly;
  const [rooms, employees, counts, assigned] = await Promise.all([
    ctx.db.query.classrooms.findMany({ orderBy: [asc(t.classrooms.name)] }),
    ctx.db.query.employees.findMany({ with: { user: true }, orderBy: (e, { asc }) => asc(e.createdAt) }),
    ctx.db.select({ classroomId: t.children.classroomId, n: count() }).from(t.children).where(and(eq(t.children.status, "ACTIVE"))).groupBy(t.children.classroomId),
    ctx.db.select().from(t.classroomEmployees),
  ]);
  const countOf = new Map(counts.map((c) => [c.classroomId, c.n]));
  const staffOf = (id: string) => new Set(assigned.filter((a) => a.classroomId === id).map((a) => a.employeeId));
  const ageRange = (min: number | null, max: number | null) => (min == null && max == null ? "Qualquer idade" : `${min ?? 0}–${max ?? "∞"} meses`);

  const Form = ({ r }: { r?: (typeof rooms)[number] }) => (
    <ActionForm action={saveClassroomAction} hidden={{ slug, classroomId: r?.id }} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome"><input name="name" className="input" required minLength={2} maxLength={60} defaultValue={r?.name} placeholder="Ex.: Girassóis" /></Field>
        <Field label="Cor"><select name="color" className="input" defaultValue={r?.color ?? "green"}>{ROOM_COLOR_KEYS.map((k) => <option key={k} value={k}>{ROOM_COLORS[k].label}</option>)}</select></Field>
        <Field label="Capacidade"><input name="capacity" type="number" min={1} max={500} className="input" required defaultValue={r?.capacity ?? 20} /></Field>
        <Field label="Idade mínima (meses)" hint="Opcional"><input name="ageMin" type="number" min={0} max={999} className="input" defaultValue={r?.ageMinMonths ?? ""} /></Field>
        <Field label="Idade máxima (meses)" hint="Opcional"><input name="ageMax" type="number" min={0} max={999} className="input" defaultValue={r?.ageMaxMonths ?? ""} /></Field>
      </div>
      {r && <Check name="active" label="Turma ativa" defaultChecked={r.active} />}
      <fieldset>
        <legend className="label">Educadores e assistentes</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {employees.map((e) => (
            <label key={e.id} className="flex min-h-[40px] items-center gap-3 text-sm">
              <input type="checkbox" name="employeeIds" value={e.id} defaultChecked={r ? staffOf(r.id).has(e.id) : false} className="h-5 w-5 accent-[rgb(var(--accent))]" />
              {e.user.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end"><Submit>Guardar turma</Submit></div>
    </ActionForm>
  );

  return (
    <>
      <PageHeader title="Turmas" subtitle="Salas, idades, capacidade e equipa" actions={canManage && <Modal title="Nova turma" trigger="Nova turma" wide><Form /></Modal>} />
      {rooms.length === 0 ? <EmptyState title="Sem turmas" text="Crie a primeira turma para começar a inscrever crianças." /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rooms.map((r) => {
            const c = ROOM_COLORS[r.color] ?? ROOM_COLORS.green;
            const n = countOf.get(r.id) ?? 0;
            return (
              <Card key={r.id} pad={false} className="overflow-hidden">
                <div className="flex items-center justify-between gap-3 p-4" style={{ background: c.hex }}>
                  <p className="truncate text-base font-semibold text-white drop-shadow-sm">{r.name}</p>
                  {!r.active && <Badge tone="gray">Inativa</Badge>}
                </div>
                <div className="space-y-2 p-4 text-sm">
                  <p>{n} de {r.capacity} crianças</p>
                  <p className="text-ink-soft">{ageRange(r.ageMinMonths, r.ageMaxMonths)}</p>
                  <p className="text-ink-soft">{staffOf(r.id).size ? employees.filter((e) => staffOf(r.id).has(e.id)).map((e) => e.user.name).join(", ") : "Sem equipa atribuída"}</p>
                </div>
                {canManage && (
                  <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
                    <Modal title={`Editar ${r.name}`} trigger="Editar" triggerClass="btn-secondary btn-sm" wide><Form r={r} /></Modal>
                    <ConfirmAction action={deleteClassroomAction} hidden={{ slug, classroomId: r.id }} label="Eliminar" title="Eliminar turma" text="As crianças ficam sem turma. Esta ação não pode ser desfeita." confirmLabel="Eliminar" danger />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
