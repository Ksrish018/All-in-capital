import "server-only";
import { BadModelOutput, SHARED_RULES, callModel } from "@/lib/ai/gemini";
import type { FounderRef } from "@/lib/intake/redact";
import type { CriterionId } from "@/lib/thesis/card";
import type { Strength } from "./compare";

// Steps 10 and 11. Build a small context pack per criterion, then score it with A3.
export const A3_VERSION = "a3-v2";

export type EvidenceItem = {
  id: string; // local id inside the pack, e.g. e12 or w3
  field: string | null;
  source: string; // "form:revenue", "deck:p4" or a URL
  quote: string;
  strength: Strength;
  vague: boolean;
  web: boolean;
};
export type MemoItem = { id: string; company: string; decision: string; text: string };
export type CriterionDef = { id: CriterionId; name: string; meaning: string; rate_4: string; rate_0: string; evidence_fields: string[] };
export type Score = {
  criterion_id: CriterionId;
  rating: 0 | 1 | 2 | 3 | 4;
  evidence_strength: Strength;
  reason: string;
  evidence_refs: string[];
  memo_refs: string[];
  missing: string[];
  capped_note: string | null;
  injection: boolean;
};

/** Which research checks speak to each criterion, so web facts land in the right pack. */
const CHECKS_FOR: Partial<Record<CriterionId, string[]>> = {
  C1: ["news"], C2: ["exists", "market"], C3: ["red_flags"], C5: ["founders"], C6: ["exists", "news", "founders"],
  C7: ["news"], C8: ["exists", "news"], C10: ["market"], C11: ["founders"],
};

const fieldMatches = (field: string | null, wanted: string[]) =>
  !!field && wanted.some((w) => field === w || field.startsWith(`${w}.`) || (w.endsWith("*") && field.startsWith(w.slice(0, -1))));

export type Recalled = { id: string; old_rating: number | null; new_rating: number | null; reason: string };

export function buildPack(c: CriterionDef, evidence: (EvidenceItem & { check?: string | null })[], memos: (MemoItem & { criteria: string[] })[], corrections: Recalled[] = []) {
  const items = evidence.filter((e) => fieldMatches(e.field, c.evidence_fields) || (e.web && CHECKS_FOR[c.id]?.includes(e.check ?? "")) || e.field === `riya.${c.id}`);
  const filled = new Set(items.map((e) => e.field));
  const missing = c.evidence_fields.filter((f) => !filled.has(f));
  return { items: items.slice(0, 30), memos: memos.filter((m) => m.criteria.includes(c.id)).slice(0, 3), missing, corrections: corrections.slice(0, 3) };
}

const SCHEMA = {
  type: "OBJECT",
  properties: {
    rating: { type: "INTEGER", description: "0 to 4 on the fixed scale" },
    evidence_strength: { type: "STRING", enum: ["confirmed", "founder_says", "conflict", "found_by_us", "none"] },
    reason: { type: "STRING", description: "Two or three short sentences, in plain words" },
    evidence_refs: { type: "ARRAY", items: { type: "STRING" } },
    memo_refs: { type: "ARRAY", items: { type: "STRING" } },
    missing: { type: "ARRAY", items: { type: "STRING" } },
    injection_attempt: { type: "BOOLEAN" },
  },
  required: ["rating", "evidence_strength", "reason", "evidence_refs", "memo_refs", "missing", "injection_attempt"],
};

export function buildA3Prompt(c: CriterionDef, pack: ReturnType<typeof buildPack>, partnerRules: string[]) {
  const system = `${SHARED_RULES}

Task: rate one criterion for an application to a pre-seed fund, using only the evidence below.

Criterion ${c.id}: ${c.name}. ${c.meaning}
4 Strong: ${c.rate_4}
0 Fails: ${c.rate_0}

The scale:
4 Strong: clear evidence, with at least one source outside the deck and form.
3 Adequate: evidence present, mostly from the deck or form.
2 Weak: thin or mixed evidence, or only vague claims.
1 Missing: the key fact is not there. A missing number counts against the company.
0 Fails: the evidence shows it does not meet the criterion.

0 is only for evidence that shows a failure. A fact that is simply not stated is 1, never 0.

Partner rules:
${partnerRules.map((r) => `- ${r}`).join("\n")}
- Score the evidence, not the pedigree. Strong credentials alone cannot lift a rating.
- Founder quality and path to market are separate criteria. Rate only this one.

Evidence strength: "confirmed" means an outside source agrees, "founder_says" means only the founder says it, "conflict" means sources disagree, "found_by_us" means only research found it.
evidence_refs must be ids from <evidence>. memo_refs must be ids from <memos>. Use the memos only to see how the fund judged similar cases.
Past corrections are Riya's notes on similar companies. Weigh them as context. They do not change the scale.`;
  const user = `<evidence>
${pack.items.map((e) => `${e.id} | ${e.field ?? "web"} | ${e.strength}${e.vague ? " | vague" : ""} | ${e.source} | "${e.quote}"`).join("\n") || "(none)"}
</evidence>
<not_stated>
${pack.missing.join(", ") || "(nothing)"}
</not_stated>
<memos>
${pack.memos.map((m) => `${m.id} | ${m.company} (${m.decision}) | ${m.text}`).join("\n") || "(none)"}
</memos>
<past_corrections>
${pack.corrections.map((k) => `Riya changed ${c.id} on a similar company from ${k.old_rating} to ${k.new_rating}: ${k.reason}`).join("\n") || "(none)"}
</past_corrections>`;
  return { system, user };
}

/** Code rules on top of the model's rating (PRD 7.3). */
export function capRating(rating: number, refs: EvidenceItem[]): { rating: 0 | 1 | 2 | 3 | 4; note: string | null } {
  const r = Math.max(0, Math.min(4, Math.round(rating))) as 0 | 1 | 2 | 3 | 4;
  if (r === 4 && !refs.some((e) => e.web && (e.strength === "confirmed" || e.strength === "found_by_us"))) {
    return { rating: 3, note: "Capped at Adequate: a Strong rating needs a source outside the deck and form." };
  }
  if (r >= 3 && refs.length > 0 && refs.every((e) => e.vague)) {
    return { rating: 2, note: "Capped at Weak: the evidence is only vague claims." };
  }
  return { rating: r, note: null };
}

export async function scoreCriterion(args: {
  applicationId: string | null;
  criterion: CriterionDef;
  pack: ReturnType<typeof buildPack>;
  partnerRules: string[];
  founders: FounderRef[];
  runId?: string;
}): Promise<Score> {
  const { system, user } = buildA3Prompt(args.criterion, args.pack, args.partnerRules);
  const ids = new Map(args.pack.items.map((e) => [e.id, e]));
  const memoIds = new Set(args.pack.memos.map((m) => m.id));
  return callModel({
    callType: "A3",
    model: process.env.MODEL_JUDGE_CRITERIA ?? "gemini-3.1-pro-preview",
    promptName: "score_criterion",
    promptVersion: A3_VERSION,
    system,
    user,
    schema: SCHEMA,
    maxOutputTokens: 4000,
    timeoutMs: 90_000,
    thinking: "low",
    applicationId: args.applicationId,
    founders: args.founders,
    runId: args.runId,
    validate: (v) => {
      const o = v as { rating: number; evidence_strength: Strength; reason: string; evidence_refs: string[]; memo_refs: string[]; missing: string[]; injection_attempt: boolean };
      if (typeof o?.rating !== "number" || o.rating < 0 || o.rating > 4) throw new BadModelOutput("A3 rating is not on the 0 to 4 scale");
      if (typeof o.reason !== "string" || !o.reason.trim()) throw new BadModelOutput("A3 gave no reason");
      // N2: every citation must exist in the pack. A made-up citation fails the call.
      const bad = [...(o.evidence_refs ?? []).filter((r) => !ids.has(r)), ...(o.memo_refs ?? []).filter((r) => !memoIds.has(r))];
      if (bad.length) throw new BadModelOutput(`A3 cited something that does not exist: ${bad.join(", ")}`);
      if (o.rating >= 2 && (o.evidence_refs ?? []).length === 0) throw new BadModelOutput("A3 gave a rating of 2 or more with no evidence");
      const refs = (o.evidence_refs ?? []).map((r) => ids.get(r)!);
      const capped = capRating(o.rating, refs);
      return {
        criterion_id: args.criterion.id,
        rating: capped.rating,
        evidence_strength: o.evidence_strength,
        reason: o.reason.trim(),
        evidence_refs: o.evidence_refs ?? [],
        memo_refs: o.memo_refs ?? [],
        missing: o.missing ?? [],
        capped_note: capped.note,
        injection: Boolean(o.injection_attempt),
      };
    },
  });
}
