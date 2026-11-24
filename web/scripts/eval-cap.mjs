// The daily cost cap (PRD 19.3a, Critical): an application paused mid-way resumes cleanly from its saved step.
// Sets the cap just above today's spend, screens one generated application, then raises the cap and checks it finishes.
// The original cap is always put back. Usage: npm run eval:cap   (app on localhost:3000)
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import nextEnv from "@next/env";
import { clearUploadCount, refuseOnLive } from "./lib/guard.mjs";
import { createClient } from "@supabase/supabase-js";
import { makeForm, makePdf } from "./lib/pdf.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
nextEnv.loadEnvConfig(root);
refuseOnLive("eval-cap");
const BASE = process.env.APP_URL ?? "http://localhost:3000";
const ref = new URL(process.env.SUPABASE_URL).hostname.split(".")[0];
const db = new pg.Client({ host: process.env.SUPABASE_DB_HOST, port: 5432, user: `postgres.${ref}`, password: process.env.SUPABASE_DB_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false } });
await db.connect();
const q = async (sql, a = []) => (await db.query(sql, a)).rows;
await clearUploadCount(q);
const kick = () => fetch(`${BASE}/api/worker/screening`, { method: "POST", headers: { authorization: `Bearer ${process.env.WORKER_SECRET}` } }).catch(() => {});
const waitFor = async (id, done, tries = 120) => {
  for (let i = 0; i < tries; i++) {
    const a = (await q("select status, last_step, status_reason from applications where id = $1", [id]))[0];
    if (done(a)) return a;
    if (i % 10 === 9) kick();
    await new Promise((r) => setTimeout(r, 3000));
  }
  return (await q("select status, last_step, status_reason from applications where id = $1", [id]))[0];
};

const original = (await q("select value from settings where key = 'daily_cost_cap_usd'"))[0]?.value ?? 5;
// A reused answer costs nothing, so the cap could never trip. The cache is off for this test and put back after.
const cacheBefore = (await q("select value from settings where key = 'answer_cache'"))[0]?.value ?? "on";
await q("update settings set value = '\"off\"' where key = 'answer_cache'");
// The alert fires once a day. Clear today's mark so this run can see it fire (G6).
await q("update settings set value = 'null' where key = 'cap_alert_sent_on'");
const alertsBefore = (await q("select count(*)::int n from events where to_status = 'cost_cap_alert'"))[0].n;
const spent = Number((await q("select coalesce(sum(cost_usd), 0) s from llm_calls where created_at >= date_trunc('day', now() at time zone 'utc')"))[0].s);
const results = [];
const check = (severity, id, title, ok, detail = "") => results.push({ severity, id, title, ok: Boolean(ok), detail });
let id = null;
try {
  // Enough for the cheap checks and extraction, not enough for scoring: the pause lands mid-way.
  await q("update settings set value = $1 where key = 'daily_cost_cap_usd'", [JSON.stringify(Math.round((spent + 0.012) * 1000) / 1000)]);
  const fd = new FormData();
  fd.set("source", "public_form");
  fd.set("consent", "yes");
  fd.set("form", new Blob([makeForm([
    ["Company", [["Company name", "Eval Cap Labs (Eval Cap Labs Pvt. Ltd.)"], ["Website", "www.evalcaplabs.example"], ["Location", "Chennai, Tamil Nadu"], ["One-line description", "Scheduling software for physiotherapy clinics."], ["Sector (as selected)", "Consumer tech"], ["Stage (as selected)", "Pre-seed"]]],
    ["Founders", [["Founder 1", "Tara Menon, CEO. 7 years as a physiotherapist running two clinics."]]],
    ["Product and traction", [["What have you built?", "Booking, reminders and billing for clinics."], ["Customers", "31 paying clinics."], ["Revenue", "MRR INR 1.6 L."]]],
    ["Fundraising", [["Amount raising", "INR 1.5 Cr"], ["Existing investors", "None."]]],
  ])], { type: "application/pdf" }), "EvalCap_Form.pdf");
  fd.set("deck", new Blob([makePdf([[{ x: 60, y: 760, size: 16, text: "Eval Cap Labs: clinics run on us. 31 paying clinics, INR 1.6 L MRR." }]])], { type: "application/pdf" }), "EvalCap_Deck.pdf");
  const res = await fetch(`${BASE}/api/applications`, { method: "POST", body: fd });
  id = (await res.json()).id;

  const paused = await waitFor(id, (a) => !["received", "queued", "parsing", "screening", "extracting", "researching", "scoring"].includes(a.status));
  check("Critical", "CAP1", "The cap pauses the application with a plain reason", paused.status === "paused_cost_cap" && /cost cap/i.test(paused.status_reason ?? ""), `${paused.status} at ${paused.last_step}`);
  check("High", "CAP2", "It paused at a saved step", Boolean(paused.last_step), `last step ${paused.last_step}`);
  const page = await (await fetch(`${BASE}/`)).text();
  check("High", "CAP3", "Every page shows the cap alert", /daily cost cap is reached/i.test(page));
  const callsBefore = (await q("select count(*)::int n from llm_calls where application_id = $1 and status = 'ok'", [id]))[0].n;
  const alerts = (await q("select count(*)::int n from events where to_status = 'cost_cap_alert'"))[0].n - alertsBefore;
  const mark = (await q("select value from settings where key = 'cap_alert_sent_on'"))[0]?.value;
  check("High", "CAP6", "The cap also raises one alert for Kushal and Riya, by email when their addresses are set", alerts === 1 && typeof mark === "string", `${alerts} alert(s) recorded, marked sent on ${mark}`);

  // Raising the cap lets it carry on from where it stopped.
  await fetch(`${BASE}/api/settings`, { method: "POST", headers: { "content-type": "application/json", cookie: "working_as=kushal" }, body: JSON.stringify({ key: "daily_cost_cap_usd", value: Number(original) }) });
  kick();
  const done = await waitFor(id, (a) => a.status === "brief_ready" || a.status === "needs_attention" || a.status === "short_circuited");
  check("Critical", "CAP4", "Raising the cap resumes it to a finished brief", done.status === "brief_ready", `${done.status}: ${done.status_reason ?? ""}`);
  const a1 = (await q("select count(*)::int n from llm_calls where application_id = $1 and call_type = 'A1' and status = 'ok'", [id]))[0].n;
  check("High", "CAP5", "Work done before the pause was not repeated (extraction ran once)", a1 <= 2, `${a1} A1 calls (form and deck), ${callsBefore} calls before the pause`);
} finally {
  await q("update settings set value = $1 where key = 'daily_cost_cap_usd'", [JSON.stringify(original)]);
  await q("update settings set value = $1 where key = 'answer_cache'", [JSON.stringify(cacheBefore)]);
  if (id) {
    const paths = (await q("select storage_path from documents where application_id = $1", [id])).map((r) => r.storage_path);
    await createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } }).storage.from("applications").remove(paths);
    await q("delete from applications where id = $1", [id]);
  }
}
const failed = results.filter((r) => !r.ok);
const critical = failed.filter((r) => r.severity === "Critical").length;
await q("insert into eval_runs (kind, passed, failed, critical_failed, detail) values ('cap', $1, $2, $3, $4)", [results.length - failed.length, failed.length, critical, JSON.stringify(results)]);
await db.end();
for (const r of results) console.log(`${r.ok ? "pass" : "FAIL"}  ${r.severity.padEnd(8)} ${r.id.padEnd(5)} ${r.title}${r.detail ? `  (${r.detail})` : ""}`);
console.log(`\n${results.length - failed.length} of ${results.length} passed. Cap restored to $${original}.`);
process.exit(critical ? 1 : 0);
