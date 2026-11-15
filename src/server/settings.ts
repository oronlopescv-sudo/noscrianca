"use server";

import { count, eq } from "drizzle-orm";
import { z } from "zod";
import { t } from "@/db/tenant";
import { bool, fail, file, run, str, type ActionResult } from "@/lib/result";
import { parseReminderDays } from "@/lib/reminder-rules";
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
      reminderDays: z.string().trim().regex(/^\d{1,2}(\s*,\s*\d{1,2})*$/, "Use dias separados por vírgula, por exemplo 1,7.").max(40),
    }).parse(Object.fromEntries(["name", "email", "phone", "address", "taxId", "accentColor", "currency", "schoolYear", "invoiceDueDay", "paymentInfo", "reminderDays"].map((k) => [k, str(fd, k)])));
    const days = parseReminderDays(d.reminderDays);
    if (!days.length) fail("Indique pelo menos um dia entre 1 e 90.");
    await ctx.db.update(t.settings).set({ ...d, reminderDays: days.join(","), reminderEnabled: bool(fd, "reminderEnabled") }).where(eq(t.settings.id, 1));
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

export async function uploadCoverAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "settings.manage" });
    const f = file(fd, "capa");
    if (!f) fail("Escolha uma fotografia.");
    const saved = await saveUpload(ctx.institution.id, "capa", f!, { kind: "image", maxMb: 8 });
    await ctx.db.update(t.settings).set({ coverPath: saved.path }).where(eq(t.settings.id, 1));
    await deleteTenantFile(ctx.institution.id, ctx.settings.coverPath);
    await audit(ctx, "Capa da página pública atualizada");
    return { ok: true, message: "Capa atualizada." };
  });
}

export async function removeCoverAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "settings.manage" });
    await ctx.db.update(t.settings).set({ coverPath: null }).where(eq(t.settings.id, 1));
    await deleteTenantFile(ctx.institution.id, ctx.settings.coverPath);
    return { ok: true, message: "Capa removida." };
  });
}

// ======================= PÁGINA PÚBLICA =======================
const MAX_PUBLIC_PHOTOS = 12;

/** Anúncio da creche na página pública (mostrado 5 segundos ao abrir). */
export async function saveAdAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "settings.manage" });
    const enabled = bool(fd, "adEnabled");
    const adTitle = str(fd, "adTitle").slice(0, 80);
    const adText = str(fd, "adText").slice(0, 300);
    const adLink = str(fd, "adLink").slice(0, 300);
    if (adLink && !/^https?:\/\//i.test(adLink)) fail("O link tem de começar por https://");
    if (enabled && !adTitle && !adText) fail("Para ativar o anúncio, escreva pelo menos um título ou um texto.");
    await ctx.db.update(t.settings).set({ adEnabled: enabled, adTitle, adText, adLink }).where(eq(t.settings.id, 1));
    await audit(ctx, enabled ? "Anúncio da página pública ativado" : "Anúncio da página pública desativado");
    return { ok: true, message: enabled ? "Anúncio guardado e ativo." : "Anúncio guardado (desativado)." };
  });
}

export async function savePublicPageAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "settings.manage" });
    const publicDescription = str(fd, "publicDescription"), publicHours = str(fd, "publicHours");
    if (publicDescription.length > 3000) fail("A apresentação pode ter até 3000 caracteres.");
    if (publicHours.length > 300) fail("O horário pode ter até 300 caracteres.");
    await ctx.db.update(t.settings).set({ publicDescription, publicHours }).where(eq(t.settings.id, 1));
    await audit(ctx, "Página pública atualizada");
    return { ok: true, message: "Página pública guardada." };
  });
}

export async function uploadPublicPhotoAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "settings.manage" });
    const f = file(fd, "photo");
    if (!f) fail("Escolha uma fotografia.");
    if (!bool(fd, "confirm")) fail("Confirme que tem autorização para publicar esta fotografia.");
    const [{ n }] = await ctx.db.select({ n: count() }).from(t.publicPhotos).where(eq(t.publicPhotos.slot, ""));
    if (n >= MAX_PUBLIC_PHOTOS) fail(`A página pública pode ter até ${MAX_PUBLIC_PHOTOS} fotografias. Remova uma para adicionar outra.`);
    const saved = await saveUpload(ctx.institution.id, "public", f!, { kind: "image", maxMb: 5 });
    await ctx.db.insert(t.publicPhotos).values({ path: saved.path, caption: str(fd, "caption").slice(0, 120) });
    await audit(ctx, "Fotografia adicionada à página pública");
    return { ok: true, message: "Fotografia publicada." };
  });
}

export async function deletePublicPhotoAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "settings.manage" });
    const [row] = await ctx.db.delete(t.publicPhotos).where(eq(t.publicPhotos.id, str(fd, "id"))).returning();
    if (!row) fail("Fotografia não encontrada.");
    await deleteTenantFile(ctx.institution.id, row.path);
    await audit(ctx, "Fotografia removida da página pública");
    return { ok: true, message: "Fotografia removida." };
  });
}

/** Fotografia e título de um dos quatro cartões de atividades do site da creche.
 * Substitui a que lá estiver; sem fotografia própria, o site mostra a imagem de exemplo. */
export async function uploadActivityPhotoAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "settings.manage" });
    const n = Number(str(fd, "n"));
    if (![1, 2, 3, 4].includes(n)) fail("Atividade inválida.");
    const slot = `atividade-${n}`;
    const caption = str(fd, "caption").slice(0, 40);
    const f = file(fd, "photo");
    const atual = await ctx.db.query.publicPhotos.findFirst({ where: eq(t.publicPhotos.slot, slot) });
    if (!f) {
      // Só o título: precisa de já haver fotografia própria para o guardar.
      if (!atual) fail("Escolha uma fotografia para esta atividade.");
      await ctx.db.update(t.publicPhotos).set({ caption }).where(eq(t.publicPhotos.id, atual!.id));
      return { ok: true, message: "Título da atividade guardado." };
    }
    if (!bool(fd, "confirm")) fail("Confirme que tem autorização para publicar esta fotografia.");
    const saved = await saveUpload(ctx.institution.id, "public", f, { kind: "image", maxMb: 5 });
    await ctx.db.insert(t.publicPhotos).values({ path: saved.path, caption, slot });
    if (atual) {
      await ctx.db.delete(t.publicPhotos).where(eq(t.publicPhotos.id, atual.id));
      await deleteTenantFile(ctx.institution.id, atual.path);
    }
    await audit(ctx, "Fotografia de atividade atualizada no site", { details: { atividade: n } });
    return { ok: true, message: "Fotografia da atividade publicada." };
  });
}
