import { lt } from "drizzle-orm";
import { central, c } from "@/db/central";
import { getTenantDb } from "@/db/tenant";
import { todayIn } from "@/lib/format";
import { bootstrapCentral } from "./bootstrap";
import { generateMonthlyInvoices } from "./finance";
import { sendOverdueReminders } from "./reminders";
import { backupInstitution, liveInstitutions, pruneBackups, refreshStats } from "./ops";
import { runBillingCycle } from "./platform-billing";
import { resumePendingJobs } from "./provisioning";

const g = globalThis as unknown as { __ncScheduler?: boolean; __ncTick?: boolean };

/** Garante que uma tarefa corre uma única vez por chave (mesmo com vários processos). */
async function once(key: string, fn: () => Promise<void>) {
  const inserted = await central().insert(c.schedulerLocks).values({ key, runAt: new Date() }).onConflictDoNothing().returning();
  if (!inserted.length) return;
  try {
    await fn();
  } catch (e) {
    console.error(`[scheduler] ${key}:`, (e as Error).message);
  }
}

export async function runDailyTasks() {
  await runBillingCycle();
  await central().delete(c.sessions).where(lt(c.sessions.expiresAt, new Date()));
  for (const inst of await liveInstitutions()) {
    try {
      const today = todayIn(inst.timezone);
      if (inst.status !== "SUSPENDED") {
        // Geração mensal automática das mensalidades (idempotente).
        await generateMonthlyInvoices(await getTenantDb(inst.id), today.slice(0, 7), today);
        // Avisos automáticos de faturas em atraso (email e notificação no portal).
        const r = await sendOverdueReminders(inst);
        if (r.sent || r.failed) console.log(`[avisos] ${inst.slug}: ${r.sent} enviados, ${r.failed} falhados`);
      }
      await refreshStats(inst.id);
      await backupInstitution(inst.id, false);
    } catch (e) {
      console.error(`[scheduler] ${inst.slug}:`, (e as Error).message);
    }
  }
  await pruneBackups();
  await central().delete(c.schedulerLocks).where(lt(c.schedulerLocks.runAt, new Date(Date.now() - 30 * 86_400_000)));
}

async function tick() {
  if (g.__ncTick) return;
  g.__ncTick = true;
  try {
    await resumePendingJobs();
    await once(`daily:${new Date().toISOString().slice(0, 10)}`, runDailyTasks);
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
