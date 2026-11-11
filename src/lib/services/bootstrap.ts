import { count } from "drizzle-orm";
import { central, centralPool, c } from "@/db/central";
import { migrateCentral } from "@/db/migrate";
import { hashPassword } from "@/lib/crypto";

/**
 * Prepara a BD central: migrations, definições, planos iniciais e primeiro
 * Super Admin (a partir de SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD).
 * Idempotente — corre em cada arranque.
 */
export async function bootstrapCentral(log: (m: string) => void = () => {}) {
  await migrateCentral();
  const pool = centralPool();
  // Nenhuma role de tenant pode ligar-se à BD central.
  const dbName = (await pool.query("SELECT current_database() AS d")).rows[0].d as string;
  await pool.query(`REVOKE ALL ON DATABASE "${dbName.replace(/"/g, "")}" FROM PUBLIC`).catch(() => {});

  await central().insert(c.platformSettings).values({ id: 1 }).onConflictDoNothing();

  const [{ n: planCount }] = await central().select({ n: count() }).from(c.plans);
  if (planCount === 0) {
    await central().insert(c.plans).values([
      { name: "Essencial", description: "Até 40 crianças", priceMonthlyCents: 350000, priceYearlyCents: 3500000, maxChildren: 40 },
      { name: "Profissional", description: "Até 120 crianças", priceMonthlyCents: 650000, priceYearlyCents: 6500000, maxChildren: 120 },
      { name: "Ilimitado", description: "Sem limite de crianças", priceMonthlyCents: 950000, priceYearlyCents: 9500000, maxChildren: null },
    ]);
    log("Planos iniciais criados.");
  }

  const [{ n: adminCount }] = await central().select({ n: count() }).from(c.platformUsers);
  if (adminCount === 0) {
    const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.SUPERADMIN_PASSWORD;
    if (email && password && password.length >= 8) {
      await central().insert(c.platformUsers).values({
        email, name: process.env.SUPERADMIN_NAME || "Super Administrador", passwordHash: await hashPassword(password),
      });
      log(`Super Admin criado: ${email}`);
    } else {
      log("AVISO: sem Super Admin. Defina SUPERADMIN_EMAIL e SUPERADMIN_PASSWORD (mín. 8 caracteres) e reinicie.");
    }
  }
}
