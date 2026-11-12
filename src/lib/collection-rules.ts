// Regras puras das cobranças aos encarregados (sem acesso à base de dados).
import { money } from "@/lib/format";

/** Etapa usada para os avisos enviados manualmente (as automáticas usam 1, 7… dias após o vencimento). */
export const MANUAL_STAGE = 0;
/** Não se volta a cobrar o mesmo encarregado antes de passarem estes dias (evita avisos repetidos). */
export const COOLDOWN_DAYS = 3;

export type DebtInvoice = { id: string; number: string; childName: string; dueDate: string; owed: number; overdue: boolean };

/** Texto da cobrança de um encarregado: email completo e uma versão curta para WhatsApp/SMS. */
export function collectionMessage(p: {
  schoolName: string; guardianName: string; invoices: DebtInvoice[]; owed: number; currency: string; paymentInfo: string;
}): { subject: string; text: string; short: string } {
  const late = p.invoices.some((i) => i.overdue);
  const pay = p.paymentInfo.trim();
  const lines = p.invoices.map((i) => `• ${i.childName}: fatura ${i.number}, vence ${i.dueDate.split("-").reverse().join("/")}${i.overdue ? " (em atraso)" : ""} — em falta ${money(i.owed, p.currency)}`);
  const text = [
    `Olá ${p.guardianName},`, "",
    `${late ? "Tem mensalidades em atraso" : "Tem mensalidades por regularizar"} na ${p.schoolName}:`,
    ...lines, "",
    `Total em falta: ${money(p.owed, p.currency)}.`, "",
    pay ? `Como pagar:\n${pay}` : "Contacte a creche para saber como pagar.", "",
    "Se já pagou, pode ignorar esta mensagem. Obrigado.", p.schoolName,
  ].join("\n");
  const detail = p.invoices.map((i) => `${i.childName.split(" ")[0]} ${money(i.owed, p.currency)}`).join("; ");
  const short = `Olá ${p.guardianName.split(" ")[0]}, ${p.schoolName}: mensalidade(s) em falta: ${detail}. Total ${money(p.owed, p.currency)}. ${pay ? pay.slice(0, 200) : "Contacte-nos para saber como pagar."} Se já pagou, ignore. Obrigado.`;
  return { subject: `${p.schoolName}: ${late ? "mensalidades em atraso" : "mensalidades por regularizar"}`, text, short };
}

/** Número de WhatsApp só com dígitos. Sem indicativo, assume Cabo Verde (+238). */
export function whatsappNumber(phone: string): string | null {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 7) d = `238${d}`;
  return d.length >= 9 ? d : null;
}

/** Link que abre o WhatsApp com a mensagem já escrita (não precisa de conta de API). */
export function whatsappLink(phone: string, text: string): string | null {
  const n = whatsappNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}
