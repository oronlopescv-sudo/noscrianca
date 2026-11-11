import { describe, expect, it } from "vitest";
import { addMonths, centsToInput, csvCell, isIsoDate, parseMoney, toCsv } from "@/lib/format";

describe("parseMoney", () => {
  it("aceita formatos portugueses e internacionais", () => {
    expect(parseMoney("1.250,50")).toBe(125050);
    expect(parseMoney("1250.5")).toBe(125000 + 50);
    expect(parseMoney("1250")).toBe(125000);
    expect(parseMoney(" 12,3 ")).toBe(1230);
  });
  it("rejeita valores inválidos", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("1.2.3,4,5")).toBeNull();
    expect(parseMoney("-10")).toBeNull();
  });
  it("é reversível com centsToInput", () => {
    expect(centsToInput(125050)).toBe("1250.50");
    expect(centsToInput(120000)).toBe("1200");
  });
});

describe("CSV", () => {
  it("escapa separadores e aspas", () => {
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('diz "olá"')).toBe('"diz ""olá"""');
  });
  it("neutraliza fórmulas (proteção contra CSV injection)", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toMatch(/^"?'=/);
    expect(csvCell("+351")).toMatch(/^'\+/);
  });
  it("começa com BOM UTF-8 e usa CRLF", () => {
    const out = toCsv([["Nome", "Valor"], ["Lara", 10]]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out).toContain("\r\n");
    expect(out.endsWith("Lara;10")).toBe(true);
  });
});

describe("datas", () => {
  it("valida datas ISO", () => {
    expect(isIsoDate("2026-11-11")).toBe(true);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("11/11/2026")).toBe(false);
  });
  it("soma meses com mudança de ano", () => {
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
});
