// Live database check: Row Level Security on every table, queues, private bucket,
// and that an anonymous browser can read nothing. With --strict, exits 1 on any failure.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import nextEnv from "@next/env";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
nextEnv.loadEnvConfig(root);
const strict = process.argv.includes("--strict");
const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? "pass" : "FAIL"}  ${label}`);
  if (!ok) failures.push(label);
};

const ref = new URL(process.env.SUPABASE_URL).hostname.split(".")[0];
const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST,
  port: 5432,
  user: `postgres.${ref}`,
  password: process.env.SUPABASE_DB_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const noRls = await c.query("select tablename from pg_tables where schemaname = 'public' and not rowsecurity");
check(noRls.rows.length === 0, `Row Level Security on every public table${noRls.rows.length ? ` (missing: ${noRls.rows.map((r) => r.tablename).join(", ")})` : ""}`);

const queues = (await c.query("select queue_name from pgmq.list_queues()")).rows.map((r) => r.queue_name);
check(queues.includes("screening") && queues.includes("outreach_tick"), "queues screening and outreach_tick exist");

const bucket = await c.query("select public from storage.buckets where id = 'applications'");
check(bucket.rows.length === 1 && bucket.rows[0].public === false, "applications bucket exists and is private");
await c.end();

// An anonymous browser (publishable key, no sign-in) must read nothing.
for (const table of ["settings", "applications", "founders", "users"]) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}?select=*`, {
    headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY },
  });
  const body = r.ok ? await r.json() : [];
  check(Array.isArray(body) && body.length === 0, `anonymous read of ${table} returns nothing`);
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  if (strict) process.exit(1);
} else {
  console.log("\nall database checks passed");
}
