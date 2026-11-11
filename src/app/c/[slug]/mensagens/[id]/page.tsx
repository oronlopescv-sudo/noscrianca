import { redirect } from "next/navigation";
import { panelHome, requireTenant } from "@/lib/tenant";

/** Atalho neutro usado nas notificações: leva à conversa no painel do utilizador. */
export default async function MessageShortcut({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await requireTenant(slug);
  redirect(ctx.isGuardian ? `${panelHome(ctx)}/mensagens` : `${panelHome(ctx)}/mensagens/${id}`);
}
