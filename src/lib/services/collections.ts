import { and, desc, inArray, isNull } from "drizzle-orm";
import { t, type TenantDb } from "@/db/tenant";
import type { DebtInvoice } from "@/lib/collection-rules";

export type GuardianDebt = {
  userId: string; name: string; email: string; phone: string;
  /** Conta ativa: recebe também o aviso na aplicação. */
  accountActive: boolean;
  invoices: DebtInvoice[];
  owed: number;
  overdueOwed: number;
  lastSentAt: Date | null;
};

/**
 * Mensalidades em aberto por encarregado (todas as faturas não anuladas com valor em falta
 * dos filhos a seu cargo). Ordena pelo que está em atraso.
 */
export async function guardianDebts(db: TenantDb, today: string, onlyUserIds?: string[]): Promise<{ guardians: GuardianDebt[]; unlinked: { count: number; owed: number } }> {
  const open = await db.query.invoices.findMany({
    where: and(inArray(t.invoices.status, ["OPEN", "PARTIAL"]), isNull(t.invoices.voidedAt)),
    with: { child: true },
  });
  if (!open.length) return { guardians: [], unlinked: { count: 0, owed: 0 } };
  const links = await db.query.childGuardians.findMany({
    where: inArray(t.childGuardians.childId, [...new Set(open.map((i) => i.childId))]),
    with: { guardian: { with: { user: true } } },
  });
  const linksByChild = new Map<string, typeof links>();
  for (const l of links) linksByChild.set(l.childId, [...(linksByChild.get(l.childId) ?? []), l]);
  // Faturas de crianças sem nenhum encarregado ativo: não há a quem cobrar (é preciso associar o encarregado).
  const withGuardian = new Set(links.filter((l) => l.guardian.user.status !== "SUSPENDED" && !l.guardian.user.deletedAt).map((l) => l.childId));
  let unlinkedCount = 0, unlinkedOwed = 0;
  for (const inv of open) {
    const owedNow = inv.totalCents - inv.paidCents;
    if (owedNow > 0 && !withGuardian.has(inv.childId)) { unlinkedCount++; unlinkedOwed += owedNow; }
  }

  const byUser = new Map<string, GuardianDebt>();
  for (const inv of open) {
    const owed = inv.totalCents - inv.paidCents;
    if (owed <= 0) continue;
    const overdue = inv.dueDate < today;
    for (const l of linksByChild.get(inv.childId) ?? []) {
      const u = l.guardian.user;
      if (u.status === "SUSPENDED" || u.deletedAt) continue;
      if (onlyUserIds && !onlyUserIds.includes(u.id)) continue;
      const g = byUser.get(u.id) ?? {
        userId: u.id, name: u.name, email: u.email, phone: u.phone, accountActive: u.status === "ACTIVE",
        invoices: [], owed: 0, overdueOwed: 0, lastSentAt: null,
      };
      if (!g.invoices.some((x) => x.id === inv.id)) {
        g.invoices.push({ id: inv.id, number: inv.number, childName: `${inv.child.firstName} ${inv.child.lastName}`, dueDate: inv.dueDate, owed, overdue });
        g.owed += owed;
        if (overdue) g.overdueOwed += owed;
      }
      byUser.set(u.id, g);
    }
  }

  const list = [...byUser.values()];
  if (list.length) {
    const sent = await db.select({ userId: t.invoiceReminders.userId, sentAt: t.invoiceReminders.sentAt })
      .from(t.invoiceReminders)
      .where(inArray(t.invoiceReminders.userId, list.map((g) => g.userId)))
      .orderBy(desc(t.invoiceReminders.sentAt));
    for (const s of sent) {
      const g = byUser.get(s.userId);
      if (g && !g.lastSentAt) g.lastSentAt = s.sentAt;
    }
  }
  return { guardians: list.sort((a, b) => b.overdueOwed - a.overdueOwed || b.owed - a.owed || a.name.localeCompare(b.name)), unlinked: { count: unlinkedCount, owed: unlinkedOwed } };
}
