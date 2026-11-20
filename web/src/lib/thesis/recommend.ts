import { CRITERIA, lensWeights, type CriterionId, type Lens, type ThesisCard } from "./card";

/**
 * Turns criterion ratings into a recommendation, in code (PRD Step 12 and Section 7.4).
 * The model only rates criteria. It never chooses the recommendation, so a deck cannot talk its way to GO.
 */
export type Rating = 0 | 1 | 2 | 3 | 4;
export type Ratings = Partial<Record<CriterionId, Rating | null>>;
export type Recommendation = "go" | "pass" | "needs_human" | "hold";

export type LensResult = {
  lens: Lens;
  recommendation: Recommendation;
  score: number;
  reasons: string[];
};

export type Options = {
  /** "soft" (default): out-of-sector lowers to NEEDS HUMAN. "hard": it forces PASS. */
  sectorFlag?: "soft" | "hard";
};

const MISSING: Rating = 1;

/** A rating that was not produced counts as Missing (1). A missing number drags the score. */
function filled(ratings: Ratings): Record<CriterionId, Rating> {
  return Object.fromEntries(CRITERIA.map((c) => [c, ratings[c] ?? MISSING])) as Record<CriterionId, Rating>;
}

export function recommendForLens(card: ThesisCard, raw: Ratings, lens: Lens, opts: Options = {}): LensResult {
  const r = filled(raw);
  const w = lensWeights(card, lens);
  const totalWeight = CRITERIA.reduce((s, c) => s + w[c], 0);
  const score = Math.round((CRITERIA.reduce((s, c) => s + w[c] * r[c], 0) / totalWeight) * 100) / 100;
  const reasons: string[] = [];
  const t = card.thresholds;

  // Order matters: a conflict outranks everything, then rule-outs, then unknown deal breakers, then the score.
  if (r.C4 === 0) {
    reasons.push("Possible portfolio conflict. Held for Kushal.");
    return { lens, recommendation: "hold", score, reasons };
  }
  if (r.C1 === 0) reasons.push("Later stage than the fund invests in.");
  if (r.C3 === 0) reasons.push("Depends on regulation becoming friendlier.");
  if (r.C2 === 0 && opts.sectorFlag === "hard") reasons.push("Outside the fund's sectors.");
  if (reasons.length) return { lens, recommendation: "pass", score, reasons };

  const unknownBreakers = (["C1", "C3", "C4"] as const).filter((c) => r[c] === MISSING);
  if (unknownBreakers.length) {
    reasons.push(`Could not tell ${unknownBreakers.join(", ")}, which could rule the company out. A person decides.`);
    return { lens, recommendation: "needs_human", score, reasons };
  }

  const missingCount = CRITERIA.filter((c) => r[c] === MISSING).length;
  let rec: Recommendation;
  if (score >= t.go_min) rec = "go";
  else if (score <= t.pass_max) rec = "pass";
  else rec = "needs_human";
  reasons.push(`Weighted score ${score.toFixed(2)} of 4 (GO from ${t.go_min}, PASS at or below ${t.pass_max}).`);

  if (rec === "go" && missingCount > t.max_missing_for_go) {
    rec = "needs_human";
    reasons.push(`${missingCount} criteria are missing evidence, too many to recommend GO.`);
  }
  if (r.C2 === 0 && rec === "go") {
    rec = "needs_human";
    reasons.push("Outside the four sectors named in the case. Soft flag: a person decides.");
  }
  return { lens, recommendation: rec, score, reasons };
}

export type Recommendations = {
  public: LensResult;
  revealed: LensResult;
  headline: Lens;
  lensNote: string | null;
};

/** Both lenses side by side, plus which one is the headline and why (Meeting 5: "tell me which one you used"). */
export function recommend(card: ThesisCard, ratings: Ratings, headline: Lens = "revealed", opts: Options = {}): Recommendations {
  const pub = recommendForLens(card, ratings, "public", opts);
  const rev = recommendForLens(card, ratings, "revealed", opts);
  const lensNote =
    pub.recommendation === rev.recommendation
      ? null
      : `The lenses differ: public thesis says ${label(pub.recommendation)}, revealed thesis says ${label(rev.recommendation)}. ` +
        `The headline uses the ${headline} lens because ${
          headline === "revealed" ? "it reflects what the fund has actually backed" : "it follows the fund's stated thesis"
        }.`;
  return { public: pub, revealed: rev, headline, lensNote };
}

export function label(r: Recommendation): string {
  return { go: "GO", pass: "PASS", needs_human: "NEEDS HUMAN", hold: "HOLD" }[r];
}
