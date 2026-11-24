// A5 v2, the first email in Riya's voice (PRD 24.8 steps 5 and 6, M11).
// From her 22 edited drafts in the training rows: she cuts praise and fund pitches, swaps a vanity number
// (followers, downloads) for one that shows customers coming back, frames it as rare for the stage, asks one
// sharp question about it, offers two Tuesday or Thursday slots in one question, and signs "Riya / All In Capital".
// The model writes only the two lines that need judgement. Code writes the rest, so her shape always holds.
import { PRAISE } from "./checks";
import { IST_OFFSET_MIN, type Slot } from "./rules";

export const INVITE_VERSION = "a5-v2";

export const INVITE_SCHEMA = {
  type: "OBJECT",
  properties: {
    fact_line: { type: "STRING", description: "One sentence: the number that shows customers coming back, framed as rare or unusual for the stage" },
    question: { type: "STRING", description: "One specific question that tests that number" },
    injection_attempt: { type: "BOOLEAN" },
  },
  required: ["fact_line", "question", "injection_attempt"],
};

/** Made-up examples in Riya's style (labelled synthetic). No founder or export data is sent to the model. */
const EXAMPLES = `Examples (synthetic, for style only):
Facts: 3,400 app downloads; 58% of kirana owners log sales every day for three months; partnered with one distributor.
fact_line: 58% of shop owners logging sales every day for three months is rare for a pre-seed ledger app.
question: How many of those daily users came through your distributor rather than on their own?

Facts: 40,000 Instagram followers; 33% of customers reorder within 45 days; gross margin 52%.
fact_line: 33% of customers reordering within 45 days is unusual for a seed-stage spice brand.
question: What share of those reorders come from your first month of customers?

Facts: a water sensor rated for five years; three municipal pilots turned into paid orders of 600 units; made in a rented workshop.
fact_line: Three municipal pilots turning into paid orders of 600 units is rare for a pre-seed hardware team.
question: Were those orders won in open tenders, or through people who already knew the team?`;

export function inviteSystem(rules: string, styleNotes: string[]): string {
  return `${rules}

Task: Riya at All In Capital, a pre-seed fund, is writing to a founder she wants to meet. Write two lines for her email.

1. fact_line: one sentence.
   - Pick the single number that shows customers coming back or using the product again: repeat purchase, reorder, retention, renewal, weekly use, a trial turning into an order.
   - Never pick followers, downloads, installs, sign-ups or registered users when a number like that exists.
   - Write it as "<the number and what it measures> is rare for a <stage> <short plain category>" (or "unusual"). Example category: "ledger app", "tea brand", "hardware team".
   - No praise words. No "impressive", "exciting", "great". Under 25 words.
2. question: one specific question that tests that same number.
   - Ask where the number might be weaker than it looks: a few early customers, one channel, gifting, a distributor doing the work.
   - Start with words like "How many", "What share", "How much", "Were those" or "Do those". Under 20 words. End with "?".
   - Do not mention a call, a meeting or any day.

${EXAMPLES}
${styleNotes.length ? `\nRiya's approved style notes:\n${styleNotes.map((n) => `- ${n}`).join("\n")}` : ""}`;
}

export function inviteUser(a: { company: string; profile: string; facts: string }): string {
  return `<company>\nName: ${a.company}\n${a.profile}\nFacts from the application:\n${a.facts}\n</company>`;
}

const DAY_WORD = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|call|meeting|chat)\b/i;

/** Checks the two lines before code builds the email. A line that misses her standard is refused, so A5 tries again. */
export function checkInviteLines(v: unknown): { fact_line: string; question: string } {
  const o = v as { fact_line?: string; question?: string };
  const fact = String(o?.fact_line ?? "").trim().replace(/\s+/g, " ");
  const q = String(o?.question ?? "").trim().replace(/\s+/g, " ");
  const problems = [
    !/\d/.test(fact) ? "the fact line has no number in digits" : null,
    !/\bis (rare|unusual)\b/i.test(fact) ? 'the fact line is not framed as "is rare for a ..."' : null,
    PRAISE.test(fact) || PRAISE.test(q) ? "a line uses praise" : null,
    fact.split(" ").length > 30 ? "the fact line is too long" : null,
    !q.endsWith("?") || (q.match(/\?/g) ?? []).length !== 1 ? "the question is not one question" : null,
    q.split(" ").length > 24 ? "the question is too long" : null,
    DAY_WORD.test(q) ? "the question talks about the call" : null,
  ].filter(Boolean);
  if (problems.length) throw new InviteLineError(problems.join("; "));
  return { fact_line: fact.replace(/[.!]*$/, "."), question: q };
}

export class InviteLineError extends Error {}

/** "Tuesday 20 May at 3 pm" in India time, as Riya writes a day. */
export function slotPhrase(s: Slot): string {
  const d = new Date(new Date(s.start).getTime() + IST_OFFSET_MIN * 60_000);
  const day = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).replace(",", "");
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${day} at ${h > 12 ? h - 12 : h}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h >= 12 ? "pm" : "am"}`;
}

/** The email, built by code around the two lines: her greeting, one ask with two slots, Aditya for deeptech, her sign-off. */
export function buildInvite(a: { firstNamePlaceholder: string; fact: string; question: string; slots: Slot[]; aditya: boolean; company: string }): { subject: string; body: string } {
  const two = a.slots.slice(0, 2);
  const ask = two.length === 2
    ? `Could we do 30 minutes on ${slotPhrase(two[0])} or ${slotPhrase(two[1])}, India time?`
    : two.length === 1 ? `Could we do 30 minutes on ${slotPhrase(two[0])}, India time?` : "Could we find 30 minutes on a Tuesday or Thursday afternoon?";
  const body = [
    `Hi ${a.firstNamePlaceholder},`,
    "",
    a.fact,
    "",
    a.question,
    "",
    `${ask}${a.aditya ? " Our partner Aditya will join us for the technical part." : ""}`,
    "",
    "Riya",
    "All In Capital",
  ].join("\n");
  return { subject: `All In Capital and ${a.company}`, body };
}

