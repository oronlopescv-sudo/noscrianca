import { getPlatformUser } from "@/lib/platform";
import { pdfResponse } from "@/lib/pdf";
import { platformInvoicePdf } from "@/lib/services/platform-pdf";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getPlatformUser())) return new Response("Não autorizado", { status: 401 });
  const doc = await platformInvoicePdf((await params).id);
  if (!doc) return new Response("Fatura não encontrada", { status: 404 });
  return pdfResponse(doc.bytes, `fatura-${doc.number}.pdf`);
}
