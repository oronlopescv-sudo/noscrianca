import { StaffInbox } from "@/components/tenant/inbox";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function ManagementInbox({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireTenant((await params).slug, { permission: "messages.reply" });
  return <StaffInbox ctx={ctx} panelBase={`${ctx.base}/gestao/mensagens`} />;
}
