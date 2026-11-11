import { count, eq } from "drizzle-orm";
import { Layers } from "lucide-react";
import { ActionForm, ConfirmAction, FormFooter, Modal } from "@/components/ui/client";
import { Badge, Card, Check, EmptyState, Field, PageHeader } from "@/components/ui/kit";
import { central, c } from "@/db/central";
import type { Plan } from "@/db/central/schema";
import { centsToInput, money } from "@/lib/format";
import { getPlatformSettings } from "@/lib/platform";
import { deletePlanAction, savePlanAction } from "../../actions";

export const metadata = { title: "Planos" };

function PlanForm({ plan, currency }: { plan?: Plan; currency: string }) {
  return (
    <ActionForm action={savePlanAction} hidden={{ id: plan?.id ?? "" }} resetOnSuccess={!plan} className="space-y-4">
      <Field label="Nome do plano"><input name="name" className="input" required minLength={2} maxLength={60} defaultValue={plan?.name} /></Field>
      <Field label="Descrição"><input name="description" className="input" maxLength={160} defaultValue={plan?.description} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Preço mensal (${currency})`}><input name="priceMonthly" inputMode="decimal" className="input" required defaultValue={plan ? centsToInput(plan.priceMonthlyCents) : ""} /></Field>
        <Field label={`Preço anual (${currency})`}><input name="priceYearly" inputMode="decimal" className="input" required defaultValue={plan ? centsToInput(plan.priceYearlyCents) : ""} /></Field>
      </div>
      <Field label="Limite de crianças" hint="Deixe vazio para ilimitado"><input name="maxChildren" inputMode="numeric" className="input" maxLength={6} defaultValue={plan?.maxChildren ?? ""} /></Field>
      <Check name="active" label="Plano ativo" hint="Planos inativos não aparecem ao criar novas creches" defaultChecked={plan ? plan.active : true} />
      <FormFooter />
    </ActionForm>
  );
}

export default async function Plans() {
  const settings = await getPlatformSettings();
  const plans = await central().query.plans.findMany({ orderBy: (p, { asc }) => asc(p.priceMonthlyCents) });
  const usage = await central().select({ planId: c.institutions.planId, n: count() }).from(c.institutions).groupBy(c.institutions.planId);
  const used = (id: string) => usage.find((u) => u.planId === id)?.n ?? 0;
  return (
    <>
      <PageHeader title="Planos" subtitle={`Preços em ${settings.billingCurrency}. Os pagamentos são registados manualmente.`}
        actions={<Modal trigger="Novo plano" title="Novo plano"><PlanForm currency={settings.billingCurrency} /></Modal>} />
      {plans.length === 0 ? (
        <Card><EmptyState icon={<Layers size={24} />} title="Sem planos" text="Crie pelo menos um plano para poder adicionar instituições." /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
            <div key={p.id} className="card card-pad flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base">{p.name}</h2>
                <Badge tone={p.active ? "green" : "gray"}>{p.active ? "Ativo" : "Inativo"}</Badge>
              </div>
              <p className="mt-1 text-sm text-ink-soft">{p.description || "Sem descrição"}</p>
              <p className="mt-4 text-2xl font-semibold">{money(p.priceMonthlyCents, settings.billingCurrency)}<span className="text-sm font-normal text-ink-soft"> / mês</span></p>
              <p className="text-sm text-ink-soft">{money(p.priceYearlyCents, settings.billingCurrency)} / ano</p>
              <p className="mt-3 text-sm">{p.maxChildren ? `Até ${p.maxChildren} crianças` : "Crianças ilimitadas"} · {used(p.id)} {used(p.id) === 1 ? "instituição" : "instituições"}</p>
              <div className="mt-4 flex gap-2 pt-1">
                <Modal trigger="Editar" triggerClass="btn-ghost btn-sm" title={`Editar ${p.name}`}><PlanForm plan={p} currency={settings.billingCurrency} /></Modal>
                <ConfirmAction action={deletePlanAction} hidden={{ id: p.id }} label="Eliminar" danger title="Eliminar plano" confirmLabel="Eliminar" disabled={used(p.id) > 0}
                  text={`Eliminar o plano ${p.name}? Só é possível se nenhuma instituição o usar.`} />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
