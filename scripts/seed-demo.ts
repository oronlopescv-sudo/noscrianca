import "./_env";
import { eq } from "drizzle-orm";
import { central, c, closeCentral } from "@/db/central";
import { closeAllTenantPools, getTenantDb, t, type TenantDb } from "@/db/tenant";
import { hashPassword } from "@/lib/crypto";
import { DIRECTOR_KEY } from "@/lib/permissions";
import { todayIn } from "@/lib/format";
import { generateMonthlyInvoices, recordPayment } from "@/lib/services/finance";
import { createInstitution, runProvisioning } from "@/lib/services/provisioning";

/** Dados de demonstração: duas creches independentes, cada uma com a sua base de dados. Idempotente. */
const PASSWORD = "Demo12345";

const DEMO = [
  {
    slug: "creche-sol", name: "Creche Sol Nascente", city: "São Vicente", directorName: "Ana Lopes", directorEmail: "diretora@creche-sol.demo",
    classrooms: [{ name: "Girassóis", color: "yellow", ageMin: 24, ageMax: 36 }, { name: "Joaninhas", color: "coral", ageMin: 36, ageMax: 60 }],
    educator: { name: "Marta Évora", email: "educadora@creche-sol.demo", classroom: "Girassóis" },
    children: [["Lara", "Mendes", "2023-03-14", "Girassóis"], ["Tiago", "Fortes", "2022-11-02", "Joaninhas"], ["Sofia", "Vieira", "2023-07-21", "Girassóis"], ["Nuno", "Andrade", "2021-09-30", "Joaninhas"]] as const,
    guardian: { name: "Rosa Mendes", email: "rosa@familia.demo", childIndex: 0 },
  },
  {
    slug: "creche-lua", name: "Creche Lua Cheia", city: "Mindelo", directorName: "Helena Tavares", directorEmail: "diretora@creche-lua.demo",
    classrooms: [{ name: "Estrelas", color: "blue", ageMin: 24, ageMax: 48 }],
    educator: { name: "Carla Monteiro", email: "educadora@creche-lua.demo", classroom: "Estrelas" },
    children: [["Gabriel", "Rocha", "2023-01-08", "Estrelas"], ["Mia", "Pires", "2022-05-19", "Estrelas"]] as const,
    guardian: { name: "João Rocha", email: "joao@familia.demo", childIndex: 0 },
  },
] as const;

async function ensureInstitution(d: (typeof DEMO)[number]) {
  const existing = await central().query.institutions.findFirst({ where: eq(c.institutions.slug, d.slug) });
  if (existing) return existing.id;
  const plan = await central().query.plans.findFirst({ where: eq(c.plans.active, true) });
  if (!plan) throw new Error("Não há planos ativos. Execute primeiro npm run db:setup.");
  const { institutionId, jobId } = await createInstitution({
    slug: d.slug, name: d.name, email: `geral@${d.slug}.demo`, phone: "+238 991 0000", address: "Rua Principal 1", city: d.city,
    currency: "CVE", timezone: "Atlantic/Cape_Verde", directorName: d.directorName, directorEmail: d.directorEmail, directorPhone: "+238 991 0001",
    planId: plan.id, billingCycle: "MONTHLY", trialDays: 30,
  });
  const result = await runProvisioning(jobId);
  if (!result.ok) throw new Error(`Provisionamento de ${d.slug} falhou: ${result.error}`);
  return institutionId;
}

async function seedTenant(db: TenantDb, d: (typeof DEMO)[number]) {
  const [{ n }] = await db.select({ n: t.children.id }).from(t.children).limit(1).then((r) => [{ n: r.length }]);
  if (n > 0) { console.log(`  • ${d.slug}: dados já existem, a saltar.`); return; }

  const pwd = await hashPassword(PASSWORD);
  const today = todayIn("Atlantic/Cape_Verde");
  const period = today.slice(0, 7);

  await db.update(t.settings).set({
    name: d.name, email: `geral@${d.slug}.demo`, phone: "+238 991 0000", address: "Rua Principal 1", taxId: "123456789",
    schoolYear: "2026/2027", paymentInfo: "Transferência: Banco Comercial do Atlântico · IBAN CV64 0000 0000 0000 0000 0",
  }).where(eq(t.settings.id, 1));

  const roles = await db.query.roles.findMany();
  const roleOf = (key: string) => roles.find((r) => r.key === key)!;

  // Direção: conta criada no provisionamento → ativar com palavra-passe de demonstração.
  const director = await db.query.users.findFirst({ where: eq(t.users.roleId, roleOf(DIRECTOR_KEY).id) });
  if (director) await db.update(t.users).set({ passwordHash: pwd, status: "ACTIVE" }).where(eq(t.users.id, director.id));

  const classroomIds = new Map<string, string>();
  for (const cl of d.classrooms) {
    const [row] = await db.insert(t.classrooms).values({ name: cl.name, color: cl.color, capacity: 15, ageMinMonths: cl.ageMin, ageMaxMonths: cl.ageMax }).returning();
    classroomIds.set(cl.name, row.id);
  }

  const [plan] = await db.insert(t.feePlans).values({ name: "Tempo inteiro", amountCents: 1_500_000 }).returning();
  await db.insert(t.feePlans).values({ name: "Meio-dia", amountCents: 900_000 });

  // Educadora com acesso à sala.
  const [eduUser] = await db.insert(t.users).values({
    email: d.educator.email, name: d.educator.name, phone: "+238 991 0100", kind: "STAFF", status: "ACTIVE", passwordHash: pwd, roleId: roleOf("EDUCATOR").id,
  }).returning();
  const [emp] = await db.insert(t.employees).values({ userId: eduUser.id, jobTitle: "Educadora de infância", schedule: "8h–16h" }).returning();
  await db.insert(t.classroomEmployees).values({ classroomId: classroomIds.get(d.educator.classroom)!, employeeId: emp.id });

  // Crianças e família.
  const childIds: string[] = [];
  for (const [first, last, birth, room] of d.children) {
    const [ch] = await db.insert(t.children).values({
      firstName: first, lastName: last, birthDate: birth, enrolledAt: "2026-09-01", gender: "", classroomId: classroomIds.get(room)!, feePlanId: plan.id,
    }).returning();
    childIds.push(ch.id);
  }
  const [gUser] = await db.insert(t.users).values({ email: d.guardian.email, name: d.guardian.name, phone: "+238 991 0200", kind: "GUARDIAN", status: "ACTIVE", passwordHash: pwd }).returning();
  const [guardian] = await db.insert(t.guardians).values({ userId: gUser.id, address: "Rua Principal 1", occupation: "Enfermeira" }).returning();
  await db.insert(t.childGuardians).values({ childId: childIds[d.guardian.childIndex], guardianId: guardian.id, relationship: "Mãe", isPrimary: true, canPickup: true });
  await db.insert(t.authorizedPickups).values({ childId: childIds[d.guardian.childIndex], name: "Avó Filomena", phone: "+238 991 0300", relationship: "Avó" });

  // Dia a dia: presenças e diário de hoje.
  const now = new Date();
  for (const [i, id] of childIds.entries()) {
    if (i === childIds.length - 1) {
      await db.insert(t.attendance).values({ childId: id, date: today, status: "ABSENT", absenceReason: "Doença" });
      continue;
    }
    await db.insert(t.attendance).values({ childId: id, date: today, status: "PRESENT", checkInAt: now, checkInBy: eduUser.name, droppedBy: "Mãe" });
  }
  await db.insert(t.diaryEntries).values([
    { childId: childIds[0], date: today, type: "MEAL", title: "Almoço", details: "Comeu tudo", createdById: eduUser.id, createdByName: eduUser.name },
    { childId: childIds[0], date: today, type: "SLEEP", title: "Sesta", details: "Dormiu bem", createdById: eduUser.id, createdByName: eduUser.name },
    { childId: childIds[0], date: today, type: "ACTIVITY", title: "Pintura", details: "", createdById: eduUser.id, createdByName: eduUser.name },
  ]);

  // Comunicação.
  await db.insert(t.announcements).values({ title: "Reunião de pais", body: "Sexta-feira às 17h30 na sala principal.", createdById: eduUser.id, createdByName: eduUser.name });
  await db.insert(t.messages).values([
    { guardianId: guardian.id, fromGuardian: true, senderId: gUser.id, senderName: gUser.name, body: "Bom dia! A Lara pode trazer a manta da sesta?" },
    { guardianId: guardian.id, fromGuardian: false, senderId: eduUser.id, senderName: eduUser.name, body: "Claro! Pode trazer, obrigada." },
  ]);

  // Faturação: mensalidades do mês e um pagamento.
  const gen = await generateMonthlyInvoices(db, period, today);
  console.log(`  • faturas de ${period}: ${gen.created} criadas`);
  const [firstInvoice] = await db.query.invoices.findMany({ where: eq(t.invoices.childId, childIds[0]), limit: 1 });
  if (firstInvoice && director) {
    await recordPayment(db, { invoiceId: firstInvoice.id, amountCents: 500_000, method: "TRANSFER", reference: "TRF-0001", paidAt: today, userId: director.id, userName: director.name });
  }
  await db.update(t.settings).set({ updatedAt: new Date() }).where(eq(t.settings.id, 1));
  console.log(`  • ${d.slug}: ${d.children.length} crianças, 1 educador, 1 encarregado, dados do dia.`);
}

async function main() {
  for (const d of DEMO) {
    console.log(`\n${d.name} (${d.slug})`);
    const institutionId = await ensureInstitution(d);
    const db = await getTenantDb(institutionId);
    await seedTenant(db, d);
  }
  console.log(`\nPronto. Palavra-passe de todas as contas de demonstração: ${PASSWORD}`);
  console.log("Diretoras: diretora@creche-sol.demo · diretora@creche-lua.demo");
  console.log("Educadoras: educadora@creche-sol.demo · educadora@creche-lua.demo");
  console.log("Encarregados: rosa@familia.demo · joao@familia.demo");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await closeAllTenantPools(); await closeCentral(); });
