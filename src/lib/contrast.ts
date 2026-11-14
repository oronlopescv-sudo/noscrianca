/**
 * Contraste WCAG 2.1 para cores de instituição (o accent é escolhido pela
 * diretora e pode ser claro — texto branco por cima fica ilegível). Calcula
 * a luminância relativa e escolhe, por cor de fundo, a cor de texto com mais
 * contraste: branco ou o navy da plataforma.
 */

const INK = "#1B2333";
const BRANCO = "#FFFFFF";

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminancia(hex: string): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Razão de contraste WCAG (1–21) entre duas cores hexadecimais. */
export function contrastRatio(foreground: string, background: string): number {
  const [maior, menor] = [luminancia(foreground), luminancia(background)].sort((a, b) => b - a);
  return (maior + 0.05) / (menor + 0.05);
}

/** Cor de texto legível sobre `bg`: branca ou navy, o que contrastar mais. */
export function readableTextColorOn(background: string): string {
  return contrastRatio(INK, background) > contrastRatio(BRANCO, background) ? INK : BRANCO;
}
