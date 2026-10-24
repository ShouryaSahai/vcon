export default function AppLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-56 animate-pulse rounded-lg bg-slate-200" />
      <div className="space-y-2">
        <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-20 w-2/3 animate-pulse rounded-xl bg-slate-100" />
      </div>
      <p className="text-xs text-slate-400">Loading…</p>
    </div>
  );
}
