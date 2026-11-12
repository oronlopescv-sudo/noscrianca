import nodemailer from "nodemailer";

type Mail = { to: string; subject: string; text: string; replyTo?: string; attachments?: { filename: string; content: Uint8Array }[] };

/** Endereço de envio: EMAIL_FROM, ou o SMTP_FROM / SMTP_USER como alternativa. */
export function mailFrom(): string | undefined {
  return process.env.EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || undefined;
}

/** Há um serviço de email utilizável? Exige credenciais e endereço de envio. */
export function mailConfigured(): boolean {
  return Boolean((process.env.RESEND_API_KEY || process.env.SMTP_HOST) && mailFrom());
}

/**
 * Envia email pelo Resend (se RESEND_API_KEY existir) ou por SMTP. Sem configuração
 * regista no log. Devolve true se o email foi aceite pelo serviço. Os links de
 * convite são sempre mostrados também no painel, para poderem ser enviados por outra via.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  const from = mailFrom();
  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from, to: [mail.to], subject: mail.subject, text: mail.text, ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
          ...(mail.attachments?.length ? { attachments: mail.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString("base64") })) } : {}),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        console.error("[mail] Resend recusou o envio:", res.status, (await res.text()).slice(0, 200));
        return false;
      }
      return true;
    } catch (e) {
      console.error("[mail] falha no envio (Resend):", (e as Error).message);
      return false;
    }
  }
  const host = process.env.SMTP_HOST;
  if (!host) {
    // Em produção o corpo não vai para o log: contém links de convite e de recuperação.
    console.log(`[mail:não configurado] Para: ${mail.to} | ${mail.subject}${process.env.NODE_ENV === "production" ? "" : `\n${mail.text}`}`);
    return false;
  }
  try {
    const port = Number(process.env.SMTP_PORT || 587);
    const transport = nodemailer.createTransport({
      host, port, secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    await transport.sendMail({
      from, replyTo: mail.replyTo, to: mail.to, subject: mail.subject, text: mail.text,
      attachments: mail.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content) })),
    });
    return true;
  } catch (e) {
    console.error("[mail] falha no envio:", (e as Error).message);
    return false;
  }
}
