import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { getTenantDb, t, type TenantDb } from "@/db/tenant";
import { money, todayIn } from "@/lib/format";
import { mailConfigured, sendMail } from "@/lib/mail";
import { DEFAULT_REMINDER_DAYS, daysBetween, parseReminderDays, reminderDue } from "@/lib/reminder-rules";

type Inst = { id: string; slug: string; timezone: string };

/**
 * Envia avisos de faturas em atraso aos encarregados de cada criança.
 * Idempotente: o registo (fatura, etapa, utilizador) é inserido antes do envio,
 * e removido se o envio falhar, para tentar de novo no dia seguinte.
 */
export async function sendOverdueReminders(inst: Inst): Promise<{ sent: number; failed: number }> {
  const result = { sent: 0, failed: 0 };
  const db = await getTenantDb(inst.id);
  const s = await db.query.settings.findFirst({ where: eq(t.settings.id, 1) });
  if (!s || !s.reminderEnabled || !mailConfigured()) return result;

  const stages = parseReminderDays(s.reminderDays || DEFAULT_REMINDER_DAYS);
  if (!stages.length) return result;
  const today = todayIn(inst.timezone);

  const overdue = await db.select().from(t.invoices).where(and(
    inArray(t.invoices.status, ["OPEN", "PARTIAL"]),
    isNull(t.invoices.voidedAt),
    lt(t.invoices.dueDate, today),
  ));

  for (const inv of overdue) {
    const stage = stages.find((st) => reminderDue(inv.dueDate, today, stages, st));
    if (stage === undefined) continue;
    const recipients = await guardiansOfChild(db, inv.childId);
    const child = await db.query.children.findFirst({ where: eq(t.children.id, inv.childId) });
    if (!child) continue;

    for (const g of recipients) {
      const [row] = await db.insert(t.invoiceReminders)
        .values({ invoiceId: inv.id, stage, userId: g.userId, email: g.email })
        .onConflictDoNothing().returning();
      if (!row) continue;

      const due = money(inv.totalCents - inv.paidCents, s.currency);
      const days = daysBetween(inv.dueDate, today);
      const ok = await sendMail({
        to: g.email,
        replyTo: s.email || undefined,
        subject: `Pagamento em atraso: ${child.firstName} (fatura ${inv.number})`,
        text: [
          `Olá ${g.name},`,
          "",
          `A fatura ${inv.number} de ${child.firstName} está em atraso há ${days} dia(s).`,
          `Valor em falta: ${due}. Vencimento: ${inv.dueDate}.`,
          "",
          s.paymentInfo ? `Como pagar:\n${s.paymentInfo}` : "Contacte a creche para saber como pagar.",
          "",
          `Se já pagou, pode ignorar esta mensagem. Obrigado.`,
          `${s.name}`,
        ].join("\n"),
      });

      if (ok) {
        result.sent++;
        await db.insert(t.notifications).values({
          userId: g.userId,
          title: `Fatura ${inv.number} em atraso`,
          body: `Valor em falta: ${due}`,
          href: `/c/${inst.slug}/pais/financeiro`,
        });
      } else {
        result.failed++;
        await db.delete(t.invoiceReminders).where(eq(t.invoiceReminders.id, row.id));
      }
    }
  }
  return result;
}

async function guardiansOfChild(db: TenantDb, childId: string) {
  const rows = await db
    .select({ userId: t.users.id, email: t.users.email, name: t.users.name, status: t.users.status, deletedAt: t.users.deletedAt })
    .from(t.childGuardians)
    .innerJoin(t.guardians, eq(t.guardians.id, t.childGuardians.guardianId))
    .innerJoin(t.users, eq(t.users.id, t.guardians.userId))
    .where(eq(t.childGuardians.childId, childId));
  return rows.filter((r) => r.status !== "SUSPENDED" && !r.deletedAt && r.email);
}

