"use client";

import { useState } from "react";
import clsx from "clsx";
import { ActionForm, FormFooter } from "@/components/ui/client";
import { Check, Field } from "@/components/ui/kit";
import { addDiaryAction } from "@/server/daily";

const TYPES = [
  { key: "MEAL", label: "Refeição", presets: ["Pequeno-almoço", "Almoço", "Lanche"], details: ["Comeu tudo", "Comeu bem", "Comeu pouco", "Não quis comer"] },
  { key: "SLEEP", label: "Sesta", presets: ["Sesta"], details: ["Dormiu bem", "Dormiu pouco", "Não dormiu"] },
  { key: "HYGIENE", label: "Higiene", presets: ["Muda de fralda", "Casa de banho", "Lavou os dentes"], details: [] },
  { key: "ACTIVITY", label: "Atividade", presets: ["Pintura", "Música", "Recreio", "Hora do conto"], details: [] },
  { key: "INCIDENT", label: "Ocorrência", presets: ["Queda", "Febre", "Indisposição"], details: [] },
  { key: "NOTE", label: "Nota", presets: [], details: [] },
  { key: "PHOTO", label: "Fotografia", presets: [], details: [] },
] as const;

export type DiaryChild = { id: string; name: string; photoConsent: boolean };

export function DiaryForm({ slug, date, kids, fixedChildId }: { slug: string; date: string; kids: DiaryChild[]; fixedChildId?: string }) {
  const [type, setType] = useState<(typeof TYPES)[number]["key"]>("MEAL");
  const [title, setTitle] = useState("Almoço");
  const [details, setDetails] = useState("");
  const [selected, setSelected] = useState<string[]>(fixedChildId ? [fixedChildId] : []);
  const cfg = TYPES.find((x) => x.key === type)!;
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <ActionForm action={addDiaryAction} hidden={{ slug, date, type }} className="space-y-4" onDone={() => { setDetails(""); if (!fixedChildId) setSelected([]); }}>
      <div>
        <span className="label">Tipo de registo</span>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((x) => (
            <button key={x.key} type="button" onClick={() => { setType(x.key); setTitle(x.presets[0] ?? ""); setDetails(""); }}
              className={clsx("min-h-[40px] rounded-full border px-3.5 text-sm font-medium", type === x.key ? "border-accent bg-accent text-white" : "border-line bg-white text-ink hover:bg-surface")}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <Field label="Título">
        <input name="title" className="input" required minLength={2} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      {cfg.presets.length > 1 && (
        <div className="-mt-2 flex flex-wrap gap-1.5">
          {cfg.presets.map((p) => <button key={p} type="button" onClick={() => setTitle(p)} className={clsx("rounded-full border px-2.5 py-1 text-xs", title === p ? "border-accent text-accent" : "border-line text-ink-soft")}>{p}</button>)}
        </div>
      )}
      <Field label="Detalhes">
        <textarea name="details" className="input" maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Opcional" />
      </Field>
      {cfg.details.length > 0 && (
        <div className="-mt-2 flex flex-wrap gap-1.5">
          {cfg.details.map((p) => <button key={p} type="button" onClick={() => setDetails(p)} className={clsx("rounded-full border px-2.5 py-1 text-xs", details === p ? "border-accent text-accent" : "border-line text-ink-soft")}>{p}</button>)}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Hora" hint="Vazio = agora"><input name="time" type="time" className="input" /></Field>
        <Field label={type === "PHOTO" ? "Fotografia" : "Fotografia (opcional)"} hint="JPG, PNG ou WebP até 8 MB">
          <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="input py-2" required={type === "PHOTO"} />
        </Field>
      </div>
      {type === "INCIDENT" && <Check name="visible" label="Visível para os pais" hint="Desmarque para registo interno da equipa" defaultChecked />}
      {fixedChildId ? <input type="hidden" name="childIds" value={fixedChildId} /> : (
        <fieldset>
          <div className="mb-1.5 flex items-center justify-between">
            <legend className="label !mb-0">Crianças ({selected.length} de {kids.length})</legend>
            <button type="button" className="text-xs font-medium text-accent" onClick={() => setSelected(selected.length === kids.length ? [] : kids.map((k) => k.id))}>
              {selected.length === kids.length ? "Limpar" : "Selecionar todas"}
            </button>
          </div>
          {kids.length === 0 ? <p className="text-sm text-ink-soft">Não há crianças ativas nesta turma.</p> : (
            <div className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto rounded-btn border border-line p-2 sm:grid-cols-3">
              {kids.map((k) => (
                <label key={k.id} className={clsx("flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg px-2 text-sm", selected.includes(k.id) ? "bg-accent/10 font-medium text-accent" : "hover:bg-surface")}>
                  <input type="checkbox" name="childIds" value={k.id} checked={selected.includes(k.id)} onChange={() => toggle(k.id)} className="h-4 w-4 accent-[rgb(var(--accent))]" />
                  <span className="truncate">{k.name}{!k.photoConsent && <span title="Sem autorização de fotografias" className="text-ink-soft"> ⦸</span>}</span>
                </label>
              ))}
            </div>
          )}
          <p className="hint">⦸ = sem autorização de fotografias</p>
        </fieldset>
      )}
      <FormFooter submit="Adicionar registo" />
    </ActionForm>
  );
}
