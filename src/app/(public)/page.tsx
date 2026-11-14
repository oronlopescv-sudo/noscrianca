import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { central, c } from "@/db/central";
import { getTenantDb, t } from "@/db/tenant";

export const dynamic = "force-dynamic";

/** Só instituições em uso (as de teste, pendentes ou arquivadas não aparecem). */
const LISTED = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED"] as const;

/** As cores das salas dão a identidade: cada cartão leva uma, em rotação. */
const CORES_SALAS = [
  { hex: "#5DC98A" }, { hex: "#F0714F" }, { hex: "#5B8DEF" }, { hex: "#F5B93A" }, { hex: "#A77BDB" },
];
const COR_TEXTO = "#1B2333";

type Cartao = { id: string; name: string; slug: string; city: string; logoSrc: string | null };

export default async function Landing() {
  const institutions = await central().query.institutions.findMany({
    where: inArray(c.institutions.status, [...LISTED]),
    columns: { id: true, name: true, slug: true, city: true },
    orderBy: (i, { asc }) => asc(i.name),
  });
  // O cartão leva a marca da própria creche: o logo que a direção carregou.
  const creches: Cartao[] = await Promise.all(institutions.map(async (i): Promise<Cartao> => {
    try {
      const db = await getTenantDb(i.id);
      const settings = await db.query.settings.findFirst({ where: eq(t.settings.id, 1) });
      return { ...i, logoSrc: settings?.logoPath ? `/c/${i.slug}/logo?v=${encodeURIComponent(settings.logoPath.slice(-24))}` : null };
    } catch {
      return { ...i, logoSrc: null };
    }
  }));

  return (
    <div className="bg-surface">
      {/* ——— Capa da plataforma: calma mas com a identidade das creches ——— */}
      <section className="text-white" style={{ background: "linear-gradient(180deg, #1B2333 0%, #223050 100%)" }}>
        <div className="mx-auto max-w-5xl px-4 py-14 sm:py-16">
          <div className="pontos-cores" aria-hidden>{CORES_SALAS.map((k, i) => <i key={i} style={{ backgroundColor: k.hex }} />)}</div>
          <h1 className="display mt-4 max-w-2xl text-3xl leading-tight sm:text-5xl">A creche do seu filho, dentro de um só lugar</h1>
          <p className="mt-3 max-w-2xl text-white/80">Escolha abaixo a creche para ver a sua página: fotografias, salas e o pedido de vaga. Direção, equipa e famílias entram no seu espaço.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="#creches" className="btn-primary px-6 font-semibold">Ver as creches</a>
            <Link href="/pedir-adesao" className="btn border border-white/40 px-6 hover:bg-white/10">A minha creche quer aderir</Link>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-5xl px-4 py-12" id="topo">
        <h2 className="display text-2xl">Escolha a instituição</h2>
        {creches.length === 0 ? (
          <p className="mt-8 rounded-card bg-white p-6 text-center text-ink-soft shadow-sm">Ainda não há instituições disponíveis.</p>
        ) : (
          <ul id="creches" className="mt-6 grid scroll-mt-6 gap-4 sm:grid-cols-2">
            {creches.map((i, idx) => {
              const cor = CORES_SALAS[idx % CORES_SALAS.length];
              // "Creche Lua Cheia" → "Lua": a inicial vem do nome próprio, não do género.
              const nomeProprio = i.name.replace(/^(creche|jardim de infância|jardim|escola|infância)\s*/i, "").trim() || i.name;
              const inicial = nomeProprio.trim().charAt(0).toUpperCase() || i.name.charAt(0).toUpperCase();
              return (
                <li key={i.slug} className="card card-pad flex flex-col gap-4">
                  <Link href={`/creche/${i.slug}`} className="group flex items-center gap-4">
                    {i.logoSrc
                      ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={i.logoSrc} alt={`Logótipo de ${i.name}`} className="h-11 w-11 shrink-0 rounded-xl bg-white object-cover" />
                      )
                      : (
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-bold" style={{ backgroundColor: cor.hex, color: COR_TEXTO }} aria-hidden>
                          {inicial}
                        </span>
                      )}
                    <span>
                      <span className="block font-medium group-hover:text-accent">{i.name}</span>
                      {i.city && <span className="block text-xs text-ink-soft">{i.city}</span>}
                    </span>
                  </Link>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/creche/${i.slug}`} className="btn btn-secondary btn-sm">Ver a creche</Link>
                    <Link href={`/c/${i.slug}/entrar`} className="btn-primary btn-sm">Entrar</Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <section className="mt-12 rounded-card bg-white p-8 text-center shadow-sm">
          <div className="flex justify-center">
            <div className="pontos-cores" aria-hidden>{CORES_SALAS.map((k, i) => <i key={i} style={{ backgroundColor: k.hex }} />)}</div>
          </div>
          <h2 className="display mt-3 text-xl sm:text-2xl">A sua creche ainda não está aqui?</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-ink-soft">Conte-nos um pouco da instituição: criamos o espaço, os acessos e formamos a equipa para começar.</p>
          <Link href="/pedir-adesao" className="btn-primary mt-5 px-8">Pedir adesão</Link>
        </section>
      </main>
    </div>
  );
}
