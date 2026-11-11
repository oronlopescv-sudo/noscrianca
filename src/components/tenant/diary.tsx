import { Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/ui/client";
import { Avatar, Badge, EmptyState } from "@/components/ui/kit";
import { fmtTime } from "@/lib/format";
import { DIARY_TYPES } from "@/lib/labels";
import { deleteDiaryAction } from "@/server/daily";

export type FeedEntry = {
  id: string; type: string; title: string; details: string; occurredAt: Date; photoUrl: string | null; createdByName: string; createdById: string;
  childName?: string; groupId: string | null; visible: boolean;
};

/** Lista de registos do diário (usada na gestão, na sala e no portal dos pais). */
export function DiaryFeed({ entries, timezone, slug, canDelete, userId, isDirector, emptyText }: {
  entries: FeedEntry[]; timezone: string; slug?: string; canDelete?: boolean; userId?: string; isDirector?: boolean; emptyText?: string;
}) {
  if (!entries.length) return <EmptyState title="Sem registos" text={emptyText ?? "Ainda não há registos para este dia."} />;
  return (
    <ul className="divide-y divide-line/70">
      {entries.map((e) => {
        const tp = DIARY_TYPES[e.type] ?? DIARY_TYPES.NOTE;
        return (
          <li key={e.id} className="flex gap-3 px-4 py-3.5 sm:px-5">
            <Avatar name={e.createdByName} size={36} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Badge tone={tp.tone}>{tp.label}</Badge>
                <span className="text-sm font-semibold">{e.title}</span>
                {!e.visible && <Badge tone="gray">Só equipa</Badge>}
              </div>
              {e.details && <p className="mt-1 whitespace-pre-wrap break-words text-sm">{e.details}</p>}
              {e.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <a href={e.photoUrl} target="_blank" rel="noreferrer"><img src={e.photoUrl} alt={e.title} className="mt-2 max-h-64 w-full max-w-sm rounded-btn object-cover" loading="lazy" /></a>
              )}
              <p className="mt-1 text-xs text-ink-soft">{e.childName ? `${e.childName} · ` : ""}{fmtTime(e.occurredAt, timezone)} · {e.createdByName}</p>
            </div>
            {canDelete && slug && (isDirector || e.createdById === userId) && (
              <ConfirmAction action={deleteDiaryAction} hidden={{ slug, id: e.id, group: e.groupId ? "1" : "" }} danger
                label={<Trash2 size={16} />} triggerClass="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-surface hover:text-red-600"
                title="Eliminar registo" confirmLabel="Eliminar"
                text={e.groupId ? "Este registo foi criado para várias crianças ao mesmo tempo. Será eliminado para todas." : "O registo deixa de ser visível para os pais."} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
