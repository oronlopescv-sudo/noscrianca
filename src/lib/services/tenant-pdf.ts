import { eq } from "drizzle-orm";
import { t, type TenantDb } from "@/db/tenant";
import type { Setting } from "@/db/tenant/schema";
import { fmtDate, fmtDateObj, money, periodLabel } from "@/lib/format";
import { buildDocPdf } from "@/lib/pdf";
import { METHOD_LABELS } from "./finance";

function issuer(s: Setting) {
  return { name: s.name, lines: [s.address, [s.phone, s.email].filter(Boolean).join(" · "), s.taxId ? `NIF: ${s.taxId}` : ""] };
}

async function billTo(db: TenantDb, childId: string) {
  const child = await db.query.children.findFirst({ where: eq(t.children.id, childId), with: { guardians: { with: { guardian: { with: { user: true } } } }, classroom: true } });
  const primary = child?.guardians.find((g) => g.isPrimary) ?? child?.guardians[0];
  return {
    child,
    lines: [primary ? primary.guardian.user.name : "", `Criança: ${child?.firstName ?? ""} ${child?.lastName ?? ""}`, child?.classroom ? `Turma: ${child.classroom.name}` : ""],
  };
}

export async function invoicePdf(db: TenantDb, s: Setting, invoiceId: string) {
  const inv = await db.query.invoices.findFirst({ where: eq(t.invoices.id, invoiceId), with: { items: true } });
  if (!inv) return null;
  const to = await billTo(db, inv.childId);
  const due = inv.totalCents - inv.paidCents;
  const bytes = await buildDocPdf({
    kind: "FATURA", number: inv.number, accent: s.accentColor, issuer: issuer(s),
    recipient: { title: "Encarregado de educação", lines: to.lines },
    meta: [["Data de emissão", fmtDate(inv.issueDate)], ["Vencimento", fmtDate(inv.dueDate)], ["Referente a", inv.kind === "MONTHLY" ? periodLabel(inv.period) : "Fatura avulsa"]],
    items: inv.items.map((i) => ({ description: i.description, amount: money(i.amountCents, s.currency) })),
    totals: [["Total", money(inv.totalCents, s.currency)], ["Pago", money(inv.paidCents, s.currency)], ["Em dívida", money(Math.max(due, 0), s.currency)]],
    stamp: inv.status === "PAID" ? "PAGO" : inv.status === "VOID" ? "ANULADO" : undefined,
    note: inv.status === "VOID" ? `Anulada: ${inv.voidReason ?? ""}` : due > 0 && s.paymentInfo ? `Como pagar:\n${s.paymentInfo}` : inv.notes || undefined,
    footer: `${s.name} — documento gerado eletronicamente`,
  });
  return { bytes, number: inv.number, childId: inv.childId };
}

export async function receiptPdf(db: TenantDb, s: Setting, paymentId: string) {
  const p = await db.query.payments.findFirst({ where: eq(t.payments.id, paymentId), with: { receipt: true, invoice: { with: { items: true } } } });
  if (!p || !p.receipt) return null;
  const to = await billTo(db, p.invoice.childId);
  const bytes = await buildDocPdf({
    kind: "RECIBO", number: p.receipt.number, accent: s.accentColor, issuer: issuer(s),
    recipient: { title: "Recebemos de", lines: to.lines },
    meta: [["Data do pagamento", fmtDate(p.paidAt)], ["Emitido em", fmtDateObj(p.receipt.issuedAt, s.timezone)], ["Fatura", p.invoice.number], ["Método", METHOD_LABELS[p.method]]],
    items: [{ description: `Pagamento da fatura ${p.invoice.number} — ${p.invoice.items.map((i) => i.description).join("; ")}`, amount: money(p.amountCents, s.currency) }],
    totals: [["Valor recebido", money(p.amountCents, s.currency)]],
    stamp: p.reversedAt ? "ANULADO" : "PAGO",
    note: [p.reference ? `Referência: ${p.reference}` : "", `Registado por ${p.recordedByName}.`, p.reversedAt ? `Estornado: ${p.reversalReason ?? ""}` : ""].filter(Boolean).join("\n"),
    footer: `${s.name} — documento gerado eletronicamente`,
  });
  return { bytes, number: p.receipt.number, childId: p.invoice.childId };
}
