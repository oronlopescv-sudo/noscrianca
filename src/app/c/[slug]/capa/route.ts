import { eq } from "drizzle-orm";
import { getTenantDb, t } from "@/db/tenant";
import { readTenantFile } from "@/lib/storage";
import { getInstitutionBySlug, institutionUsable } from "@/lib/tenant";

/** Capa da instituição (público: abre a página das creches). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const inst = await getInstitutionBySlug((await params).slug);
  if (!inst || !institutionUsable(inst.status)) return new Response(null, { status: 404 });
  const s = await (await getTenantDb(inst.id)).query.settings.findFirst({ where: eq(t.settings.id, 1) });
  const f = s?.coverPath ? await readTenantFile(inst.id, s.coverPath) : null;
  if (!f) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(f.data), { headers: { "Content-Type": f.mime, "Cache-Control": "public, max-age=3600" } });
}
