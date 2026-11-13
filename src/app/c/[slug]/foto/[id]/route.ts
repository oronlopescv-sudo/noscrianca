import { eq } from "drizzle-orm";
import { getTenantDb, t } from "@/db/tenant";
import { readTenantFile } from "@/lib/storage";
import { getInstitutionBySlug, institutionUsable } from "@/lib/tenant";

/** Fotografia da página pública (só serve ficheiros registados na galeria pública). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const inst = await getInstitutionBySlug(slug);
  if (!inst || !institutionUsable(inst.status)) return new Response(null, { status: 404 });
  const photo = await (await getTenantDb(inst.id)).query.publicPhotos.findFirst({ where: eq(t.publicPhotos.id, id) });
  const f = photo ? await readTenantFile(inst.id, photo.path) : null;
  if (!f) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(f.data), { headers: { "Content-Type": f.mime, "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
