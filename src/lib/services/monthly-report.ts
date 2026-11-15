import { and, asc, eq, isNull, gte, lte } from "drizzle-orm";
import { t, type TenantDb } from "@/db/tenant";
import type { Setting } from "@/db/tenant/schema";
import { money, periodLabel } from "@/lib/format";
import { buildDocPdf } from "@/lib/pdf";
import { METHOD_LABELS } from "./finance";

export type ReportMode = "RECEBIDOS" | "COMPLETO";

/** Dia AAAA-MM-DD → DD/MM/AAAA */
const br = (d: string) => d.split("-").reverse().join("/");

export type MonthlyRow = { date: string; kind: "IN" | "OUT"; description: string; party: string; invoice: string; method: string; cents: number };

/** Todos os movimentos do mês, ordenados por dia. Estornos e salários anulados ficam de fora. */
export async function monthlyRows(db: TenantDb, period: string, mode: ReportMode): Promise<{ rows: MonthlyRow[]; received: number; paid: number }> {
  const from = `${period}-01`;
  const to = `${period}-31`;
  const payments = await db.select({
    paidAt: t.payments.paidAt, amountCents: t.payments.amountCents, method: t.payments.method,
    invoiceNumber: t.invoices.number, childFirst: t.children.firstName, childLast: t.children.lastName,
  }).from(t.payments)
    .innerJoin(t.invoices, eq(t.invoices.id, t.payments.invoiceId))
    .innerJoin(t.children, eq(t.children.id, t.invoices.childId))
    .where(and(isNull(t.payments.reversedAt), gte(t.payments.paidAt, from), lte(t.payments.paidAt, to)))
    .orderBy(asc(t.payments.paidAt));

  const rows: MonthlyRow[] = payments.map((p) => ({
    date: p.paidAt, kind: "IN", description: "Mensalidade / fatura", party: `${p.childFirst} ${p.childLast}`,
    invoice: p.invoiceNumber, method: METHOD_LABELS[p.method] ?? p.method, cents: p.amountCents,
  }));
  let paid = 0;
  if (mode === "COMPLETO") {
    const salaries = await db.select({
      paidAt: t.salaryPayments.paidAt, amountCents: t.salaryPayments.amountCents, method: t.salaryPayments.method, name: t.users.name,
    }).from(t.salaryPayments)
      .innerJoin(t.employees, eq(t.employees.id, t.salaryPayments.employeeId))
      .innerJoin(t.users, eq(t.users.id, t.employees.userId))
      .where(and(isNull(t.salaryPayments.voidedAt), gte(t.salaryPayments.paidAt, from), lte(t.salaryPayments.paidAt, to)))
      .orderBy(asc(t.salaryPayments.paidAt));
    for (const s of salaries) {
      rows.push({ date: s.paidAt, kind: "OUT", description: "Salário", party: s.name, invoice: "", method: METHOD_LABELS[s.method] ?? s.method, cents: s.amountCents });
      paid += s.amountCents;
    }
  }
  const received = payments.reduce((a, p) => a + p.amountCents, 0);
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
  return { rows, received, paid };
}

/** Totais por método de pagamento (só entradas). */
function byMethod(rows: MonthlyRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) if (r.kind === "IN") m.set(r.method, (m.get(r.method) ?? 0) + r.cents);
  return m;
}

export async function monthlyReportPdf(db: TenantDb, s: Setting, period: string, mode: ReportMode): Promise<Uint8Array> {
  const { rows, received, paid } = await monthlyRows(db, period, mode);
  const cur = s.currency;
  const items: { description: string; amount: string }[] = [];
  let lastDay = "";
  if (mode === "COMPLETO") {
    // Secções separadas: primeiro recebidos, depois pagos.
    for (const kind of ["IN", "OUT"] as const) {
      const part = rows.filter((r) => r.kind === kind);
      items.push({ description: kind === "IN" ? "RECEBIDOS" : "PAGOS", amount: "" });
      lastDay = "";
      for (const r of part) {
        if (r.date !== lastDay) { items.push({ description: `Dia ${br(r.date)}`, amount: "" }); lastDay = r.date; }
        const ref = r.invoice ? ` · fatura ${r.invoice}` : "";
        items.push({ description: `   ${r.description}: ${r.party}${ref} · ${r.method}`, amount: money(r.cents, cur) });
      }
      if (!part.length) items.push({ description: "   Sem movimentos", amount: "" });
    }
  } else {
    lastDay = "";
    for (const r of rows) {
      if (r.date !== lastDay) { items.push({ description: `Dia ${br(r.date)}`, amount: "" }); lastDay = r.date; }
      items.push({ description: `   ${r.party} · fatura ${r.invoice} · ${r.method}`, amount: money(r.cents, cur) });
    }
    if (!rows.length) items.push({ description: "Sem pagamentos recebidos neste mês.", amount: "" });
  }

  const totals: [string, string][] = [];
  for (const [m, c] of byMethod(rows)) totals.push([`Total ${m.toLowerCase()}`, money(c, cur)]);
  totals.push(["Total recebido", money(received, cur)]);
  if (mode === "COMPLETO") {
    totals.push(["Total pago", money(paid, cur)]);
    totals.push(["Saldo do mês", money(received - paid, cur)]);
  }

  return buildDocPdf({
    kind: "RELATÓRIO", number: period, accent: s.accentColor,
    issuer: { name: s.name, lines: [s.address, [s.phone, s.email].filter(Boolean).join(" · "), s.taxId ? `NIF: ${s.taxId}` : ""] },
    recipient: { title: "Período", lines: [periodLabel(period), mode === "COMPLETO" ? "Recebidos e pagos" : "Apenas pagamentos recebidos"] },
    meta: [["Gerado em", new Date().toISOString().slice(0, 10).split("-").reverse().join("/")]],
    items, totals,
    footer: `${s.name} — documento gerado eletronicamente`,
  });
}

export async function monthlyReportCsv(db: TenantDb, s: Setting, period: string, mode: ReportMode): Promise<string> {
  const { rows, received, paid } = await monthlyRows(db, period, mode);
  const money2 = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const header = ["Data", "Tipo", "Movimento", "Pessoa", "Fatura", "Método", "Entrada", "Saída"];
  const body = rows.map((r) => [br(r.date), r.kind === "IN" ? "Recebido" : "Pago", r.description, r.party, r.invoice, r.method,
    r.kind === "IN" ? money2(r.cents) : "", r.kind === "OUT" ? money2(r.cents) : ""]);
  const totals: unknown[][] = [[], ["", "", "Total recebido", "", "", "", money2(received), ""]];
  if (mode === "COMPLETO") {
    totals.push(["", "", "Total pago", "", "", "", "", money2(paid)]);
    totals.push(["", "", "Saldo do mês", "", "", "", "", money2(received - paid)]);
  }
  const esc = (v: unknown) => { const x = String(v ?? ""); return /[;"\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
  return String.fromCharCode(0xfeff) + [header, ...body, ...totals].map((r) => r.map(esc).join(";")).join("\r\n");
}
