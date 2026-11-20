// Step 4. Redact. Code only.
// Founders become F1, F2. Emails, phones and links become tags. Only the redacted copy ever goes to a model.
import { findLinkedIn } from "./form";

export type FounderRef = { id: string; name: string | null; linkedin: string | null; email?: string | null; phone?: string | null };

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Indian mobiles (with or without +91) and any international number written with a + prefix.
const PHONE = /(?:\+91[ -]?)?\b[6-9]\d{4}[ -]?\d{5}\b|\+\d{1,3}[ -]?\d(?:[ -]?\d){6,11}/g;
const TITLES = new Set(["Dr", "Mr", "Mrs", "Ms", "Prof"]);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normLink = (s: string) => s.replace(/\s+/g, "").replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "").toLowerCase();

/** The words that identify a founder: the full name, then each part of three letters or more. */
export function nameParts(name: string | null): string[] {
  if (!name) return [];
  const full = name.replace(/^(Dr|Mr|Mrs|Ms|Prof)\.?\s+/i, "").trim();
  const parts = full.split(/\s+/).filter((p) => p.length >= 3 && !TITLES.has(p.replace(/\.$/, "")));
  return [name.trim(), full, ...parts].filter((v, i, a) => v && a.indexOf(v) === i);
}

export function redactText(text: string, founders: FounderRef[]): string {
  let out = text;
  // Links first, because they contain the name.
  for (const raw of findLinkedIn(out)) {
    const f = founders.find((x) => x.linkedin && normLink(x.linkedin) === normLink(raw));
    out = out.replace(raw, f ? `[LINK_${f.id}]` : "[LINK]");
  }
  out = out.replace(EMAIL, "[EMAIL]").replace(PHONE, "[PHONE]");
  // Longest names first, so "Dr. Lakshmi Reddy" goes before "Lakshmi".
  const pairs = founders.flatMap((f) => nameParts(f.name).map((p) => [p, f.id] as const)).sort((a, b) => b[0].length - a[0].length);
  for (const [part, id] of pairs) out = out.replace(new RegExp(`(?<![A-Za-z])${escape(part)}(?![A-Za-z])`, "g"), id);
  // Names written as link slugs, such as "dhruv-shah" in a URL.
  for (const f of founders) for (const slug of slugs(f.name)) out = out.replace(new RegExp(escape(slug), "gi"), f.id.toLowerCase());
  return out;
}

/** "Dr. Nila Rao" becomes "nila-rao", "nila_rao" and "nilarao". */
export function slugs(name: string | null): string[] {
  if (!name) return [];
  const parts = name.replace(/^(Dr|Mr|Mrs|Ms|Prof)\.?\s+/i, "").trim().toLowerCase().split(/\s+/);
  if (parts.length < 2) return [];
  return [parts.join("-"), parts.join("_"), parts.join("")];
}

/** N6 guard. Lists anything that identifies a founder. An empty list means the text is safe to send. */
export function findPii(text: string, founders: FounderRef[]): string[] {
  const leaks: string[] = [];
  for (const m of text.match(EMAIL) ?? []) leaks.push(`email ${m}`);
  for (const m of text.match(PHONE) ?? []) leaks.push(`phone ${m}`);
  for (const m of findLinkedIn(text)) leaks.push(`link ${m}`);
  for (const f of founders) {
    for (const part of nameParts(f.name)) {
      if (new RegExp(`(?<![A-Za-z])${escape(part)}(?![A-Za-z])`).test(text)) leaks.push(`name ${f.id}`);
    }
    if (slugs(f.name).some((sl) => text.toLowerCase().includes(sl))) leaks.push(`name ${f.id} (as a link slug)`);
    if (f.email && text.includes(f.email)) leaks.push(`email ${f.id}`);
    if (f.phone && text.replace(/\D/g, "").includes(f.phone.replace(/\D/g, ""))) leaks.push(`phone ${f.id}`);
  }
  return [...new Set(leaks)];
}
