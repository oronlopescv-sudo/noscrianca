import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { central, c } from "@/db/central";
import { getTenantDb, t } from "@/db/tenant";
import { CrecheSearch, type CartaoCreche } from "@/components/public/creche-search";

export const dynamic = "force-dynamic";

/** Só instituições em uso (as de teste, pendentes ou arquivadas não aparecem). */
const LISTED = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED"] as const;

/** As cores das salas dão a identidade: cada cartão leva uma, em rotação. */
const CORES_SALAS = ["#5DC98A", "#F0714F", "#5B8DEF", "#F5B93A", "#A77BDB"];
const NAVY = "#1B2333";
const BLUE = "#1E4FA3";
const ORANGE = "#F0714F";
const YELLOW = "#F5B93A";

export default async function Landing() {
  const institutions = await central().query.institutions.findMany({
    where: inArray(c.institutions.status, [...LISTED]),
    columns: { id: true, name: true, slug: true, island: true, city: true },
    orderBy: (i, { asc }) => asc(i.name),
  });

  // Cada cartão leva a marca da própria creche: capa e logótipo carregados pela direção.
  const creches: CartaoCreche[] = await Promise.all(institutions.map(async (i, idx): Promise<CartaoCreche> => {
    const cor = CORES_SALAS[idx % CORES_SALAS.length];
    // "Creche Lua Cheia" → "L": a inicial vem do nome próprio, não do género.
    const nomeProprio = i.name.replace(/^(creche|jardim de infância|jardim|escola|infância)\s*/i, "").trim() || i.name;
    const inicial = nomeProprio.charAt(0).toUpperCase() || i.name.charAt(0).toUpperCase();
    try {
      const db = await getTenantDb(i.id);
      const s = await db.query.settings.findFirst({ where: eq(t.settings.id, 1) });
      return {
        slug: i.slug,
        name: i.name,
        island: i.island ?? "",
        city: i.city ?? "",
        coverSrc: s?.coverPath ? `/c/${i.slug}/capa?v=${encodeURIComponent(s.coverPath.slice(-24))}` : null,
        logoSrc: s?.logoPath ? `/c/${i.slug}/logo?v=${encodeURIComponent(s.logoPath.slice(-24))}` : null,
        inicial,
        cor,
      };
    } catch {
      return { slug: i.slug, name: i.name, island: i.island ?? "",
        city: i.city ?? "", coverSrc: null, logoSrc: null, inicial, cor };
    }
  }));

  return (
    <div className="min-h-screen bg-slate-100 pb-24" id="topo">
      {/* Cabeçalho */}
      <header className="flex items-center justify-between px-5 pb-10 pt-5" style={{ backgroundColor: NAVY }}>
        <Link href="/" className="flex items-center gap-3">
          <span className="text-2xl font-extrabold leading-none text-white">
            Nos<span style={{ color: YELLOW }}>Criança</span>
            <span className="mt-1 block text-xs font-medium text-white/80">Creches de Cabo Verde</span>
          </span>
        </Link>
        <span aria-hidden className="text-2xl text-white">≡</span>
      </header>

      {/* Faixa de destaque */}
      <img src="/hero-criancas.png" alt="Crianças sorridentes numa creche de Cabo Verde" className="block w-full object-cover" />
      <section className="-mt-6 rounded-b-[2rem] px-6 pb-14 pt-8 text-white" style={{ backgroundColor: BLUE }}>
        <div className="pontos-cores" aria-hidden>{CORES_SALAS.map((k, i) => <i key={i} style={{ backgroundColor: k }} />)}</div>
        <h1 className="mt-3 text-3xl font-extrabold leading-tight">Encontre a<br />sua Creche</h1>
        <p className="mt-3 max-w-xs text-sm text-white/90">Ofereça ao seu filho um futuro melhor em Cabo Verde.</p>
      </section>

      <CrecheSearch items={creches} />

      {creches.length === 0 && (
        <p className="mx-4 mt-8 rounded-2xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm">Ainda não há instituições disponíveis.</p>
      )}

      {/* Pedir adesão */}
      <section className="mx-4 mt-6 rounded-2xl bg-white p-6 text-center shadow-sm">
        <div className="flex justify-center">
          <div className="pontos-cores" aria-hidden>{CORES_SALAS.map((k, i) => <i key={i} style={{ backgroundColor: k }} />)}</div>
        </div>
        <h2 className="mt-3 text-lg font-bold" style={{ color: NAVY }}>A sua creche ainda não está aqui?</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm text-slate-500">Criamos o espaço, os acessos e formamos a equipa para começar.</p>
        <Link href="/pedir-adesao" className="mt-5 inline-block rounded-full px-8 py-2.5 text-sm font-semibold text-white" style={{ backgroundColor: ORANGE }}>Pedir adesão</Link>
      </section>

      {/* Faixa de rodapé */}
      <section className="mx-4 mt-6 rounded-2xl p-5" style={{ backgroundColor: "#DCE9FB" }}>
        <p className="text-lg font-extrabold" style={{ color: BLUE }}>NosCriança</p>
        <p className="text-sm font-medium" style={{ color: BLUE }}>Juntos pelo bem das nossas crianças!</p>
      </section>

      {/* Navegação inferior */}
      <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t bg-white py-2 text-xs font-semibold" style={{ color: NAVY }}>
        <a href="#topo" className="flex flex-col items-center gap-0.5" style={{ color: BLUE }}><span aria-hidden className="text-lg">⌂</span>Início</a>
        <a href="#creches" className="flex flex-col items-center gap-0.5"><span aria-hidden className="text-lg">▦</span>Creches</a>
        <Link href="/pedir-adesao" className="flex flex-col items-center gap-0.5"><span aria-hidden className="text-lg">＋</span>Adesão</Link>
      </nav>
    </div>
  );
}
