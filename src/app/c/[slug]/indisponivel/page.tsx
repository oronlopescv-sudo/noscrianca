import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuthCard } from "@/components/tenant/auth-card";
import { loadTenant, tenantBranding } from "@/lib/tenant";
import { tenantLogoutAction } from "@/server/auth";

export const metadata = { title: "Indisponível" };

export default async function Unavailable({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = await tenantBranding(slug);
  if (!b.institution) notFound();
  const r = await loadTenant(slug);
  if (r.ok) redirect(`/c/${slug}`);
  const blocked = !r.ok && r.reason === "blocked";
  const st = b.institution.status;
  const text = blocked || st === "SUSPENDED" ? "O acesso a esta instituição está temporariamente suspenso. Contacte a direção para mais informações."
    : st === "PROVISIONING" || st === "PENDING" ? "O espaço desta instituição ainda está a ser preparado. Tente novamente dentro de alguns minutos."
    : "Esta instituição não está disponível de momento.";
  return (
    <AuthCard name={b.name || "NosCriança"} logoSrc={null} title="Acesso indisponível">
      <p className="text-sm text-ink-soft">{text}</p>
      <div className="mt-5 flex flex-col gap-2">
        {blocked && <form action={tenantLogoutAction.bind(null, slug)}><button className="btn-primary w-full" type="submit">Terminar sessão</button></form>}
        <Link href="/" className="btn-ghost w-full">Página inicial</Link>
      </div>
    </AuthCard>
  );
}
