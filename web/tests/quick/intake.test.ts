// M2 quick tests: parse, redact, money, cheap checks and the portfolio decision.
// All inputs here are made up, so these run in CI without the case PDFs.
import { describe, expect, it } from "vitest";
import { parseFormItems, parseFounder, type TextItem } from "@/lib/intake/form";
import { findPii, redactText, type FounderRef } from "@/lib/intake/redact";
import { parseInr } from "@/lib/intake/money";
import { outcome, runCheapChecks, type CheckInput } from "@/lib/intake/checks";
import { decideOverlap } from "@/lib/intake/portfolio";
import { checkPdf, nameFromFile } from "@/lib/intake/create";
import { tag } from "../helpers";

// A made-up form in the case template: headings at x=45 (13pt), labels at x=52, answers at x=193.
const H = (page: number, y: number, str: string): TextItem => ({ page, x: 45, y, h: 13, w: str.length * 6, str });
const L = (page: number, y: number, str: string): TextItem => ({ page, x: 52, y, h: 10, w: str.length * 5, str });
const A = (page: number, y: number, str: string, x = 193): TextItem => ({ page, x, y, h: 12, w: str.length * 5.2, str });
const sampleForm: TextItem[] = [
  { page: 1, x: 45, y: 763, h: 18, w: 200, str: "Application Form Response" },
  H(1, 705, "Company"),
  L(1, 682, "Company name"), A(1, 681, "Acme Robotics (Acme Robotics Pvt. Ltd.)"),
  L(1, 660, "Website"), A(1, 658, "www.acme.example"),
  L(1, 592, "One-line description"), A(1, 591, "Robots for"), { page: 1, x: 249, y: 591, h: 12, w: 6, str: "fi" }, A(1, 591, "nishing furniture.", 255),
  L(1, 570, "Sector (as selected)"), A(1, 568, "Deeptech"),
  L(1, 547, "Stage (as selected)"), A(1, 546, "Pre-seed"),
  H(1, 491, "Founders"),
  L(1, 469, "Founder 1"), A(1, 467, "Asha Verma, CEO. 7 years building robots at a car maker."), A(1, 453, "linkedin.com/in/asha-"), A(1, 439, "verma-example"),
  L(1, 432, "Founder 2"), A(1, 430, "Ravi K, CTO. Embedded engineer."),
  H(1, 91, "Fundraising"),
  L(1, 68, "Amount raising"), A(1, 67, "INR 2 Cr"),
  L(2, 710, "Other investors in"), L(2, 697, "conversation"), A(2, 709, "One angel."),
  H(2, 643, "Anything else we should know?"),
  { page: 2, x: 45, y: 625, h: 10, w: 100, str: "Happy to demo." },
  { page: 2, x: 52, y: 612, h: 10, w: 100, str: "Call us any time." },
];

describe("parse the form (Step 3)", () => {
  const form = parseFormItems(sampleForm);

  it(tag("High", "I1", "pairs each answer with its label by position, across pages"), () => {
    expect(form.byKey.company_name).toBe("Acme Robotics (Acme Robotics Pvt. Ltd.)");
    expect(form.byKey.sector).toBe("Deeptech");
    expect(form.byKey.stage).toBe("Pre-seed");
    expect(form.byKey.amount_raising).toBe("INR 2 Cr");
    expect(form.fields.find((f) => f.key === "amount_raising")?.page).toBe(1);
  });

  it(tag("High", "I2", "joins words split by PDF ligatures, and labels that wrap onto two lines"), () => {
    expect(form.byKey.one_line).toBe("Robots for finishing furniture.");
    expect(form.byKey.other_investors).toBe("One angel.");
    expect(form.fields.some((f) => f.key === "conversation")).toBe(false);
  });

  it(tag("High", "I3", "keeps every line of the 'Anything else' answer"), () => {
    expect(form.byKey.anything_else).toBe("Happy to demo. Call us any time.");
  });

  it(tag("High", "I4", "reads founders, including a wrapped LinkedIn link and a one-letter surname"), () => {
    const f1 = parseFounder("founder_1", form.byKey.founder_1);
    expect(f1).toMatchObject({ name: "Asha Verma", role: "CEO", linkedin: "linkedin.com/in/asha-verma-example" });
    expect(parseFounder("founder_2", form.byKey.founder_2)).toMatchObject({ name: "Ravi K", role: "CTO" });
    expect(parseFounder("f", "Manu Das. 10 years running a travel agency.")).toMatchObject({ name: "Manu Das", role: null });
    expect(parseFounder("f", "Dr. Nila Rao, CEO. MBBS.")).toMatchObject({ name: "Dr. Nila Rao", role: "CEO" });
  });
});

describe("redact (Step 4) and the N6 guard", () => {
  const founders: FounderRef[] = [
    { id: "F1", name: "Asha Verma", linkedin: "linkedin.com/in/asha-verma-example", email: "asha@acme.example", phone: "+91 98765 43210" },
    { id: "F2", name: "Dr. Nila Rao", linkedin: null },
  ];
  const text = `Asha Verma, CEO. linkedin.com/in/asha-verma-example. Write to asha@acme.example or hello@acme.example,
call +91 98765 43210 or 9876543210. Asha's team. Dr. Nila Rao leads clinics; Nila and Rao agree. Other: linkedin.com/in/someone-else`;
  const out = redactText(text, founders);

  it(tag("Critical", "N6a", "no founder name, email, phone or link survives redaction"), () => {
    expect(findPii(out, founders)).toEqual([]);
    expect(out).not.toMatch(/Asha|Verma|Nila|Rao|@|98765/);
  });

  it(tag("High", "N6b", "uses founder IDs and tags, so the text still reads"), () => {
    expect(out).toContain("F1, CEO. [LINK_F1]");
    expect(out).toContain("F1's team");
    expect(out).toContain("F2 leads clinics; F2 and F2 agree");
    expect(out).toContain("[EMAIL]");
    expect(out).toContain("[PHONE]");
    expect(out).toContain("[LINK]");
  });

  it(tag("Critical", "N6c", "the guard catches founder details left in any model input"), () => {
    expect(findPii("Founded by Asha.", founders)).toContain("name F1");
    expect(findPii("reach us at a@b.example", founders).length).toBeGreaterThan(0);
    expect(findPii("call 9876543210", founders).length).toBeGreaterThan(0);
    expect(findPii("F1 and F2 built a robot.", founders)).toEqual([]);
  });

  it(tag("High", "N6d", "does not mistake money or counts for phone numbers"), () => {
    expect(findPii("INR 1,20,00,000 raised. 3,100 customers. 2026.", [])).toEqual([]);
  });
});

describe("money", () => {
  it(tag("High", "I5", "reads Indian amounts as founders write them"), () => {
    expect(parseInr("INR 30 Cr")).toBe(30e7);
    expect(parseInr("INR 9.4 L annualised")).toBe(9.4e5);
    expect(parseInr("MRR INR 78,000")).toBe(78000);
    expect(parseInr("about INR 9 lakh")).toBe(9e5);
    expect(parseInr("₹2.5 crore")).toBe(2.5e7);
    expect(parseInr("No raise amount")).toBeNull();
  });
});

describe("cheap checks (Step 5)", () => {
  const base = (byKey: Record<string, string>, extra: Partial<CheckInput> = {}): CheckInput => ({
    fields: Object.entries(byKey).map(([key, value]) => ({ key, label: key, value, page: 1 })),
    byKey, others: [], portfolio: null, inrPerUsd: 85, sectorFlag: "soft", ...extra,
  });
  const ok = { company_name: "Acme", sector: "Fintech", stage: "Pre-seed", amount_raising: "INR 2 Cr" };

  it(tag("High", "C1", "a clean pre-seed application passes the cheap checks"), () => {
    expect(runCheapChecks(base(ok))).toEqual([]);
    expect(outcome(runCheapChecks(base(ok)))).toBe("continue");
  });

  it(tag("Critical", "C2", "a named Series round, or a raise far above the fund's cheque, stops early (Settlr)"), () => {
    expect(outcome(runCheapChecks(base({ ...ok, stage: "Series A" })))).toBe("short_circuited");
    const big = runCheapChecks(base({ ...ok, amount_raising: "INR 30 Cr" }));
    expect(big[0]).toMatchObject({ id: "later_stage", short_circuit: true });
    expect(big[0].evidence.length).toBeGreaterThan(0);
  });

  it(tag("High", "C3", "outside the four sectors is soft by default and hard only when Kushal sets it (CareCorner)"), () => {
    const soft = runCheapChecks(base({ ...ok, sector: "Other (Healthcare)" }));
    expect(soft[0]).toMatchObject({ id: "outside_core_sectors", severity: "Soft", short_circuit: false });
    const hard = runCheapChecks(base({ ...ok, sector: "Other (Healthcare)" }, { sectorFlag: "hard" }));
    expect(hard[0].short_circuit).toBe(true);
  });

  it(tag("High", "C4", "a large build-out per site is flagged as heavy on capital (CareCorner)"), () => {
    const f = runCheapChecks(base({ ...ok, capex: "INR 28 L per clinic, funded by angels." }));
    expect(f.map((x) => x.id)).toContain("capital_intensive");
    const per = runCheapChecks(base({ ...ok, use_of_funds: "Open stores at INR 15 L per store." }));
    expect(per.map((x) => x.id)).toContain("capital_intensive");
    expect(runCheapChecks(base({ ...ok, use_of_funds: "Sensors at INR 4,000 per unit." }))).toEqual([]);
  });

  it(tag("High", "C5", "a crypto exchange is flagged as likely excluded (Coinlane)"), () => {
    expect(runCheapChecks(base({ ...ok, one_line: "A crypto exchange for Indian retail." }))[0].id).toBe("likely_excluded");
  });

  it(tag("Critical", "C6", "a portfolio conflict is always held for Kushal, even with other hits"), () => {
    const f = runCheapChecks(base({ ...ok, stage: "Series A" }, { portfolio: { overlap: "MeetRecord", reason: "Same buyer and job.", confidence: "high" } }));
    expect(outcome(f)).toBe("hold_conflict");
    expect(f.find((x) => x.id === "portfolio_conflict")?.with).toBe("MeetRecord");
  });

  it(tag("High", "C7", "a weak portfolio match is shown as a note and does not hold the application"), () => {
    const f = runCheapChecks(base(ok, { portfolio: { overlap: "SuperK", reason: "Both serve kirana stores.", confidence: "low" } }));
    expect(f[0]).toMatchObject({ id: "portfolio_overlap_note", short_circuit: false });
    expect(outcome(f)).toBe("continue");
  });

  it(tag("High", "C8", "a duplicate by website or name is flagged, never dropped"), () => {
    const f = runCheapChecks(base({ ...ok, website: "https://www.acme.example/" }, { others: [{ id: "x", company_name: "Other", website: "acme.example" }] }));
    expect(f[0].id).toBe("possible_duplicate");
  });

  it(tag("High", "C9", "'Run full review anyway' keeps the flags but skips nothing"), () => {
    const f = runCheapChecks(base({ ...ok, stage: "Series A" }, { fullReview: true }));
    expect(f[0].id).toBe("later_stage");
    expect(outcome(f)).toBe("continue");
  });
});

describe("portfolio decision is made in code (A0)", () => {
  const c = (o: Partial<{ same_buyer: boolean; same_job: boolean; buyer_picks_one: boolean }>) => ({
    company: "MeetRecord", company_buyer: "sales teams", company_job: "call notes", reason: "r",
    same_buyer: false, same_job: false, buyer_picks_one: false, ...o,
  });

  it(tag("Critical", "C10", "same buyer, same job and a buyer would pick one: a conflict (Talkbook)"), () => {
    expect(decideOverlap([c({ same_buyer: true, same_job: true, buyer_picks_one: true })])).toMatchObject({ overlap: "MeetRecord", confidence: "high" });
  });

  it(tag("High", "C11", "same customers for a different job is not a conflict (StockSathi and SuperK)"), () => {
    expect(decideOverlap([c({ same_buyer: true })]).overlap).toBeNull();
    expect(decideOverlap([c({ same_buyer: true, same_job: true })]).confidence).toBe("low");
  });
});

describe("intake (Step 1)", () => {
  it(tag("High", "I6", "refuses files that are not PDFs or are over 25 MB, with a clear message"), async () => {
    await expect(checkPdf(new File(["hello"], "deck.pdf"), "deck")).rejects.toThrow(/not a PDF/);
    await expect(checkPdf(new File([new Uint8Array(26 * 1024 * 1024)], "deck.pdf"), "deck")).rejects.toThrow(/25 MB/);
    await expect(checkPdf(new File(["%PDF-1.7 rest"], "deck.pdf"), "deck")).resolves.toBeInstanceOf(Uint8Array);
  });

  it(tag("Low", "I7", "guesses the company from the file name until the form is parsed"), () => {
    expect(nameFromFile("Talkbook_Form.pdf")).toBe("Talkbook");
    expect(nameFromFile("StockSathi_Form Response.pdf")).toBe("StockSathi");
    expect(nameFromFile("Yatrika_Deck.pdf")).toBe("Yatrika");
  });
});
