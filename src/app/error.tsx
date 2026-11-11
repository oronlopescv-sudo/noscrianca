"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl">Ocorreu um erro</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-soft">Não foi possível carregar esta página. Tente novamente dentro de instantes.</p>
      <button type="button" onClick={reset} className="btn-primary mt-6">Tentar de novo</button>
    </main>
  );
}
