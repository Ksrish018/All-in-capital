// M2 tests on the ten real case files (PRD 19.2). The PDFs are kept out of the public repository,
// so these run on a machine that has the Decks folder and skip in CI.
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { pdfItems, deckPages } from "@/lib/intake/pdf";
import { parseFormItems, parseFounder, type ParsedForm } from "@/lib/intake/form";
import { findPii, redactText, type FounderRef } from "@/lib/intake/redact";
import { outcome, runCheapChecks } from "@/lib/intake/checks";
import { ROOT, tag } from "../helpers";

const DECKS = path.join(ROOT, "Decks");
const have = fs.existsSync(DECKS);
const files = have ? fs.readdirSync(DECKS) : [];
const COMPANIES = ["CAPilot", "CareCorner", "EarnWise", "GrainKind", "Pumpwise", "RentRoute", "Settlr", "StockSathi", "Talkbook", "Yatrika"];

type Case = { form: ParsedForm; founders: FounderRef[]; deckText: string };
const cases = new Map<string, Case>();

describe.skipIf(!have)("the ten case applications", () => {
  beforeAll(async () => {
    for (const co of COMPANIES) {
      const formFile = files.find((f) => f.startsWith(`${co}_Form`))!;
      const form = parseFormItems((await pdfItems(new Uint8Array(fs.readFileSync(path.join(DECKS, formFile))))).items);
      const founders = Object.keys(form.byKey).filter((k) => k.startsWith("founder_")).map((k, i) => ({ id: `F${i + 1}`, ...parseFounder(k, form.byKey[k]) }));
      const deckFile = files.find((f) => f.startsWith(`${co}_Deck`));
      let deckText = "";
      if (deckFile) {
        const d = await pdfItems(new Uint8Array(fs.readFileSync(path.join(DECKS, deckFile))));
        deckText = deckPages(d.items, d.pages).map((p) => p.text).join("\n");
      }
      cases.set(co, { form, founders, deckText });
    }
  }, 60_000);

  it(tag("High", "P1", "every form gives every core field, in all ten"), () => {
    const core = ["company_name", "website", "location", "incorporated", "one_line", "sector", "stage", "team_size", "founder_1",
      "time_commitment", "prior_experience", "equity_split", "built", "amount_raising", "valuation", "existing_investors",
      "use_of_funds", "other_investors", "heard_from", "anything_else"];
    for (const co of COMPANIES) {
      const { byKey } = cases.get(co)!.form;
      for (const k of core) expect(byKey[k], `${co}.${k}`).toBeTruthy();
      expect(byKey.company_name.startsWith(co), co).toBe(true);
      expect(Object.keys(byKey).some((k) => /^(conversation|.*we_would.*)$/.test(k)), `${co} has a stray label`).toBe(false);
    }
  });

  it(tag("High", "P2", "known values come out exactly"), () => {
    const v = (co: string, k: string) => cases.get(co)!.form.byKey[k];
    expect(v("Settlr", "stage")).toBe("Series A");
    expect(v("Settlr", "amount_raising")).toBe("INR 30 Cr");
    expect(v("CareCorner", "sector")).toBe("Other (Healthcare)");
    expect(v("Talkbook", "revenue")).toMatch(/MRR INR 1\.9 L/);
    expect(v("Yatrika", "customers")).toMatch(/1,300 travellers/);
    expect(v("StockSathi", "regulatory_status")).toBe("Not registered as an NBFC.");
    expect(v("CAPilot", "anything_else")).toBe("We believe CA firms are underserved by existing tools. We would welcome a call.");
  });

  it(tag("High", "P3", "every founder is found with a name and a full LinkedIn link"), () => {
    for (const co of COMPANIES) {
      const { founders } = cases.get(co)!;
      expect(founders.length, co).toBeGreaterThan(0);
      for (const f of founders) {
        expect(f.name, `${co} ${f.id}`).toBeTruthy();
        expect(f.linkedin, `${co} ${f.id}`).toMatch(/^linkedin\.com\/in\/[a-z0-9-]+-example$/);
      }
    }
  });

  it(tag("Critical", "N6", "no founder detail survives redaction of any form or deck (the deck email in Yatrika too)"), () => {
    for (const co of COMPANIES) {
      const { form, founders, deckText } = cases.get(co)!;
      const all = `${form.fields.map((f) => `${f.label}: ${f.value}`).join("\n")}\n${deckText}`;
      const out = redactText(all, founders);
      expect(findPii(out, founders), co).toEqual([]);
    }
    expect(cases.get("Yatrika")!.deckText).toMatch(/@/);
    expect(redactText(cases.get("Yatrika")!.deckText, cases.get("Yatrika")!.founders)).toContain("[EMAIL]");
  });

  it(tag("High", "S1", "the code checks match the gold set: Settlr later stage, CareCorner sector and capital, nobody else"), () => {
    const expected: Record<string, string[]> = { Settlr: ["later_stage"], CareCorner: ["outside_core_sectors", "capital_intensive"] };
    for (const co of COMPANIES) {
      const { form } = cases.get(co)!;
      const flags = runCheapChecks({ fields: form.fields, byKey: form.byKey, others: [], portfolio: null, inrPerUsd: 85, sectorFlag: "soft" });
      expect(flags.map((f) => f.id).sort(), co).toEqual((expected[co] ?? []).sort());
      expect(outcome(flags), co).toBe(expected[co] ? "short_circuited" : "continue");
    }
  });
});
