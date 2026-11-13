import { pdfResponse } from "@/lib/pdf";
import { salaryReceiptPdf } from "@/lib/services/tenant-pdf";
import { loadTenant } from "@/lib/tenant";

/** Recibo de vencimento: só quem gere salários ou o próprio funcionário. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const r = await loadTenant(slug);
  if (!r.ok) return new Response("Não autorizado", { status: 401 });
  if (r.ctx.isGuardian) return new Response("Sem acesso", { status: 403 });
  const doc = await salaryReceiptPdf(r.ctx.db, r.ctx.settings, id);
  if (!doc) return new Response("Recibo não encontrado", { status: 404 });
  const own = !!r.ctx.employeeId && r.ctx.employeeId === doc.employee.id && !r.ctx.impersonating;
  if (!own && !r.ctx.can("payroll.manage")) return new Response("Sem acesso", { status: 403 });
  return pdfResponse(doc.bytes, `recibo-vencimento-${doc.number}.pdf`);
}
