/** Sonda de saúde para o healthcheck do contentor (sem tocar em bases de dados). */
export const dynamic = "force-static";

export async function GET() {
  return Response.json({ ok: true });
}
