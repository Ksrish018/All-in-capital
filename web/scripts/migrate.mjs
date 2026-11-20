// Applies SQL files in ../supabase/migrations in order, once each, inside a transaction.
// Usage: npm run db:migrate   (reads SUPABASE_URL, SUPABASE_DB_HOST, SUPABASE_DB_PASSWORD from the root .env)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import nextEnv from "@next/env";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
nextEnv.loadEnvConfig(root);

const ref = new URL(process.env.SUPABASE_URL).hostname.split(".")[0];
const client = new pg.Client({
  host: process.env.SUPABASE_DB_HOST,
  port: 5432,
  user: `postgres.${ref}`,
  password: process.env.SUPABASE_DB_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

const dir = path.join(root, "supabase", "migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

await client.connect();
await client.query(
  "create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())",
);
await client.query("alter table public.schema_migrations enable row level security");
const done = new Set((await client.query("select name from public.schema_migrations")).rows.map((r) => r.name));

for (const f of files) {
  if (done.has(f)) {
    console.log(`skip  ${f}`);
    continue;
  }
  const sql = fs.readFileSync(path.join(dir, f), "utf8");
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into public.schema_migrations (name) values ($1)", [f]);
    await client.query("commit");
    console.log(`apply ${f}`);
  } catch (e) {
    await client.query("rollback");
    console.error(`FAILED ${f}: ${e.message}`);
    process.exitCode = 1;
    break;
  }
}
await client.end();
