import nodemailer from "nodemailer";

type Mail = { to: string; subject: string; text: string };

/**
 * Envia email se o SMTP estiver configurado. Caso contrário regista no log.
 * Devolve true se o email foi efetivamente enviado. Os links de convite são
 * sempre mostrados também no painel, para poderem ser enviados por outra via.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.log(`[mail:não configurado] Para: ${mail.to} | ${mail.subject}\n${mail.text}`);
    return false;
  }
  try {
    const port = Number(process.env.SMTP_PORT || 587);
    const transport = nodemailer.createTransport({
      host, port, secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, ...mail });
    return true;
  } catch (e) {
    console.error("[mail] falha no envio:", (e as Error).message);
    return false;
  }
}
