import { describe, expect, it } from "vitest";
import { CRITERIA, ThesisCardSchema, type CriterionId } from "@/lib/thesis/card";
import { recommend, recommendForLens, type Rating, type Ratings } from "@/lib/thesis/recommend";
import { readJson, tag } from "../helpers";

const card = ThesisCardSchema.parse(readJson("seed/fund/thesis_card_v1.json"));
const all = (r: Rating): Ratings => Object.fromEntries(CRITERIA.map((c) => [c, r])) as Ratings;
const with_ = (base: Ratings, over: Partial<Record<CriterionId, Rating | null>>): Ratings => ({ ...base, ...over });

describe("Thesis Card v1", () => {
  it(tag("High", "T1", "has all 11 criteria, each with a source"), () => {
    expect(card.criteria.map((c) => c.id)).toEqual([...CRITERIA]);
    for (const c of card.criteria) expect(c.sources.length).toBeGreaterThan(0);
  });

  it(tag("High", "T2", "each lens's weights add up to 1"), () => {
    for (const w of [card.weights_public, card.weights_revealed]) {
      const sum = CRITERIA.reduce((s, c) => s + w[c], 0);
      expect(sum).toBeCloseTo(1, 6);
    }
  });

  it(tag("High", "T3", "thresholds are ordered and inside the 0 to 4 scale"), () => {
    expect(card.thresholds.pass_max).toBeLessThan(card.thresholds.go_min);
    expect(card.thresholds.go_min).toBeLessThanOrEqual(4);
    expect(card.thresholds.pass_max).toBeGreaterThanOrEqual(0);
  });

  it(tag("High", "T4", "the revealed lens weighs groundwork and numbers more than the public lens"), () => {
    expect(card.weights_revealed.C6).toBeGreaterThan(card.weights_public.C6);
    expect(card.weights_revealed.C7).toBeGreaterThan(card.weights_public.C7);
  });

  it(tag("High", "T5", "deal breakers are exactly stage, regulation and portfolio"), () => {
    expect(card.criteria.filter((c) => c.deal_breaker).map((c) => c.id)).toEqual(["C1", "C3", "C4"]);
  });
});

describe("memo tags", () => {
  type Tags = { memos: { id: string; decision: string; split: string; tags: Record<string, string[]> }[] };
  const memos = readJson<Tags>("seed/fund/memo_tags.json").memos;

  it(tag("High", "M1", "12 memos, 6 invested and 6 passed, four tagged sections each"), () => {
    expect(memos.length).toBe(12);
    expect(memos.filter((m) => m.decision === "invested").length).toBe(6);
    for (const m of memos) {
      expect(Object.keys(m.tags).sort()).toEqual(["founder", "risks", "what", "why"]);
      for (const t of Object.values(m.tags).flat()) expect(CRITERIA).toContain(t);
    }
  });

  it(tag("Critical", "M2", "the held-out test set is Giva, SuperK, Coinlane and Prepnest, with both decisions"), () => {
    const test = memos.filter((m) => m.split === "test");
    expect(test.map((m) => m.id).sort()).toEqual(["coinlane", "giva", "prepnest", "superk"]);
    expect(new Set(test.map((m) => m.decision))).toEqual(new Set(["invested", "passed"]));
  });

  it(tag("High", "M3", "every criterion except portfolio conflict has memo evidence to learn from"), () => {
    const used = new Set(memos.flatMap((m) => Object.values(m.tags).flat()));
    for (const c of CRITERIA.filter((c) => c !== "C4")) expect(used.has(c)).toBe(true);
  });
});

describe("recommendation rules (code, not the model)", () => {
  it(tag("Critical", "R1", "a portfolio conflict is always HOLD, even with perfect scores"), () => {
    const res = recommend(card, with_(all(4), { C4: 0 }));
    expect(res.public.recommendation).toBe("hold");
    expect(res.revealed.recommendation).toBe("hold");
  });

  it(tag("Critical", "R2", "later stage can never be GO (Settlr)"), () => {
    const res = recommend(card, with_(all(4), { C1: 0 }));
    expect(res.revealed.recommendation).toBe("pass");
    expect(res.revealed.reasons.join(" ")).toMatch(/Later stage/);
  });

  it(tag("Critical", "R3", "a regulatory bet can never be GO (Coinlane, RentRoute)"), () => {
    expect(recommendForLens(card, with_(all(4), { C3: 0 }), "revealed").recommendation).toBe("pass");
  });

  it(tag("High", "R4", "an unknown deal breaker needs a person"), () => {
    expect(recommendForLens(card, with_(all(4), { C3: 1 }), "revealed").recommendation).toBe("needs_human");
    expect(recommendForLens(card, with_(all(4), { C1: null }), "revealed").recommendation).toBe("needs_human");
  });

  it(tag("High", "R5", "out of sector is soft by default and hard only when Kushal sets it"), () => {
    const r = with_(all(4), { C2: 0 });
    expect(recommendForLens(card, r, "revealed").recommendation).toBe("needs_human");
    expect(recommendForLens(card, r, "revealed", { sectorFlag: "hard" }).recommendation).toBe("pass");
  });

  it(tag("High", "R6", "a missing rating counts against the company (Meeting 1)"), () => {
    const withMissing = recommendForLens(card, with_(all(3), { C7: null }), "revealed").score;
    const withAdequate = recommendForLens(card, all(3), "revealed").score;
    expect(withMissing).toBeLessThan(withAdequate);
  });

  it(tag("High", "R7", "too many missing criteria block GO"), () => {
    const r = with_(all(4), { C6: null, C7: null, C9: null, C10: null });
    expect(recommendForLens(card, r, "revealed").recommendation).toBe("needs_human");
  });

  it(tag("High", "R8", "clear evidence gives GO, clear failure gives PASS"), () => {
    expect(recommendForLens(card, all(4), "revealed").recommendation).toBe("go");
    expect(recommendForLens(card, with_(all(1), { C1: 3, C3: 3, C4: 4 }), "revealed").recommendation).toBe("pass");
  });

  it(tag("High", "R9", "when the lenses differ, the brief says so and names the headline lens"), () => {
    // Strong groundwork and numbers, weaker on the things the public lens weighs more.
    const r: Ratings = { C1: 4, C2: 3, C3: 3, C4: 4, C5: 3, C6: 4, C7: 4, C8: 2, C9: 2, C10: 2, C11: 2 };
    const res = recommend(card, r);
    expect(res.revealed.score).toBeGreaterThan(res.public.score);
    if (res.public.recommendation !== res.revealed.recommendation) {
      expect(res.lensNote).toMatch(/headline uses the revealed lens/);
    } else {
      expect(res.lensNote).toBeNull();
    }
  });

  it(tag("High", "R10", "the same ratings always give the same answer (run twice)"), () => {
    const r: Ratings = { C1: 3, C2: 3, C3: 2, C4: 4, C5: 3, C6: 2, C7: 1, C8: 3, C9: 3, C10: 2, C11: 3 };
    expect(recommend(card, r)).toEqual(recommend(card, r));
  });
});
