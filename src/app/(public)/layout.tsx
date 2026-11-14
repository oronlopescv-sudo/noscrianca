import Link from "next/link";
import type { ReactNode } from "react";
import { PlainShell } from "@/components/shell";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <PlainShell>
      <header className="bg-navy text-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" className="group flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-base font-bold text-white">N</span>
            <span className="display text-lg leading-none">NosCriança</span>
            <span className="pontos-cores hidden items-center sm:inline-flex" aria-hidden>
              {["#5DC98A", "#F0714F", "#5B8DEF", "#F5B93A", "#A77BDB"].map((c) => <i key={c} style={{ backgroundColor: c, height: 6, width: 6 }} />)}
            </span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/#creches" className="btn btn-sm border border-white/25 text-white hover:bg-white/10">Entrar</Link>
            <Link href="/pedir-adesao" className="btn-primary btn-sm hidden sm:inline-flex">Pedir adesão</Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-7 text-sm text-ink-soft sm:flex-row">
          <p className="flex items-center gap-2.5">
            <span className="pontos-cores" aria-hidden>
              {["#5DC98A", "#F0714F", "#5B8DEF", "#F5B93A", "#A77BDB"].map((c) => <i key={c} style={{ backgroundColor: c }} />)}
            </span>
            NosCriança — Gestão de creches e jardins de infância
          </p>
          <div className="flex gap-4">
            <Link href="/#creches" className="hover:text-accent">Entrar</Link>
            <Link href="/pedir-adesao" className="hover:text-accent">Pedir adesão</Link>
            <Link href="/admin" className="hover:text-accent">Administração</Link>
          </div>
        </div>
      </footer>
    </PlainShell>
  );
}
