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
const founders: FounderRef[] = (await db.query("select founder_key, name, email, phone, linkedin_url from public.founders")).rows.map((f) => ({
  id: f.founder_key, name: f.name, email: f.email, phone: f.phone, linkedin: f.linkedin_url,
}));
const calls = (await db.query("select id, call_type, application_id, input from public.llm_calls where input is not null")).rows;
await db.end();

let leaks = 0;
for (const c of calls) {
  if (c.input?.blocked) continue; // refused before sending, nothing left the system
  const found = findPii(`${c.input.system ?? ""}\n${c.input.user ?? ""}`, founders);
  if (found.length) {
    leaks++;
    console.log(`LEAK in ${c.call_type} call ${c.id}: ${found.join(", ")}`);
  }
}
console.log(`N6 ${leaks === 0 ? "pass" : "FAIL"}: scanned ${calls.length} model inputs against ${founders.length} founders, ${leaks} with founder details`);
process.exit(leaks === 0 ? 0 : 1);
