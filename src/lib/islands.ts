/** Ilhas de Cabo Verde. Usadas no pedido de adesão, no painel admin e na pesquisa pública. */
export const ILHAS = [
  "Santo Antão",
  "São Vicente",
  "Santa Luzia",
  "São Nicolau",
  "Sal",
  "Boa Vista",
  "Maio",
  "Santiago",
  "Fogo",
  "Brava",
] as const;

export type Ilha = (typeof ILHAS)[number];

/** Aceita só uma ilha da lista; qualquer outro valor fica vazio. */
export function ilhaValida(v: string): Ilha | "" {
  return (ILHAS as readonly string[]).includes(v) ? (v as Ilha) : "";
}
