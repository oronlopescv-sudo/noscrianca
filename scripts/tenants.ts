import "./_env";
import { eq } from "drizzle-orm";
import { central, c, closeCentral } from "@/db/central";
import { closeAllTenantPools } from "@/db/tenant";
import { backupInstitution, migrateAllTenants, restoreInstitution } from "@/lib/services/ops";
import { hardenTenantIsolation } from "@/lib/services/provisioning";

/**
 * CLI de manutenção das bases de dados das instituições.
 *   npm run tenants:migrate                  aplica migrações em todas as instituições ativas
 *                                            e endurece o isolamento das roles (sem CONNECT)
 *   npm run tenants:backup -- <slug>         cópia de segurança manual de uma instituição
 *   npm run tenants:restore -- <slug> <id>   repõe uma cópia de segurança (id em backup_records)
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
  if (cmd === "backup" || cmd === "restore") {
    if (!slug) throw new Error(`Indique o endereço da instituição: npm run tenants:${cmd} -- <slug>`);
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
  console.log("Uso: tenants.ts migrate | backup <slug> | restore <slug> <backupId>");
  process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(async () => { await closeAllTenantPools(); await closeCentral(); });
