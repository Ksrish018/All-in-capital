export function Coming({ title, milestone, what }: { title: string; milestone: string; what: string }) {
  return (
    <div className="rise mx-auto max-w-[1400px]">
      <div className="eyebrow">All In Capital · {title}</div>
      <h1 className="mt-3 text-[40px] leading-[1.05] md:text-[60px]">{title}</h1>
      <div className="hairline mt-6" />
      <div className="mt-8 max-w-2xl rounded-lg border border-border bg-surface px-8 py-10">
        <div className="eyebrow text-brass">Arrives in {milestone}</div>
        <p className="mt-3 font-display text-[22px] leading-snug">{what}</p>
      </div>
    </div>
  );
}
