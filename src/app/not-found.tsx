import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="text-5xl font-bold text-accent">404</p>
      <h1 className="mt-3 text-xl">Página não encontrada</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-soft">O endereço que procura não existe ou foi movido.</p>
      <Link href="/" className="btn-primary mt-6">Voltar ao início</Link>
    </main>
  );
}
