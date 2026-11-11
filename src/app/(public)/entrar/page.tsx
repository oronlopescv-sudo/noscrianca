import Link from "next/link";
import { ActionForm, Submit } from "@/components/ui/client";
import { Field } from "@/components/ui/kit";
import { findInstitutionAction } from "../actions";

export const metadata = { title: "Entrar" };

export default function FindInstitution() {
  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <div className="card card-pad">
        <h1 className="text-xl">Entrar na sua instituição</h1>
        <p className="mb-5 mt-1 text-sm text-ink-soft">Indique o código da creche (está no link do convite que recebeu, depois de <span className="font-mono">/c/</span>).</p>
        <ActionForm action={findInstitutionAction} className="space-y-4" resetOnSuccess={false}>
          <Field label="Código da instituição" hint="Exemplo: jardim-sorriso">
            <input name="code" className="input" required autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="codigo-da-creche" />
          </Field>
          <Submit className="btn-primary w-full" pendingText="A procurar…">Continuar</Submit>
        </ActionForm>
        <p className="mt-5 text-center text-sm text-ink-soft">
          A sua instituição ainda não usa o NosCriança? <Link href="/pedir-adesao" className="link">Pedir adesão</Link>
        </p>
      </div>
    </main>
  );
}
