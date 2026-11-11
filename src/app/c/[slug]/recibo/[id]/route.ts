import { pdfResponse } from "@/lib/pdf";
import { receiptPdf } from "@/lib/services/tenant-pdf";
import { canAccessChild, loadTenant } from "@/lib/tenant";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const r = await loadTenant(slug);
  if (!r.ok) return new Response("Não autorizado", { status: 401 });
  const doc = await receiptPdf(r.ctx.db, r.ctx.settings, id);
  if (!doc) return new Response("Recibo não encontrado", { status: 404 });
  const allowed = r.ctx.isGuardian ? await canAccessChild(r.ctx, doc.childId) : r.ctx.can("finance.view");
  if (!allowed) return new Response("Sem acesso", { status: 403 });
  return pdfResponse(doc.bytes, `recibo-${doc.number}.pdf`);
}
