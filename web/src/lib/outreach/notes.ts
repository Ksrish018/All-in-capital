// Loop D style notes, tagged (PRD 24.3 G12). A note is either for every founder ("Keep it under 60 words")
// or for one kind of company ("[sector:deeptech] Say Aditya will join for the technical part").
// Only the notes for this company's kind, plus the general ones, go into a draft.

export const MAX_NOTES = 8;

export function tagged(note: string, tag: string | null): string {
  return tag ? `[${tag}] ${note}` : note;
}

export function parseNote(n: string): { tag: string | null; text: string } {
  const m = /^\[([a-z]+:[a-z ]+)\]\s+(.*)$/i.exec(n.trim());
  return m ? { tag: m[1].toLowerCase(), text: m[2] } : { tag: null, text: n.trim() };
}

/** The notes a draft for a company with this tag should see: general ones, and the ones for its kind. */
export function notesFor(notes: string[], tag: string | null): string[] {
  return notes
    .map(parseNote)
    .filter((n) => n.tag === null || n.tag === tag)
    .map((n) => n.text)
    .slice(-MAX_NOTES);
}

/** True when no note was written for this kind of company: the draft leans on general habits only. */
export function noCloseNote(notes: string[], tag: string | null): boolean {
  return !!tag && !notes.map(parseNote).some((n) => n.tag === tag);
}
