export function Coming({ title, milestone, what }: { title: string; milestone: string; what: string }) {
  return (
    <div>
      <h1 className="text-[22px] font-semibold">{title}</h1>
      <div className="mt-6 rounded-lg border border-dashed border-border bg-surface px-6 py-10">
        <div className="font-medium">Arrives in {milestone}</div>
        <p className="mt-1 text-muted">{what}</p>
      </div>
    </div>
  );
}
