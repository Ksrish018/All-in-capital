// Gate 1 (Riya) and Gate 2 (Kushal), the rules in plain code (PRD Gates 1 and 2, 13.6, 13.7).

export type Decision = "go" | "pass" | "hold" | "send_back";
export type SystemRec = "go" | "pass" | "needs_human" | "hold" | null;

/** Applications Riya reviews, oldest first. A portfolio conflict goes straight to Kushal. */
export const REVIEW_STATUSES = ["brief_ready", "short_circuited"] as const;
/** Applications on Kushal's board. */
export const SIGN_OFF_STATUSES = ["riya_decided", "hold_conflict"] as const;

/** A short-circuited brief says "likely pass", so agreeing with it means PASS. */
export function systemPosition(rec: SystemRec, status: string): "go" | "pass" | "hold" | null {
  if (status === "hold_conflict" || rec === "hold") return "hold";
  if (rec === "go" || rec === "pass") return rec;
  if (status === "short_circuited") return "pass";
  return null; // needs a person: there is nothing to agree with, Riya chooses
}

/** Agreeing is one click. Any other choice needs a one-line reason (the database enforces it too). */
export function validateGate1(input: { decision: Decision; reason?: string | null; system: "go" | "pass" | "hold" | null }): { ok: true; agreed: boolean } | { ok: false; error: string } {
  if (!["go", "pass", "hold"].includes(input.decision)) return { ok: false, error: "Choose GO, PASS or Hold." };
  const agreed = input.system !== null && input.decision === input.system;
  const reason = (input.reason ?? "").trim();
  if (!agreed && reason.length === 0) {
    return { ok: false, error: input.system ? "You changed the recommendation. Add a one-line reason." : "The system did not pick a side. Add a one-line reason for your choice." };
  }
  if (reason.length > 200) return { ok: false, error: "Keep the reason to one line (200 characters)." };
  return { ok: true, agreed };
}

export function validateCorrection(input: { rating: number; reason: string; kind: string }): string | null {
  if (!Number.isInteger(input.rating) || input.rating < 0 || input.rating > 4) return "Pick a rating from 0 to 4.";
  const r = input.reason.trim();
  if (r.length === 0) return "Add a one-line reason.";
  if (r.length > 140) return "Keep the reason under 140 characters.";
  if (input.kind !== "fact" && input.kind !== "rule") return "Mark it as a fact correction or a rule correction.";
  return null;
}

/**
 * The blind sample: at least the set share of PASS recommendations are shown to Riya without the system's view.
 * Deterministic: a PASS joins the sample whenever the sample would otherwise fall below the rate.
 */
export function joinsBlindSample(isPass: boolean, passSoFar: number, blindSoFar: number, rate: number): boolean {
  if (!isPass) return false;
  return blindSoFar < Math.ceil((passSoFar + 1) * rate);
}

export type BoardColumn = "agreed" | "disagreed" | "flagged" | "conflict";

/** Which column a card sits in on Kushal's board (PRD 13.7). Only "agreed" allows bulk sign off. */
export function boardColumn(input: { status: string; agreed: boolean | null; flags: { severity: string; id: string }[] }): BoardColumn {
  if (input.status === "hold_conflict") return "conflict";
  if (input.flags.some((f) => f.severity === "High" || f.severity === "Critical")) return "flagged";
  return input.agreed ? "agreed" : "disagreed";
}

/** Tags used to recall rule corrections for similar companies (Loop C). */
export function companyTags(input: { sector?: string | null; sellsToBusinesses?: boolean | null; revenueType?: string | null }): string[] {
  const tags = new Set<string>();
  const s = (input.sector ?? "").toLowerCase();
  for (const k of ["fintech", "deeptech", "consumer tech", "consumer brands", "healthcare", "saas"]) if (s.includes(k)) tags.add(`sector:${k}`);
  if (input.sellsToBusinesses === true) tags.add("buyer:business");
  if (input.sellsToBusinesses === false) tags.add("buyer:consumer");
  const r = (input.revenueType ?? "").toLowerCase();
  for (const [k, t] of [["subscription", "model:subscription"], ["mrr", "model:subscription"], ["commission", "model:commission"], ["gmv", "model:marketplace"], ["fee", "model:fees"], ["hardware", "model:hardware"], ["lend", "model:lending"], ["credit", "model:lending"]] as const) {
    if (r.includes(k)) tags.add(t);
  }
  return [...tags];
}

/** Up to three rule corrections for this criterion that share a tag with the company. Declined ones are never used. */
export function recallCorrections<T extends { criterion_id: string; kind: string; rule_status: string | null; tags: string[]; created_at: string }>(
  all: T[], criterion: string, tags: string[],
): T[] {
  return all
    .filter((c) => c.kind === "rule" && c.rule_status !== "declined" && c.criterion_id === criterion && c.tags.some((t) => tags.includes(t)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 3);
}
