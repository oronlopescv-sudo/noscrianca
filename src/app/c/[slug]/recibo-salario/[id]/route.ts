import { eq } from "drizzle-orm";
import { t } from "@/db/tenant";
import { pdfResponse } from "@/lib/pdf";
import { salaryReceiptPdf } from "@/lib/services/tenant-pdf";
import { loadTenant } from "@/lib/tenant";

/** Recibo de vencimento: só quem gere salários ou o próprio funcionário. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const r = await loadTenant(slug);
  if (!r.ok) return new Response("Não autorizado", { status: 401 });
  if (r.ctx.isGuardian) return new Response("Não encontrado", { status: 404 });
  // Autorização ANTES de gerar o PDF (não compõe dados de outros). 404 uniforme,
  // sem diferença entre "não existe" e "não é seu" (evita sondar recibo a recibo).
  const pay = await r.ctx.db.query.salaryPayments.findFirst({ where: eq(t.salaryPayments.id, id) });
  const own = !!pay && !!r.ctx.employeeId && r.ctx.employeeId === pay.employeeId && !r.ctx.impersonating;
  if (!pay || (!own && !r.ctx.can("payroll.manage"))) return new Response("Não encontrado", { status: 404 });
  const doc = await salaryReceiptPdf(r.ctx.db, r.ctx.settings, id);
  if (!doc) return new Response("Não encontrado", { status: 404 });
  return pdfResponse(doc.bytes, `recibo-vencimento-${doc.number}.pdf`);
}
