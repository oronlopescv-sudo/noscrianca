import { sql } from "drizzle-orm";
import { central } from "@/db/central";

/** Sondar se a base de dados responde (readiness). O /api/health diz só
 * «o processo corre»; este diz «o sistema serve dados». Falha → 503. */
export async function GET() {
  try {
    await central().execute(sql`SELECT 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
