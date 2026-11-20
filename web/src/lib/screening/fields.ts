// The evidence fields (PRD 8.3) and the Evidence Map questions (PRD 8.1).
// Field names match the evidence_fields on each Thesis Card criterion.

export type FieldKind = "yes_no" | "number" | "text";
export type FieldDef = { id: string; kind: FieldKind; hint: string };

export const FIELDS: FieldDef[] = [
  { id: "company.what_built", kind: "text", hint: "What the product is, in a few words" },
  { id: "company.city", kind: "text", hint: "City" },
  { id: "company.sector_selected", kind: "text", hint: "Sector the founder selected" },
  { id: "company.sector_inferred", kind: "text", hint: "Sector the product really is, from what it sells and to whom" },
  { id: "company.who_pays", kind: "text", hint: "Who pays the company, and for what" },
  { id: "company.sells_to_businesses", kind: "yes_no", hint: "Do businesses (not consumers) pay?" },
  { id: "stage.selected", kind: "text", hint: "Stage the founder selected" },
  { id: "stage.amount_raising", kind: "number", hint: "Amount being raised, in INR" },
  { id: "stage.existing_investors", kind: "text", hint: "Who has invested so far" },
  { id: "stage.past_rounds", kind: "text", hint: "Earlier rounds, with amounts" },
  { id: "founders.past_roles", kind: "text", hint: "Each founder's past roles and years, by founder ID" },
  { id: "founders.years_in_domain", kind: "number", hint: "Most years any founder has spent in this domain" },
  { id: "founders.full_time", kind: "yes_no", hint: "Are all founders full time?" },
  { id: "founders.owns_core_risk", kind: "yes_no", hint: "Has a founder personally worked on the hardest risk of this business?" },
  { id: "team.covers_ops", kind: "yes_no", hint: "Someone owns operations" },
  { id: "team.covers_commercial", kind: "yes_no", hint: "Someone owns sales or growth" },
  { id: "team.covers_tech", kind: "yes_no", hint: "Someone owns technology" },
  { id: "traction.paying_customers", kind: "number", hint: "Number of paying customers" },
  { id: "traction.users", kind: "number", hint: "Users, buyers or travellers served" },
  { id: "traction.pilots", kind: "text", hint: "Pilots and their outcome" },
  { id: "traction.revenue", kind: "number", hint: "Revenue in INR, with its period in unit" },
  { id: "traction.revenue_type", kind: "text", hint: "What the revenue figure is: net revenue, gross fees, GMV, commission, booking value" },
  { id: "traction.revenue_is_net", kind: "yes_no", hint: "Is the revenue figure the company's own net revenue, not volume or gross fees?" },
  { id: "traction.mrr", kind: "number", hint: "Monthly recurring revenue in INR" },
  { id: "traction.growth", kind: "text", hint: "Growth stated" },
  { id: "traction.repeat_rate", kind: "text", hint: "Repeat or retention rate" },
  { id: "traction.cohort_data", kind: "yes_no", hint: "Cohort data shared" },
  { id: "unit.gross_margin", kind: "text", hint: "Gross margin" },
  { id: "unit.cac", kind: "number", hint: "Customer acquisition cost in INR" },
  { id: "unit.payback", kind: "text", hint: "Payback period" },
  { id: "unit.contribution", kind: "text", hint: "Contribution margin" },
  { id: "market.competitors_named", kind: "text", hint: "Competitors the founder names" },
  { id: "market.edge", kind: "text", hint: "Why they will win" },
  { id: "risk.key_risks", kind: "text", hint: "Risks the founder names" },
  { id: "risk.depends_on_rule_change", kind: "yes_no", hint: "Does the model only work if rules or partners stay friendly?" },
  { id: "risk.regulatory_path_described", kind: "yes_no", hint: "Is a licence or regulatory path described?" },
  { id: "risk.lending_funded_by", kind: "text", hint: "If the company lends or gives credit: who funds it, and the licence status" },
  { id: "capital.intensity", kind: "text", hint: "low, medium or high, with the reason" },
  { id: "capital.use_of_funds", kind: "text", hint: "Use of funds" },
];

export const FIELD_IDS = new Set(FIELDS.map((f) => f.id));

/** The Evidence Map questions, and the fields that settle each one (PRD 8.1). Used by the sufficiency check. */
export const QUESTIONS: { id: string; question: string; fields: string[]; tries: number }[] = [
  { id: "stage", question: "Is it pre-seed?", fields: ["stage.selected", "stage.amount_raising"], tries: 1 },
  { id: "sector", question: "In our sectors?", fields: ["company.who_pays", "company.sector_inferred"], tries: 1 },
  { id: "founders", question: "Founders fit the market?", fields: ["founders.past_roles", "founders.owns_core_risk"], tries: 2 },
  { id: "traction", question: "Traction real?", fields: ["traction.paying_customers", "traction.revenue"], tries: 2 },
  { id: "numbers", question: "Knows the numbers?", fields: ["unit.cac", "unit.gross_margin", "traction.repeat_rate"], tries: 1 },
  { id: "regulation", question: "Depends on friendlier rules?", fields: ["risk.depends_on_rule_change"], tries: 1 },
];

/** Numbers that must agree between the deck and the form, within 5 percent (PRD Step 9). */
export const COMPARE_GAP = 0.05;
