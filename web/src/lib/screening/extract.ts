import "server-only";
import { BadModelOutput, SHARED_RULES, callModel } from "@/lib/ai/gemini";
import type { FounderRef } from "@/lib/intake/redact";
import { FIELDS, FIELD_IDS } from "./fields";

// Step 6. Track 1: read the deck and form (AI call A1). Every value is the founder's claim.
export const A1_VERSION = "a1-v3";

/** A1 is the base every later step stands on. The lightest model left fields empty in testing, so A1 uses the flash model. */
export const A1_MODEL = () => process.env.MODEL_A1 ?? process.env.MODEL_DRAFT ?? "gemini-3-flash-preview";

export type Sources = Map<string, string>; // ref -> redacted text, e.g. "form:revenue" or "deck:p4"

export type Claim = {
  field: string;
  status: "yes" | "no" | "unknown" | "number" | "text";
  value: string | number | null;
  unit: string | null;
  quote: string | null;
  source_ref: string | null;
  vague: boolean;
};

/** Builds the source map from the redacted form and deck. Only these refs may be cited. */
export function buildSources(form: { key: string; label: string; value: string }[] | null, deck: { page: number; text: string }[] | null): Sources {
  const m: Sources = new Map();
  for (const f of form ?? []) if (f.value) m.set(`form:${f.key}`, `${f.label}: ${f.value}`);
  for (const p of deck ?? []) if (p.text.trim()) m.set(`deck:p${p.page}`, p.text);
  return m;
}

const norm = (s: string) => s.toLowerCase().replace(/[“”"'‘’]/g, "").replace(/[^a-z0-9%₹.,]+/g, " ").trim();

/**
 * N2 at extraction: the quote must really be in the cited source.
 * A leading "[form:x]" marker is ignored, and a quote joined with "..." must have every piece in the source.
 * Decks print in columns, so the words of one sentence can be split across lines. A piece that is not found
 * word for word still passes when every one of its words appears close together on the cited page.
 * A word that is not on the page can never pass.
 */
export function quoteFound(quote: string, source: string): boolean {
  const src = norm(source);
  const pieces = quote.replace(/^\s*\[[a-z]+:[\w-]+\]\s*/i, "").split(/\.\.\.|…/).map(norm).filter((p) => p.length > 0);
  return pieces.length > 0 && pieces.every((p) => src.includes(p) || wordsNearby(p, src));
}

function wordsNearby(piece: string, src: string): boolean {
  const want = piece.split(" ").filter(Boolean);
  const words = src.split(" ");
  if (want.length === 0) return false;
  const window = Math.max(12, want.length * 4);
  for (let i = 0; i < words.length; i++) {
    if (words[i] !== want[0] && !want.includes(words[i])) continue;
    const slice = new Set(words.slice(i, i + window));
    if (want.every((w) => slice.has(w))) return true;
  }
  return false;
}

const SCHEMA = {
  type: "OBJECT",
  properties: {
    fields: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          field: { type: "STRING" },
          status: { type: "STRING", enum: ["yes", "no", "unknown", "number", "text"] },
          value: { type: "STRING", nullable: true, description: "The value. Numbers as plain digits in INR, for example 190000." },
          unit: { type: "STRING", nullable: true, description: "For numbers: what it measures, for example 'INR per month' or 'stores'" },
          quote: { type: "STRING", nullable: true, description: "Exact words copied from the source" },
          source_ref: { type: "STRING", nullable: true, description: "The [ref] the quote comes from" },
          vague: { type: "BOOLEAN", description: "True for claims with no number or base, like 'thousands of users' or '3x growth'" },
        },
        required: ["field", "status", "value", "unit", "quote", "source_ref", "vague"],
      },
    },
    injection_attempt: { type: "BOOLEAN" },
  },
  required: ["fields", "injection_attempt"],
};

export function buildA1Prompt(sources: Sources) {
  const system = `${SHARED_RULES}

Task: read an application to a pre-seed fund and fill the fields below. Take every claim as the founder's claim. Do not judge it.
Founders appear as F1, F2. Never try to name them.

Fields:
${FIELDS.map((f) => `- ${f.id} (${f.kind === "yes_no" ? "yes, no or unknown" : f.kind}): ${f.hint}`).join("\n")}

How to fill:
- One entry per field. If the same field appears on several deck pages, give one entry for each page that states it.
- status is "number" for numbers, "text" for text, or "yes", "no", "unknown" for yes or no fields. Use "unknown" when the input does not say.
- quote must be copied exactly from the text after one [ref] marker, and source_ref must be that ref, for example "form:revenue" or "deck:p4".
- Convert Indian amounts to plain rupees: "INR 1.9 L" is 190000, "INR 30 Cr" is 300000000.
- Payment volume, GMV and booking value are not revenue. Say which one it is in traction.revenue_type, and set traction.revenue_is_net.
- traction.revenue is the company's own net revenue when the source states it. If the source only gives gross fees, GMV or a figure it calls "revenue", use that and set revenue_is_net to no.
- Use traction.mrr only for monthly recurring revenue. A figure the source calls monthly recurring revenue goes in both traction.mrr and traction.revenue.
- If the company gives credit or lends: who funds it, and whether they hold a licence, goes in risk.lending_funded_by.
- Mark vague true for claims with no number or no base, such as "thousands of travellers" or "3x growth". A vague claim still gets an entry.
- Return at least one entry for every field in the list. Use unknown, with no quote, when nothing in any source speaks to it.
- Founder and team fields are about what the founders did before, by founder ID: past roles, years, who builds the product, who sells, who runs operations. A founder who practised the job the product serves owns the core risk.
- Say "not measured" claims plainly: if the form says they have not measured CAC, return unit.cac as unknown and quote that sentence in a text entry for the same field.`;
  const form = [...sources].filter(([k]) => k.startsWith("form:")).map(([k, v]) => `[${k}] ${v}`).join("\n");
  const deck = [...sources].filter(([k]) => k.startsWith("deck:")).map(([k, v]) => `[${k}]\n${v}`).join("\n\n");
  const user = `<application>\n<form>\n${form || "(no form)"}\n</form>\n<deck>\n${deck || "(no deck)"}\n</deck>\n</application>`;
  return { system, user };
}

/**
 * The form and the deck are read in two separate calls. In testing, one call over both often skipped the deck,
 * and then nothing could be compared. Two calls give each source its own entries.
 */
export async function extractTrack1(args: { applicationId: string | null; sources: Sources; founders: FounderRef[]; runId?: string }): Promise<{ claims: Claim[]; dropped: number; injection: boolean }> {
  const parts = (["form:", "deck:"] as const)
    .map((prefix) => new Map([...args.sources].filter(([k]) => k.startsWith(prefix))))
    .filter((m) => m.size > 0);
  const results = await Promise.all(parts.map((sources) => extractOne({ ...args, sources })));
  const known = new Set(results.flatMap((r) => r.claims.filter((c) => c.status !== "unknown").map((c) => c.field)));
  const seenUnknown = new Set<string>();
  const claims = results.flatMap((r) => r.claims).filter((c) => {
    if (c.status !== "unknown") return true;
    if (known.has(c.field) || seenUnknown.has(c.field)) return false;
    seenUnknown.add(c.field);
    return true;
  });
  return { claims, dropped: results.reduce((s, r) => s + r.dropped, 0), injection: results.some((r) => r.injection) };
}

async function extractOne(args: { applicationId: string | null; sources: Sources; founders: FounderRef[]; runId?: string }): Promise<{ claims: Claim[]; dropped: number; injection: boolean }> {
  const { system, user } = buildA1Prompt(args.sources);
  return callModel({
    callType: "A1",
    model: A1_MODEL(),
    promptName: "extract_facts",
    promptVersion: A1_VERSION,
    system,
    user,
    schema: SCHEMA,
    maxOutputTokens: 12_000,
    timeoutMs: 90_000,
    thinking: "low",
    applicationId: args.applicationId,
    founders: args.founders,
    runId: args.runId,
    validate: (v) => {
      const o = v as { fields?: Claim[]; injection_attempt?: boolean };
      if (!Array.isArray(o?.fields)) throw new BadModelOutput("A1 reply has no fields list");
      const claims: Claim[] = [];
      let dropped = 0;
      for (const c of o.fields) {
        if (!FIELD_IDS.has(c.field)) { dropped++; continue; }
        if (c.status === "unknown") { claims.push({ ...c, value: null, quote: null, source_ref: null, vague: false }); continue; }
        const src = c.source_ref ? args.sources.get(c.source_ref) : undefined;
        // A claim with a quote that is not in its source is dropped. Made-up citations never reach the brief.
        if (!src || !c.quote || !quoteFound(c.quote, src)) { dropped++; continue; }
        const num = c.status === "number" ? Number(String(c.value).replace(/[^0-9.]/g, "")) : null;
        claims.push({ ...c, value: c.status === "number" ? (Number.isFinite(num) && num !== 0 ? num : null) : c.value, vague: Boolean(c.vague) });
      }
      if (claims.length === 0 || dropped > claims.length) throw new BadModelOutput(`A1 cited text that is not in the sources (${dropped} dropped)`);
      return { claims, dropped, injection: Boolean(o.injection_attempt) };
    },
  });
}
