import { addDays } from "@/lib/format";

/** Todas as datas ISO entre duas (inclusive). Limitado a 32 dias para não crescer sem controlo. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length <= 31; d = addDays(d, 1)) out.push(d);
  return out;
}
