import { notFound, redirect } from "next/navigation";
import { AuthCard } from "@/components/tenant/auth-card";
import { TokenForm } from "@/components/tenant/token-form";
import { institutionUsable, tenantBranding } from "@/lib/tenant";
import { resetPasswordAction } from "@/server/auth";

export const metadata = { title: "Nova palavra-passe" };

export default async function Reset({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const b = await tenantBranding(slug);
  if (!b.institution) notFound();
  if (!institutionUsable(b.institution.status)) redirect(`/c/${slug}/indisponivel`);
  return (
    <AuthCard name={b.name} logoSrc={b.logoSrc} title="Definir nova palavra-passe">
      <TokenForm institutionId={b.institution.id} slug={slug} token={token} purpose="RESET" action={resetPasswordAction} submit="Guardar palavra-passe" />
    </AuthCard>
  );
}
