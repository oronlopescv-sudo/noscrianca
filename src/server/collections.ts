"use server";

import { t } from "@/db/tenant";
import { COOLDOWN_DAYS, MANUAL_STAGE, collectionMessage } from "@/lib/collection-rules";
import { money, todayIn } from "@/lib/format";
import { mailConfigured, sendMail } from "@/lib/mail";
import { fail, run, str, type ActionResult } from "@/lib/result";
import { guardianDebts, type GuardianDebt } from "@/lib/services/collections";
import { audit, notify, tenantAction, type TenantCtx } from "@/lib/tenant";

type S = ActionResult | null;

function messageFor(ctx: TenantCtx, g: GuardianDebt) {
  return collectionMessage({
    schoolName: ctx.settings.name, guardianName: g.name, invoices: g.invoices, owed: g.owed,
    currency: ctx.settings.currency, paymentInfo: ctx.settings.paymentInfo,
  });
}

/** Regista o aviso manual de cada fatura do encarregado (repetir atualiza a data do último aviso). */
async function recordManual(ctx: TenantCtx, g: GuardianDebt) {
  for (const inv of g.invoices) {
    await ctx.db.insert(t.invoiceReminders).values({ invoiceId: inv.id, stage: MANUAL_STAGE, userId: g.userId, email: g.email })
      .onConflictDoUpdate({ target: [t.invoiceReminders.invoiceId, t.invoiceReminders.stage, t.invoiceReminders.userId], set: { sentAt: new Date(), email: g.email } });
  }
}

/** Cobrança a UM encarregado: uma só mensagem com todas as mensalidades em aberto dos seus filhos. */
export async function sendGuardianCollectionAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "finance.manage" });
    const [g] = (await guardianDebts(ctx.db, todayIn(ctx.settings.timezone), [str(fd, "userId")])).guardians;
    if (!g) fail("Este encarregado não tem mensalidades em aberto.");
    const msg = messageFor(ctx, g);
    const mailOn = mailConfigured();
    const emailed = mailOn && !!g.email
      ? await sendMail({ to: g.email, replyTo: ctx.settings.email || undefined, subject: msg.subject, text: msg.text })
      : false;
    if (g.accountActive) {
      await notify(ctx.db, [g.userId], { title: msg.subject, body: `Em falta: ${money(g.owed, ctx.settings.currency)}`, href: `${ctx.base}/pais/financeiro` });
    }
    const delivered = emailed || g.accountActive;
    await audit(ctx, delivered ? "Cobrança enviada a encarregado" : "Cobrança sem canal de envio", {
      entity: "guardian", entityId: g.userId,
      details: { encarregado: g.name, faturas: g.invoices.length, valor: money(g.owed, ctx.settings.currency), email: emailed, aplicacao: g.accountActive },
    });
    if (!delivered) {
      const why = mailOn && g.email ? "o email falhou e não tem conta ativa" : mailOn ? "não tem email" : "não tem conta ativa e o email não está configurado no servidor";
      fail(`Não foi possível avisar ${g.name}: ${why}. Use o WhatsApp ou copie a mensagem.`);
    }
    await recordManual(ctx, g);
    if (emailed && g.accountActive) return { ok: true, message: `Cobrança enviada por email para ${g.email} e avisada na aplicação.` };
    if (emailed) return { ok: true, message: `Cobrança enviada por email para ${g.email}.` };
    return { ok: true, message: `${g.name} foi avisado(a) na aplicação.${mailOn ? " O email falhou." : " O email não está configurado no servidor, por isso não saiu email."}` };
  });
}

/** Cobrança a todos os encarregados com mensalidades em atraso: um aviso por encarregado, sem repetir os recentes.
 * Os emails vão SÍNCRONA e só o canal efetivamente entregue é registado como aviso (o último
 * aviso alimenta o cooldown — nunca se perde um encarregado por um email que falhou). */
export async function sendOverdueCollectionsAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "finance.manage" });
    const overdue = (await guardianDebts(ctx.db, todayIn(ctx.settings.timezone))).guardians.filter((g) => g.overdueOwed > 0);
    if (!overdue.length) fail("Não há encarregados com mensalidades em atraso.");
    const cutoff = Date.now() - COOLDOWN_DAYS * 86_400_000;
    const ready = overdue.filter((g) => !g.lastSentAt || g.lastSentAt.getTime() < cutoff);
    const skipped = overdue.length - ready.length;
    const mailOn = mailConfigured();
    const reachable = ready.filter((g) => g.accountActive || (mailOn && !!g.email));
    const noChannel = ready.length - reachable.length;
    if (!ready.length) fail(`Todos os encarregados em atraso já foram avisados nos últimos ${COOLDOWN_DAYS} dias.`);
    if (!reachable.length) fail("Nenhum encarregado em atraso tem conta ativa nem email configurado para receber a cobrança. Use o WhatsApp.");

    const replyTo = ctx.settings.email || undefined;
    let inApp = 0, emailedCount = 0, noDelivery = 0;
    for (const g of reachable) {
      const msg = messageFor(ctx, g);
      const emailed = mailOn && !!g.email ? await sendMail({ to: g.email, replyTo, subject: msg.subject, text: msg.text }) : false;
      let delivered = false;
      if (g.accountActive) {
        await notify(ctx.db, [g.userId], { title: msg.subject, body: `Em falta: ${money(g.owed, ctx.settings.currency)}`, href: `${ctx.base}/pais/financeiro` });
        inApp++;
        delivered = true;
      }
      if (emailed) emailedCount++;
      if (emailed) delivered = true;
      // Só quem recebeu por algum canal entra no cooldown; um email falhado
      // será tentado de novo na próxima cobrança em lote.
      if (delivered) await recordManual(ctx, g);
      else noDelivery++;
    }
    await audit(ctx, "Cobrança em lote a encarregados", {
      entity: "invoice",
      details: { encarregados: reachable.length, avisosNaAplicacao: inApp, emails: emailedCount, semEmailEntregue: noDelivery, semCanal: noChannel, jaAvisados: skipped },
    });
    const bits = [
      emailedCount ? `${emailedCount} email(s) enviados` : "",
      inApp ? `${inApp} avisado(s) na aplicação` : "",
      noDelivery ? `${noDelivery} sem entrega (verifique o email e use o WhatsApp)` : "",
      noChannel ? `${noChannel} sem email nem conta ativa (use o WhatsApp)` : "",
      skipped ? `${skipped} ignorado(s): avisado(s) há menos de ${COOLDOWN_DAYS} dias` : "",
    ].filter(Boolean);
    return {
      ok: true,
      message: `Cobrança enviada a ${reachable.length} encarregado(s) em atraso: ${bits.join("; ")}.${mailOn ? "" : " O email não está configurado no servidor."}`,
    };
  });
}
