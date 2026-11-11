import "../../scripts/_env";
import { and, eq } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { central, c, closeCentral } from "@/db/central";
import { closeAllTenantPools, getTenantDb, t, tenantConnectionString, type TenantDb } from "@/db/tenant";
import { decrypt } from "@/lib/crypto";
import { createExtraInvoice, generateMonthlyInvoices, recordPayment, reversePayment } from "@/lib/services/finance";
import { todayIn } from "@/lib/format";

/**
 * Testes de integração contra a base real (npm run db:setup && npm run seed:demo).
 * Verificam: isolamento entre bases de dados, finanças e imutabilidade dos pagamentos.
 */
let sol: { id: string; db: TenantDb; slug: string };
let lua: { id: string; db: TenantDb; slug: string };
const PERIOD = "2031-01"; // mês isolado para não interferir com os dados de demonstração
const REF = `TST-${Date.now()}`; // referência única por execução (os pagamentos são imutáveis)

beforeAll(async () => {
  const s = await central().query.institutions.findFirst({ where: eq(c.institutions.slug, "creche-sol") });
  const l = await central().query.institutions.findFirst({ where: eq(c.institutions.slug, "creche-lua") });
  if (!s || !l) throw new Error("Execute npm run seed:demo antes de correr os testes de integração.");
  sol = { id: s.id, slug: s.slug, db: await getTenantDb(s.id) };
  lua = { id: l.id, slug: l.slug, db: await getTenantDb(l.id) };
});

afterAll(async () => {
  await closeAllTenantPools();
  await closeCentral();
});

describe("isolamento entre bases de dados", () => {
  it("cada instituição tem a sua própria base de dados", async () => {
    const [a] = await central().select().from(c.tenantDatabases).where(eq(c.tenantDatabases.institutionId, sol.id));
    const [b] = await central().select().from(c.tenantDatabases).where(eq(c.tenantDatabases.institutionId, lua.id));
    expect(a.dbName).not.toBe(b.dbName);
    expect(a.dbUser).not.toBe(b.dbUser);
  });

  it("o utilizador de uma creche não consegue ligar-se à base de outra", async () => {
    const [solDb] = await central().select().from(c.tenantDatabases).where(eq(c.tenantDatabases.institutionId, sol.id));
    const [luaDb] = await central().select().from(c.tenantDatabases).where(eq(c.tenantDatabases.institutionId, lua.id));
    const url = new URL(await tenantConnectionString(lua.id));
    url.username = solDb.dbUser;
    url.password = decrypt(solDb.passwordEnc);
    const client = new pg.Client({ connectionString: url.toString() });
    await expect(client.connect()).rejects.toThrow();
    await client.end().catch(() => {});
    expect(luaDb.dbName).not.toBe(solDb.dbName);
  });

  it("os dados de uma creche não aparecem na outra", async () => {
    const solChildren = await sol.db.select({ id: t.children.id }).from(t.children);
    const luaChildren = await lua.db.select({ id: t.children.id }).from(t.children);
    const overlap = solChildren.filter((x) => luaChildren.some((y) => y.id === x.id));
    expect(overlap).toHaveLength(0);
    expect(solChildren.length).toBeGreaterThan(0);
    expect(luaChildren.length).toBeGreaterThan(0);
  });
});

/** Fatura nova e isolada para cada teste (evita estado herdado de execuções anteriores). */
async function newInvoice() {
  const child = await sol.db.query.children.findFirst({ where: eq(t.children.status, "ACTIVE") });
  return createExtraInvoice(sol.db, {
    childId: child!.id, description: `Teste ${REF}`, amountCents: 1000, dueDate: `${PERIOD}-28`, today: `${PERIOD}-01`,
  });
}

describe("finanças", () => {
  it("gerar faturas mensais é idempotente", async () => {
    const today = `${PERIOD}-15`;
    await generateMonthlyInvoices(sol.db, PERIOD, today);
    const second = await generateMonthlyInvoices(sol.db, PERIOD, today);
    expect(second.created).toBe(0);
    const invoices = await sol.db.select().from(t.invoices).where(and(eq(t.invoices.period, PERIOD), eq(t.invoices.kind, "MONTHLY")));
    const perChild = new Map<string, number>();
    for (const i of invoices) perChild.set(i.childId, (perChild.get(i.childId) ?? 0) + 1);
    for (const n of perChild.values()) expect(n).toBe(1);
    expect(invoices.length).toBeGreaterThan(0);
  });

  it("pagamento atualiza o estado da fatura e recibo é emitido", async () => {
    const inv = await newInvoice();
    const director = await sol.db.query.users.findFirst({ where: eq(t.users.kind, "STAFF") });
    await recordPayment(sol.db, {
      invoiceId: inv!.id, amountCents: 100, method: "CASH", reference: REF, paidAt: todayIn("Atlantic/Cape_Verde"),
      userId: director!.id, userName: director!.name,
    });
    const after = await sol.db.query.invoices.findFirst({ where: eq(t.invoices.id, inv!.id) });
    expect(after!.paidCents).toBe(100);
    expect(after!.status).toBe("PARTIAL");
  });

  it("um pagamento não pode ser apagado (trigger da base de dados)", async () => {
    const pay = await sol.db.query.payments.findFirst({ where: eq(t.payments.reference, REF) });
    expect(pay).toBeTruthy();
    await expect(sol.db.delete(t.payments).where(eq(t.payments.id, pay!.id))).rejects.toThrow();
  });

  it("estorno mantém o histórico e recalcula o saldo", async () => {
    const pay = await sol.db.query.payments.findFirst({ where: eq(t.payments.reference, REF) });
    await reversePayment(sol.db, pay!.id, "Teste automático", "Teste");
    const reversed = await sol.db.query.payments.findFirst({ where: eq(t.payments.id, pay!.id) });
    expect(reversed!.reversedAt).not.toBeNull();
    const inv = await sol.db.query.invoices.findFirst({ where: eq(t.invoices.id, pay!.invoiceId) });
    expect(inv!.paidCents).toBe(0);
    expect(inv!.status).toBe("OPEN");
  });
});

// Garante que a data de referência é válida mesmo sem dados.
it("data de referência é ISO", () => {
  expect(todayIn("Atlantic/Cape_Verde")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
