import { sanitizeBackupName } from "@/lib/backup-file";
import { getPlatformUser, platformAudit } from "@/lib/platform";
import { backupUploadMaxBytes, saveCentralBackupUpload, saveInstitutionBackupUpload } from "@/lib/services/ops";

/**
 * Subida de um ficheiro de cópia (pg_dump) vindo do painel do admin — rota
 * (não Server Action) porque os ficheiros ultrapassam o limite das ações.
 * Aceita "institutionId" (cópia de uma instituição) ou "pcentral=1" (central).
 */
export async function POST(req: Request) {
  const admin = await getPlatformUser();
  if (!admin) return Response.redirect(new URL("/admin/entrar", req.url), 303);
  // Recusa cedo pelo cabeçalho: sem isto, o formData() leria o corpo todo
  // antes de chegar ao limite (o fluxo em blocos de savePgDumpUpload fica
  // como segunda linha de defesa).
  const anunciado = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(anunciado) && anunciado > backupUploadMaxBytes) {
    return new Response(`O ficheiro passa de ${Math.round(backupUploadMaxBytes / 1_000_000)} MB (limite da subida).`, { status: 413 });
  }
  const form = await req.formData();
  const file = form.get("ficheiro");
  if (!(file instanceof File) || file.size === 0) return new Response("Escolha um ficheiro de cópia (.dump).", { status: 400 });
  if (file.size > backupUploadMaxBytes) {
    return new Response(`O ficheiro passa de ${Math.round(backupUploadMaxBytes / 1_000_000)} MB (limite da subida).`, { status: 413 });
  }
  try {
    const name = file.name;
    const size = file.size;
    if (String(form.get("pcentral") ?? "") === "1") {
      await saveCentralBackupUpload(name, file.stream());
      await platformAudit(admin, "Cópia da base central subida", { entity: "backup", details: { ficheiro: sanitizeBackupName(name), bytes: size } });
      return Response.redirect(new URL("/admin/backups", req.url), 303);
    }
    const institutionId = String(form.get("institutionId") ?? "");
    await saveInstitutionBackupUpload(institutionId, name, file.stream());
    await platformAudit(admin, "Cópia de segurança subida", { entity: "backup", institutionId, details: { ficheiro: sanitizeBackupName(name), bytes: size } });
    return Response.redirect(new URL(`/admin/instituicoes/${institutionId}?tab=backups`, req.url), 303);
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}
