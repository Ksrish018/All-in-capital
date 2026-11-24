import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { pool } from "@/lib/db";

const CALL_NAME: Record<string, string> = {
  A0: "Portfolio check", A1: "Extract facts", A2: "Read research and compare", A3: "Score criteria", A4: "Summary and back test notes", A5: "Draft emails", A6: "Read replies",
};
const CALL_HUE: Record<string, string> = {
  A0: "bg-pewter", A1: "bg-topaz", A2: "bg-sapphire", A3: "bg-ruby", A4: "bg-gold", A5: "bg-emerald", A6: "bg-amethyst",
};
const usd = (x: number) => `$${x.toFixed(x < 1 ? 3 : 2)}`;
const inr = (x: number) => `₹${Math.round(x).toLocaleString("en-IN")}`;

/** Riya's screening time, priced as in Lecture 8: about ₹50,000 for 100 applications at 30 minutes each. */
const RIYA_INR_PER_APPLICATION = 500;

/** The first day of this month in India, where the fund works. */
function startOfIndiaMonth(now: number): Date {
  const india = new Date(now + 330 * 60_000);
  return new Date(Date.UTC(india.getUTCFullYear(), india.getUTCMonth(), 1) - 330 * 60_000);
}

/** One clock for the page, read with the data. */
async function readClock() {
  return Date.now();
}

/** Cost (PRD 13.12): spend against the daily cap, and where it goes. */
export default async function CostPage() {
  const db = createAdminClient();
  const now = await readClock();
  const monthStart = startOfIndiaMonth(now);
  const since = new Date(Math.min(now - 31 * 86_400_000, monthStart.getTime())).toISOString();
  // Summed in the database. Reading the rows instead stops at the API's 1,000 row limit and under-counts busy days.
  const [{ rows: groups }, { data: cap }, { data: apps }, { count: paused }, { data: rate }] = await Promise.all([
    pool().query<{ day: string; call_type: string; bt: boolean; cached: boolean; cost: number; n: number }>(
      `select ((created_at at time zone 'Asia/Kolkata')::date)::text as day, call_type, run_id is not null as bt,
              status = 'cached' as cached, coalesce(sum(cost_usd), 0)::float8 as cost, count(*)::int as n
         from public.llm_calls where created_at >= $1 group by 1, 2, 3, 4`,
      [since],
    ),
    db.from("settings").select("value").eq("key", "daily_cost_cap_usd").maybeSingle(),
    db.from("applications").select("id, company_name, cost_usd, status").order("cost_usd", { ascending: false }),
    db.from("applications").select("id", { count: "exact", head: true }).eq("status", "paused_cost_cap"),
    db.from("settings").select("value").eq("key", "inr_per_usd").maybeSingle(),
  ]);
  const inrPerUsd = Number(rate?.value ?? 85);
  const capUsd = Number(cap?.value ?? 5);
  const indiaDate = (ms: number) => new Date(ms + 330 * 60_000).toISOString().slice(0, 10);
  const todayDate = indiaDate(now);
  const weekFrom = indiaDate(now - 6 * 86_400_000);
  const monthFrom = indiaDate(monthStart.getTime());
  const rows = groups.map((g) => ({ ...g, cost: Number(g.cost) }));
  const sum = (xs: { cost: number }[]) => xs.reduce((s, x) => s + x.cost, 0);
  const today = sum(rows.filter((r) => r.day === todayDate));
  const week = sum(rows.filter((r) => r.day >= weekFrom));
  const monthRows = rows.filter((r) => r.day >= monthFrom);
  const month = sum(monthRows);
  const reused = monthRows.filter((r) => r.cached).reduce((s, r) => s + r.n, 0);
  const byDay = [...rows.reduce((m, r) => m.set(r.day, (m.get(r.day) ?? 0) + r.cost), new Map<string, number>())].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);
  const byType = [...monthRows.reduce((m, r) => m.set(r.call_type, (m.get(r.call_type) ?? 0) + r.cost), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const scored = (apps ?? []).filter((a) => Number(a.cost_usd) > 0);
  const avgApp = scored.length ? scored.reduce((s, a) => s + Number(a.cost_usd), 0) / scored.length : 0;
  const maxApp = scored[0];
  const backtests = sum(rows.filter((r) => r.bt));
  const used = Math.min(1, today / capUsd);

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="rise">
        <div className="eyebrow">All In Capital · Spend</div>
        <h1 className="mt-3 text-[40px] leading-[1.05] md:text-[56px]">Cost</h1>
      </div>
      <div className="hairline mt-6" />

      <section aria-label="Today against the cap" className={`panel mt-8 p-6 ${used >= 1 ? "border-flag" : ""}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="eyebrow">Today against the daily cap · resets at midnight India time</div>
          <Link href="/settings" className="text-[12px] text-brass hover:underline">Cap: {usd(capUsd)} · change in Settings</Link>
        </div>
        <div className="mt-3 font-display text-[48px] leading-none tabular-nums">{usd(today)}<span className="text-[20px] text-muted"> of {usd(capUsd)}</span></div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${Math.round(used * 100)} percent of the cap used`}>
          <div className="grow h-full rounded-full" style={{ width: `${Math.max(2, used * 100)}%`, background: used >= 1 ? "var(--flag)" : "linear-gradient(90deg, var(--emerald), var(--topaz) 70%, var(--ruby))", backgroundSize: `${100 / Math.max(used, 0.02)}% 100%` }} />
        </div>
        {paused ? <p className="mt-3 text-[13px] text-flag">{paused} application{paused === 1 ? " is" : "s are"} paused by the cap. They resume tomorrow, or as soon as Kushal raises it.</p> : null}
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-4">
        {[
          ["Last 7 days", usd(week)],
          [`This month (${monthStart.toLocaleDateString("en-IN", { month: "long", timeZone: "Asia/Kolkata" })})`, usd(month)],
          ["Average per application", scored.length ? usd(avgApp) : "–"],
          ["Highest application", maxApp ? `${usd(Number(maxApp.cost_usd))}` : "–"],
        ].map(([k, v]) => (
          <div key={k} className="panel p-5">
            <div className="eyebrow">{k}</div>
            <div className="mt-2 font-display text-[32px] leading-none tabular-nums">{v}</div>
            {k === "Highest application" && maxApp ? <div className="mt-1 text-[12px] text-muted">{maxApp.company_name}</div> : null}
          </div>
        ))}
      </section>

      <section aria-label="Against Riya's time" className="panel mt-6 p-6">
        <div className="eyebrow">Against Riya&apos;s time · the baseline</div>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <div>
            <div className="font-display text-[32px] leading-none tabular-nums">{scored.length ? inr(avgApp * inrPerUsd) : "–"}</div>
            <div className="mt-1 text-[12px] text-muted">AI cost per application</div>
          </div>
          <div>
            <div className="font-display text-[32px] leading-none tabular-nums">{inr(RIYA_INR_PER_APPLICATION)}</div>
            <div className="mt-1 text-[12px] text-muted">Riya screening by hand, 30 minutes</div>
          </div>
          <div>
            <div className="font-display text-[32px] leading-none tabular-nums">{scored.length ? `${((avgApp * inrPerUsd) / RIYA_INR_PER_APPLICATION * 100).toFixed(1)}%` : "–"}</div>
            <div className="mt-1 text-[12px] text-muted">AI cost as a share of her time. {reused ? `${reused} answers reused from the cache this month, at no cost.` : ""}</div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="panel p-5">
          <div className="eyebrow">By call type</div>
          <ul className="mt-3 space-y-2">
            {byType.map(([t, v]) => (
              <li key={t}>
                <div className="flex justify-between text-[13px]"><span className="flex items-center gap-2"><span className={`size-2 rounded-full ${CALL_HUE[t] ?? "bg-brass"}`} aria-hidden="true" />{t} · {CALL_NAME[t] ?? t}</span><span className="tabular-nums">{usd(v)}</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-surface-2"><div className={`grow h-1.5 rounded-full ${CALL_HUE[t] ?? "bg-brass"}`} style={{ width: `${month ? (v / month) * 100 : 0}%` }} /></div>
              </li>
            ))}
          </ul>
          {backtests ? <p className="mt-3 text-[12px] text-muted">Back tests: {usd(backtests)} in the last 31 days.</p> : null}
        </div>
        <div className="panel p-5">
          <div className="eyebrow">By day</div>
          <ul className="mt-3 divide-y divide-border">
            {byDay.map(([d, v]) => <li key={d} className="flex justify-between py-1.5 text-[13px]"><span>{new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span><span className="tabular-nums">{usd(v)}</span></li>)}
          </ul>
        </div>
        <div className="panel p-5">
          <div className="eyebrow">By application</div>
          <ul className="mt-3 max-h-80 divide-y divide-border overflow-y-auto">
            {scored.map((a) => <li key={a.id} className="flex justify-between py-1.5 text-[13px]"><Link href={`/applications/${a.id}`} className="hover:underline">{a.company_name}</Link><span className="tabular-nums">{usd(Number(a.cost_usd))}</span></li>)}
          </ul>
        </div>
      </section>
      <p className="mt-4 text-[12px] text-muted">These numbers come from token usage in our own records, priced from the model price table, not from the gateway&apos;s estimates. Prices are set on the high side until checked (Q14).</p>
    </div>
  );
}
