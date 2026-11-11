import type { ReactNode } from "react";
import { PanelShell } from "@/components/tenant/panel-shell";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function GuardianLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const ctx = await requireTenant((await params).slug, { panel: "GUARDIAN" });
  return <PanelShell ctx={ctx}>{children}</PanelShell>;
}
