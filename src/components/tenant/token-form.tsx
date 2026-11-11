import { and, eq, gt, isNull } from "drizzle-orm";
import Link from "next/link";
import { ActionForm, Submit, type FormAction } from "@/components/ui/client";
import { Field, Notice } from "@/components/ui/kit";
import { getTenantDb, t } from "@/db/tenant";
import { sha256 } from "@/lib/crypto";

/** Formulário de definição de palavra-passe a partir de um token (convite ou recuperação). */
export async function TokenForm({ institutionId, slug, token, purpose, action, submit }: {
  institutionId: string; slug: string; token: string; purpose: "INVITE" | "RESET"; action: FormAction; submit: string;
}) {
  const db = await getTenantDb(institutionId);
  const row = await db.query.authTokens.findFirst({
    where: and(eq(t.authTokens.tokenHash, sha256(token)), eq(t.authTokens.purpose, purpose), isNull(t.authTokens.usedAt), gt(t.authTokens.expiresAt, new Date())),
  });
  const user = row ? await db.query.users.findFirst({ where: eq(t.users.id, row.userId) }) : null;
  if (!row || !user || user.status === "SUSPENDED" || user.deletedAt) {
    return (
      <div className="space-y-4">
        <Notice tone="red">Este link já não é válido: expirou ou já foi utilizado.</Notice>
        <p className="text-sm text-ink-soft">{purpose === "INVITE" ? "Peça um novo convite à instituição." : "Peça um novo link de recuperação."}</p>
        <Link href={purpose === "INVITE" ? `/c/${slug}/entrar` : `/c/${slug}/recuperar`} className="btn-primary w-full">{purpose === "INVITE" ? "Ir para o início de sessão" : "Pedir novo link"}</Link>
      </div>
    );
  }
  return (
    <ActionForm action={action} hidden={{ slug, token }} className="space-y-4" resetOnSuccess={false}>
      <p className="rounded-btn bg-surface px-3 py-2.5 text-sm">Conta: <span className="font-medium">{user.name}</span><br /><span className="text-ink-soft">{user.email}</span></p>
      <Field label="Nova palavra-passe" hint="Mínimo 8 caracteres, com letras e números"><input name="password" type="password" className="input" required minLength={8} autoComplete="new-password" /></Field>
      <Field label="Confirmar palavra-passe"><input name="confirm" type="password" className="input" required minLength={8} autoComplete="new-password" /></Field>
      <Submit className="btn-primary w-full" pendingText="A guardar…">{submit}</Submit>
    </ActionForm>
  );
}
