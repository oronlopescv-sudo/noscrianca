import Link from "next/link";
import { desc, inArray } from "drizzle-orm";
import { DatabaseBackup } from "lucide-react";
import { ActionButton, ConfirmAction } from "@/components/ui/client";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/kit";
import { central, c } from "@/db/central";
import { env } from "@/lib/env";
import { bytes, fmtDateTime } from "@/lib/format";
import { INSTITUTION_STATUS } from "@/lib/labels";
import { backupAllAction, backupNowAction, migrateAllAction } from "../../actions";

export const metadata = { title: "Backups e bases de dados" };

export default async function BackupsPage() {
  const insts = await central().query.institutions.findMany({
    where: inArray(c.institutions.status, ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED"]), with: { database: true }, orderBy: (i, { asc }) => asc(i.name),
  });
  const recent = await central().query.backupRecords.findMany({ orderBy: desc(c.backupRecords.createdAt), limit: 30, with: { institution: true } });
  const jobs = await central().query.provisioningJobs.findMany({ orderBy: desc(c.provisioningJobs.createdAt), limit: 10, with: { institution: true } });
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
                  {b.status === "DONE" ? <Badge tone="green">Concluído</Badge> : b.status === "FAILED" ? <Badge tone="red">Falhou</Badge> : <Badge tone="blue">Em curso</Badge>}
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
