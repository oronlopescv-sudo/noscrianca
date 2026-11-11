import { describe, expect, it } from "vitest";
import { dbNameForSlug, slugProblem, slugify } from "@/lib/services/provisioning";

describe("endereço da instituição", () => {
  it("valida o formato do slug", () => {
    expect(slugProblem("creche-sol")).toBeNull();
    expect(slugProblem("ab")).not.toBeNull();
    expect(slugProblem("1creche")).not.toBeNull();
    expect(slugProblem("creche--sol")).not.toBeNull();
    expect(slugProblem("creche-")).not.toBeNull();
  });
  it("bloqueia endereços reservados", () => {
    expect(slugProblem("admin")).toMatch(/reservado/);
  });
  it("gera slugs a partir de nomes com acentos", () => {
    expect(slugify("Creche Sol Nascente")).toBe("creche-sol-nascente");
    expect(slugify("Jardim  São Vicente!")).toBe("jardim-sao-vicente");
    expect(slugify("123 Creche")).toBe("creche");
  });
  it("deriva o nome da base de dados sem hífenes", () => {
    expect(dbNameForSlug("creche-sol")).toBe("nc_t_creche_sol");
  });
});
