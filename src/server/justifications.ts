"use server";

import { eq } from "drizzle-orm";
import { t } from "@/db/tenant";
import { fail, file, run, str, type ActionResult } from "@/lib/result";
import { saveUpload } from "@/lib/storage";
import { audit, canAccessChild, tenantAction } from "@/lib/tenant";

type S = ActionResult | null;

/** Encarregado: justifica (ou corrige a justificação de) uma falta do próprio filho. */
export async function submitJustificationAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"));
    if (!ctx.isGuardian) fail("Só os encarregados de educação justificam faltas.");
    const childId = str(fd, "childId");
    if (!(await canAccessChild(ctx, childId))) fail("Criança não encontrada.");
    const row = await ctx.db.query.attendance.findFirst({ where: eq(t.attendance.id, str(fd, "attendanceId")) });
    if (!row || row.childId !== childId) fail("Falta não encontrada.");
    if (row!.status !== "ABSENT") fail("Só se justificam faltas.");
    if (row!.justificationStatus === "JUSTIFIED") fail("Esta falta já foi aceite pela direção.");

    const text = str(fd, "justification").slice(0, 500);
    const f = file(fd, "document");
    if (text.length < 3 && !f && !row!.justificationFilePath) fail("Escreva o motivo da falta ou anexe um documento.");

    let filePath = row!.justificationFilePath;
    if (f) {
      const saved = await saveUpload(ctx.institution.id, `justificacoes/${childId}`, f, { kind: "document", maxMb: 8 });
      filePath = saved.path;
    }
    await ctx.db.update(t.attendance).set({
      justificationStatus: "PENDING", justificationText: text, justificationFilePath: filePath,
      justifiedByName: ctx.user.name, justifiedAt: new Date(),
      justificationDecidedByName: "", justificationDecidedAt: null,
    }).where(eq(t.attendance.id, row!.id));
    await audit(ctx, "Falta justificada pelo encarregado", { entity: "child", entityId: childId, details: { dia: row!.date, anexo: !!f } });
    return { ok: true, message: "Justificação enviada. A direção vai rever." };
  });
}

/** Direção: aceita ou recusa a justificação de uma falta. */
export async function decideJustificationAction(_p: S, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await tenantAction(str(fd, "slug"), { permission: "attendance.record", write: true });
    const row = await ctx.db.query.attendance.findFirst({ where: eq(t.attendance.id, str(fd, "attendanceId")) });
    if (!row) fail("Falta não encontrada.");
    if (row!.justificationStatus !== "PENDING" && row!.justificationStatus !== "UNJUSTIFIED") fail("Não há justificação por rever.");
    const decision = str(fd, "decision");
    if (decision !== "JUSTIFIED" && decision !== "UNJUSTIFIED") fail("Decisão inválida.");
    await ctx.db.update(t.attendance).set({
      justificationStatus: decision, justificationDecidedByName: ctx.user.name, justificationDecidedAt: new Date(),
    }).where(eq(t.attendance.id, row!.id));
    await audit(ctx, decision === "JUSTIFIED" ? "Justificação de falta aceite" : "Justificação de falta recusada", { entity: "child", entityId: row!.childId, details: { dia: row!.date } });
    return { ok: true, message: decision === "JUSTIFIED" ? "Falta justificada." : "Justificação recusada." };
  });
}
