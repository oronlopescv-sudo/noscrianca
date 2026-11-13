import { ActionButton, ActionForm, Submit } from "@/components/ui/client";
import { Badge, Card, Check, EmptyState, Field } from "@/components/ui/kit";
import { fmtDateTime } from "@/lib/format";
import { createAnnouncementAction, deleteAnnouncementAction } from "@/server/comms";

export type AnnouncementRow = { id: string; title: string; body: string; classroomName: string | null; createdByName: string; createdAt: Date; audience?: string };

const AUDIENCE_LABEL: Record<string, string> = { ALL: "Pais e equipa", GUARDIANS: "Só pais", STAFF: "Só equipa" };

export function AnnouncementList({ items, timezone, slug, canDelete }: { items: AnnouncementRow[]; timezone: string; slug?: string; canDelete?: boolean }) {
  if (!items.length) return <EmptyState title="Sem comunicados" text="Os avisos da instituição aparecem aqui." />;
  return (
    <ul className="space-y-3">
      {items.map((a) => (
        <li key={a.id}>
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{a.title} {a.audience && <Badge tone={a.audience === "STAFF" ? "purple" : a.audience === "ALL" ? "blue" : "gray"}>{AUDIENCE_LABEL[a.audience] ?? a.audience}</Badge>}</p>
                <p className="text-xs text-ink-soft">{a.classroomName ? `Turma ${a.classroomName}` : "Toda a instituição"} · {a.createdByName} · {fmtDateTime(a.createdAt, timezone)}</p>
              </div>
              {canDelete && slug && <ActionButton action={deleteAnnouncementAction} hidden={{ slug, id: a.id }} className="btn-ghost btn-sm">Eliminar</ActionButton>}
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm text-ink">{a.body}</p>
          </Card>
        </li>
      ))}
    </ul>
  );
}

export function AnnouncementForm({ slug, classrooms }: { slug: string; classrooms: { id: string; name: string }[] }) {
  return (
    <ActionForm action={createAnnouncementAction} hidden={{ slug }} className="space-y-4">
      <Field label="Título"><input name="title" className="input" required minLength={2} maxLength={120} /></Field>
      <Field label="Enviar a">
        <select name="audience" className="input" defaultValue="GUARDIANS">
          <option value="GUARDIANS">Pais e encarregados</option>
          <option value="STAFF">Equipa (educadores e funcionários)</option>
          <option value="ALL">Pais e equipa</option>
        </select>
      </Field>
      <Field label="Turma">
        <select name="classroomId" className="input" defaultValue="">
          <option value="">Toda a instituição</option>
          {classrooms.map((c) => <option key={c.id} value={c.id}>Turma {c.name}</option>)}
        </select>
      </Field>
      <Field label="Mensagem"><textarea name="body" className="input min-h-[140px]" required minLength={2} maxLength={5000} /></Field>
      <Check name="sendEmail" label="Enviar também por email" hint="Além do aviso na aplicação, cada destinatário recebe o comunicado no seu email." defaultChecked />
      <div className="flex justify-end"><Submit>Publicar comunicado</Submit></div>
    </ActionForm>
  );
}

