import "server-only";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { BadModelOutput, SHARED_RULES, callModel } from "@/lib/ai/gemini";
import { ThesisCardSchema, type CriterionId } from "@/lib/thesis/card";
import { recommend, type Ratings } from "@/lib/thesis/recommend";
import { extractTrack1 } from "@/lib/screening/extract";
import { buildPack, scoreCriterion, type CriterionDef, type EvidenceItem } from "@/lib/screening/score";
import { scrubNames } from "@/lib/screening/memo";

// The back test (PRD S4 and Loop A). Each memo company is scored as it looked at decision time:
// only the "what it does", "founder" and "risks" sections. Never the "why we invested or passed" section.
// Research is off. A company's own memo is never context for itself, and the held-out set is never context at all.

export type BacktestRow = {
  company: string; split: "build" | "test"; real_decision: "invested" | "passed";
  rec_public: string; rec_revealed: string; agrees: boolean; score_public: number; score_revealed: number;
  failing: string[];
};

/** A funded company marked PASS is the one result that must never happen (N1). */
export function agrees(real: "invested" | "passed", rec: string): boolean {
  return real === "invested" ? rec === "go" : rec === "pass";
}
/** N1 (PRD 19.1): a funded company marked PASS with no flag. A PASS that shows a failing criterion is flagged. */
export function breaksN1(real: "invested" | "passed", rec: string, ratings: Record<string, number | null>): boolean {
  return real === "invested" && rec === "pass" && !Object.values(ratings).some((v) => v === 0);
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  }));
  return out;
}

/** Hindsight for the verdict step only, from the recorded research. Clearly labelled, never used to score. */
function hindsight(company: string): string {
  const file = path.resolve(process.cwd(), "..", "evals", "fixtures", "research", "memo_companies");
  const slug = company.toLowerCase().replace(/^the /, "").replace(/[^a-z0-9]+/g, "_").replace(/_+$/, "");
  const match = fs.existsSync(file) ? fs.readdirSync(file).find((f) => f.startsWith(slug.split("_")[0])) : undefined;
  if (!match) return "";
  const data = JSON.parse(fs.readFileSync(path.join(file, match), "utf8")) as { checks: Record<string, { results: { title: string; snippet: string }[] }> };
  return Object.values(data.checks).flatMap((c) => c.results.slice(0, 2).map((r) => `${r.title}: ${r.snippet}`)).join("\n").slice(0, 2500);
}

const VERDICT_SCHEMA = {
  type: "OBJECT",
  properties: {
    explanation: { type: "STRING", description: "Two sentences: which criteria drove the system's call, in plain words" },
    verdict: { type: "STRING", enum: ["fund_likely_wrong", "system_likely_wrong", "too_early"] },
    verdict_reason: { type: "STRING", description: "One sentence. If it uses hindsight, say so." },
    injection_attempt: { type: "BOOLEAN" },
  },
  required: ["explanation", "verdict", "verdict_reason", "injection_attempt"],
};

async function explain(args: { runId: string; company: string; real: string; rec: string; reasons: { id: string; name: string; rating: number; reason: string }[] }) {
  const later = hindsight(args.company);
  return callModel({
    callType: "A4",
    model: process.env.MODEL_DRAFT ?? "gemini-3-flash-preview",
    promptName: "backtest_explain",
    promptVersion: "bt-v1",
    system: `${SHARED_RULES}

Task: the fund ${args.real === "invested" ? "invested in" : "passed on"} ${args.company}. The system, scoring only what was known then, said ${args.rec.toUpperCase()}.
Explain the system's call in two plain sentences, from the ratings given.
Then give a verdict on the disagreement: "fund_likely_wrong", "system_likely_wrong" or "too_early".
You may use the later facts below for the verdict only. Label any use of them as hindsight. If they say little, choose too_early.`,
    user: `<ratings>\n${args.reasons.map((r) => `${r.id} ${r.name}: ${r.rating} of 4. ${r.reason}`).join("\n")}\n</ratings>\n<later_facts_hindsight>\n${later || "(none recorded)"}\n</later_facts_hindsight>`,
    schema: VERDICT_SCHEMA,
    maxOutputTokens: 1200,
    timeoutMs: 45_000,
    thinking: "low",
    applicationId: null,
    founders: [],
    runId: args.runId,
    validate: (v) => {
      const o = v as { explanation: string; verdict: string; verdict_reason: string };
      if (!o?.explanation || !["fund_likely_wrong", "system_likely_wrong", "too_early"].includes(o.verdict)) throw new BadModelOutput("Back test explanation is incomplete");
      return o as { explanation: string; verdict: "fund_likely_wrong" | "system_likely_wrong" | "too_early"; verdict_reason: string };
    },
  });
}

export async function runBacktest(version?: number, opts: { only?: string[] } = {}): Promise<{ runId: string; rows: BacktestRow[] }> {
  const db = createAdminClient();
  const q = db.from("thesis_cards").select("*").order("version", { ascending: false }).limit(1);
  const { data: cardRow } = version ? await db.from("thesis_cards").select("*").eq("version", version).single() : await q.single();
  if (!cardRow) throw new Error("No Thesis Card to back test");
  const card = ThesisCardSchema.parse(cardRow);
  const { data: passages } = await db.from("memo_passages").select("id, memo_n, company, decision, split, section, criteria, text").order("memo_n");
  if (!passages?.length) throw new Error("No memo passages. Run npm run db:memos with the memo PDF in Decks/.");
  const runId = randomUUID();
  const companies = [...new Map(passages.map((p) => [p.company as string, p])).values()].filter((p) => !opts.only || opts.only.includes(p.company));
  // The scorer is told what it is reading, so it does not treat a short memo as a thin application.
  const partnerRules = [
    ...((cardRow.partner_rules ?? []) as string[]),
    "Back test: the evidence is the fund's own memo written at decision time, with the decision removed. It is not an application. Rate what the memo says. If the memo does not discuss this criterion at all, rate 1 and cite nothing.",
  ];
  const { data: settings } = await db.from("settings").select("key, value");
  const sectorFlag = settings?.find((s) => s.key === "sector_flag_strength")?.value === "hard" ? "hard" : "soft";
  const rows: BacktestRow[] = [];

  for (const co of companies) {
    const own = passages.filter((p) => p.company === co.company);
    // Only what was known at decision time. The "why" section is the decision itself, so it is never read.
    const sections = own.filter((p) => p.section !== "why");
    const sources = new Map(sections.map((p, i) => [`deck:p${i + 1}`, scrubNames(p.text as string, [co.company as string])]));
    const { claims } = await extractTrack1({ applicationId: null, sources, founders: [], runId });
    const evidence: (EvidenceItem & { check: null })[] = claims.filter((c) => c.quote).map((c, i) => ({
      id: `e${i + 1}`, field: c.field, source: c.source_ref ?? "", quote: c.quote!, strength: "founder_says", vague: c.vague, web: false, check: null,
    }));
    // Context: build-set memos of other companies only. Test-set memos never shape anything.
    const memoItems = passages
      .filter((p) => p.split === "build" && p.company !== co.company)
      .map((p) => ({ id: p.id as string, company: p.company as string, decision: p.decision as string, text: scrubNames(p.text as string, [p.company as string]).slice(0, 900), criteria: p.criteria as string[] }));
    const scores = await pool(card.criteria.filter((c) => c.id !== "C4"), 3, (c) =>
      scoreCriterion({ applicationId: null, criterion: c as CriterionDef, pack: buildPack(c as CriterionDef, evidence, memoItems), partnerRules, founders: [], runId }),
    );
    const ratings = Object.fromEntries([...scores.map((s) => [s.criterion_id, s.rating]), ["C4", 4]]) as Ratings;
    // A criterion rated Missing with nothing cited was simply not discussed in the memo.
    const notDiscussed = scores.filter((s) => s.rating === 1 && s.evidence_refs.length === 0).map((s) => s.criterion_id);
    const rec = recommend(card, ratings, "revealed", { sectorFlag, notDiscussed });
    const real = co.decision as "invested" | "passed";
    const ok = agrees(real, rec.revealed.recommendation);
    const named = scores.map((s) => ({ id: s.criterion_id, name: card.criteria.find((c) => c.id === s.criterion_id)!.name, rating: s.rating, reason: s.reason }));
    const why = ok ? null : await explain({ runId, company: co.company as string, real, rec: rec.revealed.recommendation, reasons: named });
    const row: BacktestRow = {
      company: co.company as string, split: co.split as "build" | "test", real_decision: real,
      rec_public: rec.public.recommendation, rec_revealed: rec.revealed.recommendation, agrees: ok,
      score_public: rec.public.score, score_revealed: rec.revealed.score,
      failing: Object.entries(ratings).filter(([, v]) => v === 0).map(([k]) => k),
    };
    rows.push(row);
    await db.from("backtest_results").insert({
      run_id: runId, thesis_card_id: cardRow.id, card_version: cardRow.version,
      company: row.company, split: row.split, real_decision: row.real_decision, rec_public: row.rec_public, rec_revealed: row.rec_revealed,
      agrees: row.agrees, score_public: row.score_public, score_revealed: row.score_revealed,
      ratings, reasons: { ...(Object.fromEntries(named.map((n) => [n.id, n.reason])) as Record<CriterionId, string>), _not_discussed: notDiscussed.join(", ") },
      explanation: why?.explanation ?? null, suggested_verdict: why?.verdict ?? null, verdict: why?.verdict ?? null, verdict_reason: why?.verdict_reason ?? null,
    });
  }
  await db.from("thesis_cards").update({ backtest_run_id: runId }).eq("id", cardRow.id);
  return { runId, rows };
}
