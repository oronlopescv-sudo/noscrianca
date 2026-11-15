import type { ReactNode } from "react";

/**
 * Cabeçalho ilustrado do NosCriança: céu azul claro, as crianças dos lados e o título em azul-marinho.
 * Usado no registo e no perfil da criança, para que os dois tenham o mesmo visual.
 */
export function BrandBanner({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <header className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#CDE8FC] to-[#E9F5FE] px-4 py-7 text-center text-[#12307A] shadow-sm sm:px-10 sm:py-9">
      {/* Crianças e nuvens do desenho (lado esquerdo e direito) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/site/registo/topo-esquerda.jpg" alt="" aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 h-28 w-auto sm:h-44 lg:h-52" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/site/registo/topo-direita.jpg" alt="" aria-hidden="true" className="pointer-events-none absolute bottom-0 right-0 h-28 w-auto sm:h-44 lg:h-52" />
      <div className="relative mx-auto max-w-2xl">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        <span aria-hidden="true" className="mx-auto mt-2 block h-1.5 w-32 rounded-full bg-[#F5B93A]" />
        {subtitle && <div className="mt-3 text-sm font-medium text-[#1E4FA3] sm:text-base">{subtitle}</div>}
        {children && <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{children}</div>}
      </div>
    </header>
  );
}
