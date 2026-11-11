import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";
import { ActionButton, ActionForm, AutoRefresh, ConfirmAction, CopyField, FormFooter, Modal } from "@/components/ui/client";
import { Badge, Card, Check, DL, EmptyState, Field, Notice, PageHeader, Tabs } from "@/components/ui/kit";
import { central, c } from "@/db/central";
import { getTenantDb, t } from "@/db/tenant";
import { env } from "@/lib/env";
import { bytes, fmtDateObj, fmtDateTime, money } from "@/lib/format";
import { CYCLE_LABEL, INSTITUTION_STATUS, PLATFORM_INVOICE_STATUS, USER_STATUS } from "@/lib/labels";
import { DIRECTOR_KEY } from "@/lib/permissions";
import { InvoiceRowActions } from "../../invoice-actions";
import { PROVISION_STEPS } from "@/lib/services/provisioning";
import {
  activateInstitutionAction, addDirectorAction, archiveInstitutionAction, backupNowAction, deleteFailedInstitutionAction, directorAccessLinkAction,
  impersonateAction, issueInvoiceAction, refreshStatsAction, removeDirectorAction, restoreBackupAction, retryProvisionAction,
  setPrimaryDirectorAction, suspendInstitutionAction, updateInstitutionAction,
} from "../../../actions";

export const metadata = { title: "Instituição" };
const TABS = ["resumo", "provisionamento", "diretores", "faturas", "backups", "acoes"] as const;
const TAB_LABELS: Record<(typeof TABS)[number], string> = { resumo: "Resumo", provisionamento: "Provisionamento", diretores: "Diretores", faturas: "Faturas", backups: "Backups", acoes: "Ações" };

export default async function InstitutionDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : "resumo";
  const inst = await central().query.institutions.findFirst({ where: eq(c.institutions.id, id), with: { plan: true, database: true } });
  if (!inst) notFound();
  const live = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED"].includes(inst.status);
  const base = `/admin/instituicoes/${inst.id}`;
  const st = INSTITUTION_STATUS[inst.status];
  const hid = { institutionId: inst.id };

  return (
    <>
      <PageHeader
        title={inst.name} back={{ href: "/admin/instituicoes", label: "Instituições" }}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Badge tone={st.tone}>{st.label}</Badge><span className="font-mono text-xs">/c/{inst.slug}</span></span>}
        actions={live && inst.status !== "SUSPENDED" ? <ActionButton action={impersonateAction} hidden={hid} className="btn-secondary">Entrar como diretor</ActionButton> : undefined}
      />
      {inst.status === "SUSPENDED" && <div className="mb-4"><Notice tone="red">Instituição suspensa{inst.suspendReason ? `: ${inst.suspendReason}` : ""}. O diretor só pode consultar; os restantes utilizadores estão bloqueados.</Notice></div>}
      {inst.status === "FAILED" && <div className="mb-4"><Notice tone="red">A criação falhou. Abra o separador Provisionamento para tentar de novo ou eliminar.</Notice></div>}
      <Tabs current={tab} tabs={TABS.map((k) => ({ key: k, label: TAB_LABELS[k], href: `${base}?tab=${k}` }))} />
      {tab === "resumo" && <Summary inst={inst} live={live} />}
      {tab === "provisionamento" && <Provisioning institutionId={inst.id} slug={inst.slug} status={inst.status} />}
      {tab === "diretores" && <Directors institutionId={inst.id} live={live} primaryEmail={inst.directorEmail} maxDirectors={inst.maxDirectors} />}
      {tab === "faturas" && <Invoices institutionId={inst.id} canIssue={["TRIAL", "ACTIVE", "PAST_DUE"].includes(inst.status)} />}
      {tab === "backups" && <Backups institutionId={inst.id} slug={inst.slug} live={live} lastBackupAt={inst.lastBackupAt} />}
      {tab === "acoes" && <Actions inst={inst} live={live} />}
    </>
  );
}

type Inst = NonNullable<Awaited<ReturnType<typeof loadInst>>>;
function loadInst(id: string) {
  return central().query.institutions.findFirst({ where: eq(c.institutions.id, id), with: { plan: true, database: true } });
}

async function Summary({ inst, live }: { inst: Inst; live: boolean }) {
  const plans = await central().query.plans.findMany({ orderBy: (p, { asc }) => asc(p.priceMonthlyCents) });
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Card title="Dados da instituição" actions={
          <Modal trigger="Editar" triggerClass="btn-ghost btn-sm" title="Editar instituição" wide>
            <ActionForm action={updateInstitutionAction} hidden={{ institutionId: inst.id }} resetOnSuccess={false} className="space-y-4">
              <Field label="Nome"><input name="name" className="input" required defaultValue={inst.name} maxLength={120} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email"><input name="email" type="email" className="input" defaultValue={inst.email} /></Field>
                <Field label="Telefone"><input name="phone" className="input" defaultValue={inst.phone} maxLength={40} /></Field>
                <Field label="Morada"><input name="address" className="input" defaultValue={inst.address} maxLength={200} /></Field>
                <Field label="Cidade / ilha"><input name="city" className="input" defaultValue={inst.city} maxLength={80} /></Field>
                <Field label="Plano">
                  <select name="planId" className="input" defaultValue={inst.planId ?? ""} required>
                    {plans.filter((p) => p.active || p.id === inst.planId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </Field>
                <Field label="Ciclo de faturação">
                  <select name="billingCycle" className="input" defaultValue={inst.billingCycle}><option value="MONTHLY">Mensal</option><option value="YEARLY">Anual</option></select>
                </Field>
                <Field label="N.º máximo de diretores" hint="Diretores autorizados nesta instituição">
                  <input name="maxDirectors" type="number" min={1} max={10} className="input" defaultValue={inst.maxDirectors} required />
                </Field>
              </div>
              <FormFooter />
            </ActionForm>
          </Modal>
        }>
          <DL items={[
            ["Nome", inst.name], ["Endereço de acesso", <span key="u" className="break-all font-mono text-xs">{env.appUrl}/c/{inst.slug}</span>],
            ["Email", inst.email], ["Telefone", inst.phone], ["Morada", [inst.address, inst.city].filter(Boolean).join(", ")], ["Moeda", inst.currency],
            ["Diretor responsável", `${inst.directorName} · ${inst.directorEmail}`], ["Telefone do diretor", inst.directorPhone],
            ["Criada em", fmtDateTime(inst.createdAt)], ["Identificador", <span key="i" className="font-mono text-xs">{inst.id}</span>],
          ]} />
        </Card>
        <Card title="Assinatura">
          <DL items={[
            ["Plano", inst.plan ? `${inst.plan.name} (${CYCLE_LABEL[inst.billingCycle]})` : "Sem plano"],
            ["Limite de crianças do plano", inst.plan?.maxChildren ? String(inst.plan.maxChildren) : "Sem limite"],
            ["Fim do período de teste", fmtDateObj(inst.trialEndsAt)], ["Pago até", fmtDateObj(inst.currentPeriodEnd)],
          ]} />
          {inst.plan?.maxChildren && inst.childrenCount > inst.plan.maxChildren && (
            <div className="mt-4"><Notice tone="amber">Esta instituição tem {inst.childrenCount} crianças ativas, acima do limite do plano ({inst.plan.maxChildren}).</Notice></div>
          )}
        </Card>
      </div>
      <div className="space-y-5">
        <Card title="Estatísticas" actions={live ? <ActionButton action={refreshStatsAction} hidden={{ institutionId: inst.id }}>Atualizar</ActionButton> : undefined}>
          <DL items={[["Crianças ativas", String(inst.childrenCount)], ["Utilizadores", String(inst.usersCount)]]} />
          <p className="mt-3 text-xs text-ink-soft">Atualizado: {fmtDateTime(inst.statsUpdatedAt)}</p>
        </Card>
        <Card title="Base de dados">
          {inst.database ? (
            <DL items={[
              ["Nome da BD", <span key="d" className="font-mono text-xs">{inst.database.dbName}</span>], ["Tamanho", inst.dbSizeBytes ? bytes(inst.dbSizeBytes) : "—"],
              ["Estado", live ? "Disponível" : "Indisponível"], ["Último backup", fmtDateTime(inst.lastBackupAt)],
            ]} />
          ) : <p className="text-sm text-ink-soft">A base de dados ainda não foi criada.</p>}
        </Card>
      </div>
    </div>
  );
}

async function Provisioning({ institutionId, slug, status }: { institutionId: string; slug: string; status: string }) {
  const job = await central().query.provisioningJobs.findFirst({ where: eq(c.provisioningJobs.institutionId, institutionId), orderBy: desc(c.provisioningJobs.createdAt) });
  if (!job) return <Card><EmptyState title="Sem registo de provisionamento" /></Card>;
  const running = job.status === "RUNNING" || job.status === "PENDING";
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <AutoRefresh active={running} seconds={2} />
      <Card title="Criação automática da instituição" actions={
        job.status === "DONE" ? <Badge tone="green">Concluído</Badge> : job.status === "FAILED" ? <Badge tone="red">Falhou</Badge> : <Badge tone="blue">Em curso</Badge>
      }>
        <ol className="space-y-3">
          {PROVISION_STEPS.map((label, i) => {
            const entry = job.log.find((l) => l.step === i + 1);
            const state = entry?.status ?? "pending";
            return (
              <li key={label} className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0">
                  {state === "done" ? <CheckCircle2 size={20} className="text-emerald-500" /> : state === "failed" ? <XCircle size={20} className="text-red-500" />
                    : state === "running" ? <Loader2 size={20} className="animate-spin text-accent" /> : <CircleDashed size={20} className="text-ink-soft/50" />}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{i + 1}. {label}</p>
                  {entry?.message && <p className={`break-words text-xs ${state === "failed" ? "text-red-600" : "text-ink-soft"}`}>{entry.message}</p>}
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 text-xs text-ink-soft">Tentativas: {job.attempts} · Iniciado: {fmtDateTime(job.createdAt)}{job.finishedAt ? ` · Concluído: ${fmtDateTime(job.finishedAt)}` : ""}</p>
        {job.status === "FAILED" && (
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton action={retryProvisionAction} hidden={{ institutionId }} className="btn-primary">Tentar de novo</ActionButton>
            {status === "FAILED" && (
              <ConfirmAction action={deleteFailedInstitutionAction} hidden={{ institutionId }} label="Eliminar (rollback)" triggerClass="btn-ghost" danger
                title="Eliminar criação falhada" text="Apaga a base de dados parcial e o registo desta instituição. Esta ação não pode ser desfeita." confirmLabel="Eliminar" />
            )}
          </div>
        )}
      </Card>
      {job.status === "DONE" && job.inviteUrl && (
        <Card title="Convite do diretor">
          <p className="mb-3 text-sm text-ink-soft">Envie este link ao diretor para definir a palavra-passe (válido por 72 horas, uso único). Pode gerar um novo no separador Diretores.</p>
          <CopyField value={job.inviteUrl} />
        </Card>
      )}
      {job.status === "DONE" && <Notice tone="green">Instituição pronta em <span className="font-mono">/c/{slug}</span>.</Notice>}
    </div>
  );
}

async function Directors({ institutionId, live, primaryEmail, maxDirectors }: { institutionId: string; live: boolean; primaryEmail: string; maxDirectors: number }) {
  if (!live) return <Card><EmptyState title="Base de dados indisponível" text="Os diretores só podem ser geridos depois de a instituição estar criada." /></Card>;
  const db = await getTenantDb(institutionId);
  const role = await db.query.roles.findFirst({ where: eq(t.roles.key, DIRECTOR_KEY) });
  const directors = role ? await db.query.users.findMany({ where: eq(t.users.roleId, role.id), orderBy: (u, { asc }) => asc(u.createdAt) }) : [];
  const activeCount = directors.filter((d) => d.status !== "SUSPENDED").length;
  const hid = { institutionId };
  return (
    <Card title={`Diretores (${activeCount} de ${maxDirectors} autorizados)`} pad={false} actions={
      <Modal trigger="Adicionar diretor" triggerClass="btn-primary btn-sm" title="Adicionar diretor" disabled={activeCount >= maxDirectors}>
        <ActionForm action={addDirectorAction} hidden={hid} className="space-y-4">
          <Field label="Nome"><input name="name" className="input" required minLength={2} maxLength={120} /></Field>
          <Field label="Email"><input name="email" type="email" className="input" required /></Field>
          <Field label="Telefone"><input name="phone" className="input" maxLength={40} /></Field>
          <Check name="makePrimary" label="Tornar diretor responsável" hint="Passa a ser o contacto principal da instituição" />
          <FormFooter submit="Criar e gerar convite" />
        </ActionForm>
      </Modal>
    }>
      {activeCount >= maxDirectors && <p className="border-b border-line px-5 py-3 text-xs text-ink-soft">Limite de diretores atingido. Para alterar o diretor, aumente o limite em Resumo → Editar, adicione o novo e remova o anterior.</p>}
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Diretor</th><th>Estado</th><th>Último acesso</th><th></th></tr></thead>
          <tbody>
            {directors.map((d) => (
              <tr key={d.id}>
                <td>
                  <p className="font-medium">{d.name} {d.email === primaryEmail && <Badge tone="accent">Responsável</Badge>}</p>
                  <p className="text-xs text-ink-soft">{d.email}{d.phone ? ` · ${d.phone}` : ""}</p>
                </td>
                <td><Badge tone={USER_STATUS[d.status].tone}>{USER_STATUS[d.status].label}</Badge></td>
                <td className="whitespace-nowrap text-ink-soft">{fmtDateTime(d.lastLoginAt)}</td>
                <td>
                  <div className="flex flex-wrap justify-end gap-2">
                    {d.status !== "SUSPENDED" && (
                      <Modal trigger={d.status === "INVITED" ? "Novo convite" : "Recuperar acesso"} triggerClass="btn-ghost btn-sm" title={d.status === "INVITED" ? "Gerar novo convite" : "Recuperar acesso do diretor"}>
                        <ActionForm action={directorAccessLinkAction} hidden={{ ...hid, userId: d.id }}>
                          <p className="text-sm text-ink-soft">Gera um link seguro para {d.name} {d.status === "INVITED" ? "ativar a conta" : "definir uma nova palavra-passe"}. Os links anteriores deixam de funcionar.</p>
                          <FormFooter submit="Gerar link" />
                        </ActionForm>
                      </Modal>
                    )}
                    {d.status !== "SUSPENDED" && d.email !== primaryEmail && <ActionButton action={setPrimaryDirectorAction} hidden={{ ...hid, userId: d.id }}>Tornar responsável</ActionButton>}
                    {d.status !== "SUSPENDED" && (
                      <ConfirmAction action={removeDirectorAction} hidden={{ ...hid, userId: d.id }} label="Remover acesso" danger title="Remover acesso do diretor"
                        text={`${d.name} deixa de conseguir entrar. O histórico mantém-se. A instituição tem de ficar com pelo menos um diretor.`} confirmLabel="Remover acesso" />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

async function Invoices({ institutionId, canIssue }: { institutionId: string; canIssue: boolean }) {
  const rows = await central().query.platformInvoices.findMany({ where: eq(c.platformInvoices.institutionId, institutionId), orderBy: desc(c.platformInvoices.issuedAt) });
  const now = new Date();
  return (
    <Card title="Faturas da plataforma" pad={false} actions={canIssue ? <ActionButton action={issueInvoiceAction} hidden={{ institutionId }} className="btn-primary btn-sm">Emitir próxima fatura</ActionButton> : undefined}>
      {rows.length === 0 ? <EmptyState title="Sem faturas" text="A primeira fatura é emitida no fim do período de teste, ou pode emiti-la já." /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>N.º</th><th>Descrição</th><th>Período</th><th>Valor</th><th>Vencimento</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td className="whitespace-nowrap font-medium">{v.number}</td>
                  <td>{v.description}</td>
                  <td className="whitespace-nowrap text-ink-soft">{fmtDateObj(v.periodStart)} – {fmtDateObj(v.periodEnd)}</td>
                  <td className="whitespace-nowrap font-medium">{money(v.amountCents, v.currency)}</td>
                  <td className="whitespace-nowrap">{fmtDateObj(v.dueDate)}</td>
                  <td>
                    <Badge tone={v.status === "OPEN" && v.dueDate < now ? "red" : PLATFORM_INVOICE_STATUS[v.status].tone}>{v.status === "OPEN" && v.dueDate < now ? "Em atraso" : PLATFORM_INVOICE_STATUS[v.status].label}</Badge>
                    {v.status === "PAID" && <p className="mt-0.5 text-xs text-ink-soft">{v.paymentMethod} · {fmtDateObj(v.paidAt)}</p>}
                  </td>
                  <td><InvoiceRowActions id={v.id} number={v.number} open={v.status === "OPEN"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

async function Backups({ institutionId, slug, live, lastBackupAt }: { institutionId: string; slug: string; live: boolean; lastBackupAt: Date | null }) {
  const rows = await central().query.backupRecords.findMany({ where: eq(c.backupRecords.institutionId, institutionId), orderBy: desc(c.backupRecords.createdAt), limit: 40 });
  return (
    <Card title="Backups independentes desta instituição" pad={false} actions={live ? <ActionButton action={backupNowAction} hidden={{ institutionId }} className="btn-primary btn-sm">Fazer backup agora</ActionButton> : undefined}>
      <p className="border-b border-line px-5 py-3 text-xs text-ink-soft">Backup automático diário · retenção de {env.backupRetentionDays} dias (os manuais são mantidos) · último: {fmtDateTime(lastBackupAt)}</p>
      {rows.length === 0 ? <EmptyState title="Ainda não há backups" text="O primeiro backup automático é feito no próximo ciclo diário." /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Data</th><th>Ficheiro</th><th>Tipo</th><th>Tamanho</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td className="whitespace-nowrap">{fmtDateTime(b.createdAt)}</td>
                  <td className="font-mono text-xs">{b.fileName}</td>
                  <td>{b.manual ? "Manual" : "Automático"}</td>
                  <td className="whitespace-nowrap">{b.sizeBytes ? bytes(b.sizeBytes) : "—"}</td>
                  <td>{b.status === "DONE" ? <Badge tone="green">Concluído</Badge> : b.status === "FAILED" ? <span title={b.error ?? ""}><Badge tone="red">Falhou</Badge></span> : <Badge tone="blue">Em curso</Badge>}</td>
                  <td className="text-right">
                    {b.status === "DONE" && live && (
                      <ConfirmAction action={restoreBackupAction} hidden={{ institutionId, backupId: b.id }} label="Restaurar" danger title="Restaurar este backup" confirmLabel="Restaurar"
                        text={`A base de dados desta instituição volta ao estado de ${fmtDateTime(b.createdAt)}. Tudo o que foi registado depois será perdido. Recomenda-se fazer um backup antes.`}>
                        <Field label={`Escreva "${slug}" para confirmar`}><input name="confirm" className="input font-mono" required autoComplete="off" /></Field>
                      </ConfirmAction>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Actions({ inst, live }: { inst: Inst; live: boolean }) {
  const hid = { institutionId: inst.id };
  const canSuspend = ["TRIAL", "ACTIVE", "PAST_DUE"].includes(inst.status);
  const canActivate = ["SUSPENDED", "PAST_DUE", "TRIAL", "ARCHIVED"].includes(inst.status);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card title="Ativar / suspender">
        <p className="mb-4 text-sm text-ink-soft">Uma instituição suspensa perde o acesso operacional: o diretor só consulta e os restantes utilizadores ficam bloqueados. Os dados são mantidos.</p>
        <div className="flex flex-wrap gap-2">
          {canActivate && <ConfirmAction action={activateInstitutionAction} hidden={hid} label="Ativar instituição" triggerClass="btn-primary" title="Ativar instituição" text="A instituição volta a ter acesso total." confirmLabel="Ativar" />}
          {canSuspend && (
            <ConfirmAction action={suspendInstitutionAction} hidden={hid} label="Suspender instituição" triggerClass="btn-ghost" danger title="Suspender instituição" confirmLabel="Suspender">
              <Field label="Motivo da suspensão"><input name="reason" className="input" required minLength={3} maxLength={200} /></Field>
            </ConfirmAction>
          )}
          {!canActivate && !canSuspend && <p className="text-sm text-ink-soft">Indisponível no estado atual.</p>}
        </div>
      </Card>
      <Card title="Suporte">
        <p className="mb-4 text-sm text-ink-soft">Entre no painel da instituição como diretor para prestar suporte. A sessão dura 2 horas e fica registada na auditoria da plataforma e da instituição.</p>
        {live && inst.status !== "SUSPENDED"
          ? <ActionButton action={impersonateAction} hidden={hid} className="btn-secondary">Entrar como diretor</ActionButton>
          : <p className="text-sm text-ink-soft">Disponível apenas para instituições em funcionamento.</p>}
        <p className="mt-4 text-sm text-ink-soft">Para recuperar a conta de um diretor ou alterar o diretor responsável, use o separador <Link href={`/admin/instituicoes/${inst.id}?tab=diretores`} className="link">Diretores</Link>.</p>
      </Card>
      {live && (
        <Card title="Arquivar">
          <p className="mb-4 text-sm text-ink-soft">Arquivar encerra o acesso de todos os utilizadores. A base de dados e os backups são mantidos e a instituição pode ser reativada mais tarde.</p>
          <ConfirmAction action={archiveInstitutionAction} hidden={hid} label="Arquivar instituição" triggerClass="btn-ghost" danger title="Arquivar instituição" confirmLabel="Arquivar">
            <Field label={`Escreva "${inst.slug}" para confirmar`}><input name="confirm" className="input font-mono" required autoComplete="off" /></Field>
          </ConfirmAction>
        </Card>
      )}
    </div>
  );
}
