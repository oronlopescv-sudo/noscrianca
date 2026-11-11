import { and, eq, isNull } from "drizzle-orm";
import { t, type TenantExecutor } from "@/db/tenant";
import { randomToken, sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";

export const INVITE_HOURS = 72;
export const RESET_HOURS = 1;

/** Cria um token de uso único (convite ou recuperação). Invalida os anteriores do mesmo tipo. */
export async function createAuthToken(db: TenantExecutor, userId: string, purpose: "INVITE" | "RESET"): Promise<string> {
  await db.delete(t.authTokens).where(and(eq(t.authTokens.userId, userId), eq(t.authTokens.purpose, purpose), isNull(t.authTokens.usedAt)));
  const token = randomToken();
  const hours = purpose === "INVITE" ? INVITE_HOURS : RESET_HOURS;
  await db.insert(t.authTokens).values({ userId, tokenHash: sha256(token), purpose, expiresAt: new Date(Date.now() + hours * 3600_000) });
  return token;
}

export function inviteUrl(slug: string, token: string): string {
  return `${env.appUrl}/c/${slug}/convite/${token}`;
}

export function resetUrl(slug: string, token: string): string {
  return `${env.appUrl}/c/${slug}/redefinir/${token}`;
}

export function inviteMail(institutionName: string, userName: string, url: string) {
  return {
    subject: `Convite para aceder a ${institutionName}`,
    text: `Olá ${userName},\n\nFoi criada uma conta para si em ${institutionName}.\nPara definir a sua palavra-passe e ativar a conta, abra este link (válido por ${INVITE_HOURS} horas):\n\n${url}\n\nSe não esperava este convite, ignore este email.`,
  };
}
