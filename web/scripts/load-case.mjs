// Sends the ten case applications through the real upload route, then waits for screening to settle.
// Also the N5 volume test: --copies 2 sends 20 at once and checks that none vanish.
// Usage: npm run case:load [-- --copies 2] [-- --clean]   (needs the app running on localhost:3000)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import nextEnv from "@next/env";
import { clearUploadCount, refuseOnLive } from "./lib/guard.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
nextEnv.loadEnvConfig(root);
refuseOnLive("load-case");
const BASE = process.env.APP_URL ?? "http://localhost:3000";
const decks = path.join(root, "Decks");
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}`));
const copies = Number(process.argv[process.argv.indexOf("--copies") + 1]) || 1;

if (!fs.existsSync(decks)) {
  console.log("The Decks folder is not here (it is kept out of the public repository). Skipping.");
  process.exit(0);
}

const ref = new URL(process.env.SUPABASE_URL).hostname.split(".")[0];
const db = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: 5432, user: `postgres.${ref}`,
  password: process.env.SUPABASE_DB_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false },
});
await db.connect();
await clearUploadCount(async (sql, a = []) => (await db.query(sql, a)).rows);

if (arg("clean")) {
  // Files go through the storage API. Supabase refuses direct deletes from storage tables.
  const paths = (await db.query("select storage_path from public.documents")).rows.map((r) => r.storage_path);
  const storage = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } }).storage;
  for (let i = 0; i < paths.length; i += 100) await storage.from("applications").remove(paths.slice(i, i + 100));
  const r = await db.query("delete from public.applications returning id");
  await db.query("select pgmq.purge_queue('screening')");
  console.log(`removed ${r.rowCount} applications, emptied the queue and the bucket`);
}

const files = fs.readdirSync(decks);
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1].split(",") : null;
const companies = [...new Set(files.filter((f) => /_(Form|Deck)/.test(f) && !/MESA/.test(f)).map((f) => f.split("_")[0]))]
  .filter((c) => !only || only.includes(c))
  .sort();
const blob = (f) => new Blob([fs.readFileSync(path.join(decks, f))], { type: "application/pdf" });

async function send(co) {
  const fd = new FormData();
  const form = files.find((f) => f.startsWith(`${co}_Form`));
  const deck = files.find((f) => f.startsWith(`${co}_Deck`));
  // StockSathi came in through a warm intro from a Fund I founder (case brief).
  const warm = co === "StockSathi";
  fd.set("source", warm ? "warm_intro" : "public_form");
  fd.set("consent", "yes");
  if (warm) {
    fd.set("company_name", co);
    fd.set("introduced_by", "A founder in the Fund I portfolio");
  }
  if (form) fd.set("form", blob(form), form);
  if (deck) fd.set("deck", blob(deck), deck);
  const res = await fetch(`${BASE}/api/applications`, { method: "POST", body: fd });
  const body = await res.json();
  if (!res.ok) throw new Error(`${co}: ${res.status} ${body.error}`);
  return body.id;
}

const started = Date.now();
const jobs = [];
for (let c = 0; c < copies; c++) for (const co of companies) jobs.push(send(co));
const ids = await Promise.all(jobs);
console.log(`sent ${ids.length} applications in ${((Date.now() - started) / 1000).toFixed(1)}s`);

// Kick the worker too, as the scheduler would.
const kick = () => fetch(`${BASE}/api/worker/screening`, { method: "POST", headers: { authorization: `Bearer ${process.env.WORKER_SECRET}` } }).catch(() => {});
kick();

const busy = ["received", "queued", "parsing", "screening", "extracting", "researching", "scoring"];
let rows = [];
for (let i = 0; i < 200; i++) {
  rows = (await db.query("select id, company_name, status, last_step, short_circuit_flags, status_reason from public.applications where id = any($1)", [ids])).rows;
  const waiting = rows.filter((r) => busy.includes(r.status));
  process.stdout.write(`\r${rows.length - waiting.length}/${ids.length} settled   `);
  if (waiting.length === 0) break;
  if (i % 10 === 9) kick();
  await new Promise((r) => setTimeout(r, 3000));
}
console.log("");

// N5: every application is accounted for, in exactly one status.
const total = (await db.query("select count(*)::int as n from public.applications where id = any($1)", [ids])).rows[0].n;
const byStatus = (await db.query("select status, count(*)::int as n from public.applications where id = any($1) group by status", [ids])).rows;
const sum = byStatus.reduce((s, r) => s + r.n, 0);
console.log(`N5 ${total === ids.length && sum === total ? "pass" : "FAIL"}: sent ${ids.length}, found ${total}, statuses add up to ${sum}`, Object.fromEntries(byStatus.map((r) => [r.status, r.n])));

for (const r of rows.sort((a, b) => a.company_name.localeCompare(b.company_name))) {
  console.log(`  ${r.company_name.padEnd(12)} ${r.status.padEnd(16)} ${r.short_circuit_flags.join(", ") || "-"}${r.status === "needs_attention" ? `  (${r.status_reason})` : ""}`);
}
await db.end();
process.exit(total === ids.length && sum === total ? 0 : 1);
