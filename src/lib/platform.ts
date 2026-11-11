import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { central, c } from "@/db/central";
import { readSession } from "./auth";
import { ActionError } from "./result";

export const getPlatformUser = cache(async () => {
  const s = await readSession("PLATFORM");
  if (!s) return null;
  const u = await central().query.platformUsers.findFirst({ where: eq(c.platformUsers.id, s.userId) });
  return u && u.active ? u : null;
});

/** Para páginas do painel central. */
export async function requirePlatform() {
  const u = await getPlatformUser();
  if (!u) redirect("/admin/entrar");
  return u;
}

/** Para Server Actions do painel central. */
export async function platformAction() {
  const u = await getPlatformUser();
  if (!u) throw new ActionError("Sessão expirada. Inicie sessão novamente.");
  return u;
}

export async function platformAudit(
  user: { id: string; name: string } | null, action: string,
  extra: { entity?: string; entityId?: string; institutionId?: string; details?: unknown } = {},
) {
  await central().insert(c.platformAuditLogs).values({
    userId: user?.id ?? null, userName: user?.name ?? "Sistema", action,
    entity: extra.entity ?? "", entityId: extra.entityId ?? null,
    institutionId: extra.institutionId ?? null, details: (extra.details ?? null) as object | null,
  });
}

export const getPlatformSettings = cache(async () => {
  const s = await central().query.platformSettings.findFirst({ where: eq(c.platformSettings.id, 1) });
  if (s) return s;
  const [created] = await central().insert(c.platformSettings).values({ id: 1 }).onConflictDoNothing().returning();
  return created ?? (await central().query.platformSettings.findFirst({ where: eq(c.platformSettings.id, 1) }))!;
});
