import { pdfResponse } from "@/lib/pdf";
import { platformInvoicePdf } from "@/lib/services/platform-pdf";
import { loadTenant } from "@/lib/tenant";

/** Fatura da plataforma (assinatura) — só o diretor da própria instituição. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const r = await loadTenant(slug);
  if (!r.ok) return new Response("Não autorizado", { status: 401 });
  if (!r.ctx.isDirector) return new Response("Sem acesso", { status: 403 });
  const doc = await platformInvoicePdf(id, r.ctx.institution.id);
  if (!doc) return new Response("Fatura não encontrada", { status: 404 });
  return pdfResponse(doc.bytes, `fatura-${doc.number}.pdf`);
}
