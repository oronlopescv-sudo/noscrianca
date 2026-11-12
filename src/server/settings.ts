"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { t } from "@/db/tenant";
import { fail, file, run, str, type ActionResult } from "@/lib/result";
import { deleteTenantFile, saveUpload } from "@/lib/storage";
import { audit, tenantAction } from "@/lib/tenant";

type S = ActionResult | null;

export async function saveSettingsAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "settings.manage" });
    const d = z.object({
      // Alimenta assuntos/corpos de email: sem quebras de linha.
      name: z.string().trim().min(2, "Indique o nome da instituição.").max(120).regex(/^[^\r\n\0]+$/, "O nome não pode conter quebras de linha."),
      email: z.union([z.string().trim().toLowerCase().email("Email inválido."), z.literal("")]),
      phone: z.string().trim().max(40), address: z.string().trim().max(200), taxId: z.string().trim().max(40),
      accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida."),
      currency: z.enum(["CVE", "EUR", "USD"], { message: "Moeda inválida." }),
      schoolYear: z.string().trim().max(20),
      invoiceDueDay: z.coerce.number().int().min(1, "Dia de vencimento inválido.").max(28, "Use um dia entre 1 e 28."),
      paymentInfo: z.string().trim().max(1000),
    }).parse(Object.fromEntries(["name", "email", "phone", "address", "taxId", "accentColor", "currency", "schoolYear", "invoiceDueDay", "paymentInfo"].map((k) => [k, str(fd, k)])));
    await ctx.db.update(t.settings).set(d).where(eq(t.settings.id, 1));
    await audit(ctx, "Definições da instituição alteradas");
    return { ok: true, message: "Definições guardadas." };
  });
}

export async function uploadLogoAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "settings.manage" });
    const f = file(fd, "logo");
    if (!f) fail("Escolha uma imagem.");
    const saved = await saveUpload(ctx.institution.id, "logo", f!, { kind: "image", maxMb: 3 });
    await ctx.db.update(t.settings).set({ logoPath: saved.path }).where(eq(t.settings.id, 1));
    await deleteTenantFile(ctx.institution.id, ctx.settings.logoPath);
    await audit(ctx, "Logótipo atualizado");
    return { ok: true, message: "Logótipo atualizado." };
  });
}

export async function removeLogoAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "settings.manage" });
    await ctx.db.update(t.settings).set({ logoPath: null }).where(eq(t.settings.id, 1));
    await deleteTenantFile(ctx.institution.id, ctx.settings.logoPath);
    return { ok: true, message: "Logótipo removido." };
  });
}
