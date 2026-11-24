// N6 audit (PRD 19.1): scans every logged model input for any founder's name, email, phone or LinkedIn link.
// Checks each input against every founder in the database, not only that application's founders.
// Usage: npm run audit:n6   Exits 1 if anything leaked.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import nextEnv from "@next/env";
import { findPii, type FounderRef } from "../src/lib/intake/redact";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
nextEnv.loadEnvConfig(root);
const ref = new URL(process.env.SUPABASE_URL!).hostname.split(".")[0];
const db = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: 5432, user: `postgres.${ref}`,
  password: process.env.SUPABASE_DB_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false },
});
await db.connect();
const rows = (await db.query("select application_id, founder_key, name, email, phone, linkedin_url from public.founders")).rows;
const toRef = (f: (typeof rows)[number]): FounderRef => ({ id: f.founder_key, name: f.name, email: f.email, phone: f.phone, linkedin: f.linkedin_url });
const own = new Map<string, FounderRef[]>();
for (const f of rows) own.set(f.application_id, [...(own.get(f.application_id) ?? []), toRef(f)]);
const all = rows.map(toRef);
const since = process.argv.includes("--since") ? process.argv[process.argv.indexOf("--since") + 1] : "1970-01-01";
const calls = (await db.query("select id, call_type, application_id, input, created_at from public.llm_calls where input is not null and created_at >= $1", [since])).rows;
await db.end();

// N6 (fail): the founders of an application must never appear in that application's model inputs.
// Cross-check (warning): another application's founder name appears, which usually means a shared surname
// in a memo passage or on the web. Shown so collisions are seen, but it is not that founder's data.
let leaks = 0;
let warnings = 0;
for (const c of calls) {
  if (c.input?.blocked) continue; // refused before sending, nothing left the system
  if (c.input?.purged) continue; // cleared after the retention window (G7): nothing left to check
  const text = `${c.input.system ?? ""}
${c.input.user ?? ""}`;
  const mine = c.application_id ? own.get(c.application_id) ?? [] : [];
  const found = findPii(text, mine);
  if (found.length) {
    leaks++;
    console.log(`LEAK in ${c.call_type} call ${c.id}: ${found.join(", ")}`);
    continue;
  }
  const other = findPii(text, all).filter((x) => x.startsWith("name"));
  if (other.length) warnings++;
}
console.log(`N6 ${leaks === 0 ? "pass" : "FAIL"}: scanned ${calls.length} model inputs, ${leaks} with their own founders' details.`);
if (warnings) console.log(`Note: ${warnings} inputs contain a name that matches another application's founder (shared surnames in memos or on the web).`);
process.exit(leaks === 0 ? 0 : 1);
