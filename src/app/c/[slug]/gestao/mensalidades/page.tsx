import Link from "next/link";
import { and, asc, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { t } from "@/db/tenant";
import { ActionForm, ConfirmAction, CopyField, Modal, Submit } from "@/components/ui/client";
import { WhatsappButton } from "@/components/tenant/whatsapp";
import { Badge, Card, EmptyState, Field, Notice, PageHeader } from "@/components/ui/kit";
import { fmtDateObj, money, periodLabel, todayIn, centsToInput } from "@/lib/format";
import { COOLDOWN_DAYS, collectionMessage } from "@/lib/collection-rules";
import { mailConfigured } from "@/lib/mail";
import { guardianDebts } from "@/lib/services/collections";
import { INVOICE_STATUS, CYCLE_LABEL } from "@/lib/labels";
import { deleteFeePlanAction, generateInvoicesAction, createExtraInvoiceAction, saveFeePlanAction } from "@/server/finance";
import { sendGuardianCollectionAction, sendOverdueCollectionsAction } from "@/server/collections";
import { reviewPaymentProofAction } from "@/server/extras";
import { fileUrl, requireTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function FinancePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ estado?: string; mes?: string }> }) {
  const ctx = await requireTenant((await params).slug, { panel: "MANAGEMENT", permission: "finance.view" });
  const sp = await searchParams;
  const slug = ctx.institution.slug;
  const cur = ctx.settings.currency;
  const today = todayIn(ctx.settings.timezone);
  const period = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : today.slice(0, 7);
  const canManage = ctx.can("finance.manage") && !ctx.readOnly;
  const [plans, children, invoices] = await Promise.all([
    ctx.db.query.feePlans.findMany({ orderBy: [asc(t.feePlans.name)] }),
    ctx.db.query.children.findMany({ where: eq(t.children.status, "ACTIVE"), orderBy: [asc(t.children.firstName)] }),
    ctx.db.query.invoices.findMany({
      where: sp.estado && ["OPEN", "PARTIAL", "PAID", "VOID"].includes(sp.estado) ? eq(t.invoices.status, sp.estado as "OPEN") : undefined,
      orderBy: (i, { desc }) => desc(i.issueDate), limit: 200, with: { child: true },
    }),
  ]);
  const filtered = sp.estado ? invoices : invoices.filter((i) => i.period === period);
  const reminders = await ctx.db
    .select({ number: t.invoices.number, childName: t.children.firstName, email: t.invoiceReminders.email, stage: t.invoiceReminders.stage, sentAt: t.invoiceReminders.sentAt })
    .from(t.invoiceReminders)
    .innerJoin(t.invoices, eq(t.invoices.id, t.invoiceReminders.invoiceId))
    .innerJoin(t.children, eq(t.children.id, t.invoices.childId))
    .orderBy(desc(t.invoiceReminders.sentAt)).limit(30);

  const [proofs, overdue] = await Promise.all([
    ctx.db.query.paymentProofs.findMany({ where: eq(t.paymentProofs.status, "PENDING"), orderBy: [asc(t.paymentProofs.createdAt)], with: { invoice: { with: { child: true } } } }),
    ctx.db.query.invoices.findMany({ where: and(inArray(t.invoices.status, ["OPEN", "PARTIAL"]), isNull(t.invoices.voidedAt), lt(t.invoices.dueDate, today)), columns: { id: true, totalCents: true, paidCents: true } }),
  ]);
  const overdueTotal = overdue.reduce((a, i) => a + (i.totalCents - i.paidCents), 0);
  // Cobrança por encarregado: um aviso com todas as mensalidades em aberto dos seus filhos.
  const { guardians: debts, unlinked } = await guardianDebts(ctx.db, today);
  const overdueGuardians = debts.filter((g) => g.overdueOwed > 0).length;
  const mailOk = mailConfigured();

  return (
    <>
      <PageHeader
        title="Mensalidades e faturas"
        subtitle={`Mês de referência: ${periodLabel(period)}`}
        actions={canManage && (
          <>
            {overdueGuardians > 0 && (
              <ConfirmAction action={sendOverdueCollectionsAction} hidden={{ slug }} label={`Cobrar ${overdueGuardians} encarregado(s)`} triggerClass="btn-secondary"
                title="Cobrar os encarregados em atraso"
                text={`Cada encarregado recebe UMA mensagem com todas as mensalidades em atraso dos seus filhos (${money(overdueTotal, cur)} no total). ${mailOk ? "Chega por email e como aviso na aplicação." : "O email não está configurado no servidor: chega só como aviso na aplicação, a quem tem conta ativa."} Quem foi avisado nos últimos ${COOLDOWN_DAYS} dias fica de fora.`}
                confirmLabel="Enviar cobranças" />
            )}
            <Modal title="Gerar faturas mensais" trigger="Gerar faturas do mês" triggerClass="btn-secondary">
              <ActionForm action={generateInvoicesAction} hidden={{ slug }} className="space-y-4">
                <Field label="Mês" hint="Gera uma fatura por criança ativa com mensalidade. Não duplica faturas já existentes."><input name="period" type="month" className="input" required defaultValue={period} /></Field>
                <div className="flex justify-end"><Submit>Gerar faturas</Submit></div>
              </ActionForm>
            </Modal>
            <Modal title="Nova fatura avulsa" trigger="Fatura avulsa">
              <ActionForm action={createExtraInvoiceAction} hidden={{ slug }} className="space-y-4">
                <Field label="Criança"><select name="childId" className="input" required>{children.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}</select></Field>
                <Field label="Descrição"><input name="description" className="input" required maxLength={120} placeholder="Ex.: Material escolar" /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={`Valor (${cur})`}><input name="amount" className="input" required inputMode="decimal" /></Field>
                  <Field label="Vencimento"><input name="dueDate" type="date" className="input" required defaultValue={today} /></Field>
                </div>
                <Field label="Notas"><input name="notes" className="input" maxLength={300} /></Field>
                <div className="flex justify-end"><Submit>Emitir fatura</Submit></div>
              </ActionForm>
            </Modal>
          </>
        )}
      />

      {proofs.length > 0 && (
        <Card title={`Comprovativos por confirmar (${proofs.length})`} className="mb-5 border-amber-300" pad={false}>
          <ul className="divide-y divide-line">
            {proofs.map((p) => {
              const remaining = p.invoice.totalCents - p.invoice.paidCents;
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                  <div className="min-w-0">
                    <p className="font-medium">{p.invoice.child.firstName} {p.invoice.child.lastName} · <Link href={`${ctx.base}/gestao/mensalidades/${p.invoice.id}`} className="link">{p.invoice.number}</Link></p>
                    <p className="text-xs text-ink-soft">Enviado por {p.userName} · em falta {money(Math.max(remaining, 0), cur)}{p.note ? ` · "${p.note}"` : ""}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <a href={fileUrl(ctx, p.path) ?? "#"} target="_blank" rel="noopener" className="btn btn-secondary btn-sm">Ver comprovativo</a>
                    {canManage && remaining > 0 && (
                      <Modal title={`Confirmar pagamento · ${p.invoice.number}`} trigger="Confirmar pagamento" triggerClass="btn-primary btn-sm">
                        <ActionForm action={reviewPaymentProofAction} hidden={{ slug, proofId: p.id, decision: "ACCEPT" }} className="space-y-4">
                          <p className="text-sm text-ink-soft">Confirme o valor que aparece no comprovativo. O pagamento é registado e o recibo emitido.</p>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field label={`Valor recebido (${cur})`}><input name="amount" className="input" inputMode="decimal" required defaultValue={centsToInput(remaining)} /></Field>
                            <Field label="Data do pagamento"><input name="paidAt" type="date" className="input" required defaultValue={today} max={today} /></Field>
                          </div>
                          <Field label="Forma de pagamento">
                            <select name="method" className="input" defaultValue="TRANSFER"><option value="TRANSFER">Transferência</option><option value="DEPOSIT">Depósito</option><option value="CASH">Dinheiro</option><option value="CHEQUE">Cheque</option><option value="OTHER">Outro</option></select>
                          </Field>
                          <div className="flex justify-end"><Submit>Confirmar e emitir recibo</Submit></div>
                        </ActionForm>
                      </Modal>
                    )}
                    {canManage && (
                      <ConfirmAction action={reviewPaymentProofAction} hidden={{ slug, proofId: p.id, decision: "REJECT" }} label="Recusar" danger title="Recusar comprovativo" text="O encarregado é avisado e pode enviar outro comprovativo." confirmLabel="Recusar">
                        <Field label="Motivo"><input name="reason" className="input" required minLength={3} maxLength={300} placeholder="Ex.: imagem ilegível, valor não coincide" /></Field>
                      </ConfirmAction>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="Faturas" className="lg:col-span-2" pad={false}
          actions={
            <form className="flex flex-wrap items-center gap-2" role="search">
              <input type="month" name="mes" defaultValue={period} className="input h-9 w-auto py-1 text-sm" aria-label="Mês" />
              <select name="estado" defaultValue={sp.estado ?? ""} className="input h-9 w-auto py-1 text-sm" aria-label="Estado">
                <option value="">Todas</option>
                {Object.entries(INVOICE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <button className="btn btn-secondary btn-sm" type="submit">Filtrar</button>
            </form>
          }>
          {filtered.length === 0 ? <div className="card-pad"><EmptyState title="Sem faturas" text="Gere as faturas do mês ou emita uma fatura avulsa." /></div> : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Número</th><th>Criança</th><th>Referente a</th><th>Vencimento</th><th className="text-right">Valor</th><th>Estado</th></tr></thead>
                <tbody>
                  {filtered.map((i) => (
                    <tr key={i.id}>
                      <td><Link href={`${ctx.base}/gestao/mensalidades/${i.id}`} className="link font-medium">{i.number}</Link></td>
                      <td>{i.child.firstName} {i.child.lastName}</td>
                      <td className="text-ink-soft">{i.kind === "MONTHLY" ? periodLabel(i.period) : "Avulsa"}</td>
                      <td>{i.dueDate.split("-").reverse().join("/")}</td>
                      <td className="text-right font-medium">{money(i.totalCents, cur)}</td>
                      <td><Badge tone={INVOICE_STATUS[i.status]?.tone ?? "gray"}>{INVOICE_STATUS[i.status]?.label ?? i.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Mensalidades" pad={false}>
          {plans.length === 0 ? <div className="card-pad"><EmptyState title="Sem mensalidades" text="Defina os valores mensais para associar às crianças." /></div> : (
            <ul className="divide-y divide-line">
              {plans.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-xs text-ink-soft">{money(p.amountCents, cur)} · {CYCLE_LABEL.MONTHLY}{p.active ? "" : " · inativa"}</p>
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 gap-1">
                      <Modal title={`Editar ${p.name}`} trigger="Editar" triggerClass="btn-ghost btn-sm">
                        <FeePlanForm slug={slug} plan={{ id: p.id, name: p.name, amount: centsToInput(p.amountCents), active: p.active }} />
                      </Modal>
                      <ConfirmAction action={deleteFeePlanAction} hidden={{ slug, feePlanId: p.id }} label="Eliminar" title="Eliminar mensalidade" text="Só é possível se nenhuma criança a tiver." confirmLabel="Eliminar" danger />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canManage && (
            <div className="border-t border-line p-4">
              <p className="mb-3 text-sm font-semibold">Nova mensalidade</p>
              <FeePlanForm slug={slug} />
            </div>
          )}
        </Card>
      </div>
      <Card title={`Encarregados com mensalidades em aberto (${debts.length})`} className="mt-5" pad={false}>
        {!mailOk && (
          <div className="p-4 sm:p-5"><Notice tone="amber">O email não está configurado no servidor: a cobrança chega como aviso na aplicação (só a quem tem conta ativa). Os restantes recebem por WhatsApp ou copiando a mensagem.</Notice></div>
        )}
        {unlinked.count > 0 && (
          <div className="px-4 pt-4 sm:px-5"><Notice tone="amber">{unlinked.count} fatura(s) por {money(unlinked.owed, cur)} são de crianças sem encarregado associado. Associe o encarregado na ficha da criança para poder cobrar.</Notice></div>
        )}
        {debts.length === 0 ? (
          <p className="p-5 text-sm text-ink-soft">Nenhum encarregado tem mensalidades em aberto.</p>
        ) : (
          <ul className="divide-y divide-line">
            {debts.map((g) => {
              const msg = collectionMessage({ schoolName: ctx.settings.name, guardianName: g.name, invoices: g.invoices, owed: g.owed, currency: cur, paymentInfo: ctx.settings.paymentInfo });
              const kids = [...new Set(g.invoices.map((i) => i.childName.split(" ")[0]))].join(", ");
              return (
                <li key={g.userId} className="space-y-2.5 px-4 py-3.5 sm:px-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{g.name}</p>
                      <p className="truncate text-xs text-ink-soft">{kids} · {g.email}</p>
                      {!g.accountActive && <span className="mt-1 inline-block"><Badge tone="gray">Sem conta ativa</Badge></span>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold">{money(g.owed, cur)}</p>
                      {g.overdueOwed > 0 && <p className="text-xs font-medium text-red-700">{money(g.overdueOwed, cur)} em atraso</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {canManage && (
                      <ConfirmAction action={sendGuardianCollectionAction} hidden={{ slug, userId: g.userId }} label="Enviar cobrança" triggerClass="btn-primary btn-sm"
                        title={`Cobrar ${g.name}`}
                        text={`Recebe uma mensagem com ${g.invoices.length} mensalidade(s) em aberto (${money(g.owed, cur)}), ${mailOk && g.email ? "por email e " : ""}como aviso na aplicação${g.accountActive ? "" : " (ainda não tem conta ativa, por isso só recebe o email, se existir)"}.`}
                        confirmLabel="Enviar" />
                    )}
                    {g.phone ? <WhatsappButton phone={g.phone} text={msg.short} /> : <span className="self-center text-xs text-ink-soft">Sem telefone</span>}
                    <Modal title={`Mensagem para ${g.name}`} trigger="Copiar mensagem" triggerClass="btn-ghost btn-sm">
                      <p className="mb-3 text-sm text-ink-soft">Copie e cole no WhatsApp, SMS ou email.</p>
                      <CopyField value={msg.text} label="Mensagem completa" />
                    </Modal>
                  </div>
                  <p className="text-xs text-ink-soft">Último aviso: {g.lastSentAt ? fmtDateObj(g.lastSentAt, ctx.settings.timezone) : "nunca"}</p>
                </li>
              );
            })}
          </ul>
        )}
        <p className="border-t border-line px-4 py-3 text-xs text-ink-soft sm:px-5">Cada encarregado recebe uma só mensagem, com todas as mensalidades em aberto dos seus filhos.</p>
      </Card>
      <Card title="Avisos de cobrança enviados" className="mt-5" pad={false}>
        {!reminders.length ? (
          <p className="p-5 text-sm text-ink-soft">Ainda não foram enviados avisos. Ative-os nas definições da instituição.</p>
        ) : (
          <ul className="divide-y divide-line">
            {reminders.map((r, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 px-5 py-3 text-sm">
                <span>Fatura {r.number} · {r.childName} · {r.stage === 0 ? "aviso manual" : `${r.stage} dia(s) após o vencimento`}</span>
                <span className="text-ink-soft">{r.email} · {r.sentAt.toISOString().slice(0, 16).replace("T", " ")}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function FeePlanForm({ slug, plan }: { slug: string; plan?: { id: string; name: string; amount: string; active: boolean } }) {
  return (
    <ActionForm action={saveFeePlanAction} hidden={{ slug, feePlanId: plan?.id }} className="space-y-3" resetOnSuccess={!plan}>
      <Field label="Nome"><input name="name" className="input" required maxLength={80} defaultValue={plan?.name} placeholder="Ex.: Tempo inteiro" /></Field>
      <Field label="Valor mensal"><input name="amount" className="input" required inputMode="decimal" defaultValue={plan?.amount} /></Field>
      {plan && (
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="active" defaultChecked={plan.active} className="h-5 w-5 accent-[rgb(var(--accent))]" /> Disponível para novas inscrições</label>
      )}
      <div className="flex justify-end"><Submit>{plan ? "Guardar" : "Criar mensalidade"}</Submit></div>
    </ActionForm>
  );
}

