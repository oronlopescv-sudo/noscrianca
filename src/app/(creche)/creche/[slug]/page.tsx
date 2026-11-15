import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cache } from "react";
import { asc, eq } from "drizzle-orm";
import { ArrowRight, BookOpen, CheckCircle2, ChevronRight, Clock, Heart, Home, Image as ImageIcon, LogIn, Mail, MapPin, MessageCircle, Phone, ShieldCheck, Smile, Star, Users } from "lucide-react";
import "@fontsource-variable/baloo-2";
import { ActionForm, Submit } from "@/components/ui/client";
import { Field } from "@/components/ui/kit";
import { getTenantDb, t } from "@/db/tenant";
import { ROOM_COLORS } from "@/lib/labels";
import { whatsappNumber } from "@/lib/collection-rules";
import { HeroCarousel } from "@/components/public/hero-carousel";
import { ATIVIDADES, HERO_PADRAO, HEROS_PADRAO } from "@/lib/site";
import { getInstitutionBySlug, institutionUsable } from "@/lib/tenant";
import { requestEnrollmentAction } from "@/app/(public)/actions";

export const dynamic = "force-dynamic";

// Paleta do site das creches (igual para todas, como no desenho aprovado).
const NAVY = "#12307A";
const BLUE = "#1E63D6";
const ORANGE = "#F26A1B";
const YELLOW = "#F5B93A";

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
      images: d.s?.coverPath ? [{ url: `/c/${slug}/capa` }] : d.s?.logoPath ? [{ url: `/c/${slug}/logo` }] : [{ url: HERO_PADRAO }],
    },
  };
}

const ages = (min: number | null, max: number | null) => {
  if (min == null && max == null) return "Todas as idades";
  const f = (m: number) => (m < 24 ? `${m} meses` : `${Math.floor(m / 12)} anos`);
  return min != null && max != null ? `${f(min)} a ${f(max)}` : min != null ? `A partir de ${f(min)}` : `Até ${f(max!)}`;
};

const VANTAGENS = [
  { icon: ShieldCheck, cor: BLUE, a: "Ambiente", b: "Seguro" },
  { icon: Users, cor: BLUE, a: "Equipa", b: "Qualificada" },
  { icon: BookOpen, cor: ORANGE, a: "Educação", b: "de Qualidade" },
  { icon: Heart, cor: ORANGE, a: "Desenvolvimento", b: "Integral" },
  { icon: Smile, cor: YELLOW, a: "Diversão", b: "Garantida" },
];

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="display text-3xl font-extrabold sm:text-4xl" style={{ color: NAVY }}>
      {children}
      <span aria-hidden className="mt-1 block h-1.5 w-28 rounded-full" style={{ backgroundColor: YELLOW }} />
    </h2>
  );
}

export default async function PublicInstitution({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ pedido?: string }> }) {
  const { slug } = await params;
  const sent = (await searchParams).pedido === "1";
  const d = await load(slug);
  if (!d) notFound();
  const { inst, s, photos, rooms } = d;
  const name = s?.name ?? inst.name;
  const local = [inst.island, inst.city].filter(Boolean).join(" · ");
  const address = [s?.address || inst.address, inst.city].filter(Boolean).join(", ");
  const phone = s?.phone || inst.phone;
  const email = s?.email || inst.email;
  const wa = whatsappNumber(phone || "");
  const waHref = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(`Olá! Vim da página online da ${name} e gostava de ficar a saber mais.`)}` : null;
  const abertura = (s?.publicDescription || "").split(/[.\n]/)[0]?.trim().slice(0, 160) || "";
  const aberto = inst.status !== "SUSPENDED";
  const galeria = photos.filter((p) => !p.slot);
  // Carrossel: a capa e as primeiras fotografias da galeria; enquanto forem menos de três, completam-se com as de exemplo.
  const slides = [
    ...(s?.coverPath ? [`/c/${slug}/capa?v=${encodeURIComponent(s.coverPath.slice(-24))}`] : []),
    ...galeria.slice(0, 3).map((p) => `/c/${slug}/foto/${p.id}`),
  ];
  for (const ex of HEROS_PADRAO) if (slides.length < 3) slides.push(ex);
  const atividades = ATIVIDADES.map((a) => {
    const p = photos.find((x) => x.slot === `atividade-${a.n}`);
    return { ...a, label: p?.caption || a.label, src: p ? `/c/${slug}/foto/${p.id}` : a.img };
  });

  const menu = [
    { href: "#inicio", label: "Início", icon: Home, cor: "#FFFFFF" },
    { href: "#sobre", label: "A Nossa Creche", icon: Heart, cor: ORANGE },
    { href: "#atividades", label: "Atividades", icon: Star, cor: YELLOW },
    ...(galeria.length > 0 ? [{ href: "#galeria", label: "Galeria", icon: ImageIcon, cor: BLUE }] : []),
    { href: "#contactos", label: "Contactos", icon: Phone, cor: BLUE },
  ];

  const contacts = [
    address && { icon: <MapPin size={18} />, label: "Morada", node: <span>{address}</span> },
    phone && { icon: <Phone size={18} />, label: "Telefone", node: <a href={`tel:${phone}`} className="link">{phone}</a> },
    waHref && { icon: <MessageCircle size={18} />, label: "WhatsApp", node: <a href={waHref} target="_blank" rel="noopener" className="link">Falar no WhatsApp</a> },
    email && { icon: <Mail size={18} />, label: "Email", node: <a href={`mailto:${email}`} className="link">{email}</a> },
    s?.publicHours && { icon: <Clock size={18} />, label: "Horário", node: <span className="whitespace-pre-wrap">{s.publicHours}</span> },
  ].filter(Boolean) as { icon: React.ReactNode; label: string; node: React.ReactNode }[];

  return (
    <div id="inicio" className="bg-white" style={{ color: "#1B2333" }}>
      {/* ——— Barra de topo ——— */}
      <div className="text-white" style={{ backgroundColor: NAVY }}>
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-4 px-4 text-xs font-medium sm:text-[13px]">
          <Link href="/" className="mr-auto inline-flex min-h-[36px] items-center gap-1.5 opacity-90 hover:opacity-100">NosCriança · Creches de Cabo Verde</Link>
          {waHref && <a href={waHref} target="_blank" rel="noopener" className="hidden min-h-[36px] items-center gap-1.5 opacity-90 hover:opacity-100 sm:inline-flex"><MessageCircle size={14} /> Suporte</a>}
          <Link href={`/c/${slug}/entrar`} className="inline-flex min-h-[36px] items-center gap-1.5 opacity-90 hover:opacity-100"><LogIn size={14} /> Entrar</Link>
        </div>
      </div>

      {/* ——— Cabeçalho: logótipo da creche, menu e inscrição ——— */}
      <header className="sticky top-0 z-30 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 lg:gap-6">
          <a href="#inicio" className="flex min-w-0 items-center gap-2.5">
            {s?.logoPath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/c/${slug}/logo?v=${encodeURIComponent(s.logoPath.slice(-24))}`} alt="" className="h-12 w-12 shrink-0 rounded-2xl object-cover sm:h-14 sm:w-14" />
            ) : (
              <span className="display flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl font-extrabold text-white sm:h-14 sm:w-14" style={{ backgroundColor: ORANGE }}>{name.trim().charAt(0).toUpperCase()}</span>
            )}
            <span className="min-w-0">
              <span className="display block truncate text-lg font-extrabold leading-tight sm:text-2xl" style={{ color: NAVY }}>{name}</span>
              {local && <span className="block truncate text-xs font-semibold sm:text-sm" style={{ color: BLUE }}>{local}</span>}
            </span>
          </a>
          <nav aria-label="Secções do site" className="mx-auto hidden items-center gap-1 lg:flex">
            {menu.map((m, i) => (
              <a key={m.href} href={m.href} className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[15px] font-semibold ${i === 0 ? "text-white" : "hover:bg-slate-100"}`} style={i === 0 ? { backgroundColor: BLUE } : { color: NAVY }}>
                <m.icon size={18} fill={i === 0 ? "none" : m.cor} color={i === 0 ? "#fff" : m.cor} /> {m.label}
              </a>
            ))}
          </nav>
          {aberto && (
            <a href="#inscricao" className="ml-auto inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 sm:px-6 sm:text-[15px] lg:ml-0" style={{ backgroundColor: ORANGE }}>
              <span className="sm:hidden">Inscrever</span><span className="hidden sm:inline">Inscrever o Seu Filho</span> <ArrowRight size={18} />
            </a>
          )}
        </div>
        {/* Menu no telemóvel: uma linha que desliza */}
        <nav aria-label="Secções do site" className="flex gap-1.5 overflow-x-auto border-t border-slate-100 px-3 py-2 lg:hidden">
          {menu.map((m, i) => (
            <a key={m.href} href={m.href} className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold ${i === 0 ? "text-white" : "bg-slate-50"}`} style={i === 0 ? { backgroundColor: BLUE } : { color: NAVY }}>
              <m.icon size={16} fill={i === 0 ? "none" : m.cor} color={i === 0 ? "#fff" : m.cor} /> {m.label}
            </a>
          ))}
        </nav>
      </header>

      <main>
        {/* ——— Faixa principal: texto à esquerda, fotografia à direita ——— */}
        <section className="relative overflow-hidden bg-[#FFF8E6]">
          <HeroCarousel images={slides} alt={`Fotografia da ${name}`} className="relative h-60 w-full sm:h-80 lg:absolute lg:inset-y-0 lg:right-0 lg:h-full lg:w-[64%]" />
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 hidden w-[52%] lg:block" style={{ background: "linear-gradient(90deg, #FFFDF5 0%, #FFFDF5 66%, rgba(255,253,245,0.8) 80%, rgba(255,253,245,0) 100%)" }} />
          <div className="relative mx-auto max-w-7xl px-5 pb-20 pt-8 lg:flex lg:min-h-[470px] lg:items-center lg:px-8 lg:pb-24 lg:pt-10">
            <div className="max-w-xl">
              <h1 className="display text-[2.6rem] font-extrabold leading-[1.05] sm:text-6xl" style={{ color: NAVY }}>Aprender, Brincar, Crescer…</h1>
              <p className="display mt-3 inline-block -rotate-2 text-2xl font-bold italic sm:text-4xl" style={{ color: ORANGE }}>
                Juntos por um futuro melhor!
                <svg aria-hidden viewBox="0 0 300 12" className="mt-0.5 h-2.5 w-3/4" preserveAspectRatio="none"><path d="M2 9 C80 2 180 2 298 6" fill="none" stroke={ORANGE} strokeWidth="4" strokeLinecap="round" /></svg>
              </p>
              <p className="mt-5 max-w-md text-[17px] leading-relaxed" style={{ color: NAVY }}>
                {abertura || "Uma creche moderna, segura e acolhedora, para o desenvolvimento feliz da sua criança."}
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <a href="#sobre" className="inline-flex min-h-[52px] items-center gap-3 rounded-full pl-7 pr-3 text-base font-bold text-white shadow-lg transition hover:-translate-y-0.5" style={{ backgroundColor: NAVY }}>
                  Conheça a Nossa Creche
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white" style={{ color: NAVY }}><ChevronRight size={20} /></span>
                </a>
                {waHref && <a href={waHref} target="_blank" rel="noopener" className="inline-flex min-h-[52px] items-center gap-2 rounded-full border-2 bg-white px-5 text-base font-bold" style={{ borderColor: NAVY, color: NAVY }}><MessageCircle size={18} /> WhatsApp</a>}
              </div>
            </div>
          </div>
        </section>

        {/* ——— Cinco vantagens, num cartão por cima da faixa ——— */}
        <section aria-label="Porquê a nossa creche" className="relative z-10 mx-auto -mt-12 max-w-6xl px-4">
          <ul className="grid grid-cols-2 gap-x-3 gap-y-5 rounded-3xl bg-white px-4 py-6 shadow-[0_12px_40px_-12px_rgba(18,48,122,0.35)] sm:grid-cols-3 lg:grid-cols-5 lg:px-8">
            {VANTAGENS.map((v) => (
              <li key={v.a} className="flex min-w-0 items-center gap-2.5 last:col-span-2 last:justify-self-center sm:last:col-span-1 sm:last:justify-self-auto">
                <v.icon strokeWidth={1.8} color={v.cor} fill={v.cor} fillOpacity={0.18} className="h-9 w-9 shrink-0 sm:h-11 sm:w-11" />
                <span className="min-w-0 text-[13px] font-semibold leading-tight sm:text-base" style={{ color: NAVY }}>{v.a}<br />{v.b}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ——— As Nossas Atividades ——— */}
        <section id="atividades" className="mx-auto mt-10 max-w-7xl scroll-mt-32 px-4">
          <Titulo>As Nossas Atividades</Titulo>
          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_300px]">
            <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {atividades.map((a) => (
                <li key={a.n} className="relative overflow-hidden rounded-2xl shadow-md ring-2" style={{ ["--tw-ring-color" as string]: a.color }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.src} alt={a.label} loading="lazy" className="aspect-[4/3] h-full w-full object-cover sm:aspect-[16/10]" />
                  <span className="absolute bottom-0 left-0 max-w-[92%] truncate rounded-tr-2xl px-3 py-1.5 text-[13px] font-bold text-white sm:px-4 sm:py-2 sm:text-base" style={{ backgroundColor: a.color }}>{a.label}</span>
                </li>
              ))}
            </ul>
            <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl bg-[#E4EEFB] p-6">
              <Heart size={44} color={BLUE} strokeWidth={2.2} className="shrink-0" />
              <p className="display -rotate-2 text-2xl font-bold italic leading-tight" style={{ color: NAVY }}>
                Porque cada criança merece o melhor!
                <span aria-hidden className="mt-1 block h-1.5 w-24 rounded-full" style={{ backgroundColor: YELLOW }} />
              </p>
              <svg aria-hidden viewBox="0 0 300 60" className="absolute -bottom-1 right-0 w-48" preserveAspectRatio="none">
                <path d="M0 60 C90 50 190 30 300 0 L300 60 Z" fill={NAVY} /><path d="M40 60 C130 54 220 40 300 22 L300 60 Z" fill={YELLOW} />
              </svg>
            </div>
          </div>
        </section>

        {/* ——— A Nossa Creche: apresentação e salas ——— */}
        <section id="sobre" className="mx-auto mt-14 max-w-7xl scroll-mt-32 px-4">
          <Titulo>A Nossa Creche</Titulo>
          {s?.publicDescription ? (
            <p className="mt-4 max-w-3xl whitespace-pre-wrap text-[17px] leading-relaxed text-slate-700">{s.publicDescription}</p>
          ) : (
            <p className="mt-4 max-w-3xl text-[17px] text-slate-700">A apresentação completa está a chegar. Para já, use os contactos para falar directamente com a direção.</p>
          )}
          {rooms.length > 0 && (
            <>
              <h3 className="display mt-8 text-2xl font-bold" style={{ color: NAVY }}>Salas e idades</h3>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {rooms.map((r) => (
                  <li key={r.id} className="rounded-3xl p-5 shadow-md" style={{ backgroundColor: ROOM_COLORS[r.color]?.hex ?? NAVY, color: ROOM_COLORS[r.color]?.ink ?? "#FFFFFF" }}>
                    <p className="display text-xl font-bold">{r.name}</p>
                    <p className="mt-1 text-sm opacity-90">{ages(r.ageMinMonths, r.ageMaxMonths)}</p>
                    <p className="mt-0.5 text-xs opacity-80">Até {r.capacity} crianças</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* ——— Galeria ——— */}
        {galeria.length > 0 && (
          <section id="galeria" className="mx-auto mt-14 max-w-7xl scroll-mt-32 px-4">
            <Titulo>Galeria</Titulo>
            <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {galeria.map((p) => (
                <li key={p.id}>
                  <a href={`/c/${slug}/foto/${p.id}`} target="_blank" rel="noopener" className="group block overflow-hidden rounded-2xl shadow-md">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/c/${slug}/foto/${p.id}`} alt={p.caption || `Fotografia de ${name}`} loading="lazy" className="aspect-[4/3] w-full object-cover transition duration-500 group-hover:scale-105" />
                  </a>
                  {p.caption && <p className="mt-1 text-sm text-slate-600">{p.caption}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ——— Contactos e horário ——— */}
        <section id="contactos" className="mx-auto mt-14 max-w-7xl scroll-mt-32 px-4">
          <Titulo>Contactos</Titulo>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl bg-[#E4EEFB] p-6">
              <h3 className="display text-xl font-bold" style={{ color: NAVY }}>Falar com a creche</h3>
              {contacts.length === 0 ? <p className="mt-2 text-sm text-slate-600">Contactos por publicar.</p> : (
                <dl className="mt-3 space-y-3 text-[15px]">
                  {contacts.filter((c) => c.label !== "Horário").map((c) => (
                    <div key={c.label} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white" style={{ color: BLUE }}>{c.icon}</span>
                      <div><dt className="text-xs font-semibold text-slate-500">{c.label}</dt><dd>{c.node}</dd></div>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            <div className="rounded-3xl bg-[#FFF3D6] p-6">
              <h3 className="display flex items-center gap-2 text-xl font-bold" style={{ color: NAVY }}><Clock size={20} color={ORANGE} /> Horário</h3>
              <p className="mt-3 whitespace-pre-wrap text-[15px] text-slate-700">{s?.publicHours || "Horário por publicar. Fale connosco para saber mais."}</p>
            </div>
          </div>
        </section>

        {/* ——— Pedido de inscrição ——— */}
        {aberto && (
          <section id="inscricao" className="mx-auto mt-14 max-w-4xl scroll-mt-32 px-4">
            <div className="rounded-[2rem] border-2 bg-white p-6 shadow-xl sm:p-9" style={{ borderColor: ORANGE }}>
              <h2 className="display text-3xl font-extrabold" style={{ color: NAVY }}>Inscrever o Seu Filho</h2>
              {sent ? (
                <div className="mt-4 flex items-start gap-3 rounded-btn border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <CheckCircle2 size={22} className="mt-0.5 shrink-0" />
                  <p><span className="font-semibold">Pedido enviado.</span> A {name} recebeu os seus dados e vai entrar em contacto consigo.</p>
                </div>
              ) : (
                <>
                  <p className="mb-5 mt-2 max-w-2xl text-[15px] text-slate-600">
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
                    <Submit className="inline-flex min-h-[52px] w-full items-center justify-center rounded-full px-8 text-base font-bold text-white shadow-md sm:w-auto [background-color:#F26A1B]" pendingText="A enviar…">Enviar pedido de inscrição</Submit>
                  </ActionForm>
                </>
              )}
            </div>
          </section>
        )}
      </main>

      {/* ——— Rodapé do site da creche ——— */}
      <footer className="mt-16 text-white" style={{ backgroundColor: NAVY }}>
        <div aria-hidden className="h-2" style={{ background: `linear-gradient(90deg, ${BLUE}, ${YELLOW}, ${ORANGE})` }} />
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 py-8 text-center text-sm sm:flex-row sm:justify-between sm:text-left">
          <p className="display text-xl font-bold">{name}<span className="block text-sm font-normal opacity-80">Juntos pelo bem das nossas crianças!</span></p>
          <div className="flex flex-wrap justify-center gap-x-6 font-medium [&>a]:inline-flex [&>a]:min-h-[44px] [&>a]:items-center [&>a]:opacity-90">
            <Link href={`/c/${slug}/entrar`}>Entrar (pais e equipa)</Link>
            <Link href="/">Ver todas as creches</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
