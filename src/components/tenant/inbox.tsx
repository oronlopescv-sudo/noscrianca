import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { t } from "@/db/tenant";
import { Thread } from "@/components/tenant/thread";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui/kit";
import { fmtDateTime } from "@/lib/format";
import { staffCanSeeGuardian, type TenantCtx } from "@/lib/tenant";

/** Lista de conversas com encarregados para a equipa (gestão ou sala), respeitando as turmas atribuídas. */
export async function StaffInbox({ ctx, panelBase }: { ctx: TenantCtx; panelBase: string }) {
  const all = await ctx.db.query.guardians.findMany({ with: { user: true, messages: { orderBy: (m, { desc }) => desc(m.createdAt), limit: 1 } } });
  const visible: { id: string; name: string; last?: { body: string; createdAt: Date; fromGuardian: boolean }; unread: number; hasMessages: boolean }[] = [];
  for (const g of all) {
    if (!(await staffCanSeeGuardian(ctx, g.id))) continue;
    const unreadRows = await ctx.db.select({ id: t.messages.id }).from(t.messages)
      .where(and(eq(t.messages.guardianId, g.id), eq(t.messages.fromGuardian, true), isNull(t.messages.readAt))).limit(1);
    const last = g.messages[0];
    visible.push({ id: g.id, name: g.user.name, last, unread: unreadRows.length, hasMessages: !!last });
  }
  visible.sort((a, b) => Number(b.unread > 0) - Number(a.unread > 0) || (b.last?.createdAt.getTime() ?? 0) - (a.last?.createdAt.getTime() ?? 0));
  return (
    <>
      <PageHeader title="Mensagens" subtitle="Conversas com os encarregados" />
      {visible.length === 0 ? <EmptyState title="Sem conversas" text="As mensagens dos encarregados das suas turmas aparecem aqui." /> : (
        <Card pad={false}>
          <ul className="divide-y divide-line">
            {visible.map((v) => (
              <li key={v.id}>
                <Link href={`${panelBase}/${v.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface sm:px-5">
                  <Avatar name={v.name} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate font-medium">{v.name}{v.unread > 0 && <Badge tone="accent">Nova</Badge>}</p>
                    <p className="truncate text-sm text-ink-soft">{v.last ? v.last.body : "Sem mensagens"}</p>
                  </div>
                  {v.last && <span className="hidden shrink-0 text-xs text-ink-soft sm:block">{fmtDateTime(v.last.createdAt, ctx.settings.timezone)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

/** Conversa aberta pela equipa com um encarregado. Marca as mensagens recebidas como lidas. */
export async function StaffThread({ ctx, guardianId, panelBase }: { ctx: TenantCtx; guardianId: string; panelBase: string }) {
  const g = await ctx.db.query.guardians.findFirst({
    where: eq(t.guardians.id, guardianId),
    with: { user: true, children: { with: { child: true } } },
  });
  if (!g || !(await staffCanSeeGuardian(ctx, g.id))) return <EmptyState title="Conversa não encontrada" text="Não tem acesso a esta conversa." />;
  await ctx.db.update(t.messages).set({ readAt: new Date() }).where(and(eq(t.messages.guardianId, g.id), eq(t.messages.fromGuardian, true), isNull(t.messages.readAt)));
  const msgs = await ctx.db.query.messages.findMany({ where: eq(t.messages.guardianId, g.id), orderBy: [asc(t.messages.createdAt)], limit: 300 });
  const kids = g.children.map((c) => `${c.child.firstName} ${c.child.lastName}`).join(", ");
  return (
    <>
      <PageHeader back={{ href: panelBase, label: "Mensagens" }} title={g.user.name} subtitle={kids || "Sem crianças associadas"} />
      <Thread slug={ctx.institution.slug} messages={msgs} viewer="staff" guardianId={g.id} timezone={ctx.settings.timezone} canSend={ctx.can("messages.reply") && !ctx.readOnly} />
    </>
  );
}
