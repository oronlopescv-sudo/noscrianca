import { ZodError } from "zod";

export type ActionResult = { ok: boolean; error?: string; message?: string; redirect?: string; data?: Record<string, unknown> };

/** Erro com mensagem segura para mostrar ao utilizador. */
export class ActionError extends Error {}

export function fail(message: string): never {
  throw new ActionError(message);
}

/** Envolve uma Server Action: converte erros em resultados apresentáveis. */
export async function run(fn: () => Promise<ActionResult | void>): Promise<ActionResult> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (e) {
    const digest = (e as { digest?: string })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_")) throw e;
    if (e instanceof ActionError) return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Dados inválidos." };
    // 23505 = valor duplicado na base (número de fatura, associação repetida, etc.).
    // Antes isto aparecia como "erro inesperado": agora a direção vê o que se passou.
    const codigo = (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
    if (codigo === "23505") {
      console.error("[action] registo duplicado:", e);
      return { ok: false, error: "Já existe um registo com estes dados. Atualize a página e confirme antes de tentar de novo." };
    }
    // 42P10 = falta de índice único exigido por um upsert; 42P01/42704 = objeto
    // inexistente — sinal de base de dados desatualizada (migrações não aplicadas).
    if (codigo === "42P10" || codigo === "42P01" || codigo === "42704") {
      console.error("[action] base de dados desatualizada:", e);
      return { ok: false, error: "A base de dados desta creche está a ser atualizada. Espere um minuto, atualize a página e tente de novo (se persistir, contacte a plataforma)." };
    }
    console.error("[action]", e);
    return { ok: false, error: "Ocorreu um erro inesperado. Tente novamente." };
  }
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

export function file(fd: FormData, key: string): File | null {
  const v = fd.get(key);
  return v instanceof File && v.size > 0 ? v : null;
}
