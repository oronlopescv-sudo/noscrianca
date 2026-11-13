import { and, eq, lt, or, sql } from "drizzle-orm";
import { t, type TenantDb } from "@/db/tenant";

/**
 * Retenção de dados pessoais dos pedidos de inscrição (formulário público):
 * um pedido CLOSED (fechado) há mais de 90 dias, ou por tratar há mais de 180,
 * é ANONIMIZADO — fica no histórico (contagem/estado para a gestão) sem nomes
 * de crianças, contactos ou notas.
 */
export const ENROLLMENT_RETENTION_CLOSED_DAYS = 90;
export const ENROLLMENT_RETENTION_STALE_DAYS = 180;

const ANON = "eliminado por retenção";

export async function anonymizeOldEnrollments(db: TenantDb): Promise<number> {
  const now = new Date();
  const rows = await db.update(t.enrollmentRequests).set({
    guardianName: ANON, email: "", phone: "", childName: ANON, childBirthDate: null, message: "",
  }).where(and(
    or(
      and(eq(t.enrollmentRequests.status, "CLOSED"), lt(t.enrollmentRequests.createdAt, new Date(now.getTime() - ENROLLMENT_RETENTION_CLOSED_DAYS * 86_400_000))),
      and(eq(t.enrollmentRequests.status, "NEW"), lt(t.enrollmentRequests.createdAt, new Date(now.getTime() - ENROLLMENT_RETENTION_STALE_DAYS * 86_400_000))),
    ),
    sql`${t.enrollmentRequests.childName} <> ${ANON}`,
  )).returning({ id: t.enrollmentRequests.id });
  return rows.length;
}
