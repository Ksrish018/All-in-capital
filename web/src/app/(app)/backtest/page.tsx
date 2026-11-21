import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { currentActor } from "@/lib/actor";
import { BacktestActions, VerdictEditor } from "./actions";

const REC: Record<string, string> = { go: "GO", pass: "PASS", needs_human: "Needs a person", hold: "Hold" };
const TONE: Record<string, string> = { go: "text-go", pass: "text-pass", needs_human: "text-needs-human", hold: "text-hold" };
const VERDICT: Record<string, string> = { fund_likely_wrong: "Fund likely wrong", system_likely_wrong: "System likely wrong", too_early: "Too early to tell" };

type Row = {
  id: string; company: string; split: "build" | "test"; real_decision: "invested" | "passed"; rec_public: string; rec_revealed: string;
  agrees: boolean; score_revealed: number; ratings: Record<string, number>; explanation: string | null; verdict: string | null;
  verdict_reason: string | null; kushal_note: string | null; reasons: Record<string, string>;
};

/** The back test (PRD 13.10): the memo companies scored as they looked at decision time, with research off. */
export default async function BacktestPage({ searchParams }: PageProps<"/backtest">) {
  const actor = await currentActor();
  const db = createAdminClient();
  const { data: cards } = await db.from("thesis_cards").select("id, version, status, backtest_run_id, approved_at, note").order("version", { ascending: false });
  const sp = await searchParams;
  const card = cards?.find((c) => String(c.version) === sp.version) ?? cards?.[0];
  const { data: rowsRaw } = card?.backtest_run_id
    ? await db.from("backtest_results").select("*").eq("run_id", card.backtest_run_id).order("split").order("real_decision", { ascending: false })
    : { data: [] };
  const rows = (rowsRaw ?? []) as Row[];
  const { data: calls } = card?.backtest_run_id ? await db.from("llm_calls").select("call_type, cost_usd, input_tokens, output_tokens").eq("run_id", card.backtest_run_id) : { data: [] };
  const fails = (r: Row) => Object.entries(r.ratings).filter(([, v]) => v === 0).map(([k]) => k);
  const n1 = rows.filter((r) => r.real_decision === "invested" && r.rec_revealed === "pass" && fails(r).length === 0);
  const flaggedFunded = rows.filter((r) => r.real_decision === "invested" && r.rec_revealed === "pass" && fails(r).length > 0);
  const byType = Object.entries(
    (calls ?? []).reduce<Record<string, { n: number; cost: number }>>((acc, c) => {
      acc[c.call_type] ??= { n: 0, cost: 0 };
      acc[c.call_type].n++;
      acc[c.call_type].cost += Number(c.cost_usd);
      return acc;
    }, {}),
  ).sort((a, b) => b[1].cost - a[1].cost);
  const total = byType.reduce((s, [, v]) => s + v.cost, 0);
  const agreement = (split: "build" | "test", lens: "rec_public" | "rec_revealed") => {
    const set = rows.filter((r) => r.split === split);
    return { n: set.filter((r) => r[lens] === (r.real_decision === "invested" ? "go" : "pass")).length, of: set.length };
  };

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">All In Capital · Loop A</div>
          <h1 className="mt-3 text-[40px] leading-[1.05] md:text-[56px]">Back <em className="text-accent">test</em></h1>
          <p className="mt-3 max-w-3xl text-[15px] text-muted">
            The twelve memo companies, scored only on what the fund knew at decision time: the memo without its decision section, with research switched off.
            Live research would find the winners by hindsight.
          </p>
        </div>
        <div className="segmented" role="tablist" aria-label="Thesis Card version">
          {(cards ?? []).map((c) => (
            <Link key={c.id} href={`/backtest?version=${c.version}`} role="tab" aria-selected={c.id === card?.id}>
              v{c.version} · {c.status}
            </Link>
          ))}
        </div>
      </div>
      <div className="hairline mt-6" />

      {card ? (
        <BacktestActions version={card.version} status={card.status} canRun={actor.role === "kushal"} hasRun={rows.length > 0} n1={n1.length} />
      ) : null}
      {card?.note ? <p className="mt-4 max-w-4xl border-l border-brass pl-4 font-display text-[17px] leading-snug text-muted italic">{card.note}</p> : null}

      {rows.length === 0 ? (
        <div className="panel mt-8 px-6 py-12 text-center">
          <div className="font-display text-[28px]">No back test on this version yet</div>
          <p className="mt-2 text-muted">Run it before this version can be approved.</p>
        </div>
      ) : (
        <>
          <section aria-label="Totals" className="mt-8 grid gap-4 md:grid-cols-4">
            <div className={`panel p-5 ${n1.length ? "border-flag" : ""}`}>
              <div className="eyebrow">Funded, marked PASS, no flag</div>
              <div className={`mt-2 font-display text-[52px] leading-none ${n1.length ? "text-flag" : "text-go"}`}>{n1.length}</div>
              <p className="mt-2 text-[12px] text-muted">Must be zero (N1).{flaggedFunded.length ? ` ${flaggedFunded.length} more marked PASS with a failing criterion shown.` : ""}</p>
            </div>
            {(["build", "test"] as const).map((split) => (
              <div key={split} className="panel p-5">
                <div className="eyebrow">{split === "build" ? "Build set" : "Held-out test set"}</div>
                <div className="mt-2 flex items-baseline gap-4">
                  <span className="font-display text-[40px] leading-none tabular-nums">{agreement(split, "rec_revealed").n}<span className="text-[20px] text-muted">/{agreement(split, "rec_revealed").of}</span></span>
                  <span className="text-[12px] text-muted">revealed lens</span>
                </div>
                <p className="mt-2 text-[12px] text-muted">Public lens: {agreement(split, "rec_public").n} of {agreement(split, "rec_public").of}. Agreement means GO for an investment and PASS for a pass.</p>
              </div>
            ))}
            <div className="panel p-5">
              <div className="eyebrow">Cost of this run</div>
              <div className="mt-2 font-display text-[40px] leading-none tabular-nums">${total.toFixed(2)}</div>
              <ul className="mt-2 space-y-0.5 text-[12px] text-muted">
                {byType.map(([t, v]) => <li key={t} className="flex justify-between"><span>{t} × {v.n}</span><span className="tabular-nums">${v.cost.toFixed(3)}</span></li>)}
              </ul>
              <p className="mt-2 text-[11px] text-muted">From token usage in our own records, not the gateway&apos;s estimates.</p>
            </div>
          </section>

          <section aria-label="Results" className="mt-8">
            <div className="eyebrow">Company by company</div>
            <div className="panel mt-3 overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-[13px]">
                <thead className="text-left text-muted">
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 font-normal">Company</th>
                    <th className="px-4 py-3 font-normal">Fund</th>
                    <th className="px-4 py-3 font-normal">Public</th>
                    <th className="px-4 py-3 font-normal">Revealed</th>
                    <th className="px-4 py-3 font-normal">Fails on evidence</th>
                    <th className="px-4 py-3 font-normal">Why, and the verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border align-top last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-display text-[17px]">{r.company}</div>
                        <div className="text-[11px] text-muted">{r.split === "test" ? "held out" : "build set"} · score {Number(r.score_revealed).toFixed(2)}</div>
                      </td>
                      <td className="px-4 py-3">{r.real_decision === "invested" ? <span className="text-go">Invested</span> : <span className="text-pass">Passed</span>}</td>
                      <td className={`px-4 py-3 ${TONE[r.rec_public]}`}>{REC[r.rec_public]}</td>
                      <td className={`px-4 py-3 ${TONE[r.rec_revealed]}`}>{REC[r.rec_revealed]}{r.agrees ? <span className="ml-1 text-go">✓</span> : null}</td>
                      <td className="px-4 py-3 text-[12px]">
                        {fails(r).length ? fails(r).map((c) => <div key={c} className="text-flag">{c}: <span className="text-muted">{(r.reasons[c] ?? "").slice(0, 80)}</span></div>) : <span className="text-muted">none</span>}
                      </td>
                      <td className="px-4 py-3">
                        {r.agrees ? <span className="text-[12px] text-muted">Agrees with the fund.</span> : (
                          <>
                            {r.explanation ? <p className="text-[12.5px]">{r.explanation}</p> : null}
                            <VerdictEditor id={r.id} verdict={r.verdict ?? "too_early"} note={r.kushal_note ?? ""} reason={r.verdict_reason} canEdit={actor.role === "kushal"} labels={VERDICT} />
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 max-w-4xl text-[12px] text-muted">
              A memo is a partner&apos;s notes, not an application, so criteria it never discusses are left out of the score here rather than counted as missing. Short memos rarely give
              the outside evidence a Strong rating needs, so few memo companies can reach GO. The verdict is the only place hindsight is allowed, and it is labelled as hindsight.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
