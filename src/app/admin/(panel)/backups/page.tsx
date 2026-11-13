import Link from "next/link";
import { desc, inArray } from "drizzle-orm";
import { DatabaseBackup } from "lucide-react";
import { ActionButton, ConfirmAction, Modal } from "@/components/ui/client";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/kit";
import { central, c } from "@/db/central";
import { env } from "@/lib/env";
import { bytes, fmtDateTime } from "@/lib/format";
import { INSTITUTION_STATUS } from "@/lib/labels";
import { listCentralBackups } from "@/lib/services/ops";
import { backupAllAction, backupCentralNowAction, backupNowAction, migrateAllAction } from "../../actions";
export const metadata = { title: "Backups e bases de dados" };

export default async function BackupsPage() {
  const insts = await central().query.institutions.findMany({
    where: inArray(c.institutions.status, ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED"]), with: { database: true }, orderBy: (i, { asc }) => asc(i.name),
  });
  const recent = await central().query.backupRecords.findMany({ orderBy: desc(c.backupRecords.createdAt), limit: 30, with: { institution: true } });
  const jobs = await central().query.provisioningJobs.findMany({ orderBy: desc(c.provisioningJobs.createdAt), limit: 10, with: { institution: true } });
  const centralBackups = await listCentralBackups();
  const totalSize = insts.reduce((a, b) => a + b.dbSizeBytes, 0);

  return (
    <>
      <PageHeader title="Backups e bases de dados" subtitle={`${insts.length} bases de dados independentes · ${bytes(totalSize)} no total · retenção de ${env.backupRetentionDays} dias`}
        actions={<>
          <ConfirmAction action={migrateAllAction} hidden={{}} label="Migrar todas" triggerClass="btn-ghost" title="Aplicar migrations a todas as BDs" confirmLabel="Aplicar"
            text="Aplica as migrations versionadas em falta a cada base de dados de instituição. É seguro repetir." />
          <ConfirmAction action={backupAllAction} hidden={{}} label="Backup de todas" triggerClass="btn-primary" title="Fazer backup de todas as instituições" confirmLabel="Iniciar backups"
            text="Cria um backup manual independente de cada instituição. Pode demorar alguns minutos." />
        </>} />
      <Card title="Cópias de segurança da plataforma (base central)" pad={false} className="mb-5"
        actions={<>
          <Modal trigger="Carregar cópia" triggerClass="btn-ghost btn-sm" title="Carregar cópia da base central">
            <form method="post" action="/admin/backups/carregar" encType="multipart/form-data">
              <input type="hidden" name="pcentral" value="1" />
              <p className="mb-3 text-sm text-ink-soft">Traga de volta um ficheiro de cópia que descarregou antes — por exemplo, para restaurar numa instalação nova. O restauro corre depois por comando no servidor.</p>
              <input type="file" name="ficheiro" accept=".dump,.backup" required className="input" autoComplete="off" />
              <div className="mt-4 flex justify-end gap-2"><button type="submit" className="btn-primary">Subir e validar</button></div>
            </form>
          </Modal>
          <ConfirmAction action={backupCentralNowAction} hidden={{}} label="Backup agora" triggerClass="btn-primary btn-sm" title="Copiar a base central" confirmLabel="Copiar"
            text="Cria uma cópia (pg_dump) da base central: contas de acesso, instituições, planos, faturas da plataforma e o registo dos backups." />
        </>}>
        <p className="border-b border-line px-5 py-3 text-xs text-ink-soft">
          A base central é o que faz o painel existir: se o servidor se perde, é por aqui que a plataforma volta. Cópia diária automática · retenção de {env.backupRetentionDays} dias · descarregue pelo menos uma cópia para fora do servidor.
        </p>
        {centralBackups.length === 0 ? <EmptyState icon={<DatabaseBackup size={24} />} title="Ainda não há cópias da central" text="Faça a primeira cópia com «Backup agora»." /> : (
          <ul className="divide-y divide-line/70">
            {centralBackups.slice(0, 8).map((f) => (
              <li key={f.fileName} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium font-mono text-xs">{f.fileName}</p>
                  <p className="text-xs text-ink-soft">{fmtDateTime(f.createdAt)} · {bytes(f.sizeBytes)}</p>
                </div>
                <a className="btn-ghost btn-sm shrink-0" href={`/admin/backups/descarregar/central?ficheiro=${encodeURIComponent(f.fileName)}`}>Descarregar</a>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Estado das bases de dados" pad={false} className="mb-5">
        {insts.length === 0 ? <EmptyState icon={<DatabaseBackup size={24} />} title="Sem bases de dados" text="As bases de dados aparecem aqui depois de criar instituições." /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Instituição</th><th>Base de dados</th><th>Estado</th><th>Tamanho</th><th>Último backup</th><th></th></tr></thead>
              <tbody>
                {insts.map((i) => (
                  <tr key={i.id}>
                    <td><Link href={`/admin/instituicoes/${i.id}?tab=backups`} className="font-medium hover:text-accent">{i.name}</Link></td>
                    <td className="font-mono text-xs">{i.database?.dbName ?? "—"}</td>
                    <td><Badge tone={INSTITUTION_STATUS[i.status].tone}>{INSTITUTION_STATUS[i.status].label}</Badge></td>
                    <td className="whitespace-nowrap">{i.dbSizeBytes ? bytes(i.dbSizeBytes) : "—"}</td>
                    <td className="whitespace-nowrap text-ink-soft">{fmtDateTime(i.lastBackupAt)}</td>
                    <td className="text-right"><ActionButton action={backupNowAction} hidden={{ institutionId: i.id }}>Backup agora</ActionButton></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Backups recentes" pad={false}>
          {recent.length === 0 ? <EmptyState title="Ainda não há backups" /> : (
            <ul className="divide-y divide-line/70">
              {recent.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{b.institution.name}</p>
                    <p className="text-xs text-ink-soft">{fmtDateTime(b.createdAt)} · {b.manual ? "Manual" : "Automático"}{b.sizeBytes ? ` · ${bytes(b.sizeBytes)}` : ""}</p>
                    {b.error && <p className="break-words text-xs text-red-600">{b.error}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {b.status === "DONE" && <a className="btn-ghost btn-sm" href={`/admin/backups/descarregar/${b.id}`}>Descarregar</a>}
                    {b.status === "DONE" ? <Badge tone="green">Concluído</Badge> : b.status === "FAILED" ? <Badge tone="red">Falhou</Badge> : <Badge tone="blue">Em curso</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Fila de provisionamento" pad={false}>
          {jobs.length === 0 ? <EmptyState title="Sem jobs" /> : (
            <ul className="divide-y divide-line/70">
              {jobs.map((j) => (
                <li key={j.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <Link href={`/admin/instituicoes/${j.institutionId}?tab=provisionamento`} className="truncate font-medium hover:text-accent">{j.institution.name}</Link>
                    <p className="text-xs text-ink-soft">{fmtDateTime(j.createdAt)} · passo {j.step} de 7 · {j.attempts} tentativa(s)</p>
                  </div>
                  {j.status === "DONE" ? <Badge tone="green">Concluído</Badge> : j.status === "FAILED" ? <Badge tone="red">Falhou</Badge> : <Badge tone="blue">Em curso</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
