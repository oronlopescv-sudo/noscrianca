import "./_env";
import { eq } from "drizzle-orm";
import { central, c, closeCentral } from "@/db/central";
import { closeAllTenantPools, getTenantDb, t } from "@/db/tenant";
import { randomToken, sha256 } from "@/lib/crypto";

/**
 * Percorre todas as páginas dos painéis com a sessão de cada perfil de demonstração
 * e falha se alguma responder com erro ou redirecionar para uma página inesperada.
 *   npm run seed:demo && npm run build && npm run start   (noutro terminal)
 *   npm run test:pages
 */
const BASE = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const DEMO_PASSWORD_USERS = ["creche-sol", "creche-lua"] as const;

type Who = { label: string; cookie: string };

async function sessionFor(institutionId: string, userId: string) {
  const token = randomToken();
  await central().insert(c.sessions).values({
    tokenHash: sha256(token), scope: "TENANT", userId, institutionId, expiresAt: new Date(Date.now() + 3600_000),
  });
  return token;
}

async function fetchPage(path: string, cookie: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie: `nc_session=${cookie}` }, redirect: "manual" });
  const body = await res.text();
  const redirect = body.includes("NEXT_REDIRECT") ? /NEXT_REDIRECT;replace;([^;]+);/.exec(body)?.[1] ?? "?" : null;
  const error = /Application error|__next_error__|Digest:/.test(body);
  // Página não encontrada: o Next responde 200 em streaming, por isso verifica-se o conteúdo.
  const notFound = body.includes("não existe ou foi movido");
  return { status: res.status, redirect, error, notFound };
}

function body404(r: { status: number; notFound: boolean }) {
  return r.status === 404 || r.notFound;
}

async function main() {
  let failures = 0;
  let checked = 0;
  const report = (ok: boolean, line: string) => { checked++; if (!ok) failures++; console.log(`${ok ? "✓" : "✗"} ${line}`); };

  for (const slug of DEMO_PASSWORD_USERS) {
    const inst = await central().query.institutions.findFirst({ where: eq(c.institutions.slug, slug) });
    if (!inst) throw new Error(`${slug} não existe. Execute npm run seed:demo.`);
    const db = await getTenantDb(inst.id);
    const users = await db.query.users.findMany({ with: { role: true } });
    const director = users.find((u) => u.role?.key === "DIRECTOR")!;
    const educator = users.find((u) => u.role?.key === "EDUCATOR")!;
    const guardian = users.find((u) => u.kind === "GUARDIAN")!;
    const children = await db.query.children.findMany();
    const invoices = await db.query.invoices.findMany();
    const payments = await db.query.payments.findMany();
    const guardians = await db.query.guardians.findMany();
    const base = `/c/${slug}`;
    const ownLink = await db.query.childGuardians.findFirst({ where: eq(t.childGuardians.guardianId, guardians[0]!.id) });

    const who: Record<string, Who> = {
      director: { label: "Direção", cookie: await sessionFor(inst.id, director.id) },
      educator: { label: "Educadora", cookie: await sessionFor(inst.id, educator.id) },
      guardian: { label: "Encarregado", cookie: await sessionFor(inst.id, guardian.id) },
    };

    const plan: [keyof typeof who, string, "OK" | "DENY"][] = [];
    const add = (w: keyof typeof who, path: string, expect: "OK" | "DENY") => plan.push([w, path, expect]);
    const gestao = ["/gestao", "/gestao/presencas", "/gestao/criancas", `/gestao/criancas/${children[0]?.id}`, "/gestao/encarregados", "/gestao/funcionarios", "/gestao/turmas",
      "/gestao/mensalidades", `/gestao/mensalidades/${invoices[0]?.id}`, "/gestao/comunicados", "/gestao/mensagens", `/gestao/mensagens/${guardians[0]?.id}`,
      "/gestao/cargos", "/gestao/relatorios", "/gestao/definicoes", "/gestao/auditoria", "/perfil",
      "/exportar/criancas", "/exportar/encarregados", "/exportar/faturas", "/exportar/pagamentos", "/exportar/presencas",
      `/fatura/${invoices[0]?.id}`, `/recibo/${payments[0]?.id}`];
    const sala = ["/sala", "/sala/diario", "/sala/mensagens", `/sala/mensagens/${guardians[0]?.id}`, "/sala/comunicados", "/perfil"];
    const pais = ["/pais", `/pais/filhos/${ownLink?.childId}`, "/pais/comunicados", "/pais/mensagens", "/pais/financeiro", "/perfil"];
    for (const p of gestao) add("director", `${base}${p}`, "OK");
    for (const p of sala) add("educator", `${base}${p}`, "OK");
    for (const p of pais) add("guardian", `${base}${p}`, "OK");
    // Criança de outra família: deve dar 404 (sem dados).
    const other = children.find((ch) => ch.id !== ownLink?.childId);
    if (other) add("guardian", `${base}/pais/filhos/${other.id}`, "DENY");
    // Acessos que devem ser recusados
    for (const p of ["/gestao", "/gestao/criancas"]) add("educator", `${base}${p}`, "DENY");
    for (const p of ["/gestao", "/sala"]) add("guardian", `${base}${p}`, "DENY");
    add("guardian", `${base}/exportar/criancas`, "DENY");
    add("guardian", `${base}/gestao/criancas`, "DENY");

    for (const [w, path, expect] of plan) {
      const r = await fetchPage(path, who[w].cookie);
      const denied = r.redirect !== null && r.redirect.includes("sem-acesso");
      const forbidden = r.status === 403;
      if (expect === "OK") {
        report(r.status === 200 && !r.redirect && !r.error, `[${slug}] ${who[w].label} ${path} → ${r.status}${r.redirect ? ` redir ${r.redirect}` : ""}${r.error ? " ERRO" : ""}`);
      } else {
        const notFound = body404(r);
        report(denied || forbidden || r.status === 404 || notFound, `[${slug}] ${who[w].label} sem acesso a ${path} → ${r.status}${r.redirect ? ` redir ${r.redirect}` : ""}`);
      }
    }
  }

  console.log(`\n${checked - failures}/${checked} verificações passaram.`);
  if (failures) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await closeAllTenantPools(); await closeCentral(); });
