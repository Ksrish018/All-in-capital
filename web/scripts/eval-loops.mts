// E-L1 and E-L2 (PRD 24.3 G10, 24.8 step 3): the disagreement score on the sealed Seed data 2 test sets.
// Loop 2: the old system's drafts, our current draft prompt (A5) and Riya's own emails, on the three checks,
//         the voice checks, and how far each is from what Riya sent.
// Loop 1: our screening on the latest calls, against Riya's final call, next to the old system's call.
// Founder names never reach a model: the draft prompt gets a placeholder, filled in here afterwards.
// Usage: npm run eval:loops [-- --skip-l1] [-- --skip-l2] [-- --card 2]
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";

const root = path.resolve(import.meta.dirname, "..", "..");
nextEnv.loadEnvConfig(root);
const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const { cleanEmails, loadExports, seal } = await import("../src/lib/loops/data");
const { threeChecks, voiceChecks, editClass, similarity } = await import("../src/lib/outreach/checks");
const { draftEmail, personalise } = await import("../src/lib/outreach/ai");
const { createAdminClient } = await import("../src/lib/supabase/server");

const data = loadExports(root);
if (!data) { console.log("Seed data 2 is not on this machine: E-L1 and E-L2 skipped."); process.exit(0); }
const split = JSON.parse(fs.readFileSync(path.join(root, "evals", "loops", "split.json"), "utf8"));
const cleaning = JSON.parse(fs.readFileSync(path.join(root, "evals", "loops", "cleaning.json"), "utf8"));
const { kept } = cleanEmails(data.emails, cleaning);
if (seal(kept, split.email.test) !== split.email.seal || seal(data.screens, split.screening.test) !== split.screening.seal) {
  console.error("The seal is broken: a test row changed. Stop and find out why before measuring anything.");
  process.exit(1);
}
const db = createAdminClient();
const runId = randomUUID();
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");
const detail: Record<string, unknown> = { run_id: runId };

// ---------- Loop 2: emails
if (!process.argv.includes("--skip-l2")) {
  const test = kept.filter((r) => split.email.test.includes(r.row_id));
  const { data: notes } = await db.from("style_notes").select("notes").eq("active", true).maybeSingle();
  const styleNotes = (notes?.notes ?? []) as string[];

  /** The next Tuesday and Thursday after the email was sent, 3 pm India time, as Riya offers. */
  const slotsAfter = (sent: string) => {
    const out: { start: string; end: string }[] = [];
    const d = new Date(`${sent}T09:30:00Z`);
    for (let i = 1; out.length < 2 && i < 14; i++) {
      const day = new Date(d.getTime() + i * 86_400_000);
      if ([2, 4].includes(day.getUTCDay())) out.push({ start: day.toISOString(), end: new Date(day.getTime() + 1_800_000).toISOString() });
    }
    return out;
  };

  type Scored = { id: string; type: string; three: boolean; voice: boolean; edit: string; sim: number; checks: Record<string, boolean> };
  const score = (id: string, type: string, text: string, sent: string, deeptech: boolean): Scored => {
    const t = threeChecks(text);
    const v = voiceChecks(text, { deeptech });
    return { id, type, three: t.all, voice: v.all, edit: editClass(text, sent), sim: Math.round(similarity(text, sent) * 100) / 100, checks: { short: t.short, oneAsk: t.oneAsk, noEmptyPraise: t.noEmptyPraise, ...v } };
  };

  const old: Scored[] = [];
  const ours: Scored[] = [];
  const riya: Scored[] = [];
  for (const r of test) {
    const deeptech = r.sector === "Deeptech";
    old.push(score(r.row_id, r.founder_type, r.system_draft, r.riya_final_email, deeptech));
    riya.push(score(r.row_id, r.founder_type, r.riya_final_email, r.riya_final_email, deeptech));
    const first = r.founder_name.split(/\s+/)[0];
    // A draft the system could not produce counts as a failed email, not a crashed run.
    const d = await draftEmail({
      applicationId: null,
      kind: "invite",
      company: r.startup,
      reason: `A ${r.stage.toLowerCase()} ${r.sector.toLowerCase()} startup (${r.founder_type}) in ${r.city}. Founder background: ${r.founder_background}. Traction: ${r.traction_facts}.`,
      slots: slotsAfter(r.date_sent),
      joining: deeptech ? ["Aditya, a partner, for the technical part"] : [],
      styleNotes,
      founders: [{ id: "F1", name: r.founder_name, linkedin: null }],
    }).catch((e: Error) => ({ subject: "", body: `(no draft: ${e.message})` }));
    ours.push(score(r.row_id, r.founder_type, personalise(d.body, first), r.riya_final_email, deeptech));
    process.stdout.write(".");
  }
  console.log("");

  const summary = (xs: Scored[]) => {
    const types = [...new Set(xs.map((x) => x.type))];
    return {
      n: xs.length,
      three_checks: xs.filter((x) => x.three).length,
      voice: xs.filter((x) => x.voice).length,
      kept: xs.filter((x) => x.edit === "kept").length,
      small: xs.filter((x) => x.edit === "small").length,
      rewrite: xs.filter((x) => x.edit === "rewrite").length,
      by_type: Object.fromEntries(types.map((t) => [t, { n: xs.filter((x) => x.type === t).length, three_checks: xs.filter((x) => x.type === t && x.three).length }])),
      failed_checks: Object.entries(xs.reduce((m, x) => { for (const [k, v] of Object.entries(x.checks)) if (!v && k !== "all") m[k] = (m[k] ?? 0) + 1; return m; }, {} as Record<string, number>)),
    };
  };
  const L2 = { old_drafts: summary(old), a5_current: summary(ours), riya: summary(riya), rows: ours.map((o, i) => ({ id: o.id, type: o.type, old: old[i].three, ours: o.three, ours_voice: o.voice, ours_edit: o.edit, ours_sim: o.sim })) };
  detail.loop2 = L2;

  console.log(`\nLoop 2, first emails: ${test.length} sealed test rows`);
  console.log(`                      three checks   voice   kept / small / rewrite (against what Riya sent)`);
  for (const [name, s] of [["old system drafts", L2.old_drafts], ["our A5 prompt", L2.a5_current], ["Riya (ceiling)", L2.riya]] as const) {
    console.log(`  ${name.padEnd(20)} ${`${s.three_checks}/${s.n} ${pct(s.three_checks, s.n)}`.padEnd(14)} ${`${pct(s.voice, s.n)}`.padEnd(7)} ${s.kept} / ${s.small} / ${s.rewrite}`);
  }
  console.log(`  by founder type, our A5: ${Object.entries(L2.a5_current.by_type).map(([t, v]) => `${t} ${v.three_checks}/${v.n}`).join(", ")}`);
  console.log(`  checks our A5 fails most: ${L2.a5_current.failed_checks.sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`);
}

// ---------- Loop 1: screening
if (!process.argv.includes("--skip-l1")) {
  const { loadCard, scoreSummary } = await import("../src/lib/loops/screening");
  const ctx = await loadCard(arg("--card") ? Number(arg("--card")) : undefined);
  const test = data.screens.filter((r) => split.screening.test.includes(r.row_id));
  const rows = [];
  for (const r of test) {
    const res = await scoreSummary({ company: r.startup, summary: r.application_summary, sector: r.sector, stage: r.stage, runId, ctx });
    const riyaGo = r.riya_final_call === "Go";
    const called = res.rec === "go" || res.rec === "pass";
    rows.push({
      id: r.row_id, riya: r.riya_final_call, old_call: r.system_call, old_score: Number(r.system_score),
      borderline: Math.abs(Number(r.system_score) - 6.5) <= 1,
      ours: res.rec, ours_score: res.score, agrees: called && (res.rec === "go") === riyaGo, called, failing: res.failing,
    });
    process.stdout.write(".");
  }
  console.log("");
  const oldAgree = rows.filter((r) => r.old_call === r.riya).length;
  const agree = rows.filter((r) => r.agrees).length;
  const noCall = rows.filter((r) => !r.called).length;
  const border = rows.filter((r) => r.borderline);
  detail.loop1 = { card_version: ctx.row.version, n: rows.length, old_agree: oldAgree, ours_agree: agree, ours_no_call: noCall, borderline_n: border.length, borderline_ours_agree: border.filter((r) => r.agrees).length, rows };
  console.log(`\nLoop 1, screening: the latest ${rows.length} calls, Thesis Card v${ctx.row.version}, research off`);
  console.log(`  old system agreed with Riya: ${oldAgree}/${rows.length} ${pct(oldAgree, rows.length)}`);
  console.log(`  our system agreed with Riya: ${agree}/${rows.length} ${pct(agree, rows.length)}; no call (a person decides): ${noCall}`);
  console.log(`  borderline rows (old score within 1 of the line): ${border.length}, ours agreed on ${border.filter((r) => r.agrees).length}`);
  for (const r of rows) console.log(`    ${r.id} Riya ${r.riya.padEnd(5)} old ${r.old_call.padEnd(5)} ours ${r.ours.padEnd(12)} ${r.agrees ? "agree" : r.called ? "DIFFER" : "no call"}${r.borderline ? "  (borderline)" : ""}`);
}

const { data: cost } = await db.from("llm_calls").select("cost_usd").eq("run_id", runId);
const spent = (cost ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
detail.cost_usd = spent;
await db.from("eval_runs").insert({ kind: "loops", passed: 0, failed: 0, critical_failed: 0, detail });
console.log(`\nSaved to eval_runs (kind loops). Loop 1 model cost $${spent.toFixed(3)}.`);
process.exit(0);
