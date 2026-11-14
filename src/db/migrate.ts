import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { env } from "@/lib/env";

const root = () => path.join(process.cwd(), "drizzle");

/**
 * Fechadura de migração por base (advisory lock). O migrator do drizzle não
 * serializa corridas concorrentes (CREATE TABLE IF NOT EXISTS + registo no
 * journal), e há duas rotas que podem migrar a MESMA base ao mesmo tempo: o
 * arranque do servidor e a primeira utilização preguiçosa dentro de cada
 * processo. O advisory lock é por sessão, logo afeta apenas a própria base —
 * bases diferentes não se bloqueiam entre si, e a mesma base nunca recebe duas
 * migrações em paralelo.
 */
async function comFechoMigracao(connectionString: string, fn: () => Promise<void>) {
  const dbName = new URL(connectionString).pathname.replace(/^\//, "") || "geral";
  const chave = `nc-migracoes:${dbName}`;
  const fecho = new Client({ connectionString });
  await fecho.connect();
  try {
    await fecho.query("SELECT pg_advisory_lock(hashtext($1))", [chave]);
    try { await fn(); }
    finally { await fecho.query("SELECT pg_advisory_unlock(hashtext($1))", [chave]).catch(() => {}); }
  } finally {
    await fecho.end();
  }
}

export async function migrateCentral() {
  const pool = new Pool({ connectionString: env.centralUrl, max: 1 });
  try {
    await comFechoMigracao(env.centralUrl, () =>
      migrate(drizzle(pool), { migrationsFolder: path.join(root(), "central") }),
    );
  } finally {
    await pool.end();
  }
}

/** Aplica as migrations versionadas a uma BD de tenant (idempotente). */
export async function migrateTenant(connectionString: string) {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    await comFechoMigracao(connectionString, () =>
      migrate(drizzle(pool), { migrationsFolder: path.join(root(), "tenant") }),
    );
  } finally {
    await pool.end();
  }
}
