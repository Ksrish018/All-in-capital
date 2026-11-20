import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, readJson, tag } from "../helpers";

const BLOCKED = [
  "linkedin.com", "instagram.com", "facebook.com", "rocketreach.co", "zoominfo.com",
  "apollo.io", "contactout.com", "signalhire.com", "leadiq.com", "lusha.com",
];

type Gold = {
  applicants: {
    id: string;
    files: { form: string; deck: string | null };
    source: string;
    allowed_recommendations: string[];
    aditya_on_call: boolean;
    flags: { flag: string; severity: string }[];
  }[];
};

describe("gold labels for the 10 seed applicants", () => {
  const gold = readJson<Gold>("evals/gold/applicants.json");

  it(tag("High", "G1", "all ten applicants are present, once each"), () => {
    const ids = gold.applicants.map((a) => a.id).sort();
    expect(ids).toEqual(
      ["capilot", "carecorner", "earnwise", "grainkind", "pumpwise", "rentroute", "settlr", "stocksathi", "talkbook", "yatrika"],
    );
  });

  it(tag("High", "G2", "recommendations and sources use allowed values"), () => {
    for (const a of gold.applicants) {
      expect(a.allowed_recommendations.length).toBeGreaterThan(0);
      for (const r of a.allowed_recommendations) expect(["go", "pass", "needs_human", "hold"]).toContain(r);
      expect(["public_form", "warm_intro"]).toContain(a.source);
      for (const f of a.flags) expect(["Critical", "High", "Low"]).toContain(f.severity);
    }
  });

  it(tag("High", "G3", "partner rules are encoded: Talkbook held, Pumpwise brings Aditya, StockSathi is a warm intro"), () => {
    const by = Object.fromEntries(gold.applicants.map((a) => [a.id, a]));
    expect(by.talkbook.allowed_recommendations).toEqual(["hold"]);
    expect(by.pumpwise.aditya_on_call).toBe(true);
    expect(gold.applicants.filter((a) => a.aditya_on_call).map((a) => a.id)).toEqual(["pumpwise"]);
    expect(by.stocksathi.source).toBe("warm_intro");
    expect(by.capilot.files.deck).toBeNull();
  });
});

describe("research fixtures", () => {
  const dir = path.join(ROOT, "evals/fixtures/research/memo_companies");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));

  it(tag("High", "F1", "real research recorded for all 12 memo companies"), () => {
    expect(files.length).toBe(12);
  });

  it(tag("Critical", "F2", "no result comes from a blocked site"), () => {
    const bad: string[] = [];
    for (const f of files) {
      const rec = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      for (const check of Object.values(rec.checks) as { results: { url: string }[] }[]) {
        for (const r of check.results) {
          const host = new URL(r.url).hostname;
          if (BLOCKED.some((b) => host === b || host.endsWith("." + b))) bad.push(`${f}: ${r.url}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it(tag("Critical", "F3", "synthetic pages only use .example domains"), () => {
    const syn = readJson<{ applicants: Record<string, { pages: { url: string }[] }>; injection_fixture: { url: string } }>(
      "evals/fixtures/research/applicants_synthetic.json",
    );
    const urls = [...Object.values(syn.applicants).flatMap((a) => a.pages.map((p) => p.url)), syn.injection_fixture.url];
    for (const u of urls) expect(new URL(u).hostname.endsWith(".example")).toBe(true);
  });

  it(tag("High", "F4", "recorded memo research carries the never-in-back-test warning"), () => {
    for (const f of files) {
      const rec = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      expect(rec.warning).toMatch(/Never use in the back test/);
    }
  });
});
