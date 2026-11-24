// G1: the database's own scheduler calls the workers, so the free Vercel plan's once-a-day cron is only a backstop.
// The app address and the worker secret go into Supabase Vault (encrypted), never into git.
// Usage: npm run db:schedule            (HOSTED_URL and WORKER_SECRET from the root .env)
//        npm run db:schedule -- --off   (removes the two worker jobs)
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import nextEnv from "@next/env";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
nextEnv.loadEnvConfig(root);
const off = process.argv.includes("--off");
const appUrl = (process.env.HOSTED_URL ?? "").replace(/\/$/, "");
const secret = process.env.WORKER_SECRET ?? "";
if (!off && (!/^https:\/\//.test(appUrl) || !secret)) {
  console.error("Set HOSTED_URL (the hosted https address) and WORKER_SECRET in .env first. The scheduler cannot reach localhost.");
  process.exit(1);
}

const ref = new URL(process.env.SUPABASE_URL).hostname.split(".")[0];
const db = new pg.Client({ host: process.env.SUPABASE_DB_HOST, port: 5432, user: `postgres.${ref}`, password: process.env.SUPABASE_DB_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false } });
await db.connect();

const JOBS = [
  // Every minute, start about one batch of screening (Lecture 8: "a scheduled job scores 5 a minute").
  { name: "worker-screening", schedule: "* * * * *", path: "/api/worker/screening?budget=55" },
  // Every 10 minutes, one outreach step per company (PRD 15.4).
  { name: "worker-outreach", schedule: "*/10 * * * *", path: "/api/worker/outreach" },
];

if (off) {
  for (const j of JOBS) await db.query("select cron.unschedule(jobname) from cron.job where jobname = $1", [j.name]);
  console.log("Worker jobs removed. The nightly clean-up job stays.");
  await db.end();
  process.exit(0);
}

async function putSecret(name, value) {
  const { rows } = await db.query("select id from vault.secrets where name = $1", [name]);
  if (rows.length) await db.query("select vault.update_secret($1, $2)", [rows[0].id, value]);
  else await db.query("select vault.create_secret($1, $2)", [value, name]);
}
await putSecret("app_url", appUrl);
await putSecret("worker_secret", secret);

for (const j of JOBS) {
  const command = `select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '${j.path}',
    headers := jsonb_build_object('authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secret')),
    timeout_milliseconds := 290000
  )`;
  await db.query("select cron.schedule($1, $2, $3)", [j.name, j.schedule, command]);
}
const { rows } = await db.query("select jobname, schedule, active from cron.job order by jobname");
for (const r of rows) console.log(`${r.active ? "on " : "off"}  ${r.schedule.padEnd(14)} ${r.jobname}`);
console.log(`Workers are called at ${new URL(appUrl).host}. Check runs with: select * from cron.job_run_details order by start_time desc limit 5;`);
await db.end();
