import Link from "next/link";
import { AuthCard } from "@/components/tenant/auth-card";
import { panelHome, requireTenant } from "@/lib/tenant";

export const metadata = { title: "Sem acesso" };

export default async function NoAccess({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireTenant((await params).slug);
  return (
    <AuthCard name={ctx.settings.name} logoSrc={null} title="Sem permissão">
      <p className="text-sm text-ink-soft">A sua conta ({ctx.role?.name ?? "Encarregado"}) não tem permissão para ver esta página. Se precisar de acesso, fale com a direção.</p>
      <Link href={panelHome(ctx)} className="btn-primary mt-5 w-full">Voltar ao meu painel</Link>
    </AuthCard>
  );
}
