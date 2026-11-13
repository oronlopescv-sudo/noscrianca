import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq, lt } from "drizzle-orm";
import { central, c } from "@/db/central";
import { getTenantDb } from "@/db/tenant";
import { todayIn } from "@/lib/format";
import { bootstrapCentral } from "./bootstrap";
import { generateMonthlyInvoices } from "./finance";
import { anonymizeOldEnrollments } from "./retention";
import { sendOverdueReminders } from "./reminders";
import { backupCentral, backupInstitution, liveInstitutions, migrateAllTenants, pruneBackups, refreshStats } from "./ops";
import { runBillingCycle } from "./platform-billing";
import { hardenTenantIsolation, resumePendingJobs } from "./provisioning";

const g = globalThis as unknown as { __ncScheduler?: boolean; __ncTick?: boolean; __ncOnceFails?: Map<string, number> };
const MAX_RETRIES = 10;

/**
 * Garante que uma tarefa corre uma única vez por chave (mesmo com vários
 * processos). Se a tarefa falhar, o lock é libertado e volta a tentar no tick
 * seguinte; depois de várias falhas seguidas desiste para não fustigar a base
 * de dados (a tarefa volta no dia/mês seguinte ou por restart).
 */
async function once(key: string, fn: () => Promise<void>) {
  const inserted = await central().insert(c.schedulerLocks).values({ key, runAt: new Date() }).onConflictDoNothing().returning();
  if (!inserted.length) return;
  try {
    await fn();
    g.__ncOnceFails?.delete(key);
  } catch (e) {
    console.error(`[scheduler] ${key}:`, (e as Error).message);
    const fails = ((g.__ncOnceFails ??= new Map()).get(key) ?? 1) + 1;
    g.__ncOnceFails.set(key, fails);
    if (fails < MAX_RETRIES) await central().delete(c.schedulerLocks).where(eq(c.schedulerLocks.key, key)); // volta a tentar no tick seguinte
  }
}

/** Tarefas globais: correm uma vez por dia (data UTC — a central opera em UTC). */
async function runGlobalDailyTasks() {
  await runBillingCycle();
  await central().delete(c.sessions).where(lt(c.sessions.expiresAt, new Date()));
  // A central também se copia todos os dias: é a base que guarda as contas de
  // acesso e as instituições — sem ela as cópias das instituições não chegam.
  const cb = await backupCentral();
  console.log(`[backup] central: ${cb.fileName} (${Math.ceil(cb.sizeBytes / 1024)} KB)`);
}

/** Tarefas de cada instituição, à meia-noite LOCAL de cada uma. */
async function runInstitutionDailyTasks(instId: string, slug: string, timezone: string, isSuspended: boolean, today: string) {
  try {
    if (!isSuspended) {
      // Geração mensal automática das mensalidades (idempotente).
      await generateMonthlyInvoices(await getTenantDb(instId), today.slice(0, 7), today);
      // Avisos automáticos de faturas em atraso (email e notificação no portal).
      const r = await sendOverdueReminders({ id: instId, slug, timezone });
      if (r.sent || r.failed) console.log(`[avisos] ${slug}: ${r.sent} enviados, ${r.failed} falhados`);
      // Retenção: pedidos de inscrição antigos passam a anónimos (sem PII).
      const pruned = await anonymizeOldEnrollments(await getTenantDb(instId));
      if (pruned) console.log(`[retenção] ${slug}: ${pruned} pedido(s) de inscrição anonimizado(s)`);
    }
    await refreshStats(instId);
    await backupInstitution(instId, false);
  } catch (e) {
    console.error(`[scheduler] ${slug}:`, (e as Error).message);
    throw e;
  }
}

/**
 * Selo do estado das migrações empacotadas (central + tenant): muda sempre que
 * um deploy traz migrações novas, e só nesses casos vale uma re-execução.
 * O servidor standalone tem `./drizzle` na raiz da aplicação (Dockerfile).
 */
async function migrationsStamp(): Promise<string> {
  const last = async (f: string): Promise<string> => {
    const j = JSON.parse(await readFile(path.join(process.cwd(), "drizzle", f), "utf8")) as { entries: { when: number }[] };
    return String(j.entries?.at(-1)?.when ?? 0);
  };
  return `${await last(path.join("central", "meta", "_journal.json"))}-${await last(path.join("tenant", "meta", "_journal.json"))}`;
}

/** Aplica as migrações a todas as instituições ativas e endurece o isolamento. */
async function migrateTenantsAtBoot() {
  const report = await migrateAllTenants();
  for (const r of report) console.log(`[arranque] migrações ${r.slug}: ${r.ok ? "aplicadas" : `FALHARAM — ${r.error}`}`);
  const falharam = report.filter((r) => !r.ok);
  if (falharam.length) throw new Error(`migrações falharam em: ${falharam.map((f) => f.slug).join(", ")}`);
  const n = await hardenTenantIsolation();
  console.log(`[arranque] migrações de instituições ao dia; isolamento verificado em ${n} base(s).`);
}

async function tick() {
  if (g.__ncTick) return;
  g.__ncTick = true;
  try {
    // As migrações de tenant correm no próprio arranque (a central é preparada
    // antes, em startScheduler): cada deploy atualiza a base de todas as
    // instituições sem passo manual. Se falhar, a tarefa re-tenta no seguinte.
    await once(`arranque-migracoes:${await migrationsStamp()}`, migrateTenantsAtBoot);
    await resumePendingJobs();
    await once(`daily-geral:${new Date().toISOString().slice(0, 10)}`, runGlobalDailyTasks);
    // Cada instituição tem o seu próprio dia: as tarefas correm quando o dia
    // LOCAL muda (tenants a oeste do UTC nunca ficam desatualizados).
    for (const inst of await liveInstitutions()) {
      const today = todayIn(inst.timezone);
      await once(
        `daily-inst:${inst.id}:${today}`,
        () => runInstitutionDailyTasks(inst.id, inst.slug, inst.timezone, inst.status === "SUSPENDED", today),
      );
    }
    await pruneBackups();
    await central().delete(c.schedulerLocks).where(lt(c.schedulerLocks.runAt, new Date(Date.now() - 30 * 86_400_000)));
  } catch (e) {
    console.error("[scheduler]", (e as Error).message);
  } finally {
    g.__ncTick = false;
  }
}

/** Arranca dentro do próprio processo Next.js (instrumentation.ts). */
export async function startScheduler() {
  if (g.__ncScheduler) return;
  g.__ncScheduler = true;
  try {
    await bootstrapCentral((m) => console.log(`[arranque] ${m}`));
  } catch (e) {
    console.error("[arranque] Falha ao preparar a BD central:", (e as Error).message);
  }
  setTimeout(tick, 5_000).unref?.();
  setInterval(tick, 60_000).unref?.();
}
