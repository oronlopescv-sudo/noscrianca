"use client";

import { useState } from "react";
import { ActionForm, Submit } from "@/components/ui/client";
import { Field } from "@/components/ui/kit";
import { submitJustificationAction } from "@/server/justifications";

export type FaltaJustificacao = {
  id: string; date: string; justificationStatus: string; justificationText: string;
  fileUrl: string | null; justifiedAt: Date | null;
};

const ESTADO: Record<string, { label: string; cls: string }> = {
  NONE: { label: "Falta · por justificar", cls: "bg-red-50 text-red-700" },
  PENDING: { label: "Falta · justificação pendente", cls: "bg-amber-50 text-amber-800" },
  JUSTIFIED: { label: "Falta · justificada", cls: "bg-emerald-50 text-emerald-800" },
  UNJUSTIFIED: { label: "Falta · não justificada", cls: "bg-red-50 text-red-700" },
};

/** Falta tocável: abre a folha para o encarregado justificar, editar e anexar documento. */
export function AbsenceJustification({ slug, childId, falta, fmt }: { slug: string; childId: string; falta: FaltaJustificacao; fmt: string }) {
  const [aberto, setAberto] = useState(false);
  const estado = ESTADO[falta.justificationStatus] ?? ESTADO.NONE;
  const aceite = falta.justificationStatus === "JUSTIFIED";

  return (
    <>
      <button type="button" onClick={() => setAberto(true)}
        className={`rounded-full px-3 py-1 text-xs font-semibold ${estado.cls} hover:brightness-95`}>
        {estado.label}
      </button>

      {aberto && (
        <div role="dialog" aria-modal="true" aria-label={`Falta de ${fmt}`} className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Falta</p>
                <p className="text-lg font-bold text-[#12307A]">{fmt}</p>
              </div>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-600 hover:bg-slate-200">×</button>
            </div>

            <p className={`mb-4 inline-block rounded-full px-3 py-1 text-xs font-semibold ${estado.cls}`}>{estado.label}</p>

            {falta.justificationStatus === "UNJUSTIFIED" && (
              <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">A direção não aceitou a última justificação. Pode corrigi-la e enviar de novo.</p>
            )}

            {aceite ? (
              <div className="space-y-3 text-sm">
                <p className="whitespace-pre-wrap text-slate-700">{falta.justificationText || "Sem motivo escrito."}</p>
                {falta.fileUrl && <a href={falta.fileUrl} target="_blank" rel="noopener" className="inline-block font-semibold text-[#1E63D6] underline">Ver documento anexado</a>}
                <p className="text-xs text-slate-500">A falta está justificada. Não é preciso fazer mais nada.</p>
              </div>
            ) : (
              <ActionForm action={submitJustificationAction} hidden={{ slug, childId, attendanceId: falta.id }} className="space-y-4" resetOnSuccess={false}
                onDone={(r) => { if (r.ok) setAberto(false); }}>
                <Field label="Motivo da falta" hint="Ex.: consulta médica, doença, assunto familiar">
                  <textarea name="justification" className="input min-h-[110px]" maxLength={500} defaultValue={falta.justificationText} placeholder="Escreva o motivo" />
                </Field>
                <Field label="Documento (opcional)" hint="Atestado, declaração ou receita. PDF, JPG, PNG ou WebP, até 8 MB.">
                  <input name="document" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="input" />
                </Field>
                {falta.fileUrl && <a href={falta.fileUrl} target="_blank" rel="noopener" className="inline-block text-sm font-semibold text-[#1E63D6] underline">Ver documento já enviado</a>}
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={() => setAberto(false)} className="rounded-full border-2 border-slate-300 px-5 py-2 font-semibold text-slate-600">Cancelar</button>
                  <Submit className="rounded-full bg-[#1E63D6] px-6 py-2 font-bold text-white">{falta.justificationStatus === "NONE" ? "Enviar justificação" : "Guardar alterações"}</Submit>
                </div>
              </ActionForm>
            )}
          </div>
        </div>
      )}
    </>
  );
}
