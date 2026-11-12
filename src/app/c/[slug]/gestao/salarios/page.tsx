import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { ActionForm, ConfirmAction, Modal, Submit } from "@/components/ui/client";
import { Badge, Card, EmptyState, Field, PageHeader, Stat } from "@/components/ui/kit";
import { t } from "@/db/tenant";
import { fmtDate, isPeriod, money, periodLabel, todayIn } from "@/lib/format";
import { requireTenant } from "@/lib/tenant";
import { paySalaryAction, setSalaryAction, voidSalaryPaymentAction } from "@/server/payroll";

export const dynamic = "force-dynamic";

function shift(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function PayrollPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ mes?: string }> }) {
  const ctx = await requireTenant((await params).slug, { panel: "MANAGEMENT", permission: "payroll.manage" });
  const slug = ctx.institution.slug;
  const cur = ctx.settings.currency;
  const today = todayIn(ctx.settings.timezone);
  const sp = await searchParams;
  const period = sp.mes && isPeriod(sp.mes) ? sp.mes : today.slice(0, 7);
  const canWrite = !ctx.readOnly;
  const [employees, payments] = await Promise.all([
    ctx.db.query.employees.findMany({ with: { user: { with: { role: true } } }, orderBy: (e, { asc }) => asc(e.createdAt) }),
    ctx.db.query.salaryPayments.findMany({ where: and(eq(t.salaryPayments.period, period), isNull(t.salaryPayments.voidedAt)) }),
  ]);
  const staff = employees.filter((e) => !e.user.deletedAt && e.user.status !== "SUSPENDED");
  const paidOf = new Map(payments.map((p) => [p.employeeId, p]));
  const totalDue = staff.reduce((a, e) => a + (e.salaryCents ?? 0), 0);
  const totalPaid = payments.reduce((a, p) => a + p.amountCents, 0);
  const base = `${ctx.base}/gestao/salarios`;

  return (
    <>
      <PageHeader title="Salários" subtitle={`Pagamentos à equipa · ${periodLabel(period)}`} />
      <div className="mb-5 flex items-center justify-between gap-3">
        <Link href={`${base}?mes=${shift(period, -1)}`} className="btn btn-secondary btn-sm">← {periodLabel(shift(period, -1))}</Link>
        <Link href={base} className="btn btn-secondary btn-sm">Mês atual</Link>
        <Link href={`${base}?mes=${shift(period, 1)}`} className="btn btn-secondary btn-sm">{periodLabel(shift(period, 1))} →</Link>
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Salários do mês" value={money(totalDue, cur)} />
        <Stat label="Já pago" value={money(totalPaid, cur)} />
        <Stat label="Funcionários pagos" value={`${payments.length} de ${staff.length}`} />
      </div>

      {staff.length === 0 ? <EmptyState title="Sem funcionários" text="Adicione a equipa em Funcionários para gerir os salários." /> : (
        <Card pad={false}>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Funcionário</th><th>Salário base</th><th>{periodLabel(period)}</th><th></th></tr></thead>
              <tbody>
                {staff.map((e) => {
                  const pay = paidOf.get(e.id);
                  return (
                    <tr key={e.id} className={pay ? "bg-emerald-50/60" : e.salaryCents ? "bg-red-50/60" : undefined}>
                      <td>
                        <Link href={`${ctx.base}/gestao/funcionarios/${e.id}`} className="font-medium hover:text-accent">{e.user.name}</Link>
                        <p className="text-xs text-ink-soft">{e.user.role?.name ?? "Sem cargo"}{e.jobTitle ? ` · ${e.jobTitle}` : ""}</p>
                      </td>
                      <td>{e.salaryCents ? money(e.salaryCents, cur) : <span className="text-ink-soft">Por definir</span>}</td>
                      <td>
                        {pay ? <><Badge tone="green">Pago</Badge><p className="mt-1 text-xs text-ink-soft">{money(pay.amountCents, cur)} · {fmtDate(pay.paidAt)}</p></>
                          : e.salaryCents ? <Badge tone="red">Não pago</Badge> : <Badge>Sem salário definido</Badge>}
                      </td>
                      <td>
                        {canWrite && (
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {!pay && (
                              <Modal title={`Pagar ${periodLabel(period)} · ${e.user.name}`} trigger="Marcar como pago" triggerClass="btn-primary btn-sm">
                                <ActionForm action={paySalaryAction} hidden={{ slug, employeeId: e.id, period }} className="space-y-4">
                                  <Field label={`Valor pago (${cur})`} hint={e.salaryCents ? "Deixe como está para pagar o salário base" : "Este funcionário ainda não tem salário base"}>
                                    <input name="amount" className="input" inputMode="decimal" required defaultValue={e.salaryCents ? String(e.salaryCents / 100) : ""} />
                                  </Field>
                                  <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label="Data do pagamento"><input name="paidAt" type="date" className="input" required defaultValue={today} max={today} /></Field>
                                    <Field label="Forma de pagamento">
                                      <select name="method" className="input" defaultValue="TRANSFER">
                                        <option value="TRANSFER">Transferência</option><option value="CASH">Dinheiro</option><option value="CHEQUE">Cheque</option><option value="DEPOSIT">Depósito</option><option value="OTHER">Outro</option>
                                      </select>
                                    </Field>
                                  </div>
                                  <Field label="Notas (opcional)"><input name="notes" className="input" maxLength={300} /></Field>
                                  <div className="flex justify-end"><Submit>Marcar como pago</Submit></div>
                                </ActionForm>
                              </Modal>
                            )}
                            {pay && <ConfirmAction action={voidSalaryPaymentAction} hidden={{ slug, paymentId: pay.id }} label="Marcar como não pago" danger title="Anular pagamento de salário" text="O pagamento fica no histórico como anulado e o mês volta a não pago." confirmLabel="Anular pagamento" />}
                            <Modal title={`Salário base · ${e.user.name}`} trigger="Definir salário" triggerClass="btn-ghost btn-sm">
                              <ActionForm action={setSalaryAction} hidden={{ slug, employeeId: e.id }} className="space-y-4">
                                <Field label={`Salário mensal (${cur})`} hint="Deixe vazio para remover"><input name="salary" className="input" inputMode="decimal" defaultValue={e.salaryCents ? String(e.salaryCents / 100) : ""} /></Field>
                                <div className="flex justify-end"><Submit>Guardar</Submit></div>
                              </ActionForm>
                            </Modal>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <p className="mt-4 text-xs text-ink-soft">Cada funcionário vê no seu perfil apenas o próprio salário e os meses pagos.</p>
    </>
  );
}
