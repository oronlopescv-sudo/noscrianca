export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NC_DISABLE_SCHEDULER !== "1") {
    const { startScheduler } = await import("@/lib/services/scheduler");
    await startScheduler();
  }
}
