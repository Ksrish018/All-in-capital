// The eval runner (PRD 19.6): every check in one command, with a summary and a record in eval_runs.
// Usage: npm run eval            quick tests, N1 from the latest back test, N6 audit, tricky inputs
//        npm run eval -- --full  also re-screens the ten case applications and grades them (costs about $0.70)
// The app must be running on localhost:3000 for the live parts.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import pg from "pg";
import nextEnv from "@next/env";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "..");
const root = path.resolve(web, "..");
nextEnv.loadEnvConfig(root);
const full = process.argv.includes("--full");

const steps = [
  { name: "Quick tests (no keys)", cmd: "npx vitest run", critical: true },
  ...(full && fs.existsSync(path.join(root, "Decks")) ? [
    { name: "Screen the ten case applications (N5)", cmd: "node scripts/load-case.mjs --clean", critical: true },
    { name: "Seed application evals (19.2, 19.2a, N2, N3)", cmd: "node scripts/eval-seed.mjs", critical: true },
  ] : []),
  { name: "Tricky inputs (19.3)", cmd: "node scripts/eval-tricky.mjs", critical: true },
  { name: "N6: founder data never reaches a model", cmd: "npx tsx scripts/audit-n6.mts", critical: true },
];

const results = [];
for (const s of steps) {
  process.stdout.write(`\n=== ${s.name}\n`);
  const r = spawnSync(s.cmd, { cwd: web, shell: true, stdio: "inherit", env: process.env });
  results.push({ name: s.name, ok: r.status === 0, critical: s.critical });
}

// N1 from the latest back test of the card that is in use.
const ref = new URL(process.env.SUPABASE_URL).hostname.split(".")[0];
const db = new pg.Client({ host: process.env.SUPABASE_DB_HOST, port: 5432, user: `postgres.${ref}`, password: process.env.SUPABASE_DB_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false } });
await db.connect();
const card = (await db.query("select version, backtest_run_id from thesis_cards order by (status = 'approved') desc, version desc limit 1")).rows[0];
const bt = card?.backtest_run_id ? (await db.query("select company, real_decision, rec_revealed, ratings from backtest_results where run_id = $1", [card.backtest_run_id])).rows : [];
const n1 = bt.filter((r) => r.real_decision === "invested" && r.rec_revealed === "pass" && !Object.values(r.ratings).some((v) => v === 0));
results.push({ name: `N1: no funded company marked PASS with no flag (back test of v${card?.version ?? "?"})`, ok: bt.length > 0 && n1.length === 0, critical: true });

const failed = results.filter((r) => !r.ok);
await db.query("insert into eval_runs (kind, passed, failed, critical_failed, detail) values ($1, $2, $3, $4, $5)", [
  full ? "all_full" : "all", results.length - failed.length, failed.length, failed.filter((r) => r.critical).length, JSON.stringify(results),
]);
await db.end();

console.log("\n=== Summary");
for (const r of results) console.log(`${r.ok ? "pass" : "FAIL"}  ${r.name}`);
console.log(`\n${results.length - failed.length} of ${results.length} passed.`);
process.exit(failed.some((r) => r.critical) ? 1 : 0);
