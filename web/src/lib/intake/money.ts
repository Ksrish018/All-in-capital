// Reads Indian money amounts the way founders write them: "INR 30 Cr", "INR 9.4 L", "INR 78,000", "about INR 9 lakh".

const UNIT: Record<string, number> = { cr: 1e7, crore: 1e7, crores: 1e7, l: 1e5, lakh: 1e5, lakhs: 1e5, lac: 1e5, k: 1e3 };

/** The first rupee amount in the text, in rupees. Null when there is none. */
export function parseInr(text: string | undefined | null): number | null {
  if (!text) return null;
  const m = text.match(/(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d+)?)\s*(Cr|crores?|L|lakhs?|lac|k)?\b/i)
    ?? text.match(/\b([\d,]+(?:\.\d+)?)\s*(Cr|crores?|lakhs?)\b/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return n * (m[2] ? UNIT[m[2].toLowerCase()] ?? 1 : 1);
}

export function inrToUsd(inr: number, inrPerUsd: number): number {
  return inr / inrPerUsd;
}
