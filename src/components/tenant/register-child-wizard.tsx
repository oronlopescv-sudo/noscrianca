"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionForm, Submit } from "@/components/ui/client";
import { Field } from "@/components/ui/kit";
import { createChildAction } from "@/server/people";
import { BrandBanner } from "@/components/tenant/brand-banner";

const PASSOS = ["Dados da Criança", "Dados dos Pais", "Informações de Saúde", "Informações Escolares", "Documentos", "Confirmação"] as const;

type Valores = {
  firstName: string; lastName: string; birthDate: string; gender: string; photoConsent: boolean;
  healthNotes: string; enrolledAt: string; classroomId: string; feePlanId: string;
};

/** Registo de criança em 6 passos. Os dados ficam todos no mesmo envio para o servidor. */
export function RegisterChildWizard({ slug, classrooms, feePlans, today, cancelHref }: {
  slug: string; classrooms: { id: string; name: string }[]; feePlans: { id: string; name: string; active: boolean }[];
  today: string; cancelHref: string;
}) {
  const [passo, setPasso] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  const [v, setV] = useState<Valores>({
    firstName: "", lastName: "", birthDate: "", gender: "", photoConsent: false,
    healthNotes: "", enrolledAt: today, classroomId: "", feePlanId: "",
  });
  const set = <K extends keyof Valores>(k: K, val: Valores[K]) => setV((p) => ({ ...p, [k]: val }));

  function seguinte() {
    if (passo === 0 && (!v.firstName.trim() || !v.lastName.trim() || !v.birthDate)) {
      setErro("Preencha o nome, o apelido e a data de nascimento.");
      return;
    }
    if (passo === 0 && v.birthDate > today) { setErro("A data de nascimento não pode ser futura."); return; }
    if (passo === 3 && !v.enrolledAt) { setErro("Indique a data de inscrição."); return; }
    setErro(null);
    setPasso((p) => Math.min(p + 1, PASSOS.length - 1));
  }

  const nomeTurma = classrooms.find((c) => c.id === v.classroomId)?.name ?? "Sem turma";
  const nomeMensalidade = feePlans.find((f) => f.id === v.feePlanId)?.name ?? "Sem mensalidade";

  return (
    <div className="space-y-5">
      <BrandBanner title="Registar Criança" subtitle="Preencha os dados para adicionar uma criança ao jardim de infância." />

      {/* Indicador de passos */}
      <ol className="flex flex-wrap justify-between gap-y-4 rounded-3xl bg-white px-4 py-5 shadow-sm sm:px-8">
        {PASSOS.map((nome, i) => {
          const feito = i < passo; const atual = i === passo;
          return (
            <li key={nome} className="flex min-w-[80px] flex-1 flex-col items-center text-center">
              <span className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold ${
                atual ? "border-[#1E63D6] bg-[#1E63D6] text-white" : feito ? "border-[#3DAE49] bg-[#3DAE49] text-white" : "border-slate-300 bg-white text-slate-400"}`}>
                {feito ? "✓" : i + 1}
              </span>
              <span className={`mt-2 text-[11px] font-semibold sm:text-xs ${atual ? "text-[#1E63D6]" : "text-slate-500"}`}>{nome}</span>
            </li>
          );
        })}
      </ol>

      <div>
      <ActionForm action={createChildAction} hidden={{ slug }} className="space-y-5" resetOnSuccess={false}>
        <input type="hidden" name="firstName" value={v.firstName} />
        <input type="hidden" name="lastName" value={v.lastName} />
        <input type="hidden" name="birthDate" value={v.birthDate} />
        <input type="hidden" name="gender" value={v.gender} />
        <input type="hidden" name="photoConsent" value={v.photoConsent ? "on" : ""} />
        <input type="hidden" name="healthNotes" value={v.healthNotes} />
        <input type="hidden" name="enrolledAt" value={v.enrolledAt} />
        <input type="hidden" name="classroomId" value={v.classroomId} />
        <input type="hidden" name="feePlanId" value={v.feePlanId} />

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          {/* Fotografia */}
          <section className="rounded-3xl bg-[#EAF2FD] p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-[#12307A]">📷 Fotografia da Criança</h2>
            <label className="flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#1E63D6]/40 bg-white p-4 text-center hover:bg-blue-50">
              {foto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={foto} alt="Pré-visualização da fotografia" className="h-44 w-44 rounded-2xl object-cover" />
              ) : (
                <>
                  <span className="text-5xl">📷</span>
                  <span className="font-bold text-[#12307A]">Adicionar fotografia</span>
                  <span className="text-xs text-slate-500">Clique para carregar uma fotografia</span>
                  <span className="mt-1 rounded-full bg-[#1E63D6] px-3 py-1 text-xs font-semibold text-white">JPG, PNG ou WEBP</span>
                </>
              )}
              <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; setFoto(f ? URL.createObjectURL(f) : null); }} />
            </label>
            <p className="mt-3 text-xs text-slate-500">A fotografia só aparece no diário e no site se a família autorizar.</p>
          </section>

          {/* Conteúdo do passo */}
          <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
            {passo === 0 && (
              <div className="space-y-4">
                <h2 className="flex items-center gap-2 text-lg font-bold text-[#12307A]">👤 Dados Pessoais</h2>
                <Field label="Nome próprio *"><input className="input" maxLength={80} value={v.firstName} onChange={(e) => set("firstName", e.target.value)} placeholder="Nome próprio" /></Field>
                <Field label="Apelido *"><input className="input" maxLength={80} value={v.lastName} onChange={(e) => set("lastName", e.target.value)} placeholder="Apelido" /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Data de nascimento *"><input type="date" className="input" max={today} value={v.birthDate} onChange={(e) => set("birthDate", e.target.value)} /></Field>
                  <Field label="Sexo">
                    <select className="input" value={v.gender} onChange={(e) => set("gender", e.target.value)}>
                      <option value="">Não indicado</option><option value="F">Feminino</option><option value="M">Masculino</option>
                    </select>
                  </Field>
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1 h-4 w-4" checked={v.photoConsent} onChange={(e) => set("photoConsent", e.target.checked)} />
                  <span>A família autoriza fotografias da criança no diário e na página da creche.</span>
                </label>
              </div>
            )}
            {passo === 1 && (
              <div className="space-y-3">
                <h2 className="flex items-center gap-2 text-lg font-bold text-[#12307A]">👪 Dados dos Pais</h2>
                <p className="text-sm text-slate-600">Os encarregados de educação associam-se à criança logo a seguir ao registo, no separador <span className="font-semibold">Família</span> da ficha.</p>
              </div>
            )}
            {passo === 2 && (
              <div className="space-y-3">
                <h2 className="flex items-center gap-2 text-lg font-bold text-[#12307A]">🩺 Informações de Saúde</h2>
                <Field label="Saúde e alergias" hint="Visível para a equipa da sala e para a direção">
                  <textarea className="input min-h-[140px]" maxLength={2000} value={v.healthNotes} onChange={(e) => set("healthNotes", e.target.value)} />
                </Field>
              </div>
            )}
            {passo === 3 && (
              <div className="space-y-4">
                <h2 className="flex items-center gap-2 text-lg font-bold text-[#12307A]">🏫 Informações Escolares</h2>
                <Field label="Data de inscrição *"><input type="date" className="input" value={v.enrolledAt} onChange={(e) => set("enrolledAt", e.target.value)} /></Field>
                <Field label="Turma">
                  <select className="input" value={v.classroomId} onChange={(e) => set("classroomId", e.target.value)}>
                    <option value="">Sem turma</option>
                    {classrooms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Mensalidade">
                  <select className="input" value={v.feePlanId} onChange={(e) => set("feePlanId", e.target.value)}>
                    <option value="">Sem mensalidade</option>
                    {feePlans.filter((f) => f.active).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </Field>
              </div>
            )}
            {passo === 4 && (
              <div className="space-y-3">
                <h2 className="flex items-center gap-2 text-lg font-bold text-[#12307A]">📄 Documentos</h2>
                <p className="text-sm text-slate-600">Certidão de nascimento, cartão de vacinas e outros documentos carregam-se na ficha da criança, depois do registo.</p>
              </div>
            )}
            {passo === 5 && (
              <div className="space-y-3">
                <h2 className="flex items-center gap-2 text-lg font-bold text-[#12307A]">✅ Confirmação</h2>
                <dl className="grid gap-x-6 gap-y-2 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
                  <dt className="text-slate-500">Nome</dt><dd className="font-semibold">{v.firstName} {v.lastName}</dd>
                  <dt className="text-slate-500">Data de nascimento</dt><dd className="font-semibold">{v.birthDate || "—"}</dd>
                  <dt className="text-slate-500">Sexo</dt><dd className="font-semibold">{v.gender === "F" ? "Feminino" : v.gender === "M" ? "Masculino" : "Não indicado"}</dd>
                  <dt className="text-slate-500">Turma</dt><dd className="font-semibold">{nomeTurma}</dd>
                  <dt className="text-slate-500">Mensalidade</dt><dd className="font-semibold">{nomeMensalidade}</dd>
                  <dt className="text-slate-500">Inscrição</dt><dd className="font-semibold">{v.enrolledAt || "—"}</dd>
                  <dt className="text-slate-500">Fotografia</dt><dd className="font-semibold">{foto ? "Escolhida" : "Não escolhida"}</dd>
                  <dt className="text-slate-500">Autorização de fotos</dt><dd className="font-semibold">{v.photoConsent ? "Sim" : "Não"}</dd>
                </dl>
              </div>
            )}

            {erro && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{erro}</p>}
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={cancelHref} className="rounded-full border-2 border-slate-300 bg-white px-6 py-3 font-semibold text-slate-600 hover:bg-slate-50">‹ Cancelar</Link>
          <div className="flex gap-3">
            {passo > 0 && (
              <button type="button" onClick={() => { setErro(null); setPasso((p) => p - 1); }}
                className="rounded-full border-2 border-[#1E63D6] bg-white px-6 py-3 font-semibold text-[#1E63D6] hover:bg-blue-50">Anterior</button>
            )}
            {passo < PASSOS.length - 1 ? (
              <button type="button" onClick={seguinte}
                className="rounded-full bg-[#1E63D6] px-8 py-3 font-bold text-white shadow-md hover:bg-[#12307A]">Seguinte ›</button>
            ) : (
              <Submit className="rounded-full bg-[#3DAE49] px-8 py-3 font-bold text-white shadow-md hover:bg-[#2f8c3a]">Inscrever criança</Submit>
            )}
          </div>
        </div>
      </ActionForm>
      </div>

      {/* Faixa de relva com os blocos ABC e os livros do desenho */}
      <div className="relative -mx-4 h-24 overflow-hidden rounded-b-3xl bg-[#C8E15D] sm:h-28">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/site/registo/base-esquerda.jpg" alt="" aria-hidden="true" className="pointer-events-none absolute bottom-0 left-2 h-24 w-auto sm:h-28" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/site/registo/base-direita.jpg" alt="" aria-hidden="true" className="pointer-events-none absolute bottom-0 right-2 h-20 w-auto sm:h-24" />
      </div>
    </div>
  );
}
