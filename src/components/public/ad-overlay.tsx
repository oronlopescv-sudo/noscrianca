"use client";

import { useEffect, useState } from "react";

const SEGUNDOS = 5;

/**
 * Anúncio da creche: aparece ao abrir a página e fecha sozinho ao fim de 5 segundos.
 * Só aparece uma vez por sessão do navegador (não volta a cada página); pode fechar antes.
 */
export function AdOverlay({ slug, title, text, link }: { slug: string; title: string; text: string; link: string }) {
  const chave = `anuncio-visto:${slug}`;
  const [aberto, setAberto] = useState(false);
  const [restam, setRestam] = useState(SEGUNDOS);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(chave) === "1") return;
      sessionStorage.setItem(chave, "1");
    } catch {
      // sem sessionStorage (modo privado, por exemplo): mostra sempre
    }
    setAberto(true);
    const inicio = Date.now();
    const id = setInterval(() => {
      const passados = Math.floor((Date.now() - inicio) / 1000);
      const r = Math.max(0, SEGUNDOS - passados);
      setRestam(r);
      if (r === 0) { clearInterval(id); setAberto(false); }
    }, 200);
    return () => clearInterval(id);
  }, [chave]);

  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aberto]);

  if (!aberto) return null;
  const progresso = ((SEGUNDOS - restam) / SEGUNDOS) * 100;

  return (
    <div role="dialog" aria-modal="true" aria-label="Anúncio" className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="h-1.5 bg-slate-200"><div className="h-full bg-[#F26A1B] transition-[width] duration-200" style={{ width: `${progresso}%` }} /></div>
        <button type="button" onClick={() => setAberto(false)} aria-label="Fechar anúncio"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-600 hover:bg-slate-200">×</button>
        <div className="p-6 pt-8">
          {title && <p className="display text-xl font-bold text-[#12307A]">{title}</p>}
          {text && <p className="mt-2 whitespace-pre-wrap text-slate-700">{text}</p>}
          <div className="mt-5 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">Fecha em {restam} s</span>
            {link && <a href={link} target="_blank" rel="noopener noreferrer" className="rounded-full bg-[#1E63D6] px-5 py-2 text-sm font-bold text-white">Saber mais</a>}
          </div>
        </div>
      </div>
    </div>
  );
}
