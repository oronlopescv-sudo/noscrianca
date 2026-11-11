import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type CentralDb = NodePgDatabase<typeof schema>;

const g = globalThis as unknown as { __ncCentral?: { pool: Pool; db: CentralDb } };

function init() {
  const pool = new Pool({ connectionString: env.centralUrl, max: 10, idleTimeoutMillis: 30_000 });
  pool.on("error", (e) => console.error("[central pool]", e.message));
  return { pool, db: drizzle(pool, { schema }) };
}

export function central(): CentralDb {
  return (g.__ncCentral ??= init()).db;
}

export function centralPool(): Pool {
  return (g.__ncCentral ??= init()).pool;
}

export async function closeCentral() {
  if (g.__ncCentral) {
    await g.__ncCentral.pool.end();
    g.__ncCentral = undefined;
  }
}

export { schema as c };
