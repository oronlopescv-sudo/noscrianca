import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuthCard } from "@/components/tenant/auth-card";
import { ActionForm, Submit } from "@/components/ui/client";
import { Field } from "@/components/ui/kit";
import { institutionUsable, loadTenant, tenantBranding } from "@/lib/tenant";
import { tenantLoginAction } from "@/server/auth";

export const metadata = { title: "Entrar" };

export default async function TenantLogin({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = await tenantBranding(slug);
  if (!b.institution) notFound();
  if (!institutionUsable(b.institution.status)) redirect(`/c/${slug}/indisponivel`);
  if ((await loadTenant(slug)).ok) redirect(`/c/${slug}`);
  return (
    <AuthCard name={b.name} logoSrc={b.logoSrc} title="Iniciar sessão" subtitle="Direção, funcionários e encarregados de educação."
      footer={<Link href="/entrar" className="hover:text-white">Não é a sua instituição? Procurar outra</Link>}>
      <ActionForm action={tenantLoginAction} hidden={{ slug }} className="space-y-4" resetOnSuccess={false}>
        <Field label="Email"><input name="email" type="email" className="input" required autoComplete="username" /></Field>
        <Field label="Palavra-passe"><input name="password" type="password" className="input" required autoComplete="current-password" /></Field>
        <Submit className="btn-primary w-full" pendingText="A entrar…">Entrar</Submit>
      </ActionForm>
      <p className="mt-4 text-center text-sm"><Link href={`/c/${slug}/recuperar`} className="link">Esqueci-me da palavra-passe</Link></p>
    </AuthCard>
  );
}
