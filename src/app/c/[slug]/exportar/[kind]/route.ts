import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { t } from "@/db/tenant";
import { fmtTime, isIsoDate, toCsv } from "@/lib/format";
import { INVOICE_STATUS } from "@/lib/labels";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { childScope, loadTenant } from "@/lib/tenant";

const PERM = {
  criancas: "children.view", encarregados: "children.view", faturas: "finance.view", pagamentos: "finance.view", presencas: "reports.view", "presencas-turma": "reports.view",
} as const;
type Kind = keyof typeof PERM;

/** Exportação CSV (BOM UTF-8, separador ;). Respeita permissões e o âmbito das turmas do utilizador. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind } = await params;
  if (!(kind in PERM)) return new Response("Relatório inexistente", { status: 404 });
  const r = await loadTenant(slug);
  if (!r.ok) return new Response("Não autorizado", { status: 401 });
  const ctx = r.ctx;
  if (ctx.isGuardian || ctx.panel !== "MANAGEMENT" || !ctx.can(PERM[kind as Kind])) return new Response("Sem permissão", { status: 403 });

  const url = new URL(req.url);
  const from = url.searchParams.get("de") ?? "";
  const to = url.searchParams.get("ate") ?? "";
  if ((from && !isIsoDate(from)) || (to && !isIsoDate(to))) return new Response("Datas inválidas", { status: 400 });

  const money = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const cur = ctx.settings.currency;
  const stamp = new Date().toISOString().slice(0, 10);
  // Crianças visíveis ao utilizador (null = todas).
  const visibleKids = ctx.classroomIds === null
    ? null
    : new Set((await ctx.db.query.children.findMany({ where: childScope(ctx), columns: { id: true } })).map((k) => k.id));
  const inScope = (childId: string) => visibleKids === null || visibleKids.has(childId);

  let header: string[] = [];
  let rows: unknown[][] = [];

  if (kind === "criancas") {
    header = ["Nome", "Apelido", "Data de nascimento", "Sexo", "Estado", "Turma", "Mensalidade", "Inscrição", "Encarregados"];
    const kids = await ctx.db.query.children.findMany({
      where: childScope(ctx), orderBy: [asc(t.children.firstName)],
      with: { classroom: true, feePlan: true, guardians: { with: { guardian: { with: { user: true } } } } },
    });
    rows = kids.map((k) => [
      k.firstName, k.lastName, k.birthDate, k.gender, k.status === "ACTIVE" ? "Ativa" : "Inativa", k.classroom?.name ?? "",
      k.feePlan ? `${k.feePlan.name} (${money(k.feePlan.amountCents)})` : "", k.enrolledAt, k.guardians.map((g) => g.guardian.user.name).join(" | "),
    ]);
  } else if (kind === "encarregados") {
    header = ["Nome", "Email", "Telefone", "Estado", "Crianças"];
    const gs = await ctx.db.query.guardians.findMany({ with: { user: true, children: { with: { child: true } } }, orderBy: (g, { asc }) => asc(g.createdAt) });
    // Mesmo âmbito que as crianças: o staff só vê as famílias das suas turmas.
    rows = gs.filter((g) => g.children.some((c) => inScope(c.childId)))
      .map((g) => [g.user.name, g.user.email, g.user.phone, g.user.status, g.children.filter((c) => inScope(c.childId)).map((c) => `${c.child.firstName} ${c.child.lastName}`).join(" | ")]);
  } else if (kind === "faturas") {
    header = ["Número", "Criança", "Tipo", "Período", "Emissão", "Vencimento", `Total (${cur})`, `Pago (${cur})`, "Estado"];
    const inv = await ctx.db.query.invoices.findMany({
      where: and(from ? gte(t.invoices.issueDate, from) : undefined, to ? lte(t.invoices.issueDate, to) : undefined),
      orderBy: [asc(t.invoices.issueDate)], with: { child: true },
    });
    rows = inv.filter((i) => inScope(i.childId)).map((i) => [
      i.number, `${i.child.firstName} ${i.child.lastName}`, i.kind === "MONTHLY" ? "Mensal" : "Avulsa", i.period, i.issueDate, i.dueDate,
      money(i.totalCents), money(i.paidCents), INVOICE_STATUS[i.status]?.label ?? i.status,
    ]);
  } else if (kind === "pagamentos") {
    header = ["Data", "Fatura", "Criança", "Método", "Referência", `Valor (${cur})`, "Registado por", "Estado"];
    const pays = await ctx.db.query.payments.findMany({
      where: and(isNull(t.payments.reversedAt), from ? gte(t.payments.paidAt, from) : undefined, to ? lte(t.payments.paidAt, to) : undefined),
      orderBy: [asc(t.payments.paidAt)], with: { invoice: { with: { child: true } } },
    });
    rows = pays.filter((p) => inScope(p.invoice.childId)).map((p) => [
      p.paidAt, p.invoice.number, `${p.invoice.child.firstName} ${p.invoice.child.lastName}`, PAYMENT_METHODS[p.method] ?? p.method,
      p.reference, money(p.amountCents), p.recordedByName, p.reversedAt ? "Estornado" : "Ativo",
    ]);
  } else {
    header = ["Data", "Criança", "Estado", "Entrada", "Saída", "Entregue por", "Recolhido por", "Motivo da falta"];
    const att = await ctx.db.query.attendance.findMany({
      where: and(from ? gte(t.attendance.date, from) : undefined, to ? lte(t.attendance.date, to) : undefined),
      orderBy: [asc(t.attendance.date)], with: { child: true },
    });
    const tz = ctx.settings.timezone;
    // Horas no fuso local da instituição (as datas guardam-se em UTC).
    const fmt = (d: Date | null): string => (d ? fmtTime(d, tz) : "");
    rows = att.filter((a) => inScope(a.childId)).map((a) => [
      a.date, `${a.child.firstName} ${a.child.lastName}`, a.status === "PRESENT" ? "Presente" : "Falta", fmt(a.checkInAt), fmt(a.checkOutAt),
      a.droppedBy, a.pickedBy, a.absenceReason,
    ]);
  }

  if (kind === "presencas-turma") {
    // Resumo por turma para a direção e para pedidos de subsídio: presenças, faltas e taxa no período.
    header = ["Turma", "Dias com registo", "Presenças", "Faltas", "Média de presentes por dia", "Taxa de presença (%)"];
    const att = await ctx.db.select({ date: t.attendance.date, status: t.attendance.status, childId: t.attendance.childId, turma: t.classrooms.name })
      .from(t.attendance)
      .innerJoin(t.children, eq(t.children.id, t.attendance.childId))
      .leftJoin(t.classrooms, eq(t.classrooms.id, t.children.classroomId))
      .where(and(from ? gte(t.attendance.date, from) : undefined, to ? lte(t.attendance.date, to) : undefined));
    const porTurma = new Map<string, { dias: Set<string>; presencas: number; faltas: number }>();
    for (const a of att.filter((x) => inScope(x.childId))) {
      const nome = a.turma ?? "Sem turma";
      const acc = porTurma.get(nome) ?? { dias: new Set<string>(), presencas: 0, faltas: 0 };
      acc.dias.add(a.date);
      if (a.status === "PRESENT") acc.presencas++; else acc.faltas++;
      porTurma.set(nome, acc);
    }
    const dec = (n: number) => n.toFixed(1).replace(".", ",");
    rows = [...porTurma.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([nome, a]) => {
      const total = a.presencas + a.faltas;
      return [nome, a.dias.size, a.presencas, a.faltas, dec(a.dias.size ? a.presencas / a.dias.size : 0), dec(total ? (a.presencas / total) * 100 : 0)];
    });
  }

  return new Response(toCsv([header, ...rows]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
