import "../../scripts/_env";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { central, c, closeCentral } from "@/db/central";
import { closeAllTenantPools, getTenantDb, t, type TenantDb } from "@/db/tenant";

let db: TenantDb;
const ids: { enroll: string[]; events: string[] } = { enroll: [], events: [] };

beforeAll(async () => {
  const row = await central().query.institutions.findFirst({ where: eq(c.institutions.slug, "creche-sol") });
  if (!row) throw new Error("Execute npm run seed:demo antes de correr os testes de integração.");
  db = await getTenantDb(row.id);
});

afterAll(async () => {
  for (const id of ids.enroll) await db.delete(t.enrollmentRequests).where(eq(t.enrollmentRequests.id, id));
  for (const id of ids.events) await db.delete(t.events).where(eq(t.events.id, id));
  await closeAllTenantPools();
  await closeCentral();
});

describe("lista de espera", () => {
  it("aceita o estado WAITLIST num pedido", async () => {
    const [row] = await db.insert(t.enrollmentRequests).values({ guardianName: "Teste", childName: "Criança Teste", status: "WAITLIST" }).returning();
    ids.enroll.push(row.id);
    expect(row.status).toBe("WAITLIST");
  });

  it("recusa estados desconhecidos", async () => {
    await expect(db.insert(t.enrollmentRequests).values({ guardianName: "Teste", childName: "X", status: "PENDENTE" })).rejects.toThrow();
  });
});

describe("calendário escolar", () => {
  it("aceita os tipos de calendário e o tipo por defeito é EVENTO", async () => {
    const [f] = await db.insert(t.events).values({ title: "Feriado teste", date: "2031-12-08", kind: "FERIADO", createdByName: "Teste" }).returning();
    ids.events.push(f.id);
    expect(f.kind).toBe("FERIADO");
    const [e] = await db.insert(t.events).values({ title: "Evento teste", date: "2031-12-09", createdByName: "Teste" }).returning();
    ids.events.push(e.id);
    expect(e.kind).toBe("EVENTO");
  });

  it("recusa tipos desconhecidos", async () => {
    await expect(db.insert(t.events).values({ title: "X", date: "2031-12-10", kind: "OUTRO", createdByName: "Teste" })).rejects.toThrow();
  });
});
