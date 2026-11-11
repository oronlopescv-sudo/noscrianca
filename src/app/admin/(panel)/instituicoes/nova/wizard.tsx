"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, CircleAlert, Loader2 } from "lucide-react";
import { ActionForm, Submit } from "@/components/ui/client";
import { Field } from "@/components/ui/kit";
import { checkSlugAction, createInstitutionAction } from "../../../actions";

type PlanOpt = { id: string; name: string; description: string; monthly: string; yearly: string };
type Prefill = { requestId?: string; name?: string; email?: string; phone?: string; city?: string; directorName?: string };

function slugify(name: string) {
  return name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/^[^a-z]+/, "").slice(0, 30).replace(/-+$/, "");
}

const STEPS = ["Instituição", "Diretor", "Plano"];

export function NewInstitutionWizard({ plans, trialDays, prefill, appUrl }: { plans: PlanOpt[]; trialDays: number; prefill: Prefill; appUrl: string }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(prefill.name ?? "");
  const [slug, setSlug] = useState(slugify(prefill.name ?? ""));
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugState, setSlugState] = useState<{ ok: boolean; message: string } | "checking" | null>(null);
  const [startMode, setStartMode] = useState<"trial" | "active">("trial");
  const [stepError, setStepError] = useState("");
  const panels = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!slug) { setSlugState(null); return; }
    setSlugState("checking");
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const r = await checkSlugAction(slug);
        if (!cancelled) setSlugState(r);
      } catch {
        if (!cancelled) setSlugState({ ok: false, message: "Não foi possível verificar o endereço." });
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(id); };
  }, [slug]);

  function next() {
    const inputs = panels.current[step]?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select") ?? [];
    for (const el of inputs) {
      if (!el.checkValidity()) { el.reportValidity(); return; }
    }
    if (step === 0 && (slugState === "checking" || !slugState || !slugState.ok)) {
      setStepError(slugState && slugState !== "checking" ? slugState.message : "Aguarde a verificação do endereço.");
      return;
    }
    setStepError("");
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  return (
    <div className="card card-pad mx-auto max-w-2xl">
      <ol className="mb-6 flex items-center gap-2" aria-label="Passos">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span className={clsx("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold", i < step ? "bg-emerald-500 text-white" : i === step ? "bg-accent text-white" : "bg-surface text-ink-soft")}>
              {i < step ? <Check size={16} /> : i + 1}
            </span>
            <span className={clsx("text-sm font-medium", i === step ? "text-ink" : "text-ink-soft")}>{label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 hidden h-px flex-1 bg-line sm:block" />}
          </li>
        ))}
      </ol>

      <ActionForm action={createInstitutionAction} resetOnSuccess={false} hidden={{ requestId: prefill.requestId ?? "" }}>
        <div ref={(el) => { panels.current[0] = el; }} className={clsx("space-y-4", step !== 0 && "hidden")}>
          <Field label="Nome da instituição">
            <input name="name" className="input" required minLength={2} maxLength={120} value={name}
              onChange={(e) => { setName(e.target.value); if (!slugEdited) setSlug(slugify(e.target.value)); }} />
          </Field>
          <Field label="Endereço (código da creche)" hint={`Os utilizadores entram em ${appUrl}/c/${slug || "codigo"}`}>
            <input name="slug" className="input font-mono" required minLength={3} maxLength={30} pattern="[a-z][a-z0-9\-]{2,29}" autoCapitalize="none" spellCheck={false}
              value={slug} onChange={(e) => { setSlugEdited(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); }} />
          </Field>
          {slug && (
            <p className={clsx("-mt-2 flex items-center gap-1.5 text-xs font-medium", slugState === "checking" ? "text-ink-soft" : slugState?.ok ? "text-emerald-600" : "text-red-600")} aria-live="polite">
              {slugState === "checking" ? <><Loader2 size={13} className="animate-spin" /> A verificar…</> : slugState?.ok ? <><Check size={13} /> {slugState.message}</> : <><CircleAlert size={13} /> {slugState?.message}</>}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email da instituição"><input name="email" type="email" className="input" defaultValue={prefill.email ?? ""} /></Field>
            <Field label="Telefone"><input name="phone" type="tel" className="input" defaultValue={prefill.phone ?? ""} maxLength={40} /></Field>
          </div>
          <Field label="Morada"><input name="address" className="input" maxLength={200} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cidade / ilha"><input name="city" className="input" defaultValue={prefill.city ?? ""} maxLength={80} /></Field>
            <Field label="Moeda">
              <select name="currency" className="input" defaultValue="CVE">
                <option value="CVE">CVE — Escudo cabo-verdiano</option><option value="EUR">EUR — Euro</option><option value="USD">USD — Dólar</option>
              </select>
            </Field>
          </div>
        </div>

        <div ref={(el) => { panels.current[1] = el; }} className={clsx("space-y-4", step !== 1 && "hidden")}>
          <p className="text-sm text-ink-soft">O diretor recebe um convite seguro para definir a sua palavra-passe. É a primeira conta da instituição.</p>
          <Field label="Nome do diretor"><input name="directorName" className="input" required minLength={2} maxLength={120} defaultValue={prefill.directorName ?? ""} /></Field>
          <Field label="Email do diretor"><input name="directorEmail" type="email" className="input" required defaultValue={prefill.email ?? ""} /></Field>
          <Field label="Telefone do diretor"><input name="directorPhone" type="tel" className="input" maxLength={40} defaultValue={prefill.phone ?? ""} /></Field>
        </div>

        <div ref={(el) => { panels.current[2] = el; }} className={clsx("space-y-4", step !== 2 && "hidden")}>
          <fieldset>
            <legend className="label">Plano</legend>
            <div className="space-y-2">
              {plans.map((p, i) => (
                <label key={p.id} className="flex cursor-pointer items-start gap-3 rounded-btn border border-line p-3 has-[:checked]:border-accent has-[:checked]:bg-accent/5">
                  <input type="radio" name="planId" value={p.id} defaultChecked={i === 0} required className="mt-1 h-4 w-4 accent-[rgb(var(--accent))]" />
                  <span className="flex-1 text-sm">
                    <span className="font-semibold">{p.name}</span>
                    {p.description && <span className="text-ink-soft"> — {p.description}</span>}
                    <span className="block text-xs text-ink-soft">{p.monthly} / mês · {p.yearly} / ano</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Ciclo de faturação">
            <select name="billingCycle" className="input" defaultValue="MONTHLY"><option value="MONTHLY">Mensal</option><option value="YEARLY">Anual</option></select>
          </Field>
          <fieldset>
            <legend className="label">Início</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex cursor-pointer items-center gap-3 rounded-btn border border-line p-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/5">
                <input type="radio" name="startMode" value="trial" checked={startMode === "trial"} onChange={() => setStartMode("trial")} className="h-4 w-4 accent-[rgb(var(--accent))]" />
                Período de teste
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-btn border border-line p-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/5">
                <input type="radio" name="startMode" value="active" checked={startMode === "active"} onChange={() => setStartMode("active")} className="h-4 w-4 accent-[rgb(var(--accent))]" />
                Ativar já (emite a 1.ª fatura)
              </label>
            </div>
          </fieldset>
          {startMode === "trial" && (
            <Field label="Dias de teste" hint="No fim do teste é emitida a primeira fatura.">
              <input name="trialDays" type="number" min={1} max={365} defaultValue={trialDays} className="input" required />
            </Field>
          )}
          <p className="rounded-btn bg-surface px-3 py-2.5 text-xs text-ink-soft">
            Ao confirmar, o sistema cria automaticamente a base de dados PostgreSQL da instituição, as tabelas, os cargos e a conta do diretor.
          </p>
        </div>

        {stepError && <p className="mt-3 text-sm font-medium text-red-600" role="alert">{stepError}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <button type="button" className={clsx("btn-ghost", step === 0 && "invisible")} onClick={() => { setStepError(""); setStep((s) => s - 1); }}>Voltar</button>
          {step < STEPS.length - 1
            ? <button type="button" className="btn-primary" onClick={next}>Continuar</button>
            : <Submit pendingText="A criar…">Criar creche</Submit>}
        </div>
      </ActionForm>
    </div>
  );
}
