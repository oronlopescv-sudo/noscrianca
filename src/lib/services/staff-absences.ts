import { and, asc, count, eq, gte, inArray, lte } from "drizzle-orm";
import { t, type TenantDb } from "@/db/tenant";

/** Faltas de um intervalo de datas (ISO), com o funcionário e o respetivo utilizador. */
export function absencesInRange(db: TenantDb, from: string, to: string, employeeIds?: string[]) {
  if (employeeIds && employeeIds.length === 0) return Promise.resolve([]);
  return db.query.staffAbsences.findMany({
    where: and(
      gte(t.staffAbsences.date, from),
      lte(t.staffAbsences.date, to),
      employeeIds ? inArray(t.staffAbsences.employeeId, employeeIds) : undefined,
    ),
    orderBy: [asc(t.staffAbsences.date)],
    with: { employee: { with: { user: true } } },
  });
}

export type AbsenceRow = Awaited<ReturnType<typeof absencesInRange>>[number];

/** Faltas de um mês (YYYY-MM). */
export function absencesInMonth(db: TenantDb, period: string, employeeIds?: string[]) {
  return absencesInRange(db, `${period}-01`, `${period}-31`, employeeIds);
}

/** Faltas de um funcionário num ano. */
export function absencesInYear(db: TenantDb, employeeId: string, year: string) {
  return absencesInRange(db, `${year}-01-01`, `${year}-12-31`, [employeeId]);
}

/** Dias de falta que descontam do salário num mês (cada dia conta uma vez). */
export async function countDeductibleAbsences(db: TenantDb, employeeId: string, period: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(t.staffAbsences).where(and(
    eq(t.staffAbsences.employeeId, employeeId),
    eq(t.staffAbsences.deductible, true),
    gte(t.staffAbsences.date, `${period}-01`),
    lte(t.staffAbsences.date, `${period}-31`),
  ));
  return Number(row?.n ?? 0);
}

/** Dias de falta de um mês que descontam, agrupados por mês (YYYY-MM). */
export function deductibleDaysByMonth(rows: { date: string; deductible: boolean }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (!r.deductible) continue;
    const m = r.date.slice(0, 7);
    out.set(m, (out.get(m) ?? 0) + 1);
  }
  return out;
}
