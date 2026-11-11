import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { env } from "@/lib/env";

const root = () => path.join(process.cwd(), "drizzle");

export async function migrateCentral() {
  const pool = new Pool({ connectionString: env.centralUrl, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: path.join(root(), "central") });
  } finally {
    await pool.end();
  }
}

/** Aplica as migrations versionadas a uma BD de tenant (idempotente). */
export async function migrateTenant(connectionString: string) {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: path.join(root(), "tenant") });
  } finally {
    await pool.end();
  }
}
