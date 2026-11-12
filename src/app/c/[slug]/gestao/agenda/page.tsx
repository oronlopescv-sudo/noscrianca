import { asc, desc, gte, lt } from "drizzle-orm";
import { ActionForm, ConfirmAction, Modal, Submit } from "@/components/ui/client";
import { Badge, Card, EmptyState, Field, PageHeader } from "@/components/ui/kit";
import { t } from "@/db/tenant";
import { fmtDate, todayIn } from "@/lib/format";
import { requireTenant, visibleClassrooms } from "@/lib/tenant";
import { deleteEventAction, saveEventAction } from "@/server/extras";

export const dynamic = "force-dynamic";
const AUDIENCE: Record<string, string> = { ALL: "Pais e equipa", GUARDIANS: "Só pais", STAFF: "Só equipa" };

export default async function AgendaPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireTenant((await params).slug, { permission: "announcements.manage" });
  const slug = ctx.institution.slug;
  const today = todayIn(ctx.settings.timezone);
  const [upcoming, past, classrooms] = await Promise.all([
    ctx.db.query.events.findMany({ where: gte(t.events.date, today), orderBy: [asc(t.events.date)], limit: 200, with: { classroom: true } }),
    ctx.db.query.events.findMany({ where: lt(t.events.date, today), orderBy: [desc(t.events.date)], limit: 20, with: { classroom: true } }),
    visibleClassrooms(ctx),
  ]);
  const canWrite = !ctx.readOnly;
  const List = ({ rows }: { rows: typeof upcoming }) => (
    <ul className="divide-y divide-line">
      {rows.map((e) => (
        <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 gap-3">
            <div className="w-24 shrink-0 text-sm font-semibold text-accent">{fmtDate(e.date)}{e.endDate && e.endDate !== e.date ? <span className="block text-xs font-normal text-ink-soft">até {fmtDate(e.endDate)}</span> : null}</div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{e.title} <Badge tone={e.audience === "STAFF" ? "purple" : e.audience === "ALL" ? "blue" : "gray"}>{AUDIENCE[e.audience] ?? e.audience}</Badge> {e.classroom && <Badge>{e.classroom.name}</Badge>}</p>
              {e.description && <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-soft">{e.description}</p>}
            </div>
          </div>
          {canWrite && <ConfirmAction action={deleteEventAction} hidden={{ slug, id: e.id }} label="Remover" title="Remover evento" text="O evento deixa de aparecer na agenda dos pais e da equipa." confirmLabel="Remover" danger />}
        </li>
      ))}
    </ul>
  );
  return (
    <>
      <PageHeader title="Agenda" subtitle="Eventos, reuniões, feriados e férias da creche"
        actions={canWrite && (
          <Modal title="Novo evento" trigger="Novo evento">
            <ActionForm action={saveEventAction} hidden={{ slug }} className="space-y-4">
              <Field label="Título"><input name="title" className="input" required minLength={2} maxLength={120} placeholder="Ex.: Festa de Natal, Reunião de pais, Férias" /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Data"><input name="date" type="date" className="input" required defaultValue={today} /></Field>
                <Field label="Até (opcional)" hint="Para eventos de vários dias"><input name="endDate" type="date" className="input" /></Field>
                <Field label="Quem vê">
                  <select name="audience" className="input" defaultValue="ALL"><option value="ALL">Pais e equipa</option><option value="GUARDIANS">Só pais</option><option value="STAFF">Só equipa</option></select>
                </Field>
                <Field label="Turma">
                  <select name="classroomId" className="input" defaultValue=""><option value="">Toda a instituição</option>{classrooms.map((c) => <option key={c.id} value={c.id}>Turma {c.name}</option>)}</select>
                </Field>
              </div>
              <Field label="Descrição (opcional)"><textarea name="description" className="input min-h-[90px]" maxLength={1000} /></Field>
              <div className="flex justify-end"><Submit>Adicionar à agenda</Submit></div>
            </ActionForm>
          </Modal>
        )} />
      {upcoming.length === 0 && past.length === 0 ? <EmptyState title="Agenda vazia" text="Adicione os eventos e as férias da creche. Os pais e a equipa veem-nos na sua área." /> : (
        <div className="space-y-5">
          <Card title="Próximos" pad={false}>{upcoming.length ? <List rows={upcoming} /> : <p className="card-pad text-sm text-ink-soft">Sem eventos marcados.</p>}</Card>
          {past.length > 0 && <Card title="Anteriores" pad={false}><List rows={past} /></Card>}
        </div>
      )}
    </>
  );
}
