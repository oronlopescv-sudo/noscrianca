import { describe, expect, it } from "vitest";
import { HM, horasEntre, nowHM } from "@/lib/timeclock";

describe("registo de ponto — lógica pura", () => {
  it("aceita só horas HH:MM válidas", () => {
    for (const ok of ["00:00", "08:30", "23:59"]) expect(HM.test(ok)).toBe(true);
    for (const bad of ["24:00", "8:30", "08:60", "0830", "", "08:5"]) expect(HM.test(bad)).toBe(false);
  });

  it("calcula horas trabalhadas entre entrada e saída", () => {
    expect(horasEntre("08:00", "12:30")).toBe(4.5);
    expect(horasEntre("07:45", "16:15")).toBe(8.5);
    expect(horasEntre("09:00", "09:00")).toBe(0);
  });

  it("nunca devolve horas negativas", () => {
    expect(horasEntre("17:00", "08:00")).toBe(0);
  });

  it("nowHM devolve HH:MM no fuso da creche, também à meia-noite", () => {
    const meiaNoite = new Date("2026-11-15T23:30:00Z"); // 00:30 em Cabo Verde (UTC-1)
    expect(nowHM("Atlantic/Cape_Verde", meiaNoite)).toBe("22:30");
    expect(nowHM("Europe/Paris", new Date("2026-11-15T00:05:00Z"))).toBe("01:05");
    expect(HM.test(nowHM("Europe/Paris", new Date("2026-11-15T00:05:00Z")))).toBe(true);
  });
});
