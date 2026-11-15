import { monthlyReportCsv, monthlyReportPdf, type ReportMode } from "@/lib/services/monthly-report";
import { pdfResponse } from "@/lib/pdf";
import { loadTenant } from "@/lib/tenant";

/** Relatório mensal: ?mes=AAAA-MM&modo=RECEBIDOS|COMPLETO&formato=pdf|csv */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await loadTenant(slug);
  if (!r.ok) return new Response("Não autorizado", { status: 401 });
  const ctx = r.ctx;
  const url = new URL(req.url);
  const mes = url.searchParams.get("mes") ?? "";
  const modo = (url.searchParams.get("modo") ?? "RECEBIDOS") as ReportMode;
  const formato = url.searchParams.get("formato") ?? "pdf";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return new Response("Mês inválido", { status: 400 });
  if (modo !== "RECEBIDOS" && modo !== "COMPLETO") return new Response("Modo inválido", { status: 400 });
  if (ctx.isGuardian || ctx.panel !== "MANAGEMENT" || !ctx.can("finance.view")) return new Response("Sem permissão", { status: 403 });
  if (modo === "COMPLETO" && !ctx.can("payroll.manage")) return new Response("Sem permissão para salários", { status: 403 });

  const base = `relatorio-${mes}-${modo.toLowerCase()}`;
  if (formato === "csv") {
    return new Response(await monthlyReportCsv(ctx.db, ctx.settings, mes, modo), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"` },
    });
  }
  if (formato !== "pdf") return new Response("Formato inválido", { status: 400 });
  return pdfResponse(await monthlyReportPdf(ctx.db, ctx.settings, mes, modo), `${base}.pdf`);
}
