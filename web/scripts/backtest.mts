// Runs the back test on the latest Thesis Card (or --version N) and prints the result.
// Usage: npm run backtest [-- --version 1] [-- --only "Giva,Prepnest"]
import path from "node:path";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(path.resolve(import.meta.dirname, "..", ".."));
const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const { runBacktest } = await import("../src/lib/backtest/run");
const { runId, rows } = await runBacktest(arg("--version") ? Number(arg("--version")) : undefined, { only: arg("--only")?.split(",") });
console.log(`run ${runId}`);
for (const split of ["build", "test"] as const) {
  const set = rows.filter((r) => r.split === split);
  if (!set.length) continue;
  console.log(`\n${split} set`);
  for (const r of set) {
    console.log(`  ${r.agrees ? "agree" : "DIFFER"}  ${r.company.padEnd(22)} fund ${r.real_decision.padEnd(8)} public ${r.rec_public.padEnd(11)} revealed ${r.rec_revealed.padEnd(11)} ${String(r.score_revealed).padEnd(5)} fails: ${r.failing.join(",") || "-"}`);
  }
  for (const lens of ["public", "revealed"] as const) {
    const n = set.filter((r) => (lens === "public" ? r.rec_public : r.rec_revealed) === (r.real_decision === "invested" ? "go" : "pass")).length;
    console.log(`  ${lens} lens agreement: ${n} of ${set.length}`);
  }
}
// N1 (PRD 19.1): a funded company marked PASS with no flag. A PASS that shows a failing criterion is flagged.
const n1 = rows.filter((r) => r.real_decision === "invested" && r.rec_revealed === "pass" && r.failing.length === 0);
const flaggedPass = rows.filter((r) => r.real_decision === "invested" && r.rec_revealed === "pass" && r.failing.length > 0);
console.log(`\nN1 ${n1.length === 0 ? "pass" : "FAIL"}: funded companies marked PASS with no flag: ${n1.length}${n1.length ? ` (${n1.map((r) => r.company).join(", ")})` : ""}`);
if (flaggedPass.length) console.log(`Funded companies marked PASS with a failing criterion shown: ${flaggedPass.map((r) => `${r.company} (${r.failing.join(",")})`).join("; ")}`);
process.exit(n1.length ? 1 : 0);
