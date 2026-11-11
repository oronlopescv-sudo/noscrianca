import Link from "next/link";
import { Bell } from "lucide-react";
import { ActionButton, ActionForm, Submit } from "@/components/ui/client";
import { Card, EmptyState, Field } from "@/components/ui/kit";
import { fmtDateTime } from "@/lib/format";
import type { TenantCtx } from "@/lib/tenant";
import { t } from "@/db/tenant";
import { desc, eq } from "drizzle-orm";
import { changePasswordAction, markNotificationsReadAction, updateProfileAction } from "@/server/auth";

export function ProfileForms({ ctx }: { ctx: TenantCtx }) {
  const slug = ctx.institution.slug;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Os meus dados">
        <ActionForm action={updateProfileAction} hidden={{ slug }} resetOnSuccess={false} className="space-y-4">
          <Field label="Nome"><input name="name" className="input" required minLength={2} maxLength={120} defaultValue={ctx.user.name} autoComplete="name" /></Field>
          <Field label="Email" hint="O email é o seu identificador de acesso. Para o alterar, contacte a direção."><input className="input" value={ctx.user.email} disabled readOnly /></Field>
          <Field label="Telefone"><input name="phone" type="tel" className="input" maxLength={40} defaultValue={ctx.user.phone} autoComplete="tel" /></Field>
          <div className="flex justify-end"><Submit>Guardar</Submit></div>
        </ActionForm>
      </Card>
      <Card title="Palavra-passe">
        {ctx.impersonating ? <p className="text-sm text-ink-soft">Indisponível numa sessão de suporte.</p> : (
          <ActionForm action={changePasswordAction} hidden={{ slug }} className="space-y-4">
            <Field label="Palavra-passe atual"><input name="current" type="password" className="input" required autoComplete="current-password" /></Field>
            <Field label="Nova palavra-passe" hint="Mínimo 8 caracteres, com letras e números"><input name="password" type="password" className="input" required minLength={8} autoComplete="new-password" /></Field>
            <Field label="Confirmar nova palavra-passe"><input name="confirm" type="password" className="input" required minLength={8} autoComplete="new-password" /></Field>
            <div className="flex justify-end"><Submit>Alterar palavra-passe</Submit></div>
          </ActionForm>
        )}
      </Card>
    </div>
  );
}

export async function NotificationsList({ ctx }: { ctx: TenantCtx }) {
  const rows = await ctx.db.query.notifications.findMany({ where: eq(t.notifications.userId, ctx.user.id), orderBy: desc(t.notifications.createdAt), limit: 60 });
  const unread = rows.some((r) => !r.readAt);
  return (
    <Card title="Notificações" pad={false} actions={unread ? <ActionButton action={markNotificationsReadAction} hidden={{ slug: ctx.institution.slug }}>Marcar todas como lidas</ActionButton> : undefined}>
      {rows.length === 0 ? <EmptyState icon={<Bell size={24} />} title="Sem notificações" text="Os avisos de comunicados, mensagens e pagamentos aparecem aqui." /> : (
        <ul className="divide-y divide-line/70">
          {rows.map((n) => {
            const inner = (
              <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${n.readAt ? "bg-line" : "bg-accent"}`} aria-label={n.readAt ? "Lida" : "Por ler"} />
                <div className="min-w-0">
                  <p className={`text-sm ${n.readAt ? "" : "font-semibold"}`}>{n.title}</p>
                  {n.body && <p className="mt-0.5 break-words text-sm text-ink-soft">{n.body}</p>}
                  <p className="mt-1 text-xs text-ink-soft">{fmtDateTime(n.createdAt, ctx.settings.timezone)}</p>
                </div>
              </div>
            );
            return <li key={n.id}>{n.href ? <Link href={n.href} className="block hover:bg-surface">{inner}</Link> : inner}</li>;
          })}
        </ul>
      )}
    </Card>
  );
}
