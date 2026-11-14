import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { ActionForm, Submit } from "@/components/ui/client";
import { Field } from "@/components/ui/kit";
import { requestSignupAction } from "../actions";

export const metadata = { title: "Pedir adesão" };

export default async function SignupRequest({ searchParams }: { searchParams: Promise<{ enviado?: string }> }) {
  const sent = (await searchParams).enviado === "1";
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      {sent ? (
        <div className="card card-pad text-center">
          <CheckCircle2 size={44} className="mx-auto text-emerald-500" />
          <h1 className="mt-3 text-xl">Pedido enviado</h1>
          <p className="mt-2 text-sm text-ink-soft">Recebemos o seu pedido de adesão. Entraremos em contacto em breve com os dados de acesso do diretor.</p>
          <Link href="/" className="btn-primary mt-6">Voltar ao início</Link>
        </div>
      ) : (
        <div className="card card-pad">
          <div className="pontos-cores" aria-hidden>
            {["#5DC98A", "#F0714F", "#5B8DEF", "#F5B93A", "#A77BDB"].map((c) => <i key={c} style={{ backgroundColor: c }} />)}
          </div>
          <h1 className="display mt-3 text-xl sm:text-2xl">Pedir adesão</h1>
          <p className="mb-5 mt-1 text-sm text-ink-soft">Preencha os dados da instituição. A criação do espaço é feita pela nossa equipa.</p>
          <ActionForm action={requestSignupAction} className="space-y-4">
            <Field label="Nome da instituição"><input name="institutionName" className="input" required maxLength={120} /></Field>
            <Field label="O seu nome"><input name="contactName" className="input" required maxLength={120} autoComplete="name" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email"><input name="email" type="email" className="input" required autoComplete="email" /></Field>
              <Field label="Telefone"><input name="phone" type="tel" className="input" autoComplete="tel" /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cidade / ilha"><input name="city" className="input" maxLength={80} /></Field>
              <Field label="N.º aproximado de crianças"><input name="childrenEstimate" inputMode="numeric" pattern="\d*" className="input" maxLength={5} /></Field>
            </div>
            <Field label="Mensagem (opcional)"><textarea name="message" className="input" maxLength={1000} /></Field>
            <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
            <Submit className="btn-primary w-full" pendingText="A enviar…">Enviar pedido</Submit>
          </ActionForm>
        </div>
      )}
    </main>
  );
}
