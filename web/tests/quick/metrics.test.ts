// M7 quick tests: the dashboard metrics, the stop list, and who may change each setting.
import { describe, expect, it } from "vitest";
import { blindAgreement, overrideRate, overrideStop, reviewStop, weekOf, type Gate1 } from "@/lib/metrics";
import { emailEdits } from "@/lib/metrics";
import { editClass } from "@/lib/outreach/checks";
import { checkSetting } from "@/lib/settings";
import { tag } from "../helpers";

const r = (o: Partial<Gate1>): Gate1 => ({ created_at: "2026-11-23T05:00:00Z", seconds_spent: 300, agreed_with_system: true, system_recommendation: "pass", decision: "pass", blind: false, blind_first_view: null, ...o });

describe("dashboard metrics (PRD 2.4)", () => {
  it(tag("High", "K1", "weeks start on Monday, India time"), () => {
    expect(weekOf("2026-11-26T10:00:00Z")).toBe("2026-11-23");
    expect(weekOf("2026-11-22T20:00:00Z")).toBe("2026-11-23"); // Monday 01:30 IST
  });
  it(tag("High", "K2", "an override is a different choice from a system that took a side; needs a person is not a side"), () => {
    expect(overrideRate([r({}), r({ agreed_with_system: false, decision: "go" }), r({ system_recommendation: "needs_human", agreed_with_system: false })])).toBe(0.5);
    expect(overrideRate([r({ system_recommendation: "needs_human", agreed_with_system: false })])).toBeNull();
  });
  it(tag("High", "K3", "blind agreement compares Riya's first view with the system, and counts changes after the reveal"), () => {
    const b = blindAgreement([r({ blind: true, blind_first_view: "pass" }), r({ blind: true, blind_first_view: "go", decision: "pass" }), r({ blind: true, blind_first_view: "unsure" })]);
    expect(b).toEqual({ matched: 1, of: 3, changedAfterReveal: 1 });
  });
});

describe("stop list (PRD 2.5)", () => {
  it(tag("Critical", "K4", "overrides above 40 percent two weeks running is red; one week is not"), () => {
    expect(overrideStop([0.5, 0.2, 0.45])).toBe(false);
    expect(overrideStop([0.2, 0.45, 0.41])).toBe(true);
    expect(overrideStop([0.4, 0.4])).toBe(false); // exactly 40 percent is not above the line
  });
  it(tag("Critical", "K5", "review time above 15 minutes counts only after three weeks"), () => {
    expect(reviewStop([20, 18])).toBe(false);
    expect(reviewStop([20, 18, 16])).toBe(true);
    expect(reviewStop([20, 18, 9])).toBe(false);
  });
});

describe("settings permissions (PRD 13.13)", () => {
  it(tag("Critical", "K6", "only Kushal changes the cost cap, the lens, the sector rule and the outreach mode"), () => {
    for (const k of ["daily_cost_cap_usd", "default_headline_lens", "sector_flag_strength", "outreach_mode", "research_mode", "blind_sample_rate"]) {
      expect(checkSetting(k, "riya", "x")).toMatchObject({ ok: false, status: 403 });
      expect(checkSetting(k, "aditya", "x")).toMatchObject({ ok: false, status: 403 });
    }
    expect(checkSetting("daily_cost_cap_usd", "kushal", 8)).toEqual({ ok: true, value: 8 });
    expect(checkSetting("outreach_mode", "kushal", "live")).toEqual({ ok: true, value: "live" });
  });
  it(tag("High", "K7", "values are checked: a cap of zero or a lens that does not exist is refused"), () => {
    expect(checkSetting("daily_cost_cap_usd", "kushal", 0)).toMatchObject({ ok: false, status: 400 });
    expect(checkSetting("default_headline_lens", "kushal", "hindsight")).toMatchObject({ ok: false, status: 400 });
    expect(checkSetting("attendees", "riya", { riya: "not-an-email" })).toMatchObject({ ok: false, status: 400 });
    expect(checkSetting("attendees", "riya", { riya: "riya@fund.com" })).toMatchObject({ ok: true });
    expect(checkSetting("no_such_thing", "kushal", 1)).toMatchObject({ ok: false, status: 404 });
  });
});

describe("Loop 2 disagreement (G9)", () => {
  it(tag("High", "D1", "counts sent emails as kept, small edit or rewrite; unsent drafts do not count"), () => {
    const draft = ["Hi Ana,", "", "41% of buyers return within 30 days, which is rare at seed.", "", "Could we do 30 minutes on Tuesday?", "", "Riya", "All In Capital"].join("\n");
    const e = emailEdits([
      { kind: "invite", draft_body: draft, sent_body: draft, sent_at: "2026-11-24" },
      { kind: "invite", draft_body: draft, sent_body: draft.replace("Ana", "Anaya"), sent_at: "2026-11-24" },
      { kind: "invite", draft_body: draft, sent_body: "Hello, a completely different note about meeting soon.", sent_at: "2026-11-24" },
      { kind: "invite", draft_body: draft, sent_body: null, sent_at: null },
    ], editClass);
    expect(e).toMatchObject({ n: 3, kept: 1, small: 1, rewrite: 1 });
    expect(e.rewriteRate).toBeCloseTo(1 / 3);
  });
});
