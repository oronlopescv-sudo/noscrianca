import { redirect } from "next/navigation";
import { panelHome, requireTenant } from "@/lib/tenant";

export default async function TenantIndex({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireTenant((await params).slug);
  redirect(panelHome(ctx));
}
