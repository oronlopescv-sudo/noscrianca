import { platformAudit, requirePlatform } from "@/lib/platform";
import { centralBackupPath, downloadBackupResponse } from "@/lib/services/ops";

/** Descarrega uma cópia da base central (plataforma). */
export async function GET(req: Request) {
  const admin = await requirePlatform();
  const fileName = new URL(req.url).searchParams.get("ficheiro") ?? "";
  const res = await downloadBackupResponse(centralBackupPath(fileName), fileName).catch((e) => new Response((e as Error).message, { status: 404 }));
  if (res.status === 200) {
    await platformAudit(admin, "Cópia da base central descarregada", { entity: "backup", details: { ficheiro: fileName } });
  }
  return res;
}
