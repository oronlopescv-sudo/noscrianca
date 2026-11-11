import { ActionForm, ConfirmAction, FormFooter, Modal, Submit } from "@/components/ui/client";
import { Badge, Card, Field, PageHeader } from "@/components/ui/kit";
import { central } from "@/db/central";
import { fmtDateTime } from "@/lib/format";
import { getPlatformSettings, requirePlatform } from "@/lib/platform";
import { addAdminAction, changeAdminPasswordAction, savePlatformSettingsAction, toggleAdminAction } from "../../actions";

export const metadata = { title: "Definições" };

export default async function PlatformSettingsPage() {
  const me = await requirePlatform();
  const s = await getPlatformSettings();
  const admins = await central().query.platformUsers.findMany({ orderBy: (u, { asc }) => asc(u.createdAt) });
  return (
    <>
      <PageHeader title="Definições" subtitle="Dados da plataforma, faturação e contas de administração" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Plataforma e faturação">
          <ActionForm action={savePlatformSettingsAction} resetOnSuccess={false} className="space-y-4">
            <Field label="Nome da plataforma"><input name="saasName" className="input" required defaultValue={s.saasName} maxLength={60} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email de suporte"><input name="supportEmail" type="email" className="input" defaultValue={s.supportEmail} /></Field>
              <Field label="Telefone de suporte"><input name="supportPhone" className="input" defaultValue={s.supportPhone} maxLength={40} /></Field>
            </div>
            <Field label="Moeda de faturação" hint="Moeda dos planos e das faturas emitidas às instituições">
              <select name="billingCurrency" className="input" defaultValue={s.billingCurrency}><option>CVE</option><option>EUR</option><option>USD</option></select>
            </Field>
            <Field label="Dados para pagamento" hint="Aparecem nas faturas (banco, NIB/IBAN, titular…)">
              <textarea name="bankDetails" className="input" defaultValue={s.bankDetails} maxLength={1000} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Dias de teste"><input name="trialDays" type="number" min={1} max={365} className="input" required defaultValue={s.trialDays} /></Field>
              <Field label="Prazo de pagamento (dias)"><input name="invoiceDueDays" type="number" min={1} max={90} className="input" required defaultValue={s.invoiceDueDays} /></Field>
              <Field label="Tolerância (dias)" hint="Antes de suspender"><input name="graceDays" type="number" min={0} max={90} className="input" required defaultValue={s.graceDays} /></Field>
            </div>
            <div className="flex justify-end"><Submit>Guardar definições</Submit></div>
          </ActionForm>
        </Card>
        <div className="space-y-5">
          <Card title="A minha palavra-passe">
            <ActionForm action={changeAdminPasswordAction} className="space-y-4">
              <Field label="Palavra-passe atual"><input name="current" type="password" className="input" required autoComplete="current-password" /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nova palavra-passe" hint="Mín. 8 caracteres, com letras e números"><input name="password" type="password" className="input" required minLength={8} autoComplete="new-password" /></Field>
                <Field label="Confirmar"><input name="confirm" type="password" className="input" required minLength={8} autoComplete="new-password" /></Field>
              </div>
              <div className="flex justify-end"><Submit>Alterar palavra-passe</Submit></div>
            </ActionForm>
          </Card>
          <Card title="Administradores da plataforma" pad={false} actions={
            <Modal trigger="Adicionar" triggerClass="btn-primary btn-sm" title="Novo administrador">
              <ActionForm action={addAdminAction} className="space-y-4">
                <Field label="Nome"><input name="name" className="input" required minLength={2} maxLength={120} /></Field>
                <Field label="Email"><input name="email" type="email" className="input" required /></Field>
                <Field label="Palavra-passe inicial" hint="Mín. 8 caracteres, com letras e números"><input name="password" type="password" className="input" required minLength={8} autoComplete="new-password" /></Field>
                <FormFooter submit="Criar administrador" />
              </ActionForm>
            </Modal>
          }>
            <ul className="divide-y divide-line/70">
              {admins.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0 text-sm">
                    <p className="truncate font-medium">{a.name} {a.id === me.id && <Badge tone="accent">Você</Badge>}</p>
                    <p className="truncate text-xs text-ink-soft">{a.email} · último acesso: {fmtDateTime(a.lastLoginAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={a.active ? "green" : "gray"}>{a.active ? "Ativo" : "Inativo"}</Badge>
                    {a.id !== me.id && (
                      <ConfirmAction action={toggleAdminAction} hidden={{ id: a.id }} label={a.active ? "Desativar" : "Reativar"} danger={a.active}
                        title={a.active ? "Desativar administrador" : "Reativar administrador"} text={`${a.name} ${a.active ? "deixa de conseguir entrar no painel." : "volta a ter acesso ao painel."}`} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
