import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mailConfigured, sendMail } from "@/lib/mail";

const KEYS = ["RESEND_API_KEY", "SMTP_HOST", "SMTP_FROM", "SMTP_USER", "EMAIL_FROM"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  vi.unstubAllGlobals();
});

describe("mailConfigured", () => {
  it("falso sem credenciais", () => {
    expect(mailConfigured()).toBe(false);
  });
  it("falso com chave do Resend mas sem endereço de envio", () => {
    process.env.RESEND_API_KEY = "re_x";
    expect(mailConfigured()).toBe(false);
  });
  it("verdadeiro com chave do Resend e EMAIL_FROM", () => {
    process.env.RESEND_API_KEY = "re_x";
    process.env.EMAIL_FROM = "NosCriança <cobranca@exemplo.cv>";
    expect(mailConfigured()).toBe(true);
  });
});

describe("sendMail pelo Resend", () => {
  it("envia anexos em base64", async () => {
    process.env.RESEND_API_KEY = "re_x";
    process.env.EMAIL_FROM = "cobranca@exemplo.cv";
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const ok = await sendMail({ to: "marta@creche.demo", subject: "Recibo", text: "Em anexo", attachments: [{ filename: "recibo.pdf", content: new Uint8Array([37, 80, 68, 70]) }] });
    expect(ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).attachments).toEqual([{ filename: "recibo.pdf", content: "JVBERg==" }]);
  });

  it("envia o pedido com remetente, destinatário e reply_to", async () => {
    process.env.RESEND_API_KEY = "re_x";
    process.env.EMAIL_FROM = "cobranca@exemplo.cv";
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const ok = await sendMail({ to: "rosa@familia.demo", subject: "Teste", text: "Olá", replyTo: "creche@exemplo.cv" });
    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_x");
    expect(JSON.parse(init.body as string)).toEqual({ from: "cobranca@exemplo.cv", to: ["rosa@familia.demo"], subject: "Teste", text: "Olá", reply_to: "creche@exemplo.cv" });
  });

  it("devolve false quando o Resend recusa o envio", async () => {
    process.env.RESEND_API_KEY = "re_x";
    process.env.EMAIL_FROM = "cobranca@exemplo.cv";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("erro", { status: 422 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendMail({ to: "a@b.cv", subject: "x", text: "y" })).toBe(false);
  });
});
