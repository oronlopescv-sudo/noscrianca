import { eq } from "drizzle-orm";
import { central, c } from "@/db/central";
import { fmtDateObj, money } from "@/lib/format";
import { buildDocPdf } from "@/lib/pdf";

/** PDF de uma fatura da plataforma (assinatura de uma instituição). */
export async function platformInvoicePdf(invoiceId: string, institutionId?: string): Promise<{ bytes: Uint8Array; number: string } | null> {
  const inv = await central().query.platformInvoices.findFirst({ where: eq(c.platformInvoices.id, invoiceId), with: { institution: true } });
  if (!inv || (institutionId && inv.institutionId !== institutionId)) return null;
  const s = await central().query.platformSettings.findFirst({ where: eq(c.platformSettings.id, 1) });
  const bytes = await buildDocPdf({
    kind: "FATURA", number: inv.number,
    issuer: { name: s?.saasName ?? "NosCriança", lines: [s?.supportEmail ?? "", s?.supportPhone ?? ""] },
    recipient: { title: "Cliente", lines: [inv.institution.name, [inv.institution.address, inv.institution.city].filter(Boolean).join(", "), inv.institution.email] },
    meta: [["Data de emissão", fmtDateObj(inv.issuedAt)], ["Vencimento", fmtDateObj(inv.dueDate)], ["Período", `${fmtDateObj(inv.periodStart)} – ${fmtDateObj(inv.periodEnd)}`]],
    items: [{ description: inv.description, amount: money(inv.amountCents, inv.currency) }],
    totals: [["Total", money(inv.amountCents, inv.currency)]],
    stamp: inv.status === "PAID" ? "PAGO" : inv.status === "VOID" ? "ANULADO" : undefined,
    note: inv.status === "PAID"
      ? `Pago em ${fmtDateObj(inv.paidAt)} por ${inv.paymentMethod ?? "—"}${inv.paymentReference ? ` (ref. ${inv.paymentReference})` : ""}.`
      : inv.status === "OPEN" && s?.bankDetails ? `Dados para pagamento:\n${s.bankDetails}` : undefined,
    footer: `${s?.saasName ?? "NosCriança"} — documento gerado eletronicamente`,
  });
  return { bytes, number: inv.number };
}
