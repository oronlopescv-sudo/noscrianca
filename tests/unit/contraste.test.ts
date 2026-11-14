import { describe, expect, it } from "vitest";
import { contrastRatio, readableTextColorOn } from "@/lib/contrast";

describe("contraste das cores de instituição", () => {
  it("razão de contraste segue a WCAG (21:1 no máximo)", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 0);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 0);
  });

  it("accent por defeito (laranja claro) ganha texto navy, não branco", () => {
    // Branco sobre #F0714F =~ 2.9:1 (reprova); o navy contrasta bastante mais.
    expect(readableTextColorOn("#F0714F")).toBe("#1B2333");
    expect(contrastRatio("#1B2333", "#F0714F")).toBeGreaterThan(4.5);
  });

  it("accent escuro ganha texto branco", () => {
    expect(readableTextColorOn("#1B2333")).toBe("#FFFFFF");
    expect(readableTextColorOn("#0E7490")).toBe("#FFFFFF");
    expect(readableTextColorOn("#C2410C")).toBe("#FFFFFF");
    expect(contrastRatio("#FFFFFF", "#C2410C")).toBeGreaterThan(4.5);
  });

  it("accent quase branco ganha navy (era quase ilegível com branco)", () => {
    expect(readableTextColorOn("#F5F5F0")).toBe("#1B2333");
  });
});
