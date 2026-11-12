import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { getTenantDb, t } from "@/db/tenant";
import { ROOM_COLORS } from "@/lib/labels";
import { getInstitutionBySlug, institutionUsable } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/** Dados públicos de uma instituição: nunca inclui crianças, famílias, equipa ou valores. */
async function load(slug: string) {
  const inst = await getInstitutionBySlug(slug);
  if (!inst || !institutionUsable(inst.status)) return null;
  const db = await getTenantDb(inst.id);
  const [s, photos, rooms] = await Promise.all([
    db.query.settings.findFirst({ where: eq(t.settings.id, 1) }),
    db.query.publicPhotos.findMany({ orderBy: [asc(t.publicPhotos.createdAt)] }),
    db.query.classrooms.findMany({ where: eq(t.classrooms.active, true), orderBy: [asc(t.classrooms.name)] }),
  ]);
  return { inst, s, photos, rooms };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = await load((await params).slug).catch(() => null);
  return { title: d ? (d.s?.name ?? d.inst.name) : "Instituição" };
}

const ages = (min: number | null, max: number | null) => {
  if (min == null && max == null) return "Todas as idades";
  const f = (m: number) => (m < 24 ? `${m} meses` : `${Math.floor(m / 12)} anos`);
  return min != null && max != null ? `${f(min)} a ${f(max)}` : min != null ? `A partir de ${f(min)}` : `Até ${f(max!)}`;
};

export default async function PublicInstitution({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = await load(slug);
  if (!d) notFound();
  const { inst, s, photos, rooms } = d;
  const name = s?.name ?? inst.name;
  const address = [s?.address || inst.address, inst.city].filter(Boolean).join(", ");
  const phone = s?.phone || inst.phone;
  const email = s?.email || inst.email;
  const accent = /^#[0-9a-fA-F]{6}$/.test(s?.accentColor ?? "") ? s!.accentColor : "#F0714F";
  const contacts = [
    address && { icon: <MapPin size={18} />, label: "Morada", node: <span>{address}</span> },
    phone && { icon: <Phone size={18} />, label: "Telefone", node: <a href={`tel:${phone}`} className="link">{phone}</a> },
    email && { icon: <Mail size={18} />, label: "Email", node: <a href={`mailto:${email}`} className="link">{email}</a> },
    s?.publicHours && { icon: <Clock size={18} />, label: "Horário", node: <span className="whitespace-pre-wrap">{s.publicHours}</span> },
  ].filter(Boolean) as { icon: React.ReactNode; label: string; node: React.ReactNode }[];

  return (
    <main>
      <section className="text-white" style={{ backgroundColor: accent }}>
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:py-14">
          <div className="flex items-center gap-4">
            {s?.logoPath
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={`/c/${slug}/logo?v=${encodeURIComponent(s.logoPath.slice(-24))}`} alt={`Logótipo de ${name}`} className="h-20 w-20 shrink-0 rounded-2xl bg-white object-cover" />
              : <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-3xl font-bold">{name.slice(0, 1)}</span>}
            <div>
              <h1 className="text-2xl leading-tight sm:text-4xl">{name}</h1>
              {inst.city && <p className="mt-1 text-sm opacity-90 sm:text-base">{inst.city}</p>}
            </div>
          </div>
          <Link href={`/c/${slug}/entrar`} className="btn bg-white px-6 font-semibold text-ink hover:bg-white/90">Entrar na área reservada</Link>
        </div>
      </section>

      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-10 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card card-pad">
            <h2 className="text-lg">Sobre a instituição</h2>
            {s?.publicDescription
              ? <p className="mt-3 whitespace-pre-wrap text-ink-soft">{s.publicDescription}</p>
              : <p className="mt-3 text-ink-soft">Esta instituição ainda não publicou a sua apresentação. Use os contactos ao lado para saber mais.</p>}
          </section>

          {photos.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg">Fotografias</h2>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map((p) => (
                  <li key={p.id}>
                    <a href={`/c/${slug}/foto/${p.id}`} target="_blank" rel="noopener" className="block overflow-hidden rounded-card bg-surface">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/c/${slug}/foto/${p.id}`} alt={p.caption || `Fotografia de ${name}`} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                    </a>
                    {p.caption && <p className="mt-1.5 text-xs text-ink-soft">{p.caption}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {rooms.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg">Salas e idades</h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {rooms.map((r) => (
                  <li key={r.id} className={`${ROOM_COLORS[r.color]?.bg ?? "bg-navy"} rounded-card p-4 text-white`}>
                    <p className="font-semibold">{r.name}</p>
                    <p className="mt-1 text-sm opacity-90">{ages(r.ageMinMonths, r.ageMaxMonths)}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section className="card card-pad">
            <h2 className="text-lg">Contactos</h2>
            {contacts.length === 0 ? <p className="mt-3 text-sm text-ink-soft">Contactos por publicar.</p> : (
              <dl className="mt-3 space-y-3 text-sm">
                {contacts.map((c) => (
                  <div key={c.label} className="flex gap-3">
                    <span className="mt-0.5 text-ink-soft">{c.icon}</span>
                    <div><dt className="text-xs text-ink-soft">{c.label}</dt><dd>{c.node}</dd></div>
                  </div>
                ))}
              </dl>
            )}
          </section>
          <section className="card card-pad text-sm">
            <h2 className="text-base">Já é da casa?</h2>
            <p className="mt-2 text-ink-soft">Pais, direção e funcionários entram com o seu email e palavra-passe.</p>
            <Link href={`/c/${slug}/entrar`} className="btn-primary mt-4 w-full">Iniciar sessão</Link>
          </section>
          <p className="text-center text-sm"><Link href="/" className="link">← Ver todas as instituições</Link></p>
        </aside>
      </div>
    </main>
  );
}
