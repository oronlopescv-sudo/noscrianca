import { describe, expect, it } from "vitest";
import { daysBetween, parseReminderDays, reminderDue } from "@/lib/reminder-rules";

describe("parseReminderDays", () => {
  it("ordena, remove repetidos e ignora valores inválidos", () => {
    expect(parseReminderDays("7, 1,1,0,abc,91,14")).toEqual([1, 7, 14]);
  });
  it("devolve lista vazia quando não há nada válido", () => {
    expect(parseReminderDays("")).toEqual([]);
  });
});

describe("daysBetween", () => {
  it("conta dias entre datas ISO, atravessando meses", () => {
    expect(daysBetween("2026-10-08", "2026-11-12")).toBe(35);
  });
});

describe("reminderDue", () => {
  const stages = [1, 7];
  it("dispara a 1.º dia de atraso e mantém-se na janela até ao dia 6", () => {
    expect(reminderDue("2026-11-08", "2026-11-09", stages, 1)).toBe(true);
    expect(reminderDue("2026-11-08", "2026-11-14", stages, 1)).toBe(true);
  });
  it("a 2.ª etapa começa no dia 7 e não há sobreposição com a 1.ª", () => {
    expect(reminderDue("2026-11-08", "2026-11-15", stages, 1)).toBe(false);
    expect(reminderDue("2026-11-08", "2026-11-15", stages, 7)).toBe(true);
  });
  it("não dispara antes do vencimento nem para etapas fora da lista", () => {
    expect(reminderDue("2026-11-08", "2026-11-08", stages, 1)).toBe(false);
    expect(reminderDue("2026-11-08", "2026-11-20", stages, 14)).toBe(false);
  });
  it("a última etapa fica ABERTA: fatura com muito atraso continua por avisar na última etapa (e só nela)", () => {
    expect(reminderDue("2026-01-08", "2026-11-12", stages, 1)).toBe(false);
    expect(reminderDue("2026-01-08", "2026-11-12", stages, 7)).toBe(true);
    expect(reminderDue("2019-06-30", "2026-11-12", stages, 7)).toBe(true);
  });
});
