import Link from "next/link";
import { inArray } from "drizzle-orm";
import { central, c } from "@/db/central";

export const dynamic = "force-dynamic";

/** Só instituições em uso (as de teste, pendentes ou arquivadas não aparecem). */
const LISTED = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED"] as const;

export default async function Landing() {
  const institutions = await central().query.institutions.findMany({
    where: inArray(c.institutions.status, [...LISTED]),
    columns: { name: true, slug: true, city: true },
    orderBy: (i, { asc }) => asc(i.name),
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl sm:text-3xl">Escolha a sua instituição</h1>
      <p className="mt-2 text-ink-soft">Selecione uma creche para a conhecer ou para iniciar sessão.</p>

      {institutions.length === 0 ? (
        <p className="mt-8 rounded-card bg-white p-6 text-center text-ink-soft shadow-sm">Ainda não há instituições disponíveis.</p>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {institutions.map((i) => (
            <li key={i.slug}>
              <Link href={`/creche/${i.slug}`} className="card card-pad flex items-center justify-between gap-3 hover:border-accent">
                <span><span className="block font-medium">{i.name}</span>{i.city && <span className="block text-xs text-ink-soft">{i.city}</span>}</span>
                <span aria-hidden className="text-accent">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10 text-center text-sm text-ink-soft">
        A sua creche ainda não usa o NosCriança? <Link href="/pedir-adesao" className="link">Pedir adesão</Link>
      </p>
    </main>
  );
}
