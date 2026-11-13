import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { and, eq, gt, lt, ne } from "drizzle-orm";
import { central, c } from "@/db/central";
import { randomToken, sha256 } from "./crypto";
import { env } from "./env";
import { clientIp } from "./request-ip";

export const ADMIN_COOKIE = "nc_admin";
export const TENANT_COOKIE = "nc_session";
const PLATFORM_TTL_H = 12;
const TENANT_TTL_H = 24 * 30;
const MAX_FAILS = 5;
const LOCK_MIN = 15;

type Scope = "PLATFORM" | "TENANT";

export async function createSession(input: { scope: Scope; userId: string; institutionId?: string; impersonatorId?: string }) {
  const token = randomToken();
  const hours = input.scope === "PLATFORM" ? PLATFORM_TTL_H : input.impersonatorId ? 2 : TENANT_TTL_H;
  const expiresAt = new Date(Date.now() + hours * 3600_000);
  const h = await headers();
  const ipFor = clientIp(h);
  await central().insert(c.sessions).values({
    tokenHash: sha256(token),
    scope: input.scope,
    userId: input.userId,
    institutionId: input.institutionId ?? null,
    impersonatorId: input.impersonatorId ?? null,
    ip: ipFor === "local" ? null : ipFor,
    userAgent: (h.get("user-agent") ?? "").slice(0, 300) || null,
    expiresAt,
  });
  (await cookies()).set(input.scope === "PLATFORM" ? ADMIN_COOKIE : TENANT_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: env.secureCookies, path: "/", expires: expiresAt,
  });
}

export async function destroySession(scope: Scope) {
  const jar = await cookies();
  const name = scope === "PLATFORM" ? ADMIN_COOKIE : TENANT_COOKIE;
  const token = jar.get(name)?.value;
  if (token) await central().delete(c.sessions).where(eq(c.sessions.tokenHash, sha256(token)));
  jar.delete(name);
}

/** Fecha todas as sessões de um utilizador (pode manter a sessão atual). */
export async function destroyUserSessions(scope: Scope, userId: string, institutionId?: string, exceptTokenHash?: string) {
  await central().delete(c.sessions).where(and(
    eq(c.sessions.scope, scope), eq(c.sessions.userId, userId),
    institutionId ? eq(c.sessions.institutionId, institutionId) : undefined,
    exceptTokenHash ? ne(c.sessions.tokenHash, exceptTokenHash) : undefined,
  ));
}

export const readSession = cache(async (scope: Scope) => {
  const token = (await cookies()).get(scope === "PLATFORM" ? ADMIN_COOKIE : TENANT_COOKIE)?.value;
  if (!token) return null;
  const s = await central().query.sessions.findFirst({
    where: and(eq(c.sessions.tokenHash, sha256(token)), eq(c.sessions.scope, scope), gt(c.sessions.expiresAt, new Date())),
  });
  return s ?? null;
});

export async function purgeExpiredSessions() {
  await central().delete(c.sessions).where(lt(c.sessions.expiresAt, new Date()));
}

// ---------- proteção contra tentativas de acesso indevidas ----------
export async function lockedFor(key: string): Promise<number> {
  const row = await central().query.loginAttempts.findFirst({ where: eq(c.loginAttempts.key, key) });
  if (row?.lockedUntil && row.lockedUntil > new Date()) return Math.ceil((row.lockedUntil.getTime() - Date.now()) / 60_000);
  return 0;
}

export async function recordFailure(key: string) {
  const row = await central().query.loginAttempts.findFirst({ where: eq(c.loginAttempts.key, key) });
  const stale = row && Date.now() - row.updatedAt.getTime() > LOCK_MIN * 60_000;
  const count = (row && !stale ? row.count : 0) + 1;
  const lockedUntil = count >= MAX_FAILS ? new Date(Date.now() + LOCK_MIN * 60_000) : null;
  await central().insert(c.loginAttempts).values({ key, count, lockedUntil })
    .onConflictDoUpdate({ target: c.loginAttempts.key, set: { count: lockedUntil ? 0 : count, lockedUntil, updatedAt: new Date() } });
}

export async function clearFailures(key: string) {
  await central().delete(c.loginAttempts).where(eq(c.loginAttempts.key, key));
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "A palavra-passe deve ter pelo menos 8 caracteres.";
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return "A palavra-passe deve ter letras e números.";
  return null;
}
