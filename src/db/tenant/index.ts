import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { central, c } from "@/db/central";
import { migrateTenant } from "@/db/migrate";
import { decrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type TenantDb = NodePgDatabase<typeof schema>;
export type TenantTx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];
export type TenantExecutor = TenantDb | TenantTx;

type Entry = { pool: Pool; db: TenantDb; lastUsed: number; ready: Promise<void> };
const g = globalThis as unknown as { __ncTenants?: Map<string, Entry> };
const cache = () => (g.__ncTenants ??= new Map<string, Entry>());

/** Constrói o URL de ligação de um tenant a partir do host/porta da BD central. */
export function tenantUrl(dbName: string, dbUser: string, password: string): string {
  const u = new URL(env.centralUrl);
  u.username = encodeURIComponent(dbUser);
  u.password = encodeURIComponent(password);
  u.pathname = `/${dbName}`;
  return u.toString();
}

export async function tenantConnectionString(institutionId: string): Promise<string> {
  const reg = await central().query.tenantDatabases.findFirst({ where: eq(c.tenantDatabases.institutionId, institutionId) });
  if (!reg) throw new Error("Base de dados da instituição não registada");
  return tenantUrl(reg.dbName, reg.dbUser, decrypt(reg.passwordEnc));
}

function evictIfNeeded() {
  const m = cache();
  if (m.size <= env.maxTenantPools) return;
  const oldest = [...m.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
  if (oldest) {
    m.delete(oldest[0]);
    oldest[1].pool.end().catch(() => {});
  }
}

/**
 * Devolve a ligação à BD de UMA instituição. O id vem sempre do servidor
 * (sessão + registo central) — nunca do cliente. Na primeira utilização por
 * processo, garante que as migrations estão aplicadas.
 */
export async function getTenantDb(institutionId: string): Promise<TenantDb> {
  const m = cache();
  let entry = m.get(institutionId);
  if (!entry) {
    const url = await tenantConnectionString(institutionId);
    const pool = new Pool({ connectionString: url, max: 4, idleTimeoutMillis: 20_000 });
    pool.on("error", (e) => console.error(`[tenant pool ${institutionId}]`, e.message));
    entry = { pool, db: drizzle(pool, { schema }), lastUsed: Date.now(), ready: migrateTenant(url) };
    m.set(institutionId, entry);
    entry.ready.catch(() => {
      m.delete(institutionId);
      pool.end().catch(() => {});
    });
    evictIfNeeded();
  }
  entry.lastUsed = Date.now();
  await entry.ready;
  return entry.db;
}

/** Fecha a ligação em cache (ex.: antes de um restauro ou eliminação). */
export async function dropTenantPool(institutionId: string) {
  const entry = cache().get(institutionId);
  if (entry) {
    cache().delete(institutionId);
    await entry.pool.end().catch(() => {});
  }
}

export async function closeAllTenantPools() {
  const m = cache();
  await Promise.all([...m.values()].map((e) => e.pool.end().catch(() => {})));
  m.clear();
}

export { schema as t };
