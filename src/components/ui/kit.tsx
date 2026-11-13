import Link from "next/link";
import type { ReactNode } from "react";
import clsx from "clsx";
import { initials } from "@/lib/format";

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && <Link href={back.href} className="mb-1 inline-block text-[13px] font-medium text-ink-soft hover:text-accent">← {back.label}</Link>}
        <h1 className="truncate text-xl sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={clsx("card", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-3 sm:px-5">
          <h2 className="min-w-0 text-[15px]">{title}</h2>
          {actions && <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={pad ? "card-pad" : undefined}>{children}</div>
    </section>
  );
}

const TONES = {
  gray: "bg-gray-100 text-gray-700",
  green: "bg-emerald-100 text-emerald-800",
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-800",
  blue: "bg-blue-100 text-blue-700",
  purple: "bg-purple-100 text-purple-700",
  accent: "bg-accent/10 text-accent",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={clsx("badge", TONES[tone])}>{children}</span>;
}

export function Avatar({ name, src, size = 40, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.max(11, size * 0.36) };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} style={style} className={clsx("shrink-0 rounded-full object-cover", className)} />;
  }
  return (
    <span style={style} className={clsx("inline-flex shrink-0 items-center justify-center rounded-full bg-navy/10 font-semibold text-navy", className)} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      {icon && <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-ink-soft">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, icon, tone = "accent" }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: Tone }) {
  return (
    <div className="card card-pad flex items-start gap-3">
      {icon && <span className={clsx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", TONES[tone])}>{icon}</span>}
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink-soft">{label}</p>
        <p className="break-words text-lg font-semibold leading-tight sm:text-xl">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-ink-soft">{hint}</p>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint block">{hint}</span>}
    </label>
  );
}

export function Check({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-start gap-3 py-2">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-5 w-5 shrink-0 rounded border-line accent-[rgb(var(--accent))]" />
      <span className="text-sm">
        {label}
        {hint && <span className="hint block">{hint}</span>}
      </span>
    </label>
  );
}

export function Tabs({ tabs, current }: { tabs: { key: string; label: string; href: string }[]; current: string }) {
  return (
    <div className="no-print mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((tab) => (
        <Link
          key={tab.key} href={tab.href} scroll={false}
          className={clsx("whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium", current === tab.key ? "border-accent text-accent" : "border-transparent text-ink-soft hover:text-ink")}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

export function Notice({ tone = "amber", children }: { tone?: "amber" | "red" | "blue" | "green"; children: ReactNode }) {
  const map = { amber: "border-amber-200 bg-amber-50 text-amber-900", red: "border-red-200 bg-red-50 text-red-800", blue: "border-blue-200 bg-blue-50 text-blue-900", green: "border-emerald-200 bg-emerald-50 text-emerald-900" };
  return <div className={clsx("rounded-btn border px-4 py-3 text-sm", map[tone])} role="status">{children}</div>;
}

export function DL({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs font-medium text-ink-soft">{k}</dt>
          <dd className="mt-0.5 break-words text-sm">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
