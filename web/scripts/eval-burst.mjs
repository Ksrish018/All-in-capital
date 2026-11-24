// The burst test (Lecture 8 "50 in a minute", PRD Section 24, M9). Critical: no application vanishes (N5).
// Fires 50 uploads at the same moment, records each request's status, error type and time (G18),
// then waits until every application ends scored, short-circuited, held, queued, paused or flagged with a reason.
// Most are later-stage rounds, so the cheap checks end them early and the test stays cheap (about $0.50).
// Also checks the upload limit refuses one more with a plain message. Generated applications are deleted at the end.
// Usage: npm run eval:burst [-- --count 50 --full 8]   (app on localhost:3000)
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import nextEnv from "@next/env";
import { clearUploadCount, refuseOnLive } from "./lib/guard.mjs";
import { createClient } from "@supabase/supabase-js";
import { makeForm } from "./lib/pdf.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
nextEnv.loadEnvConfig(root);
refuseOnLive("eval-burst");
const BASE = process.env.APP_URL ?? "http://localhost:3000";
const arg = (k, d) => (process.argv.includes(k) ? Number(process.argv[process.argv.indexOf(k) + 1]) : d);
const COUNT = arg("--count", 50);
const FULL = Math.min(COUNT, arg("--full", 8)); // this many go through full screening; the rest stop at the cheap checks
const ref = new URL(process.env.SUPABASE_URL).hostname.split(".")[0];
const db = new pg.Client({ host: process.env.SUPABASE_DB_HOST, port: 5432, user: `postgres.${ref}`, password: process.env.SUPABASE_DB_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false } });
await db.connect();
const q = async (sql, a = []) => (await db.query(sql, a)).rows;
await clearUploadCount(q);
const kick = () => fetch(`${BASE}/api/worker/screening`, { method: "POST", headers: { authorization: `Bearer ${process.env.WORKER_SECRET}` } }).catch(() => {});
const tag = `Burst${Date.now().toString(36)}`;

const SECTORS = ["Fintech", "Consumer tech", "Consumer brands", "Deeptech"];
function form(i) {
  const full = i < FULL;
  const name = `${tag} Co ${String(i + 1).padStart(2, "0")}`;
  return makeForm([
    ["Company", [["Company name", `${name} (${name} Pvt. Ltd.)`], ["Website", `www.${tag.toLowerCase()}${i}.example`], ["Location", "Pune, Maharashtra"], ["One-line description", `Software that helps small ${["clinics", "kirana stores", "workshops", "schools"][i % 4]} keep their books.`], ["Sector (as selected)", SECTORS[i % 4]], ["Stage (as selected)", full ? "Pre-seed" : "Series B"]]],
    ["Founders", [["Founder 1", `Founder ${i + 1}, CEO. Eight years running operations in the same trade.`]]],
    ["Product and traction", [["What have you built?", "A billing and stock app used daily."], ["Customers", `${20 + i} paying customers.`], ["Revenue", `MRR INR ${(1 + (i % 5) * 0.4).toFixed(1)} L.`]]],
    ["Fundraising", [["Amount raising", full ? "INR 1.5 Cr" : "USD 12 M"], ["Existing investors", full ? "None." : "Two institutional funds."]]],
  ]);
}

const results = [];
const check = (severity, id, title, ok, detail = "") => results.push({ severity, id, title, ok: Boolean(ok), detail });
const limitBefore = (await q("select value from settings where key = 'upload_limit_per_hour'"))[0]?.value ?? 30;
const ids = [];
try {
  // Room for the burst itself; the limit is checked on its own afterwards.
  await q("update settings set value = $1 where key = 'upload_limit_per_hour'", [JSON.stringify(1000)]);

  const t0 = Date.now();
  const sent = await Promise.all(Array.from({ length: COUNT }, async (_, i) => {
    const fd = new FormData();
    fd.set("source", "public_form");
    fd.set("consent", "yes");
    fd.set("form", new Blob([form(i)], { type: "application/pdf" }), `${tag}_${i + 1}_Form.pdf`);
    const started = Date.now();
    try {
      const res = await fetch(`${BASE}/api/applications`, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (body.id) ids.push(body.id);
      return { i, status: res.status, ms: Date.now() - started, error: res.ok ? null : `${res.status} ${body.error ?? ""}`.trim() };
    } catch (e) {
      return { i, status: 0, ms: Date.now() - started, error: `network: ${e.message}` };
    }
  }));
  const accepted = sent.filter((s) => s.status === 201).length;
  const ms = sent.map((s) => s.ms).sort((a, b) => a - b);
  const errors = Object.entries(sent.filter((s) => s.error).reduce((m, s) => ({ ...m, [s.error.split(":")[0]]: (m[s.error.split(":")[0]] ?? 0) + 1 }), {}));
  check("Critical", "B1", `All ${COUNT} uploads were received`, accepted === COUNT, `${accepted} of ${COUNT} in ${((Date.now() - t0) / 1000).toFixed(1)} s; median ${ms[Math.floor(ms.length / 2)]} ms, slowest ${ms.at(-1)} ms${errors.length ? `; errors ${errors.map(([k, v]) => `${k} x${v}`).join(", ")}` : ""}`);

  // Work the queue until every one has settled. The scheduler does this when hosted; locally we kick the worker.
  const SETTLED = ["brief_ready", "short_circuited", "hold_conflict", "needs_attention", "paused_cost_cap"];
  let rows = [];
  let peak = 0;
  const WORKING = ["parsing", "screening", "extracting", "researching", "scoring"];
  const concurrency = Number((await q("select value from settings where key = 'worker_concurrency'"))[0]?.value ?? 4);
  for (let round = 0; round < 240; round++) {
    rows = await q("select id, status, status_reason from applications where id = any($1)", [ids]);
    peak = Math.max(peak, rows.filter((r) => WORKING.includes(r.status)).length);
    if (rows.length === ids.length && rows.every((r) => SETTLED.includes(r.status))) break;
    if (round % 8 === 0) kick();
    await new Promise((r) => setTimeout(r, 2500));
  }
  const byStatus = rows.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {});
  const missing = ids.length - rows.length;
  check("Critical", "B2", "No application vanished (N5)", missing === 0 && rows.length === accepted, `${rows.length} of ${accepted} found`);
  const unsettled = rows.filter((r) => !SETTLED.includes(r.status) && !(r.status === "queued" && r.status_reason));
  check("Critical", "B3", "Every one ended scored, stopped early, held, queued with a reason, paused or flagged", unsettled.length === 0, Object.entries(byStatus).map(([k, v]) => `${k} ${v}`).join(", "));
  const silent = rows.filter((r) => ["needs_attention", "paused_cost_cap", "queued"].includes(r.status) && !r.status_reason);
  check("High", "B4", "Anything not finished says why in plain words", silent.length === 0, silent.length ? `${silent.length} without a reason` : "");
  check("Critical", "B8", `Never more than ${concurrency} screened at once, however many workers start`, peak <= concurrency, `peak ${peak} in flight`);
  const busy = (await q("select count(*)::int n from llm_calls where application_id = any($1) and status = 'error' and error ilike '%busy%'", [ids]))[0].n;
  check("High", "B5", "Busy replies from the provider were waited out, not lost", rows.every((r) => r.status !== "needs_attention" || !/busy/i.test(r.status_reason ?? "")), `${busy} calls gave up after four tries and went back in the queue`);

  // The upload limit: one more from the same visitor is refused with a plain message and creates nothing.
  const hits = (await q("select count(*)::int n from intake_hits where at > now() - interval '1 hour'"))[0].n;
  await q("update settings set value = $1 where key = 'upload_limit_per_hour'", [JSON.stringify(Math.max(1, Math.floor(hits / 10)))]);
  const before = (await q("select count(*)::int n from applications"))[0].n;
  const fd = new FormData();
  fd.set("source", "public_form");
  fd.set("consent", "yes");
  fd.set("form", new Blob([form(COUNT)], { type: "application/pdf" }), `${tag}_extra_Form.pdf`);
  const over = await fetch(`${BASE}/api/applications`, { method: "POST", body: fd });
  const overBody = await over.json().catch(() => ({}));
  if (overBody.id) ids.push(overBody.id);
  const after = (await q("select count(*)::int n from applications"))[0].n;
  check("High", "B6", "Over the hourly limit, an upload is refused with a plain message and nothing is half-made", over.status === 429 && /limit/i.test(overBody.error ?? "") && after === before, `${over.status}: ${overBody.error ?? ""}`);

  // Without the consent box, nothing is accepted. The limit is lifted well clear, since earlier runs this hour count too.
  await q("update settings set value = $1 where key = 'upload_limit_per_hour'", [JSON.stringify(1000)]);
  const nc = new FormData();
  nc.set("source", "public_form");
  nc.set("form", new Blob([form(COUNT + 1)], { type: "application/pdf" }), `${tag}_noconsent_Form.pdf`);
  const ncRes = await fetch(`${BASE}/api/applications`, { method: "POST", body: nc });
  const ncBody = await ncRes.json().catch(() => ({}));
  if (ncBody.id) ids.push(ncBody.id);
  check("High", "B7", "An upload without the consent box is refused", ncRes.status === 400 && /consent/i.test(ncBody.error ?? ""), `${ncRes.status}: ${ncBody.error ?? ""}`);

  const cost = Number((await q("select coalesce(sum(cost_usd), 0) s from llm_calls where application_id = any($1)", [ids]))[0].s);
  console.log(`Burst cost: $${cost.toFixed(3)} for ${ids.length} applications.`);
} finally {
  await q("update settings set value = $1 where key = 'upload_limit_per_hour'", [JSON.stringify(limitBefore)]);
  if (ids.length) {
    const paths = (await q("select storage_path from documents where application_id = any($1)", [ids])).map((r) => r.storage_path);
    if (paths.length) await createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } }).storage.from("applications").remove(paths);
    await q("delete from applications where id = any($1)", [ids]);
  }
}
const failed = results.filter((r) => !r.ok);
const critical = failed.filter((r) => r.severity === "Critical").length;
await q("insert into eval_runs (kind, passed, failed, critical_failed, detail) values ('burst', $1, $2, $3, $4)", [results.length - failed.length, failed.length, critical, JSON.stringify(results)]);
await db.end();
for (const r of results) console.log(`${r.ok ? "pass" : "FAIL"}  ${r.severity.padEnd(8)} ${r.id.padEnd(4)} ${r.title}${r.detail ? `  (${r.detail})` : ""}`);
console.log(`\n${results.length - failed.length} of ${results.length} passed. Upload limit restored to ${limitBefore}. Generated applications deleted.`);
process.exit(critical ? 1 : 0);
