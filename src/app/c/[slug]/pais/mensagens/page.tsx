import { asc, eq, and, isNull } from "drizzle-orm";
import { t } from "@/db/tenant";
import { Thread } from "@/components/tenant/thread";
import { PageHeader } from "@/components/ui/kit";
import { requireTenant } from "@/lib/tenant";
import { guardianChildIds } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function GuardianMessages({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireTenant((await params).slug, { panel: "GUARDIAN" });
  const hasChildren = (await guardianChildIds(ctx)).length > 0;
  let msgs: { id: string; fromGuardian: boolean; senderName: string; body: string; createdAt: Date }[] = [];
  if (ctx.guardianId) {
    await ctx.db.update(t.messages).set({ readAt: new Date() }).where(and(eq(t.messages.guardianId, ctx.guardianId), eq(t.messages.fromGuardian, false), isNull(t.messages.readAt)));
    msgs = await ctx.db.query.messages.findMany({ where: eq(t.messages.guardianId, ctx.guardianId), orderBy: [asc(t.messages.createdAt)], limit: 300 });
  }
  return (
    <>
      <PageHeader title="Mensagens" subtitle="Fale diretamente com a instituição" />
      <Thread slug={ctx.institution.slug} messages={msgs} viewer="guardian" guardianId={ctx.guardianId ?? undefined} timezone={ctx.settings.timezone} canSend={hasChildren && !ctx.readOnly} />
      {!hasChildren && <p className="mt-3 text-sm text-ink-soft">Só poderá enviar mensagens depois de a instituição associar uma criança à sua conta.</p>}
    </>
  );
}
