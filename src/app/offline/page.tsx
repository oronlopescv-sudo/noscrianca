export const metadata = { title: "Sem ligação" };

export default function Offline() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl">Sem ligação à internet</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-soft">Verifique a sua ligação. Assim que voltar a estar online, a aplicação retoma automaticamente.</p>
      <a href="" className="btn-primary mt-6">Tentar de novo</a>
    </main>
  );
}
