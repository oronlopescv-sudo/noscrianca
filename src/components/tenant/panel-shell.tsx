import type { ReactNode } from "react";
import { BookOpen, Briefcase, CalendarCheck, CalendarDays, Baby, FileBarChart, Banknote, ClipboardList, History, Home, LayoutDashboard, Megaphone, MessageSquare, School, Settings, ShieldCheck, Users, Wallet, UserCog, Receipt, UserRound } from "lucide-react";
import { BottomNavShell, SidebarShell, type NavItem } from "@/components/shell";
import { Notice } from "@/components/ui/kit";
import { tenantLogoutAction } from "@/server/auth";
import { unreadNotifications, type TenantCtx } from "@/lib/tenant";

const ic = (node: ReactNode) => node;

export function managementNav(ctx: TenantCtx): NavItem[] {
  const b = ctx.base;
  const items: NavItem[] = [{ href: `${b}/gestao`, label: "Painel", icon: ic(<LayoutDashboard size={18} />), exact: true, section: "Dia a dia" }];
  const add = (ok: boolean, href: string, label: string, icon: ReactNode, section: string) => { if (ok) items.push({ href, label, icon, section }); };
  // O que se usa todos os dias fica no topo; o resto agrupa com nome do assunto.
  add(ctx.can("children.view"), `${b}/gestao/criancas`, "Crianças", ic(<Baby size={18} />), "Dia a dia");
  add(ctx.can("attendance.view"), `${b}/gestao/presencas`, "Presenças", ic(<CalendarCheck size={18} />), "Dia a dia");
  add(ctx.can("messages.reply"), `${b}/gestao/mensagens`, "Mensagens", ic(<MessageSquare size={18} />), "Dia a dia");
  add(ctx.can("finance.view"), `${b}/gestao/mensalidades`, "Mensalidades", ic(<Wallet size={18} />), "Dia a dia");
  add(ctx.can("announcements.manage"), `${b}/gestao/comunicados`, "Comunicados", ic(<Megaphone size={18} />), "Dia a dia");
  add(ctx.can("announcements.manage"), `${b}/gestao/agenda`, "Agenda", ic(<CalendarDays size={18} />), "Dia a dia");
  add(ctx.can("children.view"), `${b}/gestao/encarregados`, "Encarregados", ic(<Users size={18} />), "Famílias");
  add(ctx.can("children.manage"), `${b}/gestao/inscricoes`, "Pedidos de vaga", ic(<ClipboardList size={18} />), "Famílias");
  add(ctx.can("children.view") && ctx.can("classrooms.manage"), `${b}/gestao/turmas`, "Turmas e salas", ic(<School size={18} />), "Famílias");
  add(ctx.can("employees.manage"), `${b}/gestao/funcionarios`, "Funcionários", ic(<Briefcase size={18} />), "Equipa");
  add(ctx.can("roles.manage"), `${b}/gestao/cargos`, "Cargos e permissões", ic(<UserCog size={18} />), "Equipa");
  add(ctx.can("attendance.view") || ctx.can("finance.view"), `${b}/gestao/calendario`, "Calendário do mês", ic(<ClipboardList size={18} />), "Financeiro");
  add(ctx.can("payroll.manage"), `${b}/gestao/salarios`, "Salários", ic(<Banknote size={18} />), "Financeiro");
  add(ctx.can("reports.view"), `${b}/gestao/relatorios`, "Relatórios", ic(<FileBarChart size={18} />), "Financeiro");
  add(ctx.can("settings.manage"), `${b}/gestao/definicoes`, "Definições da instituição", ic(<Settings size={18} />), "Sistema");
  add(ctx.can("audit.view"), `${b}/gestao/auditoria`, "Auditoria", ic(<History size={18} />), "Sistema");
  return items;
}

export function classroomNav(ctx: TenantCtx): NavItem[] {
  const b = ctx.base;
  const items: NavItem[] = [{ href: `${b}/sala`, label: "Presenças", icon: ic(<CalendarCheck size={20} />), exact: true }];
  if (ctx.can("diary.record") || ctx.can("diary.view")) items.push({ href: `${b}/sala/diario`, label: "Diário", icon: ic(<BookOpen size={20} />) });
  if (ctx.can("messages.reply")) items.push({ href: `${b}/sala/mensagens`, label: "Mensagens", icon: ic(<MessageSquare size={20} />) });
  if (ctx.can("announcements.manage") || ctx.can("messages.reply")) items.push({ href: `${b}/sala/comunicados`, label: "Comunicados", icon: ic(<Megaphone size={20} />) });
  items.push({ href: `${b}/perfil`, label: "Perfil", icon: ic(<UserRound size={20} />) });
  return items;
}

export function guardianNav(ctx: TenantCtx): NavItem[] {
  const b = ctx.base;
  return [
    { href: `${b}/pais`, label: "Início", icon: ic(<Home size={20} />), exact: true },
    { href: `${b}/pais/comunicados`, label: "Avisos", icon: ic(<Megaphone size={20} />) },
    { href: `${b}/pais/mensagens`, label: "Mensagens", icon: ic(<MessageSquare size={20} />) },
    { href: `${b}/pais/financeiro`, label: "Pagamentos", icon: ic(<Receipt size={20} />) },
    { href: `${b}/perfil`, label: "Perfil", icon: ic(<ShieldCheck size={20} />) },
  ];
}

/** Escolhe o shell (gestão = sidebar; sala e pais = navegação inferior) conforme o painel do utilizador. */
export async function PanelShell({ ctx, children, wide }: { ctx: TenantCtx; children: ReactNode; wide?: boolean }) {
  const slug = ctx.institution.slug;
  const logoSrc = ctx.settings.logoPath ? `${ctx.base}/logo?v=${encodeURIComponent(ctx.settings.logoPath.slice(-24))}` : null;
  const unread = await unreadNotifications(ctx);
  const logout = tenantLogoutAction.bind(null, slug);
  const banner = ctx.readOnly ? (
    <div className="mx-auto max-w-7xl px-4 pt-4 lg:px-8"><Notice tone="red">Instituição suspensa: apenas consulta é permitida até regularizar a situação.</Notice></div>
  ) : null;
  const role = ctx.isDirector ? "Diretor(a)" : ctx.isGuardian ? "Encarregado de educação" : ctx.role?.name ?? "Funcionário";

  if (ctx.panel === "GUARDIAN") {
    return (
      <BottomNavShell title={ctx.settings.name} subtitle="Portal dos pais" logoSrc={logoSrc} nav={guardianNav(ctx)} logout={logout} notificationsHref={`${ctx.base}/perfil`} unread={unread} banner={banner}>
        {children}
      </BottomNavShell>
    );
  }
  if (ctx.panel === "CLASSROOM") {
    return (
      <BottomNavShell wide title={ctx.settings.name} subtitle={`Sala · ${ctx.user.name}`} logoSrc={logoSrc} nav={classroomNav(ctx)} logout={logout} notificationsHref={`${ctx.base}/perfil`} unread={unread} banner={banner}>
        {children}
      </BottomNavShell>
    );
  }
  return (
    <SidebarShell brand={ctx.settings.name} brandSub="Gestão" logoSrc={logoSrc} nav={managementNav(ctx)} userName={ctx.user.name} userRole={role} logout={logout} profileHref={`${ctx.base}/perfil`} notificationsHref={`${ctx.base}/perfil`} unread={unread} banner={banner}>
      {children}
    </SidebarShell>
  );
}
