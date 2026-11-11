/**
 * Gráfico de barras de uma única série (ex.: valor recebido por mês).
 * Uma só cor (acento), barras finas com topo arredondado, grelha discreta,
 * valor visível ao passar/focar cada barra e tabela equivalente para leitores de ecrã.
 */
export function BarChart({ data, format, caption }: { data: { label: string; value: number }[]; format: (v: number) => string; caption: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure>
      <div className="relative flex h-44 items-end gap-2 border-b border-line pt-6" role="img" aria-label={caption}>
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <div key={g} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line/70" style={{ bottom: `${g * 100 * 0.82}%` }} />
        ))}
        {data.map((d, i) => (
          <div key={d.label} className="group relative flex h-full flex-1 items-end justify-center" tabIndex={0}>
            <div
              className="w-full max-w-[28px] rounded-t-[4px] bg-accent transition-opacity group-hover:opacity-80"
              style={{ height: `${Math.max(d.value > 0 ? 2 : 0, (d.value / max) * 82)}%` }}
            />
            <span className={`pointer-events-none absolute -top-0 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-navy px-2 py-1 text-[11px] font-semibold text-white shadow ${i === data.length - 1 ? "opacity-100" : "opacity-0"} transition-opacity group-hover:opacity-100 group-focus:opacity-100`}>
              {format(d.value)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2">
        {data.map((d) => <span key={d.label} className="flex-1 truncate text-center text-[11px] text-ink-soft">{d.label}</span>)}
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>{data.map((d) => <tr key={d.label}><th scope="row">{d.label}</th><td>{format(d.value)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
