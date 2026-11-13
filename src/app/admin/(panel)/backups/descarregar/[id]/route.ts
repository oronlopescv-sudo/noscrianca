import path from "node:path";
import { eq } from "drizzle-orm";
import { central, c } from "@/db/central";
import { platformAudit, requirePlatform } from "@/lib/platform";
import { backupFolder, downloadBackupResponse } from "@/lib/services/ops";

/** Descarrega uma cópia de segurança (pg_dump) para o computador do admin. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatform();
  const { id } = await params;
  const rec = await central().query.backupRecords.findFirst({ where: eq(c.backupRecords.id, id), with: { institution: true } });
  if (!rec || rec.status !== "DONE") return new Response("Cópia não encontrada.", { status: 404 });
  const full = path.join(backupFolder(rec.institution.slug), path.basename(rec.fileName));
  const res = await downloadBackupResponse(full, rec.fileName).catch((e) => new Response((e as Error).message, { status: 404 }));
  if (res.status === 200) {
    await platformAudit(admin, "Cópia de segurança descarregada", {
      entity: "backup", entityId: rec.id, institutionId: rec.institutionId, details: { ficheiro: rec.fileName },
    });
  }
  return res;
}
