"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type CartaoCreche = {
  slug: string;
  name: string;
  city: string;
  coverSrc: string | null;
  logoSrc: string | null;
  inicial: string;
  cor: string;
};

const NAVY = "#1B2333";
const BLUE = "#1E4FA3";
const ORANGE = "#F0714F";

/** Pesquisa por nome ou localização. Filtra no cliente, sem novo pedido ao servidor. */
export function CrecheSearch({ items }: { items: CartaoCreche[] }) {
  const [q, setQ] = useState("");
  const visiveis = useMemo(() => {
    const termo = q.trim().toLowerCase();
    if (!termo) return items;
    return items.filter((i) => `${i.name} ${i.city}`.toLowerCase().includes(termo));
  }, [items, q]);

  return (
    <>
      <form role="search" onSubmit={(e) => e.preventDefault()} className="-mt-7 mx-4 flex items-center gap-2 rounded-full bg-white p-2 pl-5 shadow-lg">
        <span aria-hidden className="text-slate-400">⌕</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Pesquise por nome da creche ou localização…"
          aria-label="Pesquisar creche"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        <button type="submit" className="rounded-full px-5 py-2 text-sm font-semibold text-white" style={{ backgroundColor: ORANGE }}>Pesquisar</button>
      </form>

      <div className="mt-8 flex items-center justify-between px-5">
        <h2 className="flex items-center gap-2 text-lg font-bold" style={{ color: BLUE }}>
          <span aria-hidden>⌂</span> Creches Disponíveis
        </h2>
        <a href="#creches" className="text-sm font-semibold" style={{ color: BLUE }}>Ver todas →</a>
      </div>

      <ul id="creches" className="mt-4 space-y-5 px-4 pb-6">
        {visiveis.length === 0 && (
          <li className="rounded-2xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm">Nenhuma creche corresponde à pesquisa.</li>
        )}
        {visiveis.map((i) => (
          <li key={i.slug} className="overflow-hidden rounded-2xl bg-white shadow-md">
            <div className="flex gap-4 p-3">
              <div className="relative h-28 w-32 shrink-0 overflow-hidden rounded-xl" style={{ backgroundColor: i.cor }}>
                {i.coverSrc
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={i.coverSrc} alt={`Capa de ${i.name}`} className="h-full w-full object-cover" />
                  : (
                    <span className="flex h-full w-full items-center justify-center text-3xl font-bold text-white" aria-hidden>{i.inicial}</span>
                  )}
              </div>
              <div className="min-w-0 flex-1 py-1">
                <h3 className="truncate text-base font-bold" style={{ color: NAVY }}>{i.name}</h3>
                {i.city && <p className="mt-1 text-sm text-slate-500">📍 {i.city}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/creche/${i.slug}`} className="rounded-full border px-4 py-1.5 text-sm font-semibold" style={{ borderColor: BLUE, color: BLUE }}>Conhecer</Link>
                  <Link href={`/c/${i.slug}/entrar`} className="rounded-full px-4 py-1.5 text-sm font-semibold text-white" style={{ backgroundColor: ORANGE }}>Entrar</Link>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
