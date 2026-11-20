// Step 5. Cheap checks (short circuits). Code, plus the result of one small AI call (A0) for portfolio overlap.
// A hit never rejects. It sets a flag. Some flags skip the expensive research, and a person always decides.
import type { FormField } from "./form";
import { inrToUsd, parseInr } from "./money";

export type Evidence = { quote: string; source: "form" | "deck" | "portfolio" | "system"; ref: string };
export type Flag = {
  id: "later_stage" | "outside_core_sectors" | "capital_intensive" | "likely_excluded" | "portfolio_conflict" | "portfolio_overlap_note" | "possible_duplicate";
  label: string;
  severity: "Critical" | "High" | "Soft";
  /** True when the flag skips research and gets a short brief. */
  short_circuit: boolean;
  why: string;
  evidence: Evidence[];
  with?: string;
};

export type PortfolioVerdict = { overlap: string | null; reason: string; confidence?: string };

export type CheckInput = {
  fields: FormField[];
  byKey: Record<string, string>;
  /** Earlier applications, for the duplicate check. */
  others: { id: string; company_name: string; website: string | null }[];
  portfolio: PortfolioVerdict | null;
  inrPerUsd: number;
  /** Kushal's setting. Soft by default (open question Q10). */
  sectorFlag: "soft" | "hard";
  /** Riya clicked "Run full review anyway". Flags still show, but nothing is skipped. */
  fullReview?: boolean;
};

export const CORE_SECTORS = ["fintech", "deeptech", "consumer tech", "consumer brands"];
/** The fund leads rounds under $1M. Anything far above that is a later-stage round. */
export const MAX_ROUND_USD = 2_000_000;

function quote(fields: FormField[], key: string): Evidence | null {
  const f = fields.find((x) => x.key === key);
  return f ? { quote: `${f.label}: ${f.value}`, source: "form", ref: `Form, page ${f.page}` } : null;
}
const present = (e: (Evidence | null)[]) => e.filter((x): x is Evidence => x !== null);

export const normName = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");
export const normSite = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();

export function runCheapChecks(input: CheckInput): Flag[] {
  const { fields, byKey } = input;
  const flags: Flag[] = [];

  // Stage. A named Series round, or a raise far above what the fund leads.
  const stage = byKey.stage ?? "";
  const raiseInr = parseInr(byKey.amount_raising);
  const raiseUsd = raiseInr === null ? null : inrToUsd(raiseInr, input.inrPerUsd);
  const seriesNamed = /\bseries\s+[a-z]\b/i.test(stage);
  const tooBig = raiseUsd !== null && raiseUsd > MAX_ROUND_USD;
  if (seriesNamed || tooBig) {
    const why = [
      seriesNamed ? `Stage selected is "${stage}".` : null,
      raiseUsd !== null ? `Raising ${byKey.amount_raising} (about $${(raiseUsd / 1e6).toFixed(1)}M). The fund leads rounds under $1M.` : null,
      /seed round|series/i.test(byKey.existing_investors ?? "") ? `Existing investors: ${byKey.existing_investors}` : null,
    ].filter(Boolean).join(" ");
    flags.push({
      id: "later_stage", label: "Likely later stage", severity: "High", short_circuit: true, why,
      evidence: present([quote(fields, "stage"), quote(fields, "amount_raising"), quote(fields, "existing_investors")]),
    });
  }

  // Sector. Soft by default, because the fund publicly calls itself sector-agnostic.
  const sector = (byKey.sector ?? "").toLowerCase();
  if (sector && !CORE_SECTORS.some((s) => sector.includes(s))) {
    const hard = input.sectorFlag === "hard";
    flags.push({
      id: "outside_core_sectors", label: "Outside the four sectors", severity: hard ? "High" : "Soft", short_circuit: hard,
      why: `Sector selected is "${byKey.sector}". The case names fintech, deeptech, consumer tech and consumer brands. The fund's public pages say it is sector-agnostic, so this is a ${hard ? "strong" : "soft"} flag.`,
      evidence: present([quote(fields, "sector"), quote(fields, "one_line")]),
    });
  }

  // Capital intensity. Physical sites that each need a large build-out cost (criterion C9).
  const capexField = fields.find((f) => /capex|capital expenditure/i.test(f.label));
  const perSite = fields
    .map((f) => ({ f, m: f.value.match(/(?:INR|Rs\.?|₹)\s*[\d,.]+\s*(?:Cr|L|lakh)?\s*per\s+(clinic|store|outlet|kitchen|plant|warehouse|centre|center|branch|school|hospital)/i) }))
    .find((x) => x.m);
  const perSiteInr = perSite ? parseInr(perSite.m![0]) : null;
  if ((capexField && parseInr(capexField.value) !== null) || (perSiteInr !== null && perSiteInr >= 10e5)) {
    const src = capexField ?? perSite!.f;
    flags.push({
      id: "capital_intensive", label: "Heavy on capital", severity: "High", short_circuit: true,
      why: `Growth needs a large build-out for each new site: ${src.value} The fund backs capital-light models at pre-seed (criterion C9).`,
      evidence: present([{ quote: `${src.label}: ${src.value}`, source: "form", ref: `Form, page ${src.page}` }, quote(fields, "use_of_funds")]),
    });
  }

  // Excluded category. A model that only works if the rules get friendlier, with crypto exchanges as the clear case.
  const product = `${byKey.one_line ?? ""} ${byKey.built ?? ""}`;
  if (/\b(crypto|bitcoin|virtual digital asset|VDA|token exchange|web3|NFT)\b/i.test(product)) {
    flags.push({
      id: "likely_excluded", label: "Likely excluded", severity: "High", short_circuit: true,
      why: "The product is in a category the fund has passed on because it depends on rules getting friendlier (Coinlane memo).",
      evidence: present([quote(fields, "one_line"), quote(fields, "built")]),
    });
  }

  // Portfolio conflict. Decided by A0, which leans towards flagging. A real conflict is always held for Kushal.
  // A low-confidence match is still shown, as a note for Riya and Kushal to check, without holding the application.
  const lowConfidence = input.portfolio?.confidence === "low";
  if (input.portfolio?.overlap && lowConfidence) {
    flags.push({
      id: "portfolio_overlap_note", label: "Worth checking against the portfolio", severity: "Soft", short_circuit: false,
      with: input.portfolio.overlap,
      why: `A weak possible overlap with ${input.portfolio.overlap}. ${input.portfolio.reason}`,
      evidence: present([quote(fields, "one_line"), { quote: input.portfolio.reason, source: "portfolio", ref: `Portfolio: ${input.portfolio.overlap}` }]),
    });
  }
  if (input.portfolio?.overlap && !lowConfidence) {
    flags.push({
      id: "portfolio_conflict", label: "Possible portfolio conflict", severity: "Critical", short_circuit: true,
      with: input.portfolio.overlap,
      why: `May overlap with ${input.portfolio.overlap}. ${input.portfolio.reason}`,
      evidence: present([quote(fields, "one_line"), { quote: input.portfolio.reason, source: "portfolio", ref: `Portfolio: ${input.portfolio.overlap}` }]),
    });
  }

  // Duplicate. Same name or website as an earlier application. Flagged for Riya, never dropped.
  const name = normName(byKey.company_name ?? "");
  const site = normSite(byKey.website);
  const dup = input.others.find((o) => (name && normName(o.company_name) === name) || (site && normSite(o.website) === site));
  if (dup) {
    flags.push({
      id: "possible_duplicate", label: "Possible duplicate", severity: "High", short_circuit: true,
      why: `Same ${site && normSite(dup.website) === site ? "website" : "name"} as an earlier application (${dup.company_name}).`,
      evidence: present([quote(fields, "company_name"), quote(fields, "website")]),
    });
  }

  if (input.fullReview) for (const f of flags) f.short_circuit = false;
  return flags;
}

/** What the cheap checks decide. A conflict always goes to Kushal. */
export function outcome(flags: Flag[]): "hold_conflict" | "short_circuited" | "continue" {
  if (flags.some((f) => f.id === "portfolio_conflict")) return "hold_conflict";
  if (flags.some((f) => f.short_circuit)) return "short_circuited";
  return "continue";
}
