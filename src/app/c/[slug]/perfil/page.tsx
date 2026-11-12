import { PageHeader } from "@/components/ui/kit";
import { NotificationsList, ProfileForms } from "@/components/tenant/account";
import { MyLeaves } from "@/components/tenant/my-leaves";
import { MySalary } from "@/components/tenant/my-salary";
import { PanelShell } from "@/components/tenant/panel-shell";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ano?: string }> }) {
  const ctx = await requireTenant((await params).slug);
  return (
    <PanelShell ctx={ctx}>
      <PageHeader title="O meu perfil" subtitle="Dados de contacto, palavra-passe e notificações" />
      <div className="space-y-5">
        <ProfileForms ctx={ctx} />
        {!ctx.isGuardian && !ctx.impersonating && <MySalary ctx={ctx} yearParam={(await searchParams).ano} />}
        {!ctx.isGuardian && !ctx.impersonating && <MyLeaves ctx={ctx} />}
        <NotificationsList ctx={ctx} />
      </div>
    </PanelShell>
  );
}
