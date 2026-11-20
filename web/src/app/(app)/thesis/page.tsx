import { createAdminClient } from "@/lib/supabase/server";
import { can, currentActor } from "@/lib/actor";
import { CRITERIA, type CriterionId } from "@/lib/thesis/card";

type Criterion = {
  id: CriterionId; name: string; meaning: string; rate_4: string; rate_0: string;
  sources: string[]; deal_breaker: boolean;
};
type Register = {
  findings: { topic: string; says: string; sources: string[] }[];
  gaps: { item: string; status: string; cost: string }[];
  sources: Record<string, string>;
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default async function ThesisPage() {
  const db = createAdminClient();
  const actor = await currentActor();
  const [{ data: cards }, { data: portfolio }, { data: passages }] = await Promise.all([
    db.from("thesis_cards").select("*").order("version", { ascending: false }).limit(1),
    db.from("portfolio_companies").select("name, sector, description, tags, confirmed").order("name"),
    db.from("memo_passages").select("id, memo_n, company, decision, split, section, criteria").order("memo_n"),
  ]);
  const card = cards?.[0];
  if (!card) {
    return (
      <div>
        <h1 className="text-[40px] leading-[1.05] md:text-[60px]">Thesis Card</h1>
        <p className="mt-4 text-muted">No Thesis Card yet. Run <code>npm run db:seed</code>.</p>
      </div>
    );
  }
  const criteria = card.criteria as Criterion[];
  const register = card.public_register as Register;
  const wPub = card.weights_public as Record<string, number>;
  const wRev = card.weights_revealed as Record<string, number>;
  const memos = Object.values(
    (passages ?? []).reduce<Record<number, { n: number; company: string; decision: string; split: string; criteria: Set<string> }>>(
      (acc, p) => {
        acc[p.memo_n] ??= { n: p.memo_n, company: p.company, decision: p.decision, split: p.split, criteria: new Set() };
        (p.criteria as string[]).forEach((c) => acc[p.memo_n].criteria.add(c));
        return acc;
      },
      {},
    ),
  );
  const canApprove = can.approveThesis(actor.role);

  return (
    <div className="rise mx-auto max-w-[1400px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">All In Capital · Internal</div>
          <h1 className="mt-3 text-[40px] leading-[1.05] md:text-[60px]">The <em className="text-accent">Thesis</em> Card</h1>
          <p className="mt-3 text-[15px] text-muted">What every application is scored against. Internal only. Never shared with founders.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-brass/70 px-3.5 py-1 text-[12px] tracking-[0.12em] text-brass uppercase">
            Version {card.version} · {card.status === "approved" ? "Approved" : "Draft"}
          </span>
          <button
            disabled
            title={canApprove ? "Approve unlocks after the back test runs on this version (milestone M5)." : "Only Kushal can approve a version."}
            className="rounded-full border border-border px-4 py-1.5 text-muted"
          >
            Approve
          </button>
        </div>
      </div>
      <div className="hairline mt-6" />
      {card.note ? <p className="mt-6 max-w-4xl border-l border-brass pl-4 font-display text-[18px] leading-snug text-muted italic">{card.note}</p> : null}

      <section className="mt-12">
        <h2 className="text-[26px] leading-tight">Criteria</h2>
        <p className="mt-1 text-muted">
          Each criterion is rated 0 to 4. A missing fact counts as 1, so it pulls the score down. The two weight columns are the two lenses.
        </p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead className="text-left text-muted">
              <tr className="border-b border-border">
                <th className="px-3 py-2">Criterion</th>
                <th className="px-3 py-2">What it means</th>
                <th className="px-3 py-2 text-right">Public</th>
                <th className="px-3 py-2 text-right">Revealed</th>
              </tr>
            </thead>
            <tbody>
              {criteria.map((c) => (
                <tr key={c.id} className="border-b border-border align-top last:border-0">
                  <td className="px-3 py-3">
                    <div className="font-mono text-muted">{c.id}</div>
                    <div className="font-display text-[17px]">{c.name}</div>
                    {c.deal_breaker ? (
                      <span className="mt-1 inline-block rounded-full border border-flag/50 px-2 text-[12px] text-flag">Can rule out</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <p>{c.meaning}</p>
                    <details className="mt-2 text-muted">
                      <summary className="cursor-pointer text-accent">How it is rated, and where it comes from</summary>
                      <p className="mt-2"><span className="font-medium text-go">4 Strong:</span> {c.rate_4}</p>
                      <p className="mt-1"><span className="font-medium text-flag">0 Fails:</span> {c.rate_0}</p>
                      <p className="mt-1">Sources: {c.sources.join(", ")}</p>
                    </details>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{pct(wPub[c.id])}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{pct(wRev[c.id])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-muted">
          Public lens: {String(wPub._reading)} Revealed lens: {String(wRev._reading)}
        </p>
      </section>

      <section className="mt-12 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-[26px] leading-tight">Rules that override the score</h2>
          <ul className="mt-2 space-y-2">
            {(card.hard_flags as { id: string; when: string; effect: string; note: string }[]).map((f) => (
              <li key={f.id}>
                <span className="font-medium">{f.when}</span>
                <span className="text-muted"> → {f.effect.replace("_", " ").toUpperCase()}. {f.note}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-muted">
            GO from a weighted score of {card.thresholds.go_min}. PASS at or below {card.thresholds.pass_max}. In between, a person decides.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-[26px] leading-tight">Partner rules</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {(card.partner_rules as string[]).map((r) => <li key={r}>{r}</li>)}
          </ul>
          <h3 className="mt-5 text-[18px]">Pending rule corrections</h3>
          <p className="text-muted">None yet. Riya&apos;s rule corrections will collect here for Kushal (milestone M4).</p>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-[26px] leading-tight">What the fund says publicly</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface p-6">
            <h3 className="font-display text-[17px]">Found</h3>
            <ul className="mt-2 space-y-2">
              {register.findings.map((f) => (
                <li key={f.topic}>
                  <span className="font-medium">{f.topic}.</span> {f.says}{" "}
                  {f.sources.map((s) => (
                    <a key={s} href={register.sources[s]} target="_blank" rel="noreferrer" className="mr-1 text-accent underline">{s}</a>
                  ))}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-needs-human/50 bg-surface p-6">
            <h3 className="font-display text-[17px]">Not found, and what it costs</h3>
            <ul className="mt-2 space-y-2">
              {register.gaps.map((g) => (
                <li key={g.item}>
                  <span className="font-medium">{g.item}</span> <span className="text-muted">({g.status})</span>. {g.cost}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-12 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-[26px] leading-tight">Portfolio ({portfolio?.length ?? 0})</h2>
          <p className="mt-1 text-muted">Every application is checked against this list. Kushal must confirm the full list of about 80.</p>
          <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto pr-2">
            {(portfolio ?? []).map((p) => (
              <li key={p.name} className="flex items-baseline justify-between gap-3 border-b border-border py-1 last:border-0">
                <span>
                  <span className="font-medium">{p.name}</span> <span className="text-muted">{p.sector}</span>
                </span>
                <span className={p.confirmed ? "text-go" : "text-muted"}>{p.confirmed ? "Confirmed" : "Unconfirmed"}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-[26px] leading-tight">Memo passages ({passages?.length ?? 0})</h2>
          <p className="mt-1 text-muted">Scoring pulls only the few passages that match a criterion. The test set is never used to shape the card.</p>
          <ul className="mt-3 space-y-1">
            {memos.map((m) => (
              <li key={m.n} className="flex items-baseline justify-between gap-3 border-b border-border py-1 last:border-0">
                <span>
                  <span className="font-medium">{m.company}</span>{" "}
                  <span className={m.decision === "invested" ? "text-go" : "text-pass"}>{m.decision}</span>
                </span>
                <span className="text-muted">
                  {m.split === "test" ? "held out · " : ""}
                  {CRITERIA.filter((c) => m.criteria.has(c)).join(" ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
