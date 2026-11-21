// M4 quick tests: the rules of Gate 1 and Gate 2, and Loop C recall.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { boardColumn, companyTags, joinsBlindSample, recallCorrections, systemPosition, validateCorrection, validateGate1 } from "@/lib/gates";
import { ROOT, tag } from "../helpers";

describe("Gate 1 (Riya)", () => {
  it(tag("High", "H1", "agreeing is one click, changing needs a one-line reason"), () => {
    expect(validateGate1({ decision: "pass", system: "pass" })).toEqual({ ok: true, agreed: true });
    expect(validateGate1({ decision: "go", system: "pass" }).ok).toBe(false);
    expect(validateGate1({ decision: "go", system: "pass", reason: "Groundwork is stronger than rated" })).toEqual({ ok: true, agreed: false });
  });
  it(tag("High", "H2", "when the system needs a person, Riya's choice always carries a reason"), () => {
    expect(validateGate1({ decision: "go", system: null }).ok).toBe(false);
    expect(validateGate1({ decision: "go", system: null, reason: "Strong founder fit" })).toEqual({ ok: true, agreed: false });
  });
  it(tag("High", "H3", "a stopped-early brief reads as likely PASS, a conflict as Hold"), () => {
    expect(systemPosition("needs_human", "short_circuited")).toBe("pass");
    expect(systemPosition("hold", "hold_conflict")).toBe("hold");
    expect(systemPosition("needs_human", "brief_ready")).toBeNull();
    expect(systemPosition("go", "brief_ready")).toBe("go");
  });
  it(tag("High", "H4", "a correction needs a rating 0 to 4, a reason under 140 characters, and fact or rule"), () => {
    expect(validateCorrection({ rating: 3, reason: "CA practice is groundwork", kind: "fact" })).toBeNull();
    expect(validateCorrection({ rating: 5, reason: "x", kind: "fact" })).toMatch(/0 to 4/);
    expect(validateCorrection({ rating: 2, reason: "", kind: "rule" })).toMatch(/reason/);
    expect(validateCorrection({ rating: 2, reason: "x".repeat(141), kind: "rule" })).toMatch(/140/);
  });
});

describe("blind sample", () => {
  it(tag("High", "H5", "at least 10 percent of PASS recommendations are blind, never a GO"), () => {
    let pass = 0;
    let blind = 0;
    for (let i = 0; i < 30; i++) {
      if (joinsBlindSample(true, pass, blind, 0.1)) blind++;
      pass++;
    }
    expect(blind / pass).toBeGreaterThanOrEqual(0.1);
    expect(blind).toBeLessThanOrEqual(4);
    expect(joinsBlindSample(false, 0, 0, 0.1)).toBe(false);
    expect(joinsBlindSample(true, 0, 0, 0.1)).toBe(true); // the first PASS of a batch is blind
  });
});

describe("Gate 2 (Kushal)", () => {
  it(tag("Critical", "H6", "only clean agreements can be signed off in bulk"), () => {
    expect(boardColumn({ status: "riya_decided", agreed: true, flags: [] })).toBe("agreed");
    expect(boardColumn({ status: "riya_decided", agreed: false, flags: [] })).toBe("disagreed");
    expect(boardColumn({ status: "riya_decided", agreed: true, flags: [{ id: "vague_deck", severity: "High" }] })).toBe("flagged");
    expect(boardColumn({ status: "riya_decided", agreed: true, flags: [{ id: "outside_core_sectors", severity: "Soft" }] })).toBe("agreed");
    expect(boardColumn({ status: "hold_conflict", agreed: null, flags: [] })).toBe("conflict");
  });
  it(tag("Critical", "H7", "the sign off route re-checks the column, so a flagged card cannot slip into a bulk sign off"), () => {
    const route = fs.readFileSync(path.join(ROOT, "web/src/app/api/sign-off/route.ts"), "utf8");
    expect(route).toMatch(/boardColumn\(/);
    expect(route).toMatch(/col !== "agreed"/);
    expect(route).toMatch(/role !== "kushal"/);
  });
});

describe("Loop C: rule corrections are recalled, never applied to the card", () => {
  const c = (o: Partial<{ criterion_id: string; kind: string; rule_status: string | null; tags: string[]; created_at: string }>) => ({
    criterion_id: "C7", kind: "rule", rule_status: "pending", tags: ["sector:consumer brands"], created_at: "2026-11-20T00:00:00Z", ...o,
  });
  it(tag("High", "H8", "up to three matching rule corrections, newest first; facts and declined ones never"), () => {
    const all = [
      c({ created_at: "2026-11-01T00:00:00Z" }), c({ created_at: "2026-11-02T00:00:00Z" }), c({ created_at: "2026-11-03T00:00:00Z" }), c({ created_at: "2026-11-04T00:00:00Z" }),
      c({ kind: "fact" }), c({ rule_status: "declined" }), c({ criterion_id: "C5" }), c({ tags: ["sector:fintech"] }),
    ];
    const got = recallCorrections(all, "C7", ["sector:consumer brands"]);
    expect(got).toHaveLength(3);
    expect(got[0].created_at).toBe("2026-11-04T00:00:00Z");
    expect(got.every((x) => x.kind === "rule" && x.rule_status !== "declined" && x.criterion_id === "C7")).toBe(true);
  });
  it(tag("High", "H9", "tags describe the company by sector, buyer and revenue model"), () => {
    expect(companyTags({ sector: "Consumer brands", sellsToBusinesses: false, revenueType: "net revenue" })).toEqual(["sector:consumer brands", "buyer:consumer"]);
    expect(companyTags({ sector: "Fintech", sellsToBusinesses: true, revenueType: "MRR subscription" })).toEqual(["sector:fintech", "buyer:business", "model:subscription"]);
  });
});
