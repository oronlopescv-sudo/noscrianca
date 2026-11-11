import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { Notice, PageHeader } from "@/components/ui/kit";
import { central, c } from "@/db/central";
import { env } from "@/lib/env";
import { money } from "@/lib/format";
import { getPlatformSettings } from "@/lib/platform";
import { NewInstitutionWizard } from "./wizard";

export const metadata = { title: "Nova creche" };

export default async function NewInstitution({ searchParams }: { searchParams: Promise<{ pedido?: string }> }) {
  const sp = await searchParams;
  const settings = await getPlatformSettings();
  const plans = await central().query.plans.findMany({ where: eq(c.plans.active, true), orderBy: (p, { asc }) => asc(p.priceMonthlyCents) });
  const request = sp.pedido
    ? await central().query.signupRequests.findFirst({ where: and(eq(c.signupRequests.id, sp.pedido), eq(c.signupRequests.status, "PENDING")) })
    : null;

  return (
    <>
      <PageHeader title="Nova creche" subtitle="A base de dados é criada automaticamente ao confirmar" back={{ href: "/admin/instituicoes", label: "Instituições" }} />
      {plans.length === 0 ? (
        <Notice tone="amber">Não existe nenhum plano ativo. <Link href="/admin/planos" className="underline">Crie um plano</Link> antes de adicionar instituições.</Notice>
      ) : (
        <NewInstitutionWizard
          appUrl={env.appUrl} trialDays={settings.trialDays}
          plans={plans.map((p) => ({ id: p.id, name: p.name, description: p.description, monthly: money(p.priceMonthlyCents, settings.billingCurrency), yearly: money(p.priceYearlyCents, settings.billingCurrency) }))}
          prefill={request ? { requestId: request.id, name: request.institutionName, email: request.email, phone: request.phone, city: request.city, directorName: request.contactName } : {}}
        />
      )}
    </>
  );
}
