import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { ThesisCardSchema } from "@/lib/thesis/card";
import { recommend, type Ratings } from "@/lib/thesis/recommend";
import { extractTrack1 } from "@/lib/screening/extract";
import { buildPack, scoreCriterion, type CriterionDef, type EvidenceItem } from "@/lib/screening/score";
import { scrubNames } from "@/lib/screening/memo";

// E-L1 (PRD 24.3 G10): score one Loop 1 export row the way the back test scores a memo company.
// The row is a short summary the analyst wrote, so research is off and the scorer is told what it reads.
// The memo build set gives context, as in production. Returns our recommendation on the headline lens.

export type L1Result = { rec: string; score: number; failing: string[]; ratings: Record<string, number> };

export async function loadCard(version?: number) {
  const db = createAdminClient();
  const { data: cards } = await db.from("thesis_cards").select("*").order("version", { ascending: false });
  const row = version ? cards?.find((c) => c.version === version) : (cards?.find((c) => c.status === "approved") ?? cards?.[0]);
  if (!row) throw new Error("No Thesis Card");
  const { data: passages } = await db.from("memo_passages").select("id, company, decision, split, text, criteria").eq("split", "build");
  return { row, card: ThesisCardSchema.parse(row), passages: passages ?? [] };
}

export async function scoreSummary(args: {
  company: string; summary: string; sector: string; stage: string; runId: string;
  ctx: Awaited<ReturnType<typeof loadCard>>;
}): Promise<L1Result> {
  const { card, row, passages } = args.ctx;
  const text = `${args.company}. Sector: ${args.sector}. Stage: ${args.stage}.\n${args.summary}`;
  const { claims } = await extractTrack1({ applicationId: null, sources: new Map([["deck:p1", text]]), founders: [], runId: args.runId });
  const evidence: (EvidenceItem & { check: null })[] = claims.filter((c) => c.quote).map((c, i) => ({
    id: `e${i + 1}`, field: c.field, source: c.source_ref ?? "", quote: c.quote!, strength: "founder_says", vague: c.vague, web: false, check: null,
  }));
  const memoItems = passages.map((p) => ({
    id: p.id as string, company: p.company as string, decision: p.decision as string,
    text: scrubNames(p.text as string, [p.company as string]).slice(0, 900), criteria: p.criteria as string[],
  }));
  const partnerRules = [
    ...((row.partner_rules ?? []) as string[]),
    "Loop 1 eval: the evidence is a short summary of the application written by the fund's analyst, not the full form and deck. Rate what it says. If it does not discuss a criterion, rate 1 and cite nothing.",
  ];
  const scores = [];
  for (const c of card.criteria.filter((c) => c.id !== "C4")) {
    scores.push(await scoreCriterion({ applicationId: null, criterion: c as CriterionDef, pack: buildPack(c as CriterionDef, evidence, memoItems), partnerRules, founders: [], runId: args.runId }));
  }
  const ratings = Object.fromEntries([...scores.map((s) => [s.criterion_id, s.rating]), ["C4", 4]]) as Ratings;
  const notDiscussed = scores.filter((s) => s.rating === 1 && s.evidence_refs.length === 0).map((s) => s.criterion_id);
  const rec = recommend(card, ratings, "revealed", { sectorFlag: "soft", notDiscussed });
  return {
    rec: rec.revealed.recommendation, score: rec.revealed.score,
    failing: Object.entries(ratings).filter(([, v]) => v === 0).map(([k]) => k),
    ratings: ratings as Record<string, number>,
  };
}
