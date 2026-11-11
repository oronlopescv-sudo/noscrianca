import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuthCard } from "@/components/tenant/auth-card";
import { ActionForm, Submit } from "@/components/ui/client";
import { Field, Notice } from "@/components/ui/kit";
import { institutionUsable, tenantBranding } from "@/lib/tenant";
import { requestResetAction } from "@/server/auth";

export const metadata = { title: "Recuperar acesso" };

export default async function Recover({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ enviado?: string }> }) {
  const { slug } = await params;
  const sent = (await searchParams).enviado === "1";
  const b = await tenantBranding(slug);
  if (!b.institution) notFound();
  if (!institutionUsable(b.institution.status)) redirect(`/c/${slug}/indisponivel`);
  return (
    <AuthCard name={b.name} logoSrc={b.logoSrc} title="Recuperar acesso" subtitle={sent ? undefined : "Indique o email da sua conta. Enviamos um link para definir uma nova palavra-passe."}
      footer={<Link href={`/c/${slug}/entrar`} className="hover:text-white">← Voltar ao início de sessão</Link>}>
      {sent ? (
        <div className="space-y-3">
          <Notice tone="green">Se existir uma conta ativa com esse email, foi enviado um link de recuperação (válido por 1 hora).</Notice>
          <p className="text-sm text-ink-soft">Não recebeu? Verifique o spam ou peça à direção da instituição para lhe gerar um novo link de acesso.</p>
        </div>
      ) : (
        <ActionForm action={requestResetAction} hidden={{ slug }} className="space-y-4" resetOnSuccess={false}>
          <Field label="Email"><input name="email" type="email" className="input" required autoComplete="email" /></Field>
          <Submit className="btn-primary w-full" pendingText="A enviar…">Enviar link de recuperação</Submit>
        </ActionForm>
      )}
    </AuthCard>
  );
}
