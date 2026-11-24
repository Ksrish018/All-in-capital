// Riya's standard for a first email, as checks code can run (PRD 24.8).
// The three checks come from the case: short, one clear ask, and no praise unless a fact backs it.
// The voice checks come from her 56 clean sent emails in Seed data 2. One module, used by the evals now
// and by the live draft step later, so both always measure the same thing.

export const PRAISE = /\b(impressive|incredible|amazing|exciting|excited|thrilled|great|fantastic|love|loved|remarkable|brilliant|stellar|outstanding|inspiring|truly|really|strong start|caught our eye|exactly the kind)\b/i;
const DAY = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/;
export const SHORT_WORDS = 70;

/** The text between the greeting and the sign-off. */
export function bodyOf(email: string): string {
  const lines = email.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length <= 3) return lines.join("\n");
  const start = /^(hi|hello|dear|hey)\b/i.test(lines[0]) ? 1 : 0;
  let end = lines.length;
  while (end > start && (/^(riya|all in capital|best( regards)?,?|kind regards,?|regards,?|thanks,?|warmly,?|cheers,?)$/i.test(lines[end - 1]))) end--;
  return lines.slice(start, end).join("\n");
}

const sentences = (t: string) => t.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);

export type ThreeChecks = { short: boolean; oneAsk: boolean; noEmptyPraise: boolean; all: boolean; words: number; asks: number };

/** Short, one clear ask, and no praise unless a fact (a number) backs it in the same sentence. */
export function threeChecks(email: string): ThreeChecks {
  const body = bodyOf(email);
  const words = body.split(/\s+/).filter(Boolean).length;
  // The ask is the request for the call: a question that names a day. Any other question is about the business.
  const qs = sentences(body).filter((s) => s.endsWith("?"));
  const asks = qs.filter((s) => DAY.test(s)).length;
  const others = qs.length - asks;
  const short = words <= SHORT_WORDS;
  const oneAsk = asks === 1 && others <= 1;
  const noEmptyPraise = sentences(body).every((s) => !PRAISE.test(s) || /\d/.test(s));
  return { short, oneAsk, noEmptyPraise, all: short && oneAsk && noEmptyPraise, words, asks };
}

export type VoiceChecks = { greeting: boolean; signOff: boolean; factOpener: boolean; twoSlots: boolean; aditya: boolean; noPitch: boolean; all: boolean };

/** How Riya writes: "Hi {name},", one fact framed as rare for its stage, two Tuesday or Thursday slots, her sign-off. */
export function voiceChecks(email: string, opts: { deeptech: boolean }): VoiceChecks {
  const t = email.trim();
  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const greeting = /^Hi [^,\s]+,$/.test(lines[0] ?? "");
  const signOff = lines.slice(-2).join("\n") === "Riya\nAll In Capital";
  const factOpener = /\d[^.?!]*\bis (rare|unusual)\b/i.test(bodyOf(t).split(/\n/)[0] ?? "");
  const days = (t.match(/\b(Tuesday|Thursday)\b/g) ?? []).length;
  const twoSlots = days === 2 && !/\b(Monday|Wednesday|Friday|Saturday|Sunday)\b/.test(t);
  const mentionsAditya = /\bAditya\b/.test(t);
  const aditya = opts.deeptech ? mentionsAditya : !mentionsAditya;
  const noPitch = !/\b(we back founders|our partners have built|network of operators|write our first cheque)\b/i.test(t);
  return { greeting, signOff, factOpener, twoSlots, aditya, noPitch, all: greeting && signOff && factOpener && twoSlots && aditya && noPitch };
}

/** How much Riya changed a draft: kept as is, a small edit, or a rewrite. */
export function editClass(draft: string, sent: string): "kept" | "small" | "rewrite" {
  const a = draft.trim().replace(/\r/g, "");
  const b = sent.trim().replace(/\r/g, "");
  if (a === b) return "kept";
  return similarity(a, b) >= 0.85 ? "small" : "rewrite";
}

/** Share of words in common, in order (a longest-common-subsequence ratio over words). 1 means identical. */
export function similarity(a: string, b: string): number {
  const x = a.split(/\s+/).filter(Boolean);
  const y = b.split(/\s+/).filter(Boolean);
  if (!x.length && !y.length) return 1;
  let prev = new Array(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    const cur = new Array(y.length + 1).fill(0);
    for (let j = 1; j <= y.length; j++) cur[j] = x[i - 1] === y[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return (2 * prev[y.length]) / (x.length + y.length);
}
