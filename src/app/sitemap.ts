import type { MetadataRoute } from "next";
import { asc, inArray } from "drizzle-orm";
import { central, c } from "@/db/central";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const USAVEIS = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED"] as const;

/** Página por creche no sitemap: cada instituição publicada fica descobrível. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.appUrl;
  const base_rotas = ["/", "/pedir-adesao", "/entrar"].map((r) => ({ url: `${base}${r}`, priority: 0.6, changeFrequency: "weekly" as const }));
  try {
    const insts = await central()
      .select({ slug: c.institutions.slug })
      .from(c.institutions)
      .where(inArray(c.institutions.status, [...USAVEIS]))
      .orderBy(asc(c.institutions.slug));
    const creches = insts.map((i) => ({ url: `${base}/creche/${i.slug}`, priority: 0.8, changeFrequency: "weekly" as const }));
    return [{ url: `${base}/`, priority: 1, changeFrequency: "daily" as const }, ...base_rotas.slice(1), ...creches];
  } catch {
    // Central indisponível: sitemap não pode partir por causa disso.
    return base_rotas;
  }
}
