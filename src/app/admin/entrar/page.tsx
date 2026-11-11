import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { PlainShell } from "@/components/shell";
import { ActionForm, Submit } from "@/components/ui/client";
import { Field } from "@/components/ui/kit";
import { getPlatformUser } from "@/lib/platform";
import { adminLoginAction } from "../actions";

export const metadata = { title: "Administração" };

export default async function AdminLogin() {
  if (await getPlatformUser()) redirect("/admin");
  return (
    <PlainShell>
      <main className="flex min-h-dvh items-center justify-center bg-navy px-4 py-10">
        <div className="w-full max-w-sm rounded-card bg-white p-6 shadow-xl">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-white"><ShieldCheck size={24} /></span>
          <h1 className="mt-4 text-xl">Painel da plataforma</h1>
          <p className="mb-5 mt-1 text-sm text-ink-soft">Acesso reservado ao Super Administrador.</p>
          <ActionForm action={adminLoginAction} className="space-y-4" resetOnSuccess={false}>
            <Field label="Email"><input name="email" type="email" className="input" required autoComplete="username" /></Field>
            <Field label="Palavra-passe"><input name="password" type="password" className="input" required autoComplete="current-password" /></Field>
            <Submit className="btn-primary w-full" pendingText="A entrar…">Entrar</Submit>
          </ActionForm>
        </div>
      </main>
    </PlainShell>
  );
}
