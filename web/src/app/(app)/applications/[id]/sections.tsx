import { CorrectForm } from "./gate-panels";

// The parts of the brief added in M3 (PRD 13.5): both lenses, each criterion with its evidence,
// where the deck and form disagree, what research found, and what only a call can tell.

const REC_LABEL: Record<string, string> = { go: "GO", pass: "PASS", needs_human: "Needs a person", hold: "Hold for Kushal" };
const REC_TONE: Record<string, string> = { go: "text-go", pass: "text-pass", needs_human: "text-needs-human", hold: "text-hold" };
const RATING = ["Fails", "Missing", "Weak", "Adequate", "Strong"];
const STRENGTH: Record<string, { label: string; tone: string }> = {
  confirmed: { label: "Confirmed", tone: "border-go/50 text-go" },
  founder_says: { label: "Founder says", tone: "border-border-strong text-muted" },
  conflict: { label: "Conflict", tone: "border-flag/50 text-flag" },
  found_by_us: { label: "Found by us", tone: "border-brass/60 text-brass" },
  none: { label: "No evidence", tone: "border-border text-muted" },
};

export type Ev = { id: string; field: string; quote: string | null; source_ref: string | null; url: string | null; strength: string; track: string; check_id: string | null; vague: boolean; value: unknown };
export type CriterionScore = { criterion_id: string; rating: number; strength: string; reason: string; evidence_refs: string[]; memo_refs: string[]; missing: string[]; capped_note: string | null };

export function Tag({ strength }: { strength: string }) {
  const s = STRENGTH[strength] ?? STRENGTH.none;
  return <span className={`inline-block rounded-full border px-2 py-px text-[10.5px] tracking-wide whitespace-nowrap ${s.tone}`}>{s.label}</span>;
}

function where(e: Ev): string {
  if (e.track === "2" && e.url) {
    try {
      return new URL(e.url).hostname.replace(/^www\./, "");
    } catch {
      return "web";
    }
  }
  if (e.source_ref?.startsWith("deck:")) return `Deck, page ${e.source_ref.slice(6)}`;
  if (e.source_ref?.startsWith("form:")) return `Form: ${e.source_ref.slice(5).replaceAll("_", " ")}`;
  return "";
}

export function Lenses({ brief }: { brief: { rec_public: string | null; rec_revealed: string | null; headline_lens: string | null; lens_note: string | null; summary: string | null; scores: { public?: { score: number }; revealed?: { score: number } } } }) {
  const differ = brief.rec_public !== brief.rec_revealed;
  return (
    <section aria-label="Recommendation">
      <div className="eyebrow">Recommendation</div>
      <div className={`panel mt-3 p-6 ${differ ? "border-needs-human/70" : ""}`}>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["public", "revealed"] as const).map((lens) => {
            const r = lens === "public" ? brief.rec_public : brief.rec_revealed;
            const score = brief.scores?.[lens]?.score;
            const headline = brief.headline_lens === lens;
            return (
              <div key={lens} className={`rounded-[10px] border p-4 ${headline ? "border-brass/70 bg-surface-2/50" : "border-border"}`}>
                <div className="flex items-center justify-between">
                  <span className="eyebrow">{lens === "public" ? "Public thesis" : "Revealed thesis"}</span>
                  {headline ? <span className="text-[10px] tracking-[0.14em] text-brass uppercase">Headline</span> : null}
                </div>
                <div className={`mt-2 font-display text-[28px] leading-none ${REC_TONE[r ?? ""] ?? "text-muted"}`}>{r ? REC_LABEL[r] : "Not scored"}</div>
                {typeof score === "number" ? <div className="mt-2 text-[12px] text-muted tabular-nums">Weighted {score.toFixed(2)} of 4</div> : null}
              </div>
            );
          })}
        </div>
        {brief.lens_note ? <p className="mt-4 border-l border-needs-human pl-3 text-[13px] text-needs-human">{brief.lens_note}</p> : null}
        {brief.summary ? <p className="mt-4 max-w-3xl font-display text-[19px] leading-snug">{brief.summary}</p> : null}
        <p className="mt-3 text-[12px] text-muted">The recommendation comes from rules in code, never from the model. A person decides every outcome.</p>
      </div>
    </section>
  );
}

export function Criteria({ scores, names, evidence, memos, correctFor = null }: { scores: CriterionScore[]; names: Record<string, string>; evidence: Map<string, Ev>; memos: Map<string, { company: string; section: string; decision: string }>; correctFor?: string | null }) {
  if (!scores.length) return null;
  const order = (id: string) => Number(id.slice(1));
  return (
    <section aria-label="Criteria">
      <div className="eyebrow">Criteria</div>
      <p className="mt-1 text-[12px] text-muted">Rated one by one and never added into a single total here, so each can be checked on its own.</p>
      <ul className="panel mt-3 divide-y divide-border overflow-hidden">
        {[...scores].sort((a, b) => order(a.criterion_id) - order(b.criterion_id)).map((s) => (
          <li key={s.criterion_id}>
            <details className="group">
              <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-start gap-3 px-5 py-4 transition-colors duration-200 hover:bg-surface-2/40">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-[11px] text-muted">{s.criterion_id}</span>
                    <span className="font-display text-[18px]">{names[s.criterion_id] ?? s.criterion_id}</span>
                    <Tag strength={s.strength} />
                  </div>
                  <p className="mt-1 text-[13px] text-muted">{s.reason}</p>
                  {s.capped_note ? <p className="mt-1 text-[11.5px] text-needs-human">{s.capped_note}</p> : null}
                </div>
                <div className="text-right">
                  <div className="flex justify-end gap-1" aria-hidden="true">
                    {[1, 2, 3, 4].map((d) => (
                      <span key={d} className={`size-2 rounded-full ${d <= s.rating ? (s.rating >= 3 ? "bg-go" : s.rating === 2 ? "bg-needs-human" : "bg-flag") : "bg-border"}`} />
                    ))}
                  </div>
                  <div className="mt-1 text-[12px] whitespace-nowrap">{RATING[s.rating]} <span className="text-muted">({s.rating})</span></div>
                </div>
              </summary>
              <div className="space-y-2 border-t border-border bg-surface-2/30 px-5 py-4">
                {s.evidence_refs.length === 0 ? <p className="text-[12.5px] text-muted">No evidence was cited.</p> : null}
                {s.evidence_refs.map((r) => {
                  const e = evidence.get(r);
                  if (!e) return null;
                  return (
                    <div key={r} className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                      <Tag strength={e.strength} />
                      <span>“{e.quote}”</span>
                      {e.url ? <a href={e.url} target="_blank" rel="noreferrer" className="text-[11px] text-brass underline">{where(e)}</a> : <span className="text-[11px] text-brass">{where(e)}</span>}
                      {e.vague ? <span className="text-[11px] text-needs-human">vague</span> : null}
                    </div>
                  );
                })}
                {s.memo_refs.length ? (
                  <p className="text-[12px] text-muted">
                    Compared with: {s.memo_refs.map((m) => memos.get(m)).filter(Boolean).map((m) => `${m!.company} (${m!.decision}, ${m!.section})`).join(", ")}
                  </p>
                ) : null}
                {s.missing.length ? <p className="text-[12px] text-muted">Missing: {s.missing.join(", ")}</p> : null}
                {correctFor ? <CorrectForm id={correctFor} criterion={s.criterion_id} rating={s.rating} /> : null}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Disagree({ items }: { items: { field: string; form: string; deck: string; gap_percent: number | null; severity: string; note: string }[] }) {
  if (!items.length) return null;
  return (
    <section aria-label="Deck and form disagree">
      <div className="eyebrow">Deck and form disagree</div>
      <div className="mt-3 space-y-3">
        {items.map((x, i) => (
          <div key={i} className="panel p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-display text-[18px]">{x.field.split(".").pop()!.replaceAll("_", " ")}</span>
              <span className={`text-[10.5px] tracking-[0.14em] uppercase ${x.severity === "High" ? "text-flag" : "text-muted"}`}>
                {x.gap_percent !== null ? `${x.gap_percent}% apart` : x.severity}
              </span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[10px] border border-border p-3">
                <div className="eyebrow">Form says</div>
                <p className="mt-1 text-[13px]">“{x.form}”</p>
              </div>
              <div className="rounded-[10px] border border-border p-3">
                <div className="eyebrow">Deck says</div>
                <p className="mt-1 text-[13px]">“{x.deck}”</p>
              </div>
            </div>
            <p className="mt-3 text-[12px] text-muted">{x.note} The system never picks one.</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Research({ web, fetches, mode }: { web: Ev[]; fetches: { check_id: string; outcome: string; error: string | null; query_or_url: string }[]; mode: string | null }) {
  if (!web.length && !fetches.length) return null;
  const dropped = fetches.filter((f) => f.outcome === "wrong_match" || f.outcome === "injection" || f.outcome === "blocked");
  return (
    <section aria-label="Our research">
      <div className="flex items-baseline justify-between gap-3">
        <div className="eyebrow">Our research (Track 2)</div>
        <span className="text-[11px] text-muted">{mode === "replay" ? "Recorded results, replay mode" : mode === "live" ? "Live web" : ""} · {fetches.length} fetches</span>
      </div>
      {web.length ? (
        <ul className="panel mt-3 divide-y divide-border">
          {web.map((w) => (
            <li key={w.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-5 py-3 text-[13px]">
              <Tag strength={w.strength} />
              <span>{String(w.value ?? "")}</span>
              <span className="text-muted">“{w.quote}”</span>
              {w.url ? <a href={w.url} target="_blank" rel="noreferrer" className="text-[11px] text-brass underline">{where(w)}</a> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-muted">Research found nothing about this company. Nothing was invented to fill the gap.</p>
      )}
      {dropped.length ? (
        <ul className="mt-3 space-y-1">
          {dropped.map((d, i) => (
            <li key={i} className="border-l border-needs-human pl-3 text-[12px] text-muted">
              <span className="text-needs-human">{d.outcome === "wrong_match" ? "Dropped, wrong match" : d.outcome === "injection" ? "Ignored, text aimed at the AI" : "Not fetched, blocked site"}</span>: {d.error}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function CallSignals({ signals, aditya }: { signals: string[]; aditya: boolean }) {
  if (!signals.length && !aditya) return null;
  return (
    <section aria-label="Only a call can tell">
      <div className="eyebrow">Only a call can tell</div>
      <ul className="mt-3 space-y-2">
        {aditya ? <li className="border-l border-brass pl-4 text-[13.5px]">Deeptech: Aditya joins the call.</li> : null}
        {signals.map((s) => <li key={s} className="border-l border-border-strong pl-4 text-[13.5px]">{s}</li>)}
      </ul>
    </section>
  );
}
