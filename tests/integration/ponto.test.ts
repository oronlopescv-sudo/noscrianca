import "../../scripts/_env";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { central, c, closeCentral } from "@/db/central";
import { closeAllTenantPools, getTenantDb, t, type TenantDb } from "@/db/tenant";
import { monthlyReportCsv, monthlyReportPdf, monthlyRows } from "@/lib/services/monthly-report";

let db: TenantDb;
let settings: Awaited<ReturnType<typeof db.query.settings.findFirst>>;
let employeeId: string;
const created: string[] = [];

beforeAll(async () => {
  const row = await central().query.institutions.findFirst({ where: eq(c.institutions.slug, "creche-sol") });
  if (!row) throw new Error("Execute npm run seed:demo antes de correr os testes de integração.");
  db = await getTenantDb(row.id);
  settings = await db.query.settings.findFirst({ where: eq(t.settings.id, 1) });
  const emp = await db.query.employees.findFirst();
  if (!emp) throw new Error("Sem funcionários na creche de demonstração.");
  employeeId = emp!.id;
});

afterAll(async () => {
  for (const id of created) await db.delete(t.timeEntries).where(eq(t.timeEntries.id, id));
  await closeAllTenantPools();
  await closeCentral();
});

describe("registo de ponto — restrições da base de dados", () => {
  it("aceita uma marcação válida (entrada e saída)", async () => {
    const [row] = await db.insert(t.timeEntries).values({ employeeId, date: "2031-03-03", clockIn: "08:00", clockOut: "16:00" }).returning();
    created.push(row.id);
    expect(row.status).toBe("PENDING");
  });

  it("aceita entrada aberta (sem saída ainda)", async () => {
    const [row] = await db.insert(t.timeEntries).values({ employeeId, date: "2031-03-04", clockIn: "08:00" }).returning();
    created.push(row.id);
    expect(row.clockOut).toBeNull();
  });

  it("recusa saída antes ou igual à entrada", async () => {
    await expect(db.insert(t.timeEntries).values({ employeeId, date: "2031-03-05", clockIn: "10:00", clockOut: "09:00" })).rejects.toThrow();
    await expect(db.insert(t.timeEntries).values({ employeeId, date: "2031-03-05", clockIn: "10:00", clockOut: "10:00" })).rejects.toThrow();
  });

  it("recusa horas fora do formato HH:MM", async () => {
    await expect(db.insert(t.timeEntries).values({ employeeId, date: "2031-03-06", clockIn: "25:00" })).rejects.toThrow();
  });

  it("recusa estados desconhecidos", async () => {
    await expect(db.insert(t.timeEntries).values({ employeeId, date: "2031-03-07", clockIn: "08:00", status: "TALVEZ" })).rejects.toThrow();
  });
});

describe("relatório mensal — dados e ficheiros", () => {
  it("totais do modo só-recebidos batem com as linhas", async () => {
    const { rows, received, paid } = await monthlyRows(db, "2031-03", "RECEBIDOS");
    expect(rows.every((r) => r.kind === "IN")).toBe(true);
    expect(received).toBe(rows.reduce((a, r) => a + r.cents, 0));
    expect(paid).toBe(0);
  });

  it("modo completo: saldo = recebido - pago", async () => {
    const r = await monthlyRows(db, "2031-03", "COMPLETO");
    expect(r.rows.filter((x) => x.kind === "OUT").reduce((a, x) => a + x.cents, 0)).toBe(r.paid);
    expect(r.rows.filter((x) => x.kind === "IN").reduce((a, x) => a + x.cents, 0)).toBe(r.received);
  });

  it("gera PDF e CSV válidos", async () => {
    const pdf = await monthlyReportPdf(db, settings!, "2031-03", "COMPLETO");
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    const csv = await monthlyReportCsv(db, settings!, "2031-03", "COMPLETO");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.split("\r\n")[0]).toBe(String.fromCharCode(0xfeff) + "Data;Tipo;Movimento;Pessoa;Fatura;Método;Entrada;Saída");
    expect(csv).toContain("Saldo do mês");
  });
});
