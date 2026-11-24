// M10 quick tests (PRD 24.8): the three checks, Riya's voice, the data cleaning, the sealed split, tagged notes.
// Every example here is made up. The real exports stay in the gitignored Seed data 2 folder.
import { describe, expect, it } from "vitest";
import { editClass, threeChecks, voiceChecks } from "@/lib/outreach/checks";
import { cleanEmails, parseCsv, seal, splitEmails, splitScreens, type EmailRow, type ScreenRow } from "@/lib/loops/data";
import { noCloseNote, notesFor, parseNote, tagged } from "@/lib/outreach/notes";
import { InviteLineError, buildInvite, checkInviteLines } from "@/lib/outreach/invite";
import { tag } from "../helpers";

const RIYA = ["Hi Asha,", "", "62% of shops reordering every week is rare for a pre-seed ledger app.", "", "How many of those reorders come from your first fifty shops?", "", "Could we do 30 minutes on Tuesday 3 March or Thursday 5 March, in the afternoon?", "", "Riya", "All In Capital"].join("\n");
const GUSHING = ["Hi Asha,", "", "Impressive technology at Ledgerly! This is exactly the kind of innovation India needs.", "", "Would you be open to a quick chat to learn more about your journey?", "", "Best regards,", "Riya"].join("\n");

describe("the three checks", () => {
  it(tag("Critical", "L1", "Riya's own style passes all three"), () => {
    expect(threeChecks(RIYA)).toMatchObject({ short: true, oneAsk: true, noEmptyPraise: true, all: true });
  });
  it(tag("Critical", "L2", "praise with no fact, and no clear ask with a day, both fail"), () => {
    const c = threeChecks(GUSHING);
    expect(c.noEmptyPraise).toBe(false);
    expect(c.oneAsk).toBe(false);
    expect(c.all).toBe(false);
  });
  it(tag("High", "L3", "praise backed by a number is allowed; a long pitch is not short"), () => {
    expect(threeChecks(RIYA.replace("62% of shops", "An impressive 62% of shops")).noEmptyPraise).toBe(true);
    expect(threeChecks(RIYA.replace("How many", `${"We back founders in many sectors. ".repeat(12)}How many`)).short).toBe(false);
  });
});

describe("Riya's voice", () => {
  it(tag("High", "L4", "greeting, fact opener, two Tuesday or Thursday slots, her sign-off, Aditya only for deeptech"), () => {
    expect(voiceChecks(RIYA, { deeptech: false }).all).toBe(true);
    expect(voiceChecks(RIYA, { deeptech: true }).aditya).toBe(false);
    expect(voiceChecks(GUSHING, { deeptech: false })).toMatchObject({ signOff: false, factOpener: false, twoSlots: false });
  });
  it(tag("High", "L5", "an edit is kept, small or a rewrite"), () => {
    expect(editClass(RIYA, RIYA)).toBe("kept");
    expect(editClass(RIYA, RIYA.replace("Asha", "Asha Rani"))).toBe("small");
    expect(editClass(GUSHING, RIYA)).toBe("rewrite");
  });
});

const row = (id: string, type: string, draft = "d", sent = "s", startup = id): EmailRow => ({
  row_id: id, date_sent: "2026-01-01", founder_name: "Test Founder", startup, founder_type: type, sector: "Fintech", stage: "Seed",
  city: "Pune", founder_background: "b", traction_facts: "f", system_draft: draft, riya_final_email: sent,
});

describe("cleaning and the sealed split", () => {
  it(tag("High", "L6", "reads quoted CSV fields with commas, quotes and new lines"), () => {
    const rows = parseCsv('row_id,text\r\nA1,"Hi, there\nsecond line ""quoted"""\r\nA2,plain\r\n');
    expect(rows).toEqual([{ row_id: "A1", text: 'Hi, there\nsecond line "quoted"' }, { row_id: "A2", text: "plain" }]);
  });
  it(tag("Critical", "L7", "exact copies and the named off-day rows are dropped, each with its reason"), () => {
    const { kept, dropped } = cleanEmails(
      [row("E1", "software", "x", "y", "Acme"), row("E2", "software", "x", "y", "Acme"), row("E3", "hardware")],
      { email: { drop: [{ row_id: "E3", why: "off-day edit" }] }, screening: { drop: [] } },
    );
    expect(kept.map((r) => r.row_id)).toEqual(["E1"]);
    expect(dropped).toEqual([{ row_id: "E2", why: "exact copy of E1" }, { row_id: "E3", why: "off-day edit" }]);
  });
  it(tag("Critical", "L8", "the split is the same every run and tests every founder type, at least two from a type with four"), () => {
    const rows = [...Array.from({ length: 12 }, (_, i) => row(`S${i}`, "software")), ...Array.from({ length: 4 }, (_, i) => row(`H${i}`, "hardware"))];
    const a = splitEmails(rows, 1 / 3);
    expect(splitEmails([...rows].reverse(), 1 / 3)).toEqual(a);
    expect(a.test.filter((id) => id.startsWith("H"))).toHaveLength(2);
    expect(a.test.filter((id) => id.startsWith("S"))).toHaveLength(4);
    expect(new Set([...a.test, ...a.train]).size).toBe(16);
  });
  it(tag("High", "L9", "screening is split by date: the latest calls are the test"), () => {
    const s = (id: string, date: string) => ({ row_id: id, date } as ScreenRow);
    expect(splitScreens([s("a", "2026-03-01"), s("b", "2025-01-01"), s("c", "2026-09-01"), s("d", "2025-06-01")], 0.5)).toEqual({ test: ["a", "c"], train: ["b", "d"] });
  });
  it(tag("Critical", "L10", "the seal breaks if a test row changes"), () => {
    const rows = [row("E1", "software"), row("E2", "software")];
    const before = seal(rows, ["E1"]);
    expect(seal([{ ...rows[0], riya_final_email: "edited" }, rows[1]], ["E1"])).not.toBe(before);
    expect(seal([rows[0], { ...rows[1], riya_final_email: "edited" }], ["E1"])).toBe(before);
  });
});

describe("tagged style notes (G12)", () => {
  it(tag("High", "L11", "a draft sees the general notes and the ones for its kind, never another kind's"), () => {
    const notes = ["Keep it under 60 words", tagged("Say Aditya will join for the technical part", "sector:deeptech"), tagged("Lead with the repeat rate", "sector:fintech")];
    expect(notesFor(notes, "sector:deeptech")).toEqual(["Keep it under 60 words", "Say Aditya will join for the technical part"]);
    expect(notesFor(notes, null)).toEqual(["Keep it under 60 words"]);
    expect(parseNote(notes[2])).toEqual({ tag: "sector:fintech", text: "Lead with the repeat rate" });
  });
  it(tag("High", "L12", "no note for this kind of company raises the no-close-example warning"), () => {
    expect(noCloseNote(["Keep it short"], "sector:deeptech")).toBe(true);
    expect(noCloseNote([tagged("x", "sector:deeptech")], "sector:deeptech")).toBe(false);
    expect(noCloseNote(["Keep it short"], null)).toBe(false);
  });
});

describe("A5 v2: the invite built in Riya's voice (M11)", () => {
  const slots = [{ start: "2026-12-01T09:30:00Z", end: "2026-12-01T10:00:00Z" }, { start: "2026-12-03T10:30:00Z", end: "2026-12-03T11:00:00Z" }];
  const lines = { fact_line: "58% of shop owners logging sales every day is rare for a pre-seed ledger app", question: "How many of those came through your distributor?" };
  it(tag("Critical", "L13", "the built email passes the three checks and every voice check"), () => {
    const l = checkInviteLines(lines);
    const e = buildInvite({ firstNamePlaceholder: "Asha", fact: l.fact_line, question: l.question, slots, aditya: false, company: "Ledgerly" });
    expect(e.body).toContain("Tuesday 1 December at 3 pm or Thursday 3 December at 4 pm");
    expect(threeChecks(e.body).all).toBe(true);
    expect(voiceChecks(e.body, { deeptech: false }).all).toBe(true);
  });
  it(tag("High", "L14", "the Aditya line goes in for deeptech only"), () => {
    const e = buildInvite({ firstNamePlaceholder: "Asha", fact: `${lines.fact_line}.`, question: lines.question, slots, aditya: true, company: "X" });
    expect(voiceChecks(e.body, { deeptech: true }).all).toBe(true);
  });
  it(tag("Critical", "L15", "lines with praise, no number, or talk of the call are refused, so A5 tries again"), () => {
    expect(() => checkInviteLines({ ...lines, fact_line: "Impressive traction is rare for a pre-seed ledger app" })).toThrow(InviteLineError);
    expect(() => checkInviteLines({ ...lines, fact_line: "An amazing 58% of shops is rare for a pre-seed app" })).toThrow(InviteLineError);
    expect(() => checkInviteLines({ ...lines, question: "Could we talk on Tuesday?" })).toThrow(InviteLineError);
    expect(() => checkInviteLines({ ...lines, fact_line: "58% of shops log sales daily" })).toThrow(InviteLineError);
  });
});
