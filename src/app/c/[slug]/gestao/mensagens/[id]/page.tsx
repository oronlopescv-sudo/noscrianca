import { StaffThread } from "@/components/tenant/inbox";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function ManagementThread({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await requireTenant(slug, { permission: "messages.reply" });
  return <StaffThread ctx={ctx} guardianId={id} panelBase={`${ctx.base}/gestao/mensagens`} />;
}
