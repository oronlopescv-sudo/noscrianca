/** Hora HH:MM no formato do registo de ponto. */
export const HM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** Hora atual HH:MM no fuso da creche. */
export function nowHM(timezone: string, d = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

/** Horas trabalhadas entre duas marcações HH:MM (em horas, 2 casas). */
export function horasEntre(entrada: string, saida: string): number {
  const [h1, m1] = entrada.split(":").map(Number);
  const [h2, m2] = saida.split(":").map(Number);
  return Math.max(0, (h2 * 60 + m2 - (h1 * 60 + m1)) / 60);
}
