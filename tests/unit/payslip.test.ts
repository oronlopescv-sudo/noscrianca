import { describe, expect, it } from "vitest";
import { absenceDiscountCents, dailyRateCents, payslipBreakdown } from "@/lib/payslip";
import { dateRange } from "@/lib/date-range";

describe("faltas e recibo de vencimento", () => {
  it("cada dia de falta vale salário ÷ 30", () => {
    expect(dailyRateCents(3_000_000)).toBe(100_000);
    expect(absenceDiscountCents(30_000_000, 2)).toBe(2_000_000);
  });

  it("sem faltas não há desconto, e o desconto nunca passa do salário base", () => {
    expect(absenceDiscountCents(30_000_000, 0)).toBe(0);
    expect(absenceDiscountCents(30_000_000, 31)).toBe(30_000_000);
    expect(absenceDiscountCents(0, 5)).toBe(0);
  });

  it("o recibo fecha: base − desconto ± ajuste = valor pago", () => {
    const exato = payslipBreakdown({ amountCents: 27_000_000, baseCents: 30_000_000, absentDays: 3, absenceDiscountCents: 3_000_000 });
    expect(exato).toEqual({ base: 30_000_000, discount: 3_000_000, absentDays: 3, adjustment: 0 });

    const comAjuste = payslipBreakdown({ amountCents: 28_000_000, baseCents: 30_000_000, absentDays: 3, absenceDiscountCents: 3_000_000 });
    expect(comAjuste.adjustment).toBe(1_000_000);
  });

  it("pagamentos anteriores (sem base registada) mostram o valor pago como base", () => {
    expect(payslipBreakdown({ amountCents: 20_000_000, baseCents: null, absentDays: 0, absenceDiscountCents: 0 }))
      .toEqual({ base: 20_000_000, discount: 0, absentDays: 0, adjustment: 0 });
  });

  it("dateRange devolve os dias de um intervalo, inclusive, e respeita o limite", () => {
    expect(dateRange("2026-03-30", "2026-04-02")).toEqual(["2026-03-30", "2026-03-31", "2026-04-01", "2026-04-02"]);
    expect(dateRange("2026-03-05", "2026-03-05")).toEqual(["2026-03-05"]);
    expect(dateRange("2026-01-01", "2026-12-31").length).toBe(32);
  });
});
