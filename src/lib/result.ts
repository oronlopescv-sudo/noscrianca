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
