import type { ReactNode } from "react";
import { PlainShell } from "@/components/shell";

export function AuthCard({ name, logoSrc, title, subtitle, children, footer }: { name: string; logoSrc: string | null; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <PlainShell>
      <main className="flex min-h-dvh items-center justify-center bg-navy px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-5 flex flex-col items-center text-center text-white">
            {logoSrc
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={logoSrc} alt="" className="h-16 w-16 rounded-2xl bg-white object-cover" />
              : <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-2xl font-bold">{name.slice(0, 1).toUpperCase()}</span>}
            <p className="mt-3 text-lg font-semibold">{name}</p>
          </div>
          <div className="rounded-card bg-white p-6 shadow-xl">
            <h1 className="text-xl">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
            <div className="mt-5">{children}</div>
          </div>
          {footer && <div className="mt-4 text-center text-sm text-navy-text">{footer}</div>}
        </div>
      </main>
    </PlainShell>
  );
}
