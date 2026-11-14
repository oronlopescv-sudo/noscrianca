import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { central, c } from "@/db/central";
import { deleteTenantFile, readTenantFile } from "@/lib/storage";

const INST = "central";
const REL = "central-demo/teste.txt";

describe("ficheiros espelhados na base central", () => {
  it("um ficheiro que só existe na base serve-se e é reposto", async () => {
    await deleteTenantFile(INST, REL);
    await central().insert(c.dbFiles).values({
      institutionId: INST, raiz: "storage", path: REL, mime: "text/plain",
      bytes: Buffer.from("conteúdo de prova"), size: 18,
    }).onConflictDoNothing();

    // O disco não tem o ficheiro: a base fornece e repõe no disco.
    const f = await readTenantFile(INST, REL);
    expect(f?.data.toString()).toBe("conteúdo de prova");
    expect(f?.mime).toBe("text/plain");

    // Apagar remove o espelho: nova leitura já não encontra nada.
    await deleteTenantFile(INST, REL);
    const linha = await central().query.dbFiles.findFirst({
      where: and(eq(c.dbFiles.institutionId, INST), eq(c.dbFiles.raiz, "storage"), eq(c.dbFiles.path, REL)),
    });
    expect(linha).toBeUndefined();
    expect(await readTenantFile(INST, REL)).toBeNull();
  });
});
