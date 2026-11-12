import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ActionForm, ConfirmAction, Modal, Submit } from "@/components/ui/client";
import { Avatar, Badge, Card, Check, DL, Field, PageHeader } from "@/components/ui/kit";
import { t } from "@/db/tenant";
import { fmtDate, money, periodLabel, todayIn } from "@/lib/format";
import { USER_STATUS } from "@/lib/labels";
import { salaryReceiptNumber } from "@/lib/services/tenant-pdf";
import { requireTenant } from "@/lib/tenant";
import { paySalaryAction, sendSalaryReceiptAction, setSalaryAction, voidSalaryPaymentAction } from "@/server/payroll";

export const dynamic = "force-dynamic";
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default async function EmployeeProfile({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ ano?: string }> }) {
  const { slug, id } = await params;
  const ctx = await requireTenant(slug, { permission: ["employees.manage", "payroll.manage"] });
  const emp = await ctx.db.query.employees.findFirst({ where: eq(t.employees.id, id), with: { user: { with: { role: true } }, classrooms: { with: { classroom: true } } } });
  if (!emp || emp.user.deletedAt) notFound();

  const canPayroll = ctx.can("payroll.manage");
  const canWrite = canPayroll && !ctx.readOnly;
  const cur = ctx.settings.currency;
  const today = todayIn(ctx.settings.timezone);
  const thisYear = Number(today.slice(0, 4));
  const ano = (await searchParams).ano;
  const year = ano && /^\d{4}$/.test(ano) && Number(ano) <= thisYear && Number(ano) >= thisYear - 10 ? Number(ano) : thisYear;
  const payments = canPayroll
    ? await ctx.db.query.salaryPayments.findMany({ where: eq(t.salaryPayments.employeeId, emp.id), orderBy: [desc(t.salaryPayments.createdAt)] })
    : [];
  const paid = new Map(payments.filter((p) => !p.voidedAt).map((p) => [p.period, p]));
  const start = (emp.hireDate ?? emp.createdAt.toISOString().slice(0, 10)).slice(0, 7);
  const current = today.slice(0, 7);
  const yearTotal = [...paid.values()].filter((p) => p.period.startsWith(String(year))).reduce((a, p) => a + p.amountCents, 0);
  const base = `${ctx.base}/gestao/funcionarios/${emp.id}`;
  const back = ctx.can("employees.manage") ? { href: `${ctx.base}/gestao/funcionarios`, label: "Funcionários" } : { href: `${ctx.base}/gestao/salarios`, label: "Salários" };

  return (
    <>
      <PageHeader back={back} title={emp.user.name}
        subtitle={<>{emp.user.role?.name ?? "Sem cargo"}{emp.jobTitle ? ` · ${emp.jobTitle}` : ""} · <Badge tone={USER_STATUS[emp.user.status]?.tone ?? "gray"}>{USER_STATUS[emp.user.status]?.label ?? emp.user.status}</Badge></>} />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Dados do funcionário">
          <div className="mb-4 flex items-center gap-3"><Avatar name={emp.user.name} size={56} /><div className="min-w-0 text-sm"><p className="truncate font-medium">{emp.user.name}</p><p className="truncate text-ink-soft">{emp.user.email}</p></div></div>
          <DL items={[
            ["Telefone", emp.user.phone || "—"],
            ["Admissão", emp.hireDate ? fmtDate(emp.hireDate) : "—"],
            ["Horário", emp.schedule || "—"],
            ["Morada", emp.address || "—"],
            ["Turmas", emp.classrooms.length ? emp.classrooms.map((c) => c.classroom.name).join(", ") : "Todas (conforme o cargo)"],
          ]} />
        </Card>

        <div className="space-y-5 lg:col-span-2">
          {!canPayroll ? (
            <Card title="Salários"><p className="text-sm text-ink-soft">Não tem permissão para ver os salários da equipa.</p></Card>
          ) : (
            <>
              <Card title="Salário base">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-3xl font-semibold">{emp.salaryCents ? money(emp.salaryCents, cur) : "Por definir"}</p>
                    <p className="mt-1 text-sm text-ink-soft">Pago em {year}: {money(yearTotal, cur)}</p>
                  </div>
                  {canWrite && (
                    <ActionForm action={setSalaryAction} hidden={{ slug, employeeId: emp.id }} className="flex items-end gap-2" resetOnSuccess={false}>
                      <Field label={`Salário mensal (${cur})`}><input name="salary" className="input w-40" inputMode="decimal" defaultValue={emp.salaryCents ? String(emp.salaryCents / 100) : ""} /></Field>
                      <Submit className="btn-secondary">Guardar</Submit>
                    </ActionForm>
                  )}
                </div>
              </Card>

              <Card pad={false} title={<span id="salarios">Salários de {year}</span>}
                actions={<span className="flex gap-1.5">
                  <Link href={`${base}?ano=${year - 1}#salarios`} scroll={false} className="btn btn-secondary btn-sm">← {year - 1}</Link>
                  {year < thisYear && <Link href={`${base}?ano=${year + 1}#salarios`} scroll={false} className="btn btn-secondary btn-sm">{year + 1} →</Link>}
                </span>}>
                <ul className="grid gap-px bg-line/60 sm:grid-cols-2 xl:grid-cols-3">
                  {MONTHS.map((label, idx) => {
                    const ym = `${year}-${String(idx + 1).padStart(2, "0")}`;
                    const p = paid.get(ym);
                    const future = ym > current;
                    const due = !p && !!emp.salaryCents && ym >= start && !future;
                    return (
                      <li key={ym} className={`p-3 ${p ? "bg-emerald-50" : due ? "bg-red-50" : "bg-white"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{label}</span>
                          {p ? <Badge tone="green">Pago</Badge> : due ? <Badge tone="red">Não pago</Badge> : <Badge>—</Badge>}
                        </div>
                        <p className="mt-1.5 text-xs text-ink-soft">{p ? `${money(p.amountCents, cur)} · pago a ${fmtDate(p.paidAt)} · ${salaryReceiptNumber(p)}` : future ? "Ainda não chegou" : due ? "A aguardar pagamento" : "Sem lançamento"}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {p && <a href={`${ctx.base}/recibo-salario/${p.id}`} target="_blank" rel="noopener" className="btn btn-secondary btn-sm">Recibo PDF</a>}
                          {p && canWrite && <ConfirmAction action={sendSalaryReceiptAction} hidden={{ slug, paymentId: p.id }} label="Enviar recibo" triggerClass="btn-secondary btn-sm" title="Enviar recibo de vencimento" text={`O recibo de ${periodLabel(ym)} é enviado em PDF para ${emp.user.email}, com um aviso na aplicação.`} confirmLabel="Enviar recibo" />}
                          {p && canWrite && <ConfirmAction action={voidSalaryPaymentAction} hidden={{ slug, paymentId: p.id }} label="Não pago" danger title="Anular pagamento de salário" text="O pagamento fica no histórico como anulado e o mês volta a não pago." confirmLabel="Anular pagamento" />}
                          {!p && !future && canWrite && (
                            <Modal title={`Lançar ${periodLabel(ym)} · ${emp.user.name}`} trigger="Lançar pagamento" triggerClass="btn-primary btn-sm">
                              <ActionForm action={paySalaryAction} hidden={{ slug, employeeId: emp.id, period: ym }} className="space-y-4">
                                <Field label={`Quantia recebida (${cur})`} hint={emp.salaryCents ? "Vem preenchida com o salário base; altere se o valor do mês foi outro" : undefined}>
                                  <input name="amount" className="input" inputMode="decimal" required defaultValue={emp.salaryCents ? String(emp.salaryCents / 100) : ""} />
                                </Field>
                                <div className="grid gap-4 sm:grid-cols-2">
                                  <Field label="Data do pagamento"><input name="paidAt" type="date" className="input" required defaultValue={today} max={today} /></Field>
                                  <Field label="Forma de pagamento">
                                    <select name="method" className="input" defaultValue="TRANSFER">
                                      <option value="TRANSFER">Transferência</option><option value="CASH">Dinheiro</option><option value="CHEQUE">Cheque</option><option value="DEPOSIT">Depósito</option><option value="OTHER">Outro</option>
                                    </select>
                                  </Field>
                                </div>
                                <Field label="Notas (opcional)" hint="Aparecem no recibo: subsídios, descontos, horas extra…"><input name="notes" className="input" maxLength={300} /></Field>
                                <Check name="sendReceipt" label="Enviar o recibo de vencimento por email ao funcionário" defaultChecked />
                                <div className="flex justify-end"><Submit>Lançar pagamento</Submit></div>
                              </ActionForm>
                            </Modal>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>

              {payments.some((p) => p.voidedAt) && (
                <Card title="Pagamentos anulados" pad={false}>
                  <ul className="divide-y divide-line text-sm">
                    {payments.filter((p) => p.voidedAt).map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-5">
                        <span>{periodLabel(p.period)} · {money(p.amountCents, cur)}</span>
                        <span className="text-xs text-ink-soft">anulado por {p.voidedByName ?? "—"}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
