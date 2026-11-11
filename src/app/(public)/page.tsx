import Link from "next/link";
import { Baby, BellRing, CalendarCheck, Database, MessageCircle, Receipt, ShieldCheck, Smartphone, Users } from "lucide-react";

const FEATURES = [
  { icon: <CalendarCheck size={22} />, color: "bg-room-green", title: "Presenças num toque", text: "Entradas e saídas registadas na sala, com hora e quem entregou ou recolheu a criança." },
  { icon: <Baby size={22} />, color: "bg-room-coral", title: "Diário da criança", text: "Refeições, sestas, atividades e ocorrências — os pais acompanham o dia no telemóvel." },
  { icon: <Receipt size={22} />, color: "bg-room-blue", title: "Mensalidades e recibos", text: "Geração mensal automática, registo de pagamentos, dívidas e recibos em PDF." },
  { icon: <MessageCircle size={22} />, color: "bg-room-yellow", title: "Comunicação com os pais", text: "Comunicados por turma ou para toda a instituição e mensagens diretas." },
  { icon: <Users size={22} />, color: "bg-room-purple", title: "Equipa com permissões", text: "Diretor, educadores, auxiliares, administrativos e financeiros — cada um vê só o que deve." },
  { icon: <Database size={22} />, color: "bg-navy", title: "Dados isolados", text: "Cada instituição tem a sua própria base de dados, com backups independentes." },
];

export default function Landing() {
  return (
    <main>
      <section className="bg-navy pb-16 pt-10 text-white sm:pb-24 sm:pt-16">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 lg:grid-cols-2">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-navy-text">
              <Smartphone size={14} /> Funciona no computador, tablet e telemóvel
            </p>
            <h1 className="text-3xl leading-tight sm:text-5xl">A gestão da sua creche, simples e organizada.</h1>
            <p className="mt-4 max-w-xl text-base text-navy-text sm:text-lg">
              Crianças, turmas, presenças, diário, mensalidades e comunicação com os pais — tudo num só lugar, com os dados de cada instituição totalmente separados.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/pedir-adesao" className="btn-primary px-6">Pedir adesão</Link>
              <Link href="/entrar" className="btn border border-white/30 px-6 text-white hover:bg-white/10">Já tenho conta</Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4" aria-hidden>
            {[["Sala Girassol", "bg-room-green", "14 / 16 presentes"], ["Sala Estrela", "bg-room-coral", "11 / 12 presentes"], ["Sala Arco-Íris", "bg-room-blue", "17 / 20 presentes"], ["Berçário", "bg-room-yellow", "6 / 8 presentes"]].map(([name, color, info]) => (
              <div key={name} className={`${color} rounded-card p-4 text-white shadow-lg sm:p-5`}>
                <p className="text-sm font-semibold sm:text-base">{name}</p>
                <p className="mt-6 text-xs opacity-90 sm:text-sm">{info}</p>
                <div className="mt-2 h-1.5 rounded-full bg-white/30"><div className="h-1.5 w-4/5 rounded-full bg-white" /></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-center text-2xl sm:text-3xl">Tudo o que a instituição precisa</h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-ink-soft">Quatro espaços distintos: administração da plataforma, direção, sala e portal dos pais.</p>
        <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card card-pad">
              <span className={`${f.color} flex h-11 w-11 items-center justify-center rounded-xl text-white`}>{f.icon}</span>
              <h3 className="mt-4 text-base">{f.title}</h3>
              <p className="mt-1.5 text-sm text-ink-soft">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white py-14">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-3">
          {[
            { icon: <ShieldCheck size={22} />, title: "Segurança e privacidade", text: "Acessos por convite, permissões por cargo e consentimento de fotografias por criança." },
            { icon: <BellRing size={22} />, title: "Pais sempre informados", text: "Notificações de comunicados, mensagens e mensalidades diretamente na aplicação." },
            { icon: <Smartphone size={22} />, title: "Instalável como app", text: "Adicione ao ecrã principal do telemóvel e use como uma aplicação." },
          ].map((b) => (
            <div key={b.title} className="flex gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">{b.icon}</span>
              <div>
                <h3 className="text-base">{b.title}</h3>
                <p className="mt-1 text-sm text-ink-soft">{b.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-14 text-center">
        <h2 className="text-2xl sm:text-3xl">Quer usar o NosCriança na sua instituição?</h2>
        <p className="mt-2 text-ink-soft">Envie um pedido de adesão. Criamos o espaço da sua creche e enviamos o acesso ao diretor.</p>
        <Link href="/pedir-adesao" className="btn-primary mt-6 px-8">Pedir adesão</Link>
      </section>
    </main>
  );
}
