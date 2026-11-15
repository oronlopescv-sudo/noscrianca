import { requireTenant, visibleClassrooms } from "@/lib/tenant";
import { todayIn } from "@/lib/format";
import { t } from "@/db/tenant";
import { RegisterChildWizard } from "@/components/tenant/register-child-wizard";

export const dynamic = "force-dynamic";

export default async function NewChildPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireTenant((await params).slug, { panel: "MANAGEMENT", permission: "children.manage" });
  const today = todayIn(ctx.settings.timezone);
  const [classrooms, feePlans] = await Promise.all([
    visibleClassrooms(ctx, false),
    ctx.db.query.feePlans.findMany({ orderBy: (f, { asc }) => asc(f.name) }),
  ]);
  return (
    <RegisterChildWizard slug={ctx.institution.slug} classrooms={classrooms} feePlans={feePlans} today={today} cancelHref={`${ctx.base}/gestao/criancas`} />
  );
}
