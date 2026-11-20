export function Coming({ title, milestone, what }: { title: string; milestone: string; what: string }) {
  return (
    <div className="max-w-3xl">
      <h1 className="text-[28px] leading-tight font-bold md:text-[34px]">{title}</h1>
      <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface px-6 py-10">
        <span className="rounded-full bg-accent-strong px-3 py-1 text-[12px] font-semibold text-white">Arrives in {milestone}</span>
        <p className="mt-4 text-[15px] text-muted">{what}</p>
      </div>
    </div>
  );
}
