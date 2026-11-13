/**
 * IP do cliente, para limites de abuso e registo de sessões.
 *
 * Os proxies à frente da aplicação (EasyPanel/Traefik, Caddy) APENDAM o ip de
 * quem se ligou ao fim de `x-forwarded-for`; as entradas anteriores ao último
 * são dadas pelo próprio cliente e podem ser falsas. Usa-se sempre a ÚLTIMA
 * entrada — nunca a primeira. Sem proxy: "local" (uma só chave, que ainda
 * limita, e a quota por instituição segura volumes anómalos).
 */
export function clientIp(h: Headers): string {
  const xff = h.get("x-forwarded-for") ?? "";
  const parts = xff.split(",").map((s) => s.trim()).filter((s) => s && s.toLowerCase() !== "unknown");
  const last = parts[parts.length - 1];
  if (last) return last.replace(/^::ffff:/, "").slice(0, 64);
  return "local";
}
