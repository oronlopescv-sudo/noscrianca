import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cache } from "react";
import { asc, eq } from "drizzle-orm";
import { CheckCircle2, Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import "@fontsource-variable/baloo-2";
import { ActionForm, Submit } from "@/components/ui/client";
import { Field } from "@/components/ui/kit";
import { getTenantDb, t } from "@/db/tenant";
import { ROOM_COLORS } from "@/lib/labels";
import { whatsappNumber } from "@/lib/collection-rules";
import { readableTextColorOn } from "@/lib/contrast";
import { getInstitutionBySlug, institutionUsable } from "@/lib/tenant";
import { requestEnrollmentAction } from "../../actions";

export const dynamic = "force-dynamic";

/** Dados públicos de uma instituição: nunca inclui crianças, famílias, equipa ou valores.
 * cache() de React: metadata e render do MESMO request partilham uma só carga. */
const load = cache(async (slug: string) => {
  const inst = await getInstitutionBySlug(slug);
  if (!inst || !institutionUsable(inst.status)) return null;
  const db = await getTenantDb(inst.id);
  const [s, photos, rooms] = await Promise.all([
    db.query.settings.findFirst({ where: eq(t.settings.id, 1) }),
    db.query.publicPhotos.findMany({ orderBy: [asc(t.publicPhotos.createdAt)] }),
    db.query.classrooms.findMany({ where: eq(t.classrooms.active, true), orderBy: [asc(t.classrooms.name)] }),
  ]);
  return { inst, s, photos, rooms };
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const d = await load(slug).catch(() => null);
  if (!d) return { title: "Instituição" };
  const name = d.s?.name ?? d.inst.name;
  const desc = (d.s?.publicDescription || `A ${name} em ${d.inst.city}: contactos, salas e pedido de inscrição online.`).slice(0, 300);
  return {
    title: name,
    description: desc,
    openGraph: {
      title: name,
      description: desc,
      locale: "pt_CV",
      type: "website",
      images: d.s?.coverPath ? [{ url: `/c/${slug}/capa` }] : d.s?.logoPath ? [{ url: `/c/${slug}/logo` }] : undefined,
    },
  };
}

const ages = (min: number | null, max: number | null) => {
  if (min == null && max == null) return "Todas as idades";
  const f = (m: number) => (m < 24 ? `${m} meses` : `${Math.floor(m / 12)} anos`);
  return min != null && max != null ? `${f(min)} a ${f(max)}` : min != null ? `A partir de ${f(min)}` : `Até ${f(max!)}`;
};

export default async function PublicInstitution({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ pedido?: string }> }) {
  const { slug } = await params;
  const sent = (await searchParams).pedido === "1";
  const d = await load(slug);
  if (!d) notFound();
  const { inst, s, photos, rooms } = d;
  const name = s?.name ?? inst.name;
  const address = [s?.address || inst.address, inst.city].filter(Boolean).join(", ");
  const phone = s?.phone || inst.phone;
  const email = s?.email || inst.email;
  const accent = /^#[0-9a-fA-F]{6}$/.test(s?.accentColor ?? "") ? s!.accentColor : "#C2410C";
  // Accent é escolhido pela diretora e pode ser claro: a cor do texto por cima
  // adapta-se (branco ou navy) para manter contraste legível.
  const onAccent = readableTextColorOn(accent);
  const wa = whatsappNumber(phone || "");
  const waHref = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(`Olá! Vim da página online da ${name} e gostava de ficar a saber mais.`)}` : null;
  // Primeira frase da apresentação abre o hero; o resto fica na secção própria.
  const abertura = (s?.publicDescription || "").split(/[.\n]/)[0]?.trim().slice(0, 160) || "";
  const heroPhotos = photos.slice(0, 3);
  const galeria = photos.slice(heroPhotos.length);
  const comAlpha = (hex: string, a: number) => {
    const n = parseInt(hex.replace("#", ""), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  };
  const pontos = <div className="pontos-cores" aria-hidden>{Object.keys(ROOM_COLORS).map((k) => <i key={k} style={{ backgroundColor: ROOM_COLORS[k].hex }} />)}</div>;

  const contacts = [
    address && { icon: <MapPin size={18} />, label: "Morada", node: <span>{address}</span> },
    phone && { icon: <Phone size={18} />, label: "Telefone", node: <a href={`tel:${phone}`} className="link">{phone}</a> },
    waHref && { icon: <MessageCircle size={18} />, label: "WhatsApp", node: <a href={waHref} target="_blank" rel="noopener" className="link">Falar no WhatsApp</a> },
    email && { icon: <Mail size={18} />, label: "Email", node: <a href={`mailto:${email}`} className="link">{email}</a> },
    s?.publicHours && { icon: <Clock size={18} />, label: "Horário", node: <span className="whitespace-pre-wrap">{s.publicHours}</span> },
  ].filter(Boolean) as { icon: React.ReactNode; label: string; node: React.ReactNode }[];

  return (
    <main>
      {/* ——— Capa: a fotografia escolhida pela direção, ou colagem das fotos, com véu ——— */}
      <section className="relative overflow-hidden text-white" style={heroPhotos.length === 0 && !s?.coverPath ? { backgroundColor: accent, color: onAccent } : undefined}>
        {s?.coverPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/c/${slug}/capa?v=${encodeURIComponent(s.coverPath.slice(-24))}`} alt="" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
        ) : heroPhotos.length > 0 && (
          <div className="hero-collage" aria-hidden>
            {heroPhotos.map((p, i) => (
              <img
                key={p.id}
                src={`/c/${slug}/foto/${p.id}`}
                alt=""
                fetchPriority={i === 0 ? "high" : undefined}
                loading={i === 0 ? "eager" : "lazy"}
              />
            ))}
          </div>
        )}
        {s?.coverPath || heroPhotos.length > 0 ? (
          <div
            className="hero-veu absolute inset-0"
            aria-hidden
            style={{ background: `linear-gradient(180deg, ${comAlpha(accent, 0.5)} 0%, ${comAlpha("#1B2333", 0.88)} 85%, ${comAlpha("#1B2333", 0.95)} 100%)` }}
          />
        ) : null}
        <div className="relative mx-auto flex min-h-[460px] max-w-5xl flex-col justify-end px-4 pb-10 pt-20 sm:pb-14 lg:min-h-[540px]">
          {inst.city && <p className="text-sm opacity-90">{inst.city}</p>}
          <h1 className="display mt-2 flex max-w-3xl flex-wrap items-center gap-4 text-4xl leading-tight sm:text-6xl">
            {s?.logoPath && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/c/${slug}/logo?v=${encodeURIComponent(s.logoPath.slice(-24))}`} alt={`Logótipo de ${name}`} className="h-16 w-16 shrink-0 rounded-2xl bg-white object-cover shadow-lg sm:h-20 sm:w-20" />
            )}
            <span>{name}</span>
          </h1>
          <div className="mt-3">{pontos}</div>
          {abertura && <p className="mt-4 max-w-2xl text-base opacity-95 sm:text-lg">{abertura}</p>}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            {inst.status !== "SUSPENDED" && (
              <a href="#inscricao" className="btn px-6 font-semibold" style={{ backgroundColor: accent, color: onAccent }}>Pedir inscrição</a>
            )}
            {waHref && (
              <a href={waHref} target="_blank" rel="noopener" className="btn border border-white/40 px-6 hover:bg-white/10">
                <MessageCircle size={18} /> WhatsApp
              </a>
            )}
            <Link href={`/c/${slug}/entrar`} className="btn border border-white/40 px-6 hover:bg-white/10">Entrar</Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-4 py-12 sm:max-w-5xl">
        {/* ——— Apresentação ——— */}
        <section>
          <h2 className="display text-xl sm:text-2xl">A {name}</h2>
          {s?.publicDescription && s.publicDescription !== abertura ? (
            <p className="mt-3 max-w-2xl whitespace-pre-wrap text-ink-soft">{s.publicDescription}</p>
          ) : s?.publicDescription ? null : (
            <p className="mt-3 max-w-2xl text-ink-soft">A apresentação completa está a chegar. Para já, use os contactos para falar directamente com a direção.</p>
          )}
        </section>

        {/* ——— Salas: faixas etárias e vaga ——— */}
        {rooms.length > 0 && (
          <section className="mt-10">
            <h2 className="display text-xl sm:text-2xl">Salas e idades</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rooms.map((r) => (
                <li key={r.id} className="rounded-card p-4" style={{ backgroundColor: ROOM_COLORS[r.color]?.hex ?? "#1B2333", color: ROOM_COLORS[r.color]?.ink ?? "#FFFFFF" }}>
                  <p className="font-semibold">{r.name}</p>
                  <p className="mt-1 text-sm opacity-90">{ages(r.ageMinMonths, r.ageMaxMonths)}</p>
                  <p className="mt-0.5 text-xs opacity-80">Até {r.capacity} crianças</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ——— Galeria: todas as fotografias consentidas ——— */}
        {(galeria.length > 0 || heroPhotos.length > 0) && (
          <section className="mt-10">
            <h2 className="display text-xl sm:text-2xl">Fotografias</h2>
            <ul className="mt-4 columns-2 gap-3 sm:columns-3 [&>*]:mb-3">
              {[...galeria, ...heroPhotos].map((p) => (
                <li key={p.id} className="break-inside-avoid">
                  <a href={`/c/${slug}/foto/${p.id}`} target="_blank" rel="noopener" className="block overflow-hidden rounded-xl bg-surface">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/c/${slug}/foto/${p.id}`} alt={p.caption || `Fotografia de ${name}`} loading="lazy" className="w-full object-cover" />
                  </a>
                  {p.caption && <p className="mt-1 text-xs text-ink-soft">{p.caption}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ——— Horário e contactos ——— */}
        <section className="mt-10 grid gap-4 sm:grid-cols-2">
          {s?.publicHours && (
            <div className="card card-pad">
              <h2 className="text-base font-semibold">Horário</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{s.publicHours}</p>
            </div>
          )}
          <div className="card card-pad">
            <h2 className="text-base font-semibold">Falar com a creche</h2>
            {contacts.length === 0 ? <p className="mt-2 text-sm text-ink-soft">Contactos por publicar.</p> : (
              <dl className="mt-2 space-y-2.5 text-sm">
                {contacts.map((c) => (
                  <div key={c.label} className="flex items-start gap-2.5">
                    <span className="mt-0.5 text-ink-soft">{c.icon}</span>
                    <div><dt className="text-xs text-ink-soft">{c.label}</dt><dd>{c.node}</dd></div>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </section>

        {/* ——— Pedido de inscrição ——— */}
        {inst.status !== "SUSPENDED" && (
          <section id="inscricao" className="card card-pad mt-10 scroll-mt-6">
            <h2 className="display text-xl sm:text-2xl">Pedir vaga na {name}</h2>
            <div className="mt-2">{pontos}</div>
            {sent ? (
              <div className="mt-4 flex items-start gap-3 rounded-btn border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <CheckCircle2 size={22} className="mt-0.5 shrink-0" />
                <p><span className="font-semibold">Pedido enviado.</span> A {name} recebeu os seus dados e vai entrar em contacto consigo.</p>
              </div>
            ) : (
              <>
                <p className="mb-4 mt-1 max-w-2xl text-sm text-ink-soft">
                  Deixe os seus dados e os da criança. A creche entra em contacto para combinar uma visita e explicar as condições.
                  {waHref ? <> Prefere falar já? <a href={waHref} target="_blank" rel="noopener" className="link">Mande uma mensagem no WhatsApp</a>.</> : " Este pedido não garante a vaga."}
                </p>
                <ActionForm action={requestEnrollmentAction} hidden={{ slug }} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="O seu nome"><input name="guardianName" className="input" required minLength={2} maxLength={120} autoComplete="name" /></Field>
                    <Field label="Telefone"><input name="phone" type="tel" className="input" maxLength={40} autoComplete="tel" /></Field>
                    <Field label="Email" className="sm:col-span-2" hint="Indique pelo menos o telefone ou o email"><input name="email" type="email" className="input" maxLength={160} autoComplete="email" /></Field>
                    <Field label="Nome da criança"><input name="childName" className="input" required minLength={2} maxLength={120} /></Field>
                    <Field label="Data de nascimento da criança"><input name="childBirthDate" type="date" className="input" /></Field>
                  </div>
                  <Field label="Mensagem (opcional)"><textarea name="message" className="input min-h-[90px]" maxLength={1000} placeholder="Quando gostaria de começar, horário pretendido, dúvidas…" /></Field>
                  <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
                  <Submit className="btn-primary w-full sm:w-auto" pendingText="A enviar…">Enviar pedido de inscrição</Submit>
                </ActionForm>
              </>
            )}
          </section>
        )}

        <div className="mt-10 flex flex-col items-center gap-3 border-t border-line pt-6 text-sm text-ink-soft">
          <p>Pais, direção e equipa: <Link href={`/c/${slug}/entrar`} className="link">iniciar sessão</Link></p>
          <p><Link href="/" className="link">Ver todas as instituições</Link></p>
        </div>
      </div>
    </main>
  );
}
