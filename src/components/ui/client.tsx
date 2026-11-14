"use client";

import { createContext, useActionState, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Check, Copy, Loader2, X } from "lucide-react";
import type { ActionResult } from "@/lib/result";
import { reduzirImagens } from "@/lib/client-image";

export type FormAction = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

// ---------- toasts ----------
type Toast = { id: number; text: string; tone: "ok" | "error" };
const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setItems((l) => [...l, { id, text, tone }]);
    setTimeout(() => setItems((l) => l.filter((i) => i.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex flex-col items-center gap-2 px-4 sm:bottom-6" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className={clsx("pointer-events-auto max-w-md rounded-btn px-4 py-3 text-sm font-medium text-white shadow-lg", i.tone === "ok" ? "bg-navy" : "bg-red-600")}>
            {i.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- modal ----------
const ModalCtx = createContext<(() => void) | null>(null);
export const useModalClose = () => useContext(ModalCtx);

export function Modal({ trigger, triggerClass = "btn-primary", title, children, wide, disabled }: {
  trigger: ReactNode; triggerClass?: string; title: string; children: ReactNode; wide?: boolean; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close]);
  return (
    <>
      <button type="button" className={triggerClass} onClick={() => setOpen(true)} disabled={disabled}>{trigger}</button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-navy/50 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div role="dialog" aria-modal="true" aria-label={title} className={clsx("flex max-h-[92dvh] w-full flex-col rounded-t-card bg-white shadow-xl sm:rounded-card", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}>
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
              <h2 className="text-base">{title}</h2>
              <button type="button" onClick={close} aria-label="Fechar" className="flex h-10 w-10 items-center justify-center rounded-full text-ink-soft hover:bg-surface"><X size={20} /></button>
            </div>
            <div className="overflow-y-auto px-5 py-4">
              <ModalCtx.Provider value={close}>{children}</ModalCtx.Provider>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------- formulários ligados a Server Actions ----------
export function ActionForm({ action, children, className, hidden, onDone, resetOnSuccess = true }: {
  action: FormAction; children: ReactNode; className?: string; hidden?: Record<string, string | number | null | undefined>;
  onDone?: (r: ActionResult) => void; resetOnSuccess?: boolean;
}) {
  // Antes de chegar ao servidor, as imagens são reduzidas no próprio aparelho.
  const [state, formAction] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    await reduzirImagens(fd);
    return action(prev, fd);
  }, null);
  const router = useRouter();
  const toast = useToast();
  const close = useModalClose();
  const ref = useRef<HTMLFormElement>(null);
  const handled = useRef<ActionResult | null>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (!state.ok) return;
    if (state.message) toast(state.message);
    onDone?.(state);
    if (state.redirect) {
      router.push(state.redirect);
      router.refresh();
      return;
    }
    if (typeof state.data?.url === "string") {
      router.refresh();
      return;
    }
    if (resetOnSuccess) ref.current?.reset();
    close?.();
    router.refresh();
  }, [state, router, toast, close, onDone, resetOnSuccess]);

  const linkUrl = state?.ok && typeof state.data?.url === "string" ? state.data.url : null;
  if (linkUrl) {
    return (
      <div className="space-y-4">
        <div className="rounded-btn border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
          {state?.message ?? "Link gerado."} Envie este link à pessoa (por email, WhatsApp ou SMS). É de uso único e tem validade limitada.
        </div>
        <CopyField value={linkUrl} label="Link de acesso" />
        {close && <div className="flex justify-end"><button type="button" className="btn-primary" onClick={close}>Concluir</button></div>}
      </div>
    );
  }

  return (
    <form ref={ref} action={formAction} className={className}>
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v ?? ""} />)}
      {state && !state.ok && state.error && (
        <div role="alert" className="mb-4 rounded-btn border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{state.error}</div>
      )}
      {children}
    </form>
  );
}

export function Submit({ children, className = "btn-primary", pendingText }: { children: ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending && <Loader2 size={16} className="animate-spin" />}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

export function FormFooter({ submit = "Guardar", cancel = true }: { submit?: string; cancel?: boolean }) {
  const close = useModalClose();
  return (
    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      {cancel && close && <button type="button" className="btn-ghost" onClick={close}>Cancelar</button>}
      <Submit>{submit}</Submit>
    </div>
  );
}

/** Botão que pede confirmação antes de executar uma Server Action. */
export function ConfirmAction({ action, hidden, label, title, text, confirmLabel = "Confirmar", triggerClass = "btn-ghost btn-sm", danger, children, disabled }: {
  action: FormAction; hidden: Record<string, string | number | null | undefined>; label: ReactNode; title: string; text?: string;
  confirmLabel?: string; triggerClass?: string; danger?: boolean; children?: ReactNode; disabled?: boolean;
}) {
  return (
    <Modal trigger={label} triggerClass={triggerClass} title={title} disabled={disabled}>
      <ActionForm action={action} hidden={hidden}>
        {text && <p className="text-sm text-ink-soft">{text}</p>}
        {children && <div className="mt-4 space-y-4">{children}</div>}
        <ConfirmFooter label={confirmLabel} danger={danger} />
      </ActionForm>
    </Modal>
  );
}

function ConfirmFooter({ label, danger }: { label: string; danger?: boolean }) {
  const close = useModalClose();
  return (
    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button type="button" className="btn-ghost" onClick={() => close?.()}>Cancelar</button>
      <Submit className={danger ? "btn-danger" : "btn-primary"}>{label}</Submit>
    </div>
  );
}

/** Botão simples que executa uma ação sem confirmação (ex.: marcar como lido). */
export function ActionButton({ action, hidden, children, className = "btn-ghost btn-sm" }: {
  action: FormAction; hidden: Record<string, string | number | null | undefined>; children: ReactNode; className?: string;
}) {
  return (
    <ActionForm action={action} hidden={hidden} className="inline">
      <Submit className={className}>{children}</Submit>
    </ActionForm>
  );
}

export function CopyField({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div>
      {label && <span className="label">{label}</span>}
      <div className="flex gap-2">
        <input readOnly value={value} className="input font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button" className="btn-ghost shrink-0" aria-label="Copiar"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setDone(true);
              setTimeout(() => setDone(false), 2000);
            } catch { /* o campo fica selecionável manualmente */ }
          }}
        >
          {done ? <Check size={16} /> : <Copy size={16} />}{done ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

export function PrintButton({ label = "Imprimir" }: { label?: string }) {
  return <button type="button" className="btn-ghost no-print" onClick={() => window.print()}>{label}</button>;
}

/** Recarrega os dados do servidor periodicamente (ex.: progresso do provisionamento). */
export function AutoRefresh({ seconds = 3, active = true }: { seconds?: number; active?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds, active]);
  return null;
}
