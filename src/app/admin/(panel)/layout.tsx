import type { ReactNode } from "react";
import { count, eq } from "drizzle-orm";
import { Building2, DatabaseBackup, FileText, History, Inbox, LayoutDashboard, Layers, Settings } from "lucide-react";
import { SidebarShell, type NavItem } from "@/components/shell";
import { central, c } from "@/db/central";
import { getPlatformSettings, requirePlatform } from "@/lib/platform";
import { adminLogoutAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requirePlatform();
  const settings = await getPlatformSettings();
  const [{ n: pending }] = await central().select({ n: count() }).from(c.signupRequests).where(eq(c.signupRequests.status, "PENDING"));
  const nav: NavItem[] = [
    { href: "/admin", label: "Painel", icon: <LayoutDashboard size={18} />, exact: true },
    { href: "/admin/instituicoes", label: "Instituições", icon: <Building2 size={18} /> },
    { href: "/admin/pedidos", label: `Pedidos de adesão${pending ? ` (${pending})` : ""}`, icon: <Inbox size={18} /> },
    { href: "/admin/planos", label: "Planos", icon: <Layers size={18} />, section: "Faturação" },
    { href: "/admin/faturas", label: "Faturas", icon: <FileText size={18} />, section: "Faturação" },
    { href: "/admin/backups", label: "Backups e BDs", icon: <DatabaseBackup size={18} />, section: "Sistema" },
    { href: "/admin/auditoria", label: "Auditoria", icon: <History size={18} />, section: "Sistema" },
    { href: "/admin/definicoes", label: "Definições", icon: <Settings size={18} />, section: "Sistema" },
  ];
  return (
    <SidebarShell brand={settings.saasName} brandSub="Painel da plataforma" nav={nav} userName={user.name} userRole="Super Administrador" logout={adminLogoutAction} profileHref="/admin/definicoes">
      {children}
    </SidebarShell>
  );
}
