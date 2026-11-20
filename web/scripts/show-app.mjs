// Prints what screening produced for each application: calls, brief, scores, evidence and research.
// Usage: node scripts/show-app.mjs [Company]
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import nextEnv from "@next/env";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
nextEnv.loadEnvConfig(root);
const ref = new URL(process.env.SUPABASE_URL).hostname.split(".")[0];
const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: 5432, user: `postgres.${ref}`,
  password: process.env.SUPABASE_DB_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false },
});
await c.connect();
const who = process.argv[2] ?? null;
const apps = (await c.query("select id, company_name, status, status_reason, cost_usd from applications where ($1::text is null or company_name = $1) order by company_name", [who])).rows;
for (const a of apps) {
  console.log(`\n=== ${a.company_name}  ${a.status}  $${Number(a.cost_usd).toFixed(4)}  ${a.status_reason ?? ""}`);
  const calls = (await c.query("select call_type, status, error from llm_calls where application_id = $1 order by created_at", [a.id])).rows;
  console.log("calls:", calls.map((x) => `${x.call_type}${x.status === "ok" ? "" : `(${x.status}: ${x.error})`}`).join(" "));
  const b = (await c.query("select * from briefs where application_id = $1", [a.id])).rows[0];
  if (b) {
    console.log(`rec: public=${b.rec_public} revealed=${b.rec_revealed} scores=${JSON.stringify({ p: b.scores?.public?.score, r: b.scores?.revealed?.score })} aditya=${b.aditya_on_call}`);
    if (b.lens_note) console.log("lens:", b.lens_note);
    console.log("summary:", b.summary);
    console.log("flags:", (b.flags ?? []).map((f) => f.id).join(", "));
    for (const x of b.inconsistencies ?? []) console.log(`  gap: ${x.field} form="${x.form}" deck="${x.deck}" ${x.gap_percent ?? ""}`);
    for (const g of b.gaps ?? []) console.log(`  missing: ${g.item}. ${g.note}`);
    for (const s of b.call_only_signals ?? []) console.log(`  call: ${s}`);
  }
  const sc = (await c.query("select criterion_id, rating, strength, reason, capped_note from criterion_scores where application_id = $1 order by length(criterion_id), criterion_id", [a.id])).rows;
  for (const s of sc) console.log(`  ${s.criterion_id} ${s.rating} ${s.strength.padEnd(12)} ${s.reason.slice(0, 120)}${s.capped_note ? " [capped]" : ""}`);
  const ev = (await c.query("select track, strength, count(*)::int n from evidence where application_id = $1 group by 1, 2 order by 1, 2", [a.id])).rows;
  console.log("evidence:", ev.map((e) => `t${e.track}:${e.strength}=${e.n}`).join(" "));
  const web = (await c.query("select check_id, strength, quote from evidence where application_id = $1 and track = '2'", [a.id])).rows;
  for (const w of web) console.log(`  web ${w.check_id} ${w.strength}: "${(w.quote ?? "").slice(0, 80)}"`);
  const fx = (await c.query("select check_id, outcome, error from research_fetches where application_id = $1 and outcome <> 'filled'", [a.id])).rows;
  for (const f of fx) console.log(`  fetch ${f.check_id} ${f.outcome} ${f.error ?? ""}`);
}
await c.end();
