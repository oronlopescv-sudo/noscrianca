// Regras puras dos avisos de cobrança (sem acesso à base de dados).

/** Etapas por defeito: aviso 1 dia e 7 dias após o vencimento. */
export const DEFAULT_REMINDER_DAYS = "1,7";

/** Lê "1,7" -> [1, 7]. Ignora valores inválidos, ordena e remove repetidos. */
export function parseReminderDays(raw: string): number[] {
  const nums = raw.split(",").map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n >= 1 && n <= 90);
  return [...new Set(nums)].sort((a, b) => a - b);
}

/** Dias entre duas datas ISO (fim - início). */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

/**
 * Uma etapa aplica-se a uma fatura quando o atraso está dentro da sua janela:
 * de `stage` dias até à etapa seguinte (a última fica ABERTA — uma fatura com
 * muito atraso continua por avisar, nunca é ignorada). O índice único
 * (fatura, etapa, encarregado) impede a repetição do aviso.
 */
export function reminderDue(dueDate: string, today: string, stages: number[], stage: number): boolean {
  const overdue = daysBetween(dueDate, today);
  const idx = stages.indexOf(stage);
  if (idx === -1) return false;
  const next = stages[idx + 1];
  const windowEnd = next ? next - 1 : Infinity;
  return overdue >= stage && overdue <= windowEnd;
}
