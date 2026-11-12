/** Divisor usado para o valor de um dia de falta: salário base ÷ 30. */
export const DAILY_DIVISOR = 30;

/** Valor de um dia de falta, em cêntimos. */
export function dailyRateCents(baseCents: number): number {
  return Math.round(baseCents / DAILY_DIVISOR);
}

/** Desconto total por faltas, em cêntimos. Nunca ultrapassa o salário base. */
export function absenceDiscountCents(baseCents: number, days: number): number {
  if (baseCents <= 0 || days <= 0) return 0;
  return Math.min(baseCents, Math.round((baseCents * days) / DAILY_DIVISOR));
}

/**
 * Decomposição do recibo: salário base − desconto por faltas ± ajuste manual = valor pago.
 * Pagamentos antigos (sem base registada) mostram o valor pago como base, sem desconto.
 */
export function payslipBreakdown(p: { amountCents: number; baseCents: number | null; absentDays: number; absenceDiscountCents: number }) {
  const base = p.baseCents ?? p.amountCents;
  const discount = p.absenceDiscountCents;
  return { base, discount, absentDays: p.absentDays, adjustment: p.amountCents - (base - discount) };
}
