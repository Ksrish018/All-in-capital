// Memo passages name the founders of the memo companies. Those names are not needed to judge a criterion,
// and they can collide with an applicant founder's name (a memo "Mehta" and an applicant "Mehta").
// So every person-like name is replaced before a passage goes into a scoring pack.

/** Capitalised word pairs that are places, groups or terms, not people. */
const NOT_PEOPLE = new Set([
  "Southeast Asian", "Andhra Pradesh", "Tamil Nadu", "Uttar Pradesh", "Madhya Pradesh", "West Bengal", "New Delhi",
  "Fund I", "Fund II", "Series A", "Series B", "What It", "Why We", "Founder Assessment", "Risks And",
]);

export function scrubNames(text: string, keep: string[] = []): string {
  const keepSet = new Set(keep.map((k) => k.toLowerCase()));
  const names = new Set<string>();
  for (const m of text.matchAll(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+){1,2})\b/g)) {
    const n = m[1];
    if (NOT_PEOPLE.has(n) || keepSet.has(n.toLowerCase())) continue;
    // A pair at the start of a sentence can be two ordinary words ("Strong Instagram"). People here always
    // appear more than once or next to a role, so require one of those.
    const around = text.slice(Math.max(0, (m.index ?? 0) - 40), (m.index ?? 0) + n.length + 40);
    const repeated = n.split(" ").some((part) => part.length >= 3 && text.split(part).length > 2);
    if (repeated || /(found|CEO|CTO|COO|formerly|former|led by|\bhe\b|\bshe\b|\bher\b|\bhis\b|\bthey\b)/i.test(around)) names.add(n);
  }
  let out = text;
  for (const n of [...names].sort((a, b) => b.length - a.length)) out = out.replaceAll(n, "the founder");
  // Then each first name and surname on its own ("Mehta is the better storyteller").
  const parts = new Set([...names].flatMap((n) => n.split(" ")).filter((p) => p.length >= 3 && !keepSet.has(p.toLowerCase())));
  for (const p of parts) out = out.replace(new RegExp(`\\b${p}\\b`, "g"), "the founder");
  return out.replace(/the founder(?:\s+the founder)+/g, "the founder");
}
