import { PageHeader } from "@/components/ui/kit";
import { NotificationsList, ProfileForms } from "@/components/tenant/account";
import { PanelShell } from "@/components/tenant/panel-shell";
import { requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireTenant((await params).slug);
  return (
    <PanelShell ctx={ctx}>
      <PageHeader title="O meu perfil" subtitle="Dados de contacto, palavra-passe e notificações" />
      <div className="space-y-5">
        <ProfileForms ctx={ctx} />
        <NotificationsList ctx={ctx} />
      </div>
    </PanelShell>
  );
}
