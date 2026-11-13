import { and, eq } from "drizzle-orm";
import { t } from "@/db/tenant";
import { readTenantFile } from "@/lib/storage";
import { canAccessChild, loadTenant, type TenantCtx } from "@/lib/tenant";

async function authorized(ctx: TenantCtx, parts: string[], rel: string): Promise<boolean> {
  const [area, id, sub] = parts;
  if (area === "children" && id) {
    if (!(await canAccessChild(ctx, id))) return false;
    if (sub === "docs") return !ctx.isGuardian && ctx.can("documents.manage");
    return ctx.isGuardian || ctx.can("children.view");
  }
  if (area === "diary") {
    const entries = await ctx.db.query.diaryEntries.findMany({ where: eq(t.diaryEntries.photoPath, rel), with: { child: true } });
    for (const e of entries) {
      if (!(await canAccessChild(ctx, e.childId))) continue;
      if (!ctx.isGuardian) { if (ctx.can("diary.view")) return true; continue; }
      if (e.visible && e.child.photoConsent) return true; // pais: só fotografias autorizadas
    }
    return false;
  }
  if (area === "proofs" && id) {
    // Comprovativos: equipa financeira, ou o encarregado que o enviou.
    const proof = await ctx.db.query.paymentProofs.findFirst({ where: and(eq(t.paymentProofs.invoiceId, id), eq(t.paymentProofs.path, rel)) });
    if (!proof) return false;
    return ctx.isGuardian ? proof.userId === ctx.user.id : ctx.can("finance.view");
  }
  if (area === "payments" && id) {
    if (ctx.isGuardian || !ctx.can("finance.view")) return false;
    return !!(await ctx.db.query.payments.findFirst({ where: and(eq(t.payments.invoiceId, id), eq(t.payments.proofPath, rel)) }));
  }
  return false;
}

/** Ficheiros da instituição: sempre autenticados e autorizados por tipo. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; path: string[] }> }) {
  const { slug, path } = await params;
  const r = await loadTenant(slug);
  if (!r.ok) return new Response("Não autorizado", { status: 401 });
  const parts = path.map((p) => decodeURIComponent(p));
  if (parts.some((p) => p === ".." || p.includes("/") || p.includes("\\") || p.startsWith("."))) return new Response("Pedido inválido", { status: 400 });
  const rel = parts.join("/");
  if (!(await authorized(r.ctx, parts, rel))) return new Response("Sem acesso", { status: 403 });
  const f = await readTenantFile(r.ctx.institution.id, rel);
  if (!f) return new Response("Ficheiro não encontrado", { status: 404 });
  return new Response(new Uint8Array(f.data), {
    headers: { "Content-Type": f.mime, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" },
  });
}
