"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Bell, LogOut, Menu, X } from "lucide-react";
import { Avatar } from "@/components/ui/kit";
import { ToastProvider } from "@/components/ui/client";

export type NavItem = { href: string; label: string; icon: ReactNode; exact?: boolean; section?: string };

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
}

type ShellProps = {
  brand: string; brandSub?: string; logoSrc?: string | null; nav: NavItem[];
  userName: string; userRole: string; logout: () => Promise<void>;
  notificationsHref?: string; unread?: number; profileHref?: string;
  banner?: ReactNode; children: ReactNode;
};

/** Layout de gestão: sidebar navy fixa no desktop, gaveta no telemóvel. */
export function SidebarShell(p: ShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const sidebar = (
    <div className="flex h-full flex-col bg-[#1E4FA3] text-blue-100">
      <div className="flex items-center gap-3 px-5 py-5">
        {p.logoSrc
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={p.logoSrc} alt="" className="h-10 w-10 rounded-xl bg-white object-cover" />
          : <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-base font-bold text-white">{p.brand.slice(0, 1).toUpperCase()}</span>}
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-white">{p.brand}</p>
          {p.brandSub && <p className="truncate text-xs text-navy-text/70">{p.brandSub}</p>}
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4" aria-label="Menu principal">
        {p.nav.map((item, i) => {
          const active = isActive(pathname, item);
          const showSection = item.section && item.section !== p.nav[i - 1]?.section;
          return (
            <div key={item.href}>
              {showSection && <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-navy-text/50">{item.section}</p>}
              <Link
                href={item.href} aria-current={active ? "page" : undefined}
                className={clsx("flex min-h-[42px] items-center gap-3 rounded-btn px-3 text-sm font-medium transition", active ? "bg-accent text-white" : "hover:bg-navy-light hover:text-white")}
              >
                <span className="shrink-0">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </Link>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        <Link href={p.profileHref ?? "#"} className="flex items-center gap-3 rounded-btn px-2 py-2 hover:bg-navy-light">
          <Avatar name={p.userName} size={36} className="!bg-white/15 !text-white" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{p.userName}</p>
            <p className="truncate text-xs text-navy-text/70">{p.userRole}</p>
          </div>
        </Link>
        <form action={p.logout}>
          <button type="submit" className="mt-1 flex min-h-[42px] w-full items-center gap-3 rounded-btn px-3 text-sm font-medium hover:bg-navy-light hover:text-white">
            <LogOut size={18} /> Terminar sessão
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <ToastProvider>
      <div className="min-h-dvh lg:pl-64">
        <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">{sidebar}</aside>
        {open && (
          <div className="no-print fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-navy/60" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-xl">{sidebar}</aside>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar menu" className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white"><X size={22} /></button>
          </div>
        )}
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur lg:px-8">
          <button type="button" onClick={() => setOpen(true)} aria-label="Abrir menu" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-surface lg:hidden"><Menu size={22} /></button>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold lg:hidden">{p.brand}</p>
          <div className="hidden flex-1 lg:block" />
          {p.notificationsHref && (
            <Link href={p.notificationsHref} aria-label={`Notificações${p.unread ? ` (${p.unread} por ler)` : ""}`} className="relative flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-surface">
              <Bell size={20} />
              {!!p.unread && <span className="absolute right-1.5 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">{p.unread > 9 ? "9+" : p.unread}</span>}
            </Link>
          )}
        </header>
        {p.banner}
        <main className="mx-auto w-full max-w-7xl px-4 py-5 lg:px-8 lg:py-7">{p.children}</main>
      </div>
    </ToastProvider>
  );
}

type MobileProps = {
  title: string; subtitle?: string; logoSrc?: string | null; nav: NavItem[];
  logout: () => Promise<void>; notificationsHref?: string; unread?: number;
  banner?: ReactNode; children: ReactNode; wide?: boolean;
};

/** Layout de sala (tablet) e portal dos pais (telemóvel): cabeçalho simples + bottom nav. */
export function BottomNavShell(p: MobileProps) {
  const pathname = usePathname();
  return (
    <ToastProvider>
      <div className="min-h-dvh pb-24">
        <header className="no-print sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
          <div className={clsx("mx-auto flex h-14 items-center gap-3 px-4", p.wide ? "max-w-5xl" : "max-w-2xl")}>
            {p.logoSrc
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={p.logoSrc} alt="" className="h-9 w-9 rounded-xl object-cover" />
              : <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-sm font-bold text-white">{p.title.slice(0, 1).toUpperCase()}</span>}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{p.title}</p>
              {p.subtitle && <p className="truncate text-xs text-ink-soft">{p.subtitle}</p>}
            </div>
            {p.notificationsHref && (
              <Link href={p.notificationsHref} aria-label={`Notificações${p.unread ? ` (${p.unread} por ler)` : ""}`} className="relative flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface">
                <Bell size={20} />
                {!!p.unread && <span className="absolute right-1.5 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">{p.unread > 9 ? "9+" : p.unread}</span>}
              </Link>
            )}
            <form action={p.logout}>
              <button type="submit" aria-label="Terminar sessão" className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-surface"><LogOut size={19} /></button>
            </form>
          </div>
        </header>
        {p.banner}
        <main className={clsx("mx-auto w-full px-4 py-5", p.wide ? "max-w-5xl" : "max-w-2xl")}>{p.children}</main>
        <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]" aria-label="Navegação">
          <div className={clsx("mx-auto flex", p.wide ? "max-w-5xl" : "max-w-2xl")}>
            {p.nav.map((item) => {
              const active = isActive(pathname, item);
              return (
                <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
                  className={clsx("flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-accent" : "text-ink-soft")}>
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </ToastProvider>
  );
}

/** Para páginas públicas e de autenticação (precisam de toasts mas não de menu). */
export function PlainShell({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
