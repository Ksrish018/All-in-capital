// Step 9. Compare the two tracks, and the deck against the form.
// Numbers are compared in code. Claims worded differently are matched by A2. A conflict is never settled here.
import { COMPARE_GAP } from "./fields";
import type { Claim } from "./extract";
import type { WebFact } from "./research";

export type Strength = "confirmed" | "founder_says" | "conflict" | "found_by_us" | "none";
export type Inconsistency = { field: string; form: string; deck: string; gap_percent: number | null; severity: "High" | "Low"; note: string };
export type TextPair = { id: string; field: string; form: Claim; deck: Claim };

const FIELD_NAME: Record<string, string> = {
  "traction.mrr": "MRR",
  "traction.revenue": "revenue",
  "traction.paying_customers": "paying customers",
  "traction.users": "users",
  "unit.cac": "acquisition cost",
  "stage.amount_raising": "amount raising",
  "risk.lending_funded_by": "who funds the credit",
};
export const fieldName = (f: string) => FIELD_NAME[f] ?? f.split(".").pop()!.replaceAll("_", " ");

const show = (c: Claim) => c.quote ?? String(c.value ?? "unknown");

/** Deck against form, in code: numbers more than 5 percent apart, and a vague deck claim against a form number. */
export function compareDeckForm(claims: Claim[]): { found: Inconsistency[]; textPairs: TextPair[] } {
  const found: Inconsistency[] = [];
  const textPairs: TextPair[] = [];
  const byField = new Map<string, Claim[]>();
  for (const c of claims) if (c.source_ref) byField.set(c.field, [...(byField.get(c.field) ?? []), c]);
  for (const [field, list] of byField) {
    const form = list.find((c) => c.source_ref!.startsWith("form:"));
    const deck = list.filter((c) => c.source_ref!.startsWith("deck:"));
    if (!form || deck.length === 0) continue;
    for (const d of deck) {
      const a = typeof form.value === "number" ? form.value : null;
      const b = typeof d.value === "number" ? d.value : null;
      if (a !== null && b !== null) {
        // Measured against the smaller figure, as a reader would: 1.9 L against 2.1 L is 10.5 percent apart.
        const gap = Math.abs(a - b) / Math.max(1, Math.min(Math.abs(a), Math.abs(b)));
        // Exactly 5 percent is not flagged. Anything above is (PRD 19.3a).
        if (gap > COMPARE_GAP + 1e-9) {
          found.push({ field, form: show(form), deck: show(d), gap_percent: Math.round(gap * 1000) / 10, severity: gap > 0.1 ? "High" : "Low", note: `The deck and the form give different ${fieldName(field)}. A person decides which to believe.` });
        }
        break;
      }
      if (a !== null && d.vague) {
        found.push({ field, form: show(form), deck: show(d), gap_percent: null, severity: "High", note: `The deck makes a vague claim where the form gives a number.` });
        break;
      }
      if (form.status === "text" && d.status === "text" && form.quote && d.quote && form.quote !== d.quote) {
        textPairs.push({ id: `p${textPairs.length + 1}`, field, form, deck: d });
        break;
      }
    }
  }
  return { found, textPairs };
}

export type Links = { links: { web_id: string; claim_id: string | null; result: "confirmed" | "conflict" | "unrelated" }[]; pairs: { pair_id: string; agree: boolean; note: string }[] };

/**
 * Applies the comparison. Each web fact ends as conflict (if any link says so), confirmed, or found by us.
 * A claim is confirmed or in conflict only through a web fact that says so, so a founder-only claim
 * can never end up confirmed (N3).
 */
export function applyLinks(claimIds: string[], webIds: string[], links: Links["links"]) {
  const known = new Set(claimIds);
  const web = new Map<string, { strength: Strength; linked: string | null }>(webIds.map((id) => [id, { strength: "found_by_us", linked: null }]));
  const claim = new Map<string, Strength>(claimIds.map((id) => [id, "founder_says"]));
  for (const l of links) {
    if (!web.has(l.web_id) || l.result === "unrelated" || !l.claim_id || !known.has(l.claim_id)) continue;
    const cur = web.get(l.web_id)!;
    // Conflict outranks confirmed, so both versions are always shown.
    if (cur.strength === "conflict") continue;
    if (l.result === "conflict" || cur.strength !== "confirmed") web.set(l.web_id, { strength: l.result, linked: l.claim_id });
  }
  for (const [, w] of web) {
    if (!w.linked) continue;
    if (w.strength === "conflict") claim.set(w.linked, "conflict");
    else if (w.strength === "confirmed" && claim.get(w.linked) !== "conflict") claim.set(w.linked, "confirmed");
  }
  return { claim, web };
}

/** Facts only Track 2 found never count as confirmed, and a founder-only claim is never confirmed (N3). */
export function strengthIsSound(strength: Strength, hasWebLink: boolean): boolean {
  return strength !== "confirmed" || hasWebLink;
}

export type WebFactWithId = WebFact & { id: string };
