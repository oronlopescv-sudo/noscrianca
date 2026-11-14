/** Reduz as fotografias no telemóvel antes de as enviar: fotos de 5 a 12 MB e
 * formatos como HEIC (iPhone) deixavam de ser aceites pelo servidor. */

const FORMATOS_ACEITES = ["image/jpeg", "image/png", "image/webp"];
const MAX_LADO = 2000;
const MAX_BYTES = 1.5 * 1024 * 1024;

async function converter(f: File): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(f, { imageOrientation: "from-image" });
    const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * escala), h = Math.round(bitmap.height * escala);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    if (!blob) return null;
    const nome = f.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nome, { type: "image/jpeg" });
  } catch {
    // O navegador não sabe ler o formato: o servidor responde com a mensagem própria.
    return null;
  }
}

/** Substitui, in situ, cada ficheiro de imagem demasiado grande ou em formato não aceite. */
export async function reduzirImagens(fd: FormData): Promise<void> {
  for (const [chave, valor] of Array.from(fd.entries())) {
    if (!(valor instanceof File) || valor.size === 0 || !valor.type.startsWith("image/")) continue;
    if (FORMATOS_ACEITES.includes(valor.type) && valor.size <= MAX_BYTES) continue;
    const novo = await converter(valor);
    if (novo) fd.set(chave, novo);
  }
}
