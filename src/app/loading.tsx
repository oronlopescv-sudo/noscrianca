export default function Loading() {
  return (
    <div className="space-y-4 p-6" aria-busy="true" aria-label="A carregar">
      <div className="h-7 w-48 animate-pulse rounded-btn bg-line" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-card bg-line/70" />)}
      </div>
      <div className="h-64 animate-pulse rounded-card bg-line/60" />
    </div>
  );
}
