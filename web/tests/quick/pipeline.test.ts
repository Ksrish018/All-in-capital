import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { STAGES, STALLED, STATUSES, STATUS_LABEL, samplePipeline, stageOf, toneOf, waitingOn } from "@/lib/pipeline";
import { ROOT, tag } from "../helpers";

describe("live pipeline", () => {
  it(tag("High", "V1", "the pipeline knows exactly the statuses the database allows"), () => {
    const sql = fs.readFileSync(path.join(ROOT, "supabase/migrations/0001_init.sql"), "utf8");
    const block = sql.match(/status text not null default 'received' check \(status in \(([\s\S]*?)\)\)/)![1];
    const inDb = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect([...STATUSES].sort()).toEqual(inDb);
  });

  it(tag("Critical", "V2", "every status lands in exactly one column, so the board always adds up to the total"), () => {
    for (const s of STATUSES) {
      const homes = STAGES.filter((st) => (st.statuses as readonly string[]).includes(s));
      expect(homes.length, s).toBe(STALLED.includes(s) ? 0 : 1);
      expect(STAGES.map((x) => x.id)).toContain(stageOf(s));
      expect(STATUS_LABEL[s]).toBeTruthy();
    }
  });

  it(tag("High", "V3", "a stalled application stays in the column of the last step it reached"), () => {
    expect(stageOf("needs_attention", "scoring")).toBe("research");
    expect(stageOf("paused_cost_cap", "parsing")).toBe("checks");
    expect(stageOf("needs_attention", null)).toBe("intake");
  });

  it(tag("High", "V4", "a portfolio conflict sits with Kushal and is shown as a hold"), () => {
    expect(stageOf("hold_conflict")).toBe("kushal");
    expect(toneOf("hold_conflict")).toBe("hold");
  });

  it(tag("High", "V5", "each gate shows as waiting on the right person, and Aditya has no gate"), () => {
    expect(waitingOn("riya")).toBe("riya");
    expect(waitingOn("kushal")).toBe("kushal");
    expect(waitingOn("aditya")).toBeNull();
  });

  it(tag("High", "V6", "sample data holds only company names, no founder details"), () => {
    const { apps, events } = samplePipeline(0);
    expect(apps.length).toBe(10);
    const text = JSON.stringify({ apps, events });
    expect(text).not.toMatch(/@|\+91|linkedin\.com|\b\d{10}\b/i);
  });
});
