import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { startOfIndiaDay } from "@/lib/ai/gemini";

const CALL_NAME: Record<string, string> = {
  A0: "Portfolio check", A1: "Extract facts", A2: "Read research and compare", A3: "Score criteria", A4: "Summary and back test notes", A5: "Draft emails", A6: "Read replies",
};
const usd = (x: number) => `$${x.toFixed(x < 1 ? 3 : 2)}`;

/** One clock for the page, read with the data. */
async function readClock() {
  return Date.now();
}

/** Cost (PRD 13.12): spend against the daily cap, and where it goes. */
export default async function CostPage() {
  const db = createAdminClient();
  const now = await readClock();
  const since = new Date(now - 31 * 86_400_000).toISOString();
  const [{ data: calls }, { data: cap }, { data: apps }, { count: paused }] = await Promise.all([
    db.from("llm_calls").select("call_type, cost_usd, created_at, application_id, run_id").gte("created_at", since),
    db.from("settings").select("value").eq("key", "daily_cost_cap_usd").maybeSingle(),
    db.from("applications").select("id, company_name, cost_usd, status").order("cost_usd", { ascending: false }),
    db.from("applications").select("id", { count: "exact", head: true }).eq("status", "paused_cost_cap"),
  ]);
  const capUsd = Number(cap?.value ?? 5);
  const startOfDay = startOfIndiaDay(now);
  const rows = (calls ?? []).map((c) => ({ ...c, cost: Number(c.cost_usd) }));
  const sum = (xs: { cost: number }[]) => xs.reduce((s, x) => s + x.cost, 0);
  const today = sum(rows.filter((r) => new Date(r.created_at) >= startOfDay));
  const week = sum(rows.filter((r) => new Date(r.created_at).getTime() >= now - 7 * 86_400_000));
  const month = sum(rows);
  const indiaDate = (iso: string) => new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 10);
  const byDay = [...rows.reduce((m, r) => m.set(indiaDate(r.created_at), (m.get(indiaDate(r.created_at)) ?? 0) + r.cost), new Map<string, number>())].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);
  const byType = [...rows.reduce((m, r) => m.set(r.call_type, (m.get(r.call_type) ?? 0) + r.cost), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const scored = (apps ?? []).filter((a) => Number(a.cost_usd) > 0);
  const avgApp = scored.length ? scored.reduce((s, a) => s + Number(a.cost_usd), 0) / scored.length : 0;
  const maxApp = scored[0];
  const backtests = sum(rows.filter((r) => r.run_id));
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
          <div className={`h-full rounded-full ${used >= 1 ? "bg-flag" : used > 0.8 ? "bg-needs-human" : "bg-go"}`} style={{ width: `${Math.max(2, used * 100)}%` }} />
        </div>
        {paused ? <p className="mt-3 text-[13px] text-flag">{paused} application{paused === 1 ? " is" : "s are"} paused by the cap. They resume tomorrow, or as soon as Kushal raises it.</p> : null}
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-4">
        {[
          ["Last 7 days", usd(week)],
          ["Last 31 days", usd(month)],
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

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="panel p-5">
          <div className="eyebrow">By call type</div>
          <ul className="mt-3 space-y-2">
            {byType.map(([t, v]) => (
              <li key={t}>
                <div className="flex justify-between text-[13px]"><span>{t} · {CALL_NAME[t] ?? t}</span><span className="tabular-nums">{usd(v)}</span></div>
                <div className="mt-1 h-1 rounded-full bg-surface-2"><div className="h-1 rounded-full bg-brass" style={{ width: `${month ? (v / month) * 100 : 0}%` }} /></div>
              </li>
            ))}
          </ul>
          {backtests ? <p className="mt-3 text-[12px] text-muted">Back tests: {usd(backtests)} of the month.</p> : null}
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
