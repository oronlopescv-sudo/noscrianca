/** Site público de cada creche: os quatro cartões de atividades.
 * Cada um traz uma imagem de exemplo, que a direção pode trocar em Definições. */
export const ATIVIDADES = [
  { n: 1, label: "Aprendizagem", color: "#1E63D6", img: "/site/atividade-1.jpg" },
  { n: 2, label: "Brincadeiras", color: "#F26A1B", img: "/site/atividade-2.jpg" },
  { n: 3, label: "Artes e Criatividade", color: "#1746A8", img: "/site/atividade-3.jpg" },
  { n: 4, label: "Desporto e Saúde", color: "#3DAE49", img: "/site/atividade-4.jpg" },
] as const;

export const HERO_PADRAO = "/site/hero.jpg";
/** Imagens de exemplo do carrossel, usadas enquanto a creche não tiver fotografias suficientes. */
export const HEROS_PADRAO = ["/site/hero.jpg", "/site/hero-2.jpg"] as const;
