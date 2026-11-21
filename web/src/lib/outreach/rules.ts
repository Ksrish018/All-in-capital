// The outreach agent's rules in plain code (PRD Part 2, 10.4 slot rules, Loops E and F).
// The agent does one step per run. These functions decide the step. They never call a model or a network.

export type Slot = { start: string; end: string }; // ISO, UTC
export type Label = "picked_slot" | "interested_new_time" | "interested_no_time" | "not_interested" | "unclear" | "out_of_office";

export const IST_OFFSET_MIN = 330;
export const SLOT_MINUTES = 30;
export const WINDOW = { days: [2, 4], startHour: 14, endHour: 18 }; // Tuesday and Thursday, 14:00 to 18:00 IST
export const CONFIDENCE_BAR = 0.75;
export const MAX_FOLLOWUPS = 2;
export const MAX_SCHEDULING_ROUNDS = 2;
export const FOLLOWUP_DAYS = [3, 7]; // after the first email
export const NO_RESPONSE_AFTER_DAYS = 10;

const DAY = 86_400_000;

/** Wall-clock parts of a moment in India time. */
function ist(d: Date) {
  const t = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), dow: t.getUTCDay(), h: t.getUTCHours(), min: t.getUTCMinutes() };
}
/** A UTC moment from an India date and time. */
function fromIst(y: number, m: number, d: number, h: number, min: number): Date {
  return new Date(Date.UTC(y, m, d, h, min) - IST_OFFSET_MIN * 60_000);
}
const isWorkingDay = (dow: number) => dow >= 1 && dow <= 5;

/** Every 30 minute slot on Tuesday or Thursday afternoons in the next 10 working days, after one working day of notice. */
export function candidateSlots(now: Date): Slot[] {
  const out: Slot[] = [];
  let worked = 0;
  let noticeDone = false;
  for (let i = 1; i <= 21 && worked < 10; i++) {
    const day = new Date(now.getTime() + i * DAY);
    const p = ist(day);
    if (!isWorkingDay(p.dow)) continue;
    worked++;
    if (!noticeDone) { noticeDone = true; continue; } // at least one full working day of notice
    if (!WINDOW.days.includes(p.dow)) continue;
    for (let h = WINDOW.startHour; h < WINDOW.endHour; h++) {
      for (const min of [0, 30]) {
        const start = fromIst(p.y, p.m, p.d, h, min);
        out.push({ start: start.toISOString(), end: new Date(start.getTime() + SLOT_MINUTES * 60_000).toISOString() });
      }
    }
  }
  return out;
}

const overlaps = (a: Slot, b: { start: string; end: string }) => new Date(a.start) < new Date(b.end) && new Date(b.start) < new Date(a.end);

/** Up to three free slots, never one the founder refused, spread across different days where possible. */
export function pickSlots(now: Date, busy: { start: string; end: string }[], refused: Slot[], want = 3): Slot[] {
  const free = candidateSlots(now).filter((s) => !busy.some((b) => overlaps(s, b)) && !refused.some((r) => r.start === s.start));
  const byDay = new Map<string, Slot[]>();
  for (const s of free) {
    const p = ist(new Date(s.start));
    const k = `${p.y}-${p.m}-${p.d}`;
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }
  const picked: Slot[] = [];
  // One per day first (a mid-afternoon slot), then fill.
  for (const slots of byDay.values()) if (picked.length < want) picked.push(slots[Math.min(4, slots.length - 1)]);
  for (const s of free) if (picked.length < want && !picked.includes(s)) picked.push(s);
  return picked.slice(0, want);
}

export function isInWindow(iso: string, now: Date): boolean {
  return candidateSlots(now).some((s) => s.start === new Date(iso).toISOString());
}

export function formatSlot(s: Slot): string {
  const d = new Date(new Date(s.start).getTime() + IST_OFFSET_MIN * 60_000);
  const day = d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" });
  return `${day}, ${time} IST`;
}

/** A label below the confidence bar is always "unclear" and goes to Riya. The system never forces a label. */
export function settleLabel(label: Label, confidence: number): Label {
  return confidence < CONFIDENCE_BAR ? "unclear" : label;
}

export type Next =
  | { do: "book"; slot: Slot }
  | { do: "offer_slots"; round: number; refused: Slot[] }
  | { do: "draft_close" }
  | { do: "hand_to_riya"; reason: string }
  | { do: "pause_until"; date: string };

/** What a labelled reply leads to (PRD Step 16 table, Loop F). */
export function nextOnReply(input: {
  label: Label; offered: Slot[]; refused: Slot[]; round: number; proposed: string[]; returnDate: string | null; now: Date;
}): Next {
  switch (input.label) {
    case "picked_slot": {
      const slot = input.offered.find((s) => input.proposed.some((p) => new Date(p).toISOString() === s.start)) ?? (input.offered.length === 1 ? input.offered[0] : undefined);
      return slot ? { do: "book", slot } : { do: "hand_to_riya", reason: "The founder picked a time, but it does not match an offered slot." };
    }
    case "interested_new_time":
    case "interested_no_time": {
      if (input.round >= MAX_SCHEDULING_ROUNDS) return { do: "hand_to_riya", reason: "Two scheduling rounds are done. Over to Riya." };
      // A founder who asks for other times has refused the ones on offer.
      const refused = [...input.refused, ...input.offered.filter((o) => !input.refused.some((r) => r.start === o.start))];
      const asked = input.proposed.map((p) => new Date(p).toISOString()).find((p) => isInWindow(p, input.now));
      if (asked) {
        const slot = { start: asked, end: new Date(new Date(asked).getTime() + SLOT_MINUTES * 60_000).toISOString() };
        return { do: "book", slot };
      }
      return { do: "offer_slots", round: input.round + 1, refused };
    }
    case "not_interested":
      return { do: "draft_close" };
    case "out_of_office":
      return input.returnDate ? { do: "pause_until", date: input.returnDate } : { do: "hand_to_riya", reason: "Out of office with no return date." };
    default:
      return { do: "hand_to_riya", reason: "Unclear reply. Riya reads it." };
  }
}

/** Loop E: what to do when no reply has come. Follow up on day 3 and day 7, then mark no response. */
export function nextWithoutReply(input: { firstSentAt: string; followupsSent: number; now: Date; pausedUntil: string | null }):
  | { do: "wait"; until: string }
  | { do: "draft_followup"; n: 1 | 2 }
  | { do: "no_response" } {
  const now = input.now.getTime();
  if (input.pausedUntil && new Date(input.pausedUntil).getTime() > now) return { do: "wait", until: input.pausedUntil };
  const days = (now - new Date(input.firstSentAt).getTime()) / DAY;
  if (input.followupsSent >= MAX_FOLLOWUPS) {
    return days >= NO_RESPONSE_AFTER_DAYS ? { do: "no_response" } : { do: "wait", until: new Date(new Date(input.firstSentAt).getTime() + NO_RESPONSE_AFTER_DAYS * DAY).toISOString() };
  }
  const dueDay = FOLLOWUP_DAYS[input.followupsSent];
  if (days >= dueDay) return { do: "draft_followup", n: (input.followupsSent + 1) as 1 | 2 };
  return { do: "wait", until: new Date(new Date(input.firstSentAt).getTime() + dueDay * DAY).toISOString() };
}
