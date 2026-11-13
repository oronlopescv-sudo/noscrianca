import "./_env";
import { eq } from "drizzle-orm";
import { central, c, closeCentral } from "@/db/central";
import { closeAllTenantPools } from "@/db/tenant";
import { backupCentral, backupInstitution, listCentralBackups, migrateAllTenants, restoreCentralBackup, restoreInstitution } from "@/lib/services/ops";
import { bytes, fmtDateTime } from "@/lib/format";
import { hardenTenantIsolation } from "@/lib/services/provisioning";

/**
 * CLI de manutenção das bases de dados das instituições.
 *   npm run tenants:migrate                  aplica migrações em todas as instituições ativas
 *                                            e endurece o isolamento das roles (sem CONNECT)
 *   npm run tenants:backup -- <slug>         cópia de segurança manual de uma instituição
 *   npm run tenants:restore -- <slug> <id>   repõe uma cópia de segurança (id em backup_records)
 *   npm run tenants:central-backup           cópia da base central (plataforma)
 *   npm run tenants:central-list             lista as cópias da central no servidor
 *   npm run tenants:central-restore -- <f>   repõe a central a partir de um ficheiro (site PARADO!)
 *
 * Na imagem Docker (produção) a CLI via npm não existe: os mesmos comandos correm com
 * `docker exec <app> node ops.js …` (a CLI vem empacotada no arranque da imagem).
 */
async function main() {
  const [cmd, slug, extra] = process.argv.slice(2);
  if (cmd === "migrate") {
    const report = await migrateAllTenants();
    for (const r of report) console.log(`${r.ok ? "✓" : "✗"} ${r.slug}${r.error ? ` — ${r.error}` : ""}`);
    if (report.some((r) => !r.ok)) process.exitCode = 1;
    const hardened = await hardenTenantIsolation();
    console.log(`Isolamento verificado em ${hardened} base(s) de dados.`);
    return;
  }
  if (cmd === "central-backup") {
    const r = await backupCentral();
    console.log(`Cópia da central criada: ${r.fileName} (${bytes(r.sizeBytes)}).`);
    return;
  }
  if (cmd === "central-list") {
    for (const f of await listCentralBackups()) console.log(`${f.fileName}  ${bytes(f.sizeBytes)}  ${fmtDateTime(f.createdAt)}`);
    if ((await listCentralBackups()).length === 0) console.log("Sem cópias da central no servidor.");
    return;
  }
  if (cmd === "central-restore") {
    if (!slug) throw new Error("Indique o ficheiro de cópia: central-restore <nome-do-ficheiro> (veja a lista com central-list)");
    await restoreCentralBackup(slug);
    console.log("Central restaurada. Inicie o site de novo e verifique o login do admin.");
    return;
  }
  if (cmd === "backup" || cmd === "restore") {
    if (!slug) throw new Error(`Indique o endereço da instituição: ${cmd} <slug>`);
    const inst = await central().query.institutions.findFirst({ where: eq(c.institutions.slug, slug) });
    if (!inst) throw new Error(`Instituição "${slug}" não encontrada.`);
    if (cmd === "backup") {
      const r = await backupInstitution(inst.id, true);
      console.log(`Cópia de segurança criada: ${JSON.stringify(r ?? {}, null, 2)}`);
    } else {
      if (!extra) throw new Error("Indique o id da cópia de segurança.");
      await restoreInstitution(inst.id, extra);
      console.log("Restauro concluído.");
    }
    return;
  }
  console.log("Uso: migrate | backup <slug> | restore <slug> <id-da-cópia> | central-backup | central-list | central-restore <ficheiro>");
  console.log("(em desenvolvimento via npm run tenants:…; na imagem Docker via docker exec <app> node ops.js …)");
  process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(async () => { await closeAllTenantPools(); await closeCentral(); });
