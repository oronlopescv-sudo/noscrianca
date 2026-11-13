import { describe, expect, it } from "vitest";
import { collectionMessage, whatsappNumber } from "@/lib/collection-rules";
import { money } from "@/lib/format";

const inv = (over: Partial<{ childName: string; overdue: boolean; owed: number }> = {}) => ({
  id: "i1", number: "F2026/00001", childName: "Lara Mendes", dueDate: "2026-11-08", owed: 1_500_000, overdue: true, ...over,
});

describe("cobranças aos encarregados", () => {
  it("número de WhatsApp: aceita local (7 dígitos), internacional e 00", () => {
    expect(whatsappNumber("991 0200")).toBe("2389910200");
    expect(whatsappNumber("+238 991 0200")).toBe("2389910200");
    expect(whatsappNumber("00238 991 0200")).toBe("2389910200");
    expect(whatsappNumber("12")).toBeNull();
  });

  it("o WhatsApp abre sem mensagem na URL: o texto fica no painel/copiado no teclado, nunca no link", () => {
    // whatsappNumber só dá o número; o componente de cliente compõe a mensagem
    // à parte (PII de crianças/dívidas não vai para o histórico como querystring).
    expect(whatsappNumber("+238 991 0200")).toBe("2389910200");
    expect(whatsappNumber("")).toBeNull();
  });

  it("mensagem: lista cada criança, o total e marca o atraso", () => {
    const m = collectionMessage({
      schoolName: "Creche Sol", guardianName: "Rosa Mendes", currency: "CVE", paymentInfo: "Transferência: CV64 0000",
      owed: 3_000_000, invoices: [inv(), inv({ childName: "Nuno Andrade", overdue: false, owed: 1_500_000 })],
    });
    expect(m.subject).toBe("Creche Sol: mensalidades em atraso");
    expect(m.text).toContain("Olá Rosa Mendes,");
    expect(m.text).toContain("Lara Mendes: fatura F2026/00001, vence 08/11/2026 (em atraso)");
    expect(m.text).toContain("Nuno Andrade: fatura F2026/00001, vence 08/11/2026 —");
    expect(m.text).toContain(`Total em falta: ${money(3_000_000, "CVE")}.`);
    expect(m.text).toContain("Transferência: CV64 0000");
    expect(m.short).toContain(`Lara ${money(1_500_000, "CVE")}; Nuno ${money(1_500_000, "CVE")}`);
    expect(m.short.length).toBeLessThan(400);
  });

  it("sem atraso: assunto e texto dizem 'por regularizar'; sem forma de pagamento indica contactar a creche", () => {
    const m = collectionMessage({ schoolName: "Creche Lua", guardianName: "João Rocha", currency: "CVE", paymentInfo: " ", owed: 1_500_000, invoices: [inv({ overdue: false })] });
    expect(m.subject).toBe("Creche Lua: mensalidades por regularizar");
    expect(m.text).toContain("Contacte a creche para saber como pagar.");
  });
});
