// M6 quick tests: slot rules, reply handling, follow ups, and the send rule (N4).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { candidateSlots, formatSlot, nextOnReply, nextWithoutReply, pickSlots, settleLabel } from "@/lib/outreach/rules";
import { ROOT, tag } from "../helpers";

// Monday 23 November 2026, 10:00 IST.
const NOW = new Date("2026-11-23T04:30:00Z");
const istDay = (iso: string) => new Date(new Date(iso).getTime() + 330 * 60_000).getUTCDay();
const istHour = (iso: string) => new Date(new Date(iso).getTime() + 330 * 60_000).getUTCHours();

describe("slot rules (PRD 10.4)", () => {
  it(tag("High", "O1", "only Tuesday or Thursday, 14:00 to 18:00 IST, 30 minutes, after a working day of notice"), () => {
    const all = candidateSlots(NOW);
    expect(all.length).toBeGreaterThan(0);
    for (const s of all) {
      expect([2, 4]).toContain(istDay(s.start));
      expect(istHour(s.start)).toBeGreaterThanOrEqual(14);
      expect(istHour(s.start)).toBeLessThan(18);
      expect(new Date(s.end).getTime() - new Date(s.start).getTime()).toBe(30 * 60_000);
    }
    // Tuesday 24th is the next working day: that is the notice day, so it is skipped.
    expect(all.some((s) => s.start.startsWith("2026-11-24"))).toBe(false);
    expect(formatSlot(all[0])).toMatch(/Thursday, 26 November.*2:00 pm IST/i);
  });
  it(tag("High", "O2", "three slots on different days, never a refused or busy one"), () => {
    const first = pickSlots(NOW, [], []);
    expect(first).toHaveLength(3);
    expect(new Set(first.map((s) => s.start.slice(0, 10))).size).toBe(3);
    const again = pickSlots(NOW, [{ start: first[1].start, end: first[1].end }], [first[0]]);
    expect(again.some((s) => s.start === first[0].start || s.start === first[1].start)).toBe(false);
  });
});

describe("reading replies (Step 16)", () => {
  const offered = pickSlots(NOW, [], []);
  const base = { offered, refused: [], round: 0, proposed: [] as string[], returnDate: null, now: NOW };
  it(tag("High", "O3", "a label below the confidence bar is unclear and goes to Riya"), () => {
    expect(settleLabel("picked_slot", 0.6)).toBe("unclear");
    expect(settleLabel("picked_slot", 0.9)).toBe("picked_slot");
    expect(nextOnReply({ ...base, label: "unclear" })).toMatchObject({ do: "hand_to_riya" });
  });
  it(tag("High", "O4", "a picked slot is booked; a pick that matches no offered slot goes to Riya"), () => {
    expect(nextOnReply({ ...base, label: "picked_slot", proposed: [offered[1].start] })).toEqual({ do: "book", slot: offered[1] });
    expect(nextOnReply({ ...base, label: "picked_slot", proposed: ["2026-12-25T10:00:00Z"] })).toMatchObject({ do: "hand_to_riya" });
  });
  it(tag("High", "O5", "refusing all three gets new slots, none of the refused ones (19.3)"), () => {
    const n = nextOnReply({ ...base, label: "interested_no_time" });
    expect(n).toMatchObject({ do: "offer_slots", round: 1 });
    const refused = (n as { refused: { start: string }[] }).refused;
    const fresh = pickSlots(NOW, [], refused as never);
    expect(fresh.some((f) => offered.some((o) => o.start === f.start))).toBe(false);
  });
  it(tag("High", "O6", "a third request for a new time goes to Riya after two rounds (19.3a)"), () => {
    expect(nextOnReply({ ...base, label: "interested_new_time", round: 2 })).toMatchObject({ do: "hand_to_riya" });
  });
  it(tag("Low", "O7", "out of office pauses until the return date"), () => {
    expect(nextOnReply({ ...base, label: "out_of_office", returnDate: "2026-12-02" })).toEqual({ do: "pause_until", date: "2026-12-02" });
  });
  it(tag("High", "O8", "not interested drafts a polite close"), () => {
    expect(nextOnReply({ ...base, label: "not_interested" })).toEqual({ do: "draft_close" });
  });
});

describe("follow ups (Loop E, 19.3a)", () => {
  const sent = "2026-11-23T05:00:00Z";
  const at = (days: number) => new Date(new Date(sent).getTime() + days * 86_400_000);
  it(tag("High", "O9", "day 3 then day 7, then no response; never more than two"), () => {
    expect(nextWithoutReply({ firstSentAt: sent, followupsSent: 0, now: at(2.9), pausedUntil: null })).toMatchObject({ do: "wait" });
    expect(nextWithoutReply({ firstSentAt: sent, followupsSent: 0, now: at(3), pausedUntil: null })).toEqual({ do: "draft_followup", n: 1 });
    expect(nextWithoutReply({ firstSentAt: sent, followupsSent: 1, now: at(6), pausedUntil: null })).toMatchObject({ do: "wait" });
    expect(nextWithoutReply({ firstSentAt: sent, followupsSent: 1, now: at(7), pausedUntil: null })).toEqual({ do: "draft_followup", n: 2 });
    expect(nextWithoutReply({ firstSentAt: sent, followupsSent: 2, now: at(9), pausedUntil: null })).toMatchObject({ do: "wait" });
    expect(nextWithoutReply({ firstSentAt: sent, followupsSent: 2, now: at(10), pausedUntil: null })).toEqual({ do: "no_response" });
  });
  it(tag("Low", "O10", "an out of office pause holds the follow up clock"), () => {
    expect(nextWithoutReply({ firstSentAt: sent, followupsSent: 0, now: at(5), pausedUntil: at(8).toISOString() })).toMatchObject({ do: "wait" });
  });
});

describe("N4: only Riya's click sends", () => {
  it(tag("Critical", "N4a", "the send path checks for Riya, and nothing else in the code calls Gmail send"), () => {
    const agent = fs.readFileSync(path.join(ROOT, "web/src/lib/outreach/agent.ts"), "utf8");
    expect(agent).toMatch(/if \(input\.role !== "riya"\) throw new OutreachError/);
    const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? files(path.join(dir, d.name)) : [path.join(dir, d.name)]);
    const callers = files(path.join(ROOT, "web/src")).filter((f) => /\.(ts|tsx)$/.test(f) && fs.readFileSync(f, "utf8").includes("gmailSend("));
    expect(callers.map((f) => path.basename(f)).sort()).toEqual(["agent.ts", "google.ts"]);
    expect((agent.match(/gmailSend\(/g) ?? []).length).toBe(1);
  });
  it(tag("Critical", "N4b", "the database refuses a sent email with no person behind it"), () => {
    const sql = fs.readFileSync(path.join(ROOT, "supabase/migrations/0001_init.sql"), "utf8");
    expect(sql).toMatch(/constraint sent_needs_person check \(sent_at is null or sent_by is not null\)/);
  });
});
