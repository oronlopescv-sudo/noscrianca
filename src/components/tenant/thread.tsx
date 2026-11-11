import clsx from "clsx";
import { Send } from "lucide-react";
import { ActionForm, Submit } from "@/components/ui/client";
import { EmptyState } from "@/components/ui/kit";
import { fmtDateTime } from "@/lib/format";
import { sendMessageAction } from "@/server/comms";

export type ThreadMessage = { id: string; fromGuardian: boolean; senderName: string; body: string; createdAt: Date };

/** Conversa entre um encarregado e a instituição. */
export function Thread({ slug, messages, viewer, guardianId, timezone, canSend = true }: {
  slug: string; messages: ThreadMessage[]; viewer: "guardian" | "staff"; guardianId?: string; timezone: string; canSend?: boolean;
}) {
  return (
    <div className="card flex flex-col">
      <div className="max-h-[55dvh] min-h-[220px] space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && <EmptyState title="Sem mensagens" text={viewer === "guardian" ? "Envie uma mensagem à instituição." : "Ainda não há mensagens nesta conversa."} />}
        {messages.map((m) => {
          const mine = viewer === "guardian" ? m.fromGuardian : !m.fromGuardian;
          return (
            <div key={m.id} className={clsx("flex", mine ? "justify-end" : "justify-start")}>
              <div className={clsx("max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm", mine ? "rounded-br-md bg-accent text-white" : "rounded-bl-md bg-surface text-ink")}>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={clsx("mt-1 text-[11px]", mine ? "text-white/80" : "text-ink-soft")}>{m.senderName} · {fmtDateTime(m.createdAt, timezone)}</p>
              </div>
            </div>
          );
        })}
      </div>
      {canSend && (
        <ActionForm action={sendMessageAction} hidden={{ slug, guardianId: guardianId ?? "" }} className="border-t border-line p-3">
          <div className="flex items-end gap-2">
            <textarea name="body" required maxLength={3000} rows={2} placeholder="Escreva uma mensagem…" aria-label="Mensagem" className="input !min-h-[44px] flex-1 resize-none" />
            <Submit className="btn-primary shrink-0 px-3.5"><Send size={18} /><span className="sr-only">Enviar</span></Submit>
          </div>
        </ActionForm>
      )}
    </div>
  );
}
