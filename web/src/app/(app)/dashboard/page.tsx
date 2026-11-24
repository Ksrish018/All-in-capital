import { createAdminClient } from "@/lib/supabase/server";
import { STOP, avg, blindAgreement, byWeek, emailEdits, weekOf, overrideRate, overrideStop, reviewStop, share, type Gate1, type SentEmail } from "@/lib/metrics";
import { editClass } from "@/lib/outreach/checks";

const pct = (x: number | null) => (x === null ? "none yet" : `${Math.round(x * 100)}%`);
const fmtWeek = (w: string) => new Date(w).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** Each metric keeps its own jewel tone, so the eye finds it again next week. */
function Tile({ label, value, sub, bad, hue = "text-gold" }: { label: string; value: string; sub: string; bad?: boolean; hue?: string }) {
  return (
    <div className={`panel lift relative overflow-hidden p-5 ${bad ? "border-flag/60" : ""}`}>
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-[3px] bg-current ${bad ? "text-flag" : hue}`} />
      <div className="eyebrow">{label}</div>
      <div className={`mt-2 font-display text-[40px] leading-none tabular-nums ${bad ? "text-flag" : hue}`}>{value}</div>
      <p className="mt-2 text-[12px] text-muted">{sub}</p>
    </div>
  );
}

/** Dashboard (PRD 13.11): the metrics Kushal reads, and the stop list. */
export default async function DashboardPage() {
  const db = createAdminClient();
  const [{ data: g1 }, { data: apps }, { data: outreach }, { data: calls }, { data: card }, { data: badRefs }, { data: sentEmails }, { data: loopRuns }] = await Promise.all([
    db.from("reviews").select("created_at, seconds_spent, agreed_with_system, system_recommendation, decision, blind, blind_first_view").eq("gate", 1),
    db.from("applications").select("id, received_at, brief_ready_at, status"),
    db.from("outreach").select("application_id, first_sent_at, outcome, emails(sent_at)"),
    db.from("call_outcomes").select("worth_it, note, created_at"),
    db.from("thesis_cards").select("version, status, backtest_run_id").order("status", { ascending: true }).order("version", { ascending: false }),
    db.rpc("count_missing_citations").then((r) => r, () => ({ data: null })),
    db.from("emails").select("kind, draft_body, sent_body, sent_at").not("sent_at", "is", null),
    db.from("eval_runs").select("detail, created_at").eq("kind", "loops").order("created_at", { ascending: false }).limit(1),
  ]);
  // The disagreement score for both loops (PRD 24.8): live from Riya's work, and the latest sealed-test baseline.
  const emails = (sentEmails ?? []) as SentEmail[];
  const edits = emailEdits(emails, editClass);
  const firstEmails = emailEdits(emails.filter((e) => e.kind === "invite"), editClass);
  const latestLoops = (loopRuns?.[0]?.detail ?? null) as null | {
    loop2?: { a5_current: { n: number; three_checks: number } };
    loop1?: { n: number; ours_agree: number; old_agree: number };
  };
  const reviews = (g1 ?? []) as Gate1[];

  // Review minutes and override rate, by week.
  const weeks = [...byWeek(reviews, (r) => r.created_at).entries()];
  const weekly = weeks.map(([w, rs]) => ({
    w, n: rs.length,
    minutes: avg(rs.filter((r) => r.seconds_spent).map((r) => (r.seconds_spent ?? 0) / 60)),
    override: overrideRate(rs),
    emails: emailEdits(emails.filter((e) => e.sent_at && weekOf(e.sent_at) === w), editClass),
  }));
  const allMinutes = avg(reviews.filter((r) => r.seconds_spent).map((r) => (r.seconds_spent ?? 0) / 60));

  // Time from arrival to brief ready.
  const timed = (apps ?? []).filter((a) => a.brief_ready_at).map((a) => (new Date(a.brief_ready_at!).getTime() - new Date(a.received_at).getTime()) / 3_600_000);
  const within24 = share(timed.filter((h) => h <= STOP.briefHours).length, timed.length);

  // The public promise: every applicant hears back within 3 days.
  const decided = (apps ?? []).filter((a) => ["signed_off_go", "signed_off_pass"].includes(a.status));
  const firstSent = new Map((outreach ?? []).map((o) => {
    const sent = ((o.emails ?? []) as { sent_at: string | null }[]).map((e) => e.sent_at).filter(Boolean).sort()[0];
    return [o.application_id, sent ?? null] as const;
  }));
  const heard = decided.filter((a) => {
    const s = firstSent.get(a.id);
    return s && (new Date(s).getTime() - new Date(a.received_at).getTime()) / 86_400_000 <= STOP.replyDays;
  }).length;

  const blind = blindAgreement(reviews);
  const worth = share((calls ?? []).filter((c) => c.worth_it).length, (calls ?? []).length);

  // The stop list (PRD 2.5).
  const current = (card ?? []).find((c) => c.status === "approved") ?? (card ?? [])[0];
  const { data: bt } = current?.backtest_run_id ? await db.from("backtest_results").select("real_decision, rec_revealed, ratings").eq("run_id", current.backtest_run_id) : { data: null };
  const n1 = bt ? bt.filter((r) => r.real_decision === "invested" && r.rec_revealed === "pass" && !Object.values(r.ratings as Record<string, number>).some((v) => v === 0)).length : null;
  const lights = [
    { label: "Back test: funded company marked PASS with no flag", red: n1 === null ? null : n1 > 0, note: n1 === null ? "No back test on the card in use" : `${n1} on v${current?.version}` },
    { label: "A citation that does not exist", red: badRefs === null ? null : Number(badRefs) > 0, note: badRefs === null ? "Checked by npm run eval" : `${badRefs} found` },
    { label: "Riya overrides more than 40% two weeks running", red: overrideStop(weekly.map((w) => w.override)), note: `Latest week ${pct(weekly.at(-1)?.override ?? null)}` },
    { label: "Review time above 15 minutes after three weeks", red: reviewStop(weekly.map((w) => w.minutes)), note: `Latest week ${weekly.at(-1)?.minutes?.toFixed(1) ?? "none"} min` },
  ];


  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="rise">
        <div className="eyebrow">All In Capital · How it is going</div>
        <h1 className="mt-3 text-[40px] leading-[1.05] md:text-[56px]">Dash<em className="text-accent">board</em></h1>
      </div>
      <div className="hairline mt-6" />

      <section aria-label="Stop list" className="mt-8">
        <div className="eyebrow">Stop list · any red light stops the rollout</div>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          {lights.map((l) => (
            <div key={l.label} className="panel flex items-start gap-3 p-4">
              <span aria-hidden="true" className={`mt-1 size-3 shrink-0 rounded-full ${l.red === null ? "bg-border-strong" : `glow-dot ${l.red ? "text-flag" : "text-go"}`}`} />
              <div>
                <div className="text-[13px]">{l.label}</div>
                <div className={`text-[12px] ${l.red ? "text-flag" : "text-muted"}`}>{l.red === null ? "Not measured yet. " : l.red ? "Red. " : "Green. "}{l.note}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Metrics" className="mt-8 grid gap-4 md:grid-cols-3">
        <Tile hue="text-sapphire" label="Review minutes per application" value={allMinutes === null ? "–" : allMinutes.toFixed(1)} sub={`Target about 5. Stop line ${STOP.reviewMinutes}. From ${reviews.length} reviews.`} bad={(allMinutes ?? 0) > STOP.reviewMinutes} />
        <Tile hue="text-emerald" label="Brief ready within 24 hours" value={pct(within24)} sub={`Target 100%. Median ${timed.length ? [...timed].sort((a, b) => a - b)[Math.floor(timed.length / 2)].toFixed(1) : "–"} hours from arrival.`} bad={within24 !== null && within24 < 1} />
        <Tile hue="text-gold" label="Heard back within 3 days" value={decided.length ? pct(share(heard, decided.length)) : "–"} sub={`The fund's public promise. ${heard} of ${decided.length} decided applicants.`} bad={decided.length > 0 && heard < decided.length} />
        <Tile hue="text-ruby" label="Override rate" value={pct(overrideRate(reviews))} sub="Riya choosing differently from a system that took a side. Stop line 40%." bad={(overrideRate(reviews) ?? 0) > STOP.overrideRate} />
        <Tile hue="text-amethyst" label="Blind check agreement" value={blind.of ? `${blind.matched}/${blind.of}` : "–"} sub={`Riya's own first view matched the system. ${blind.changedAfterReveal} changed after the reveal.`} />
        <Tile hue="text-sapphire" label="Loop 1 disagreement · screening" value={pct(overrideRate(reviews))} sub={`Riya overturning a call the system made. Target under 10%. Sealed test: ${latestLoops?.loop1 ? `ours ${latestLoops.loop1.ours_agree}/${latestLoops.loop1.n} agree, old ${latestLoops.loop1.old_agree}/${latestLoops.loop1.n}` : "not run yet (npm run eval:loops)"}.`} bad={(overrideRate(reviews) ?? 0) > 0.1 && reviews.length >= 10} />
        <Tile hue="text-emerald" label="Loop 2 disagreement · emails" value={edits.n ? pct(edits.rewriteRate) : "–"} sub={`Share of sent emails Riya rewrote (${edits.kept} kept, ${edits.small} small edits, ${edits.rewrite} rewrites${firstEmails.n !== edits.n ? `; first emails ${firstEmails.rewrite}/${firstEmails.n}` : ""}). Target under 10%. Sealed test: ${latestLoops?.loop2 ? `${latestLoops.loop2.a5_current.three_checks}/${latestLoops.loop2.a5_current.n} pass the three checks` : "not run yet"}.`} bad={(edits.rewriteRate ?? 0) > 0.1 && edits.n >= 10} />
        <Tile hue="text-topaz" label="Calls worth 30 minutes" value={pct(worth)} sub={`The world signal, from ${(calls ?? []).length} calls. Read weekly.`} />
      </section>

      <section aria-label="By week" className="mt-8">
        <div className="eyebrow">By week</div>
        {weekly.length === 0 ? <p className="mt-2 text-muted">No reviews yet.</p> : (
          <div className="panel mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead className="text-left text-muted">
                <tr className="border-b border-border"><th className="px-4 py-2.5 font-normal">Week of</th><th className="px-4 py-2.5 font-normal">Reviews</th><th className="px-4 py-2.5 font-normal">Minutes each</th><th className="px-4 py-2.5 font-normal">Override rate</th><th className="px-4 py-2.5 font-normal">Emails rewritten</th></tr>
              </thead>
              <tbody>
                {weekly.map((w) => (
                  <tr key={w.w} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">{fmtWeek(w.w)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{w.n}</td>
                    <td className={`px-4 py-2.5 tabular-nums ${(w.minutes ?? 0) > STOP.reviewMinutes ? "text-flag" : ""}`}>{w.minutes?.toFixed(1) ?? "–"}</td>
                    <td className={`px-4 py-2.5 tabular-nums ${(w.override ?? 0) > STOP.overrideRate ? "text-flag" : ""}`}>
                      <div className="flex items-center gap-3">
                        <span className="min-w-16 whitespace-nowrap">{pct(w.override)}</span>
                        <span className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                          <span className={`grow block h-full rounded-full ${(w.override ?? 0) > STOP.overrideRate ? "bg-flag" : "bg-ruby/80"}`} style={{ width: `${Math.round((w.override ?? 0) * 100)}%` }} />
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{w.emails.n ? `${w.emails.rewrite} of ${w.emails.n}` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
