// Step 3. Parse the application form. Code only, no AI.
//
// The form prints labels in one column and answers in another, and the two drift out of line.
// So we never pair by line of text. We use each word's position: the label column and the answer
// column are found from the file itself, then every answer line is attached to the label that
// started above it. Section headings are skipped. The "Anything else" answer sits under its heading.

export type TextItem = { page: number; x: number; y: number; h: number; w: number; str: string };
export type FormField = { key: string; label: string; value: string; page: number };
export type ParsedForm = { fields: FormField[]; byKey: Record<string, string> };

/** Known labels mapped to stable keys. Anything else keeps a key made from its label. */
const KNOWN: [RegExp, string][] = [
  [/^company name$/i, "company_name"],
  [/^website$/i, "website"],
  [/^location$/i, "location"],
  [/^incorporated$/i, "incorporated"],
  [/^one-line description$/i, "one_line"],
  [/^sector \(as selected\)$/i, "sector"],
  [/^stage \(as selected\)$/i, "stage"],
  [/^team size$/i, "team_size"],
  [/^founder( \d)?$/i, "founder"],
  [/^time commitment$/i, "time_commitment"],
  [/^prior startup experience$/i, "prior_experience"],
  [/^equity split$/i, "equity_split"],
  [/^what have you built\??$/i, "built"],
  [/^amount raising$/i, "amount_raising"],
  [/^valuation expectation$/i, "valuation"],
  [/^existing investors$/i, "existing_investors"],
  [/^use of funds$/i, "use_of_funds"],
  [/^other investors in conversation$/i, "other_investors"],
  [/^how did you hear about us\??$/i, "heard_from"],
  [/^anything else we should know\??$/i, "anything_else"],
];

export function keyFor(label: string): string {
  for (const [re, key] of KNOWN) if (re.test(label.trim())) return key;
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/** Joins the pieces of one printed line. PDF ligatures split words ("fi" + "nancing"), so close pieces join with no space. */
export function joinLine(items: TextItem[]): string {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  let out = "";
  let end = -Infinity;
  for (const it of sorted) {
    const gap = it.x - end;
    out += out && gap > 1.5 ? " " : "";
    out += it.str;
    end = it.x + it.w;
  }
  return out.replace(/\s+/g, " ").trim();
}

type Line = { page: number; y: number; x: number; h: number; text: string; col: "head" | "label" | "answer" };

function mode(xs: number[]): number {
  const count = new Map<number, number>();
  for (const x of xs) count.set(x, (count.get(x) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
}

export function parseFormItems(raw: TextItem[]): ParsedForm {
  const items = raw.filter((i) => i.str.trim()).map((i) => ({ ...i, x: Math.round(i.x), y: Math.round(i.y) }));
  // Find the three columns from the file itself.
  const answerX = mode(items.filter((i) => i.x > 150).map((i) => i.x));
  const leftItems = items.filter((i) => i.x < answerX - 40);
  const headX = Math.min(...leftItems.map((i) => i.x));
  const labelX = mode(leftItems.filter((i) => i.x > headX + 2).map((i) => i.x)) || headX;

  // Group into printed lines per column, in reading order.
  const groups = new Map<string, TextItem[]>();
  for (const it of items) {
    const col = it.x >= answerX - 5 ? "answer" : it.x >= labelX - 2 && labelX > headX ? "label" : "head";
    // Pieces of one line sit within 2 points of each other vertically.
    const k = [...groups.keys()].find((g) => {
      const [p, y, c] = g.split("|");
      return Number(p) === it.page && c === col && Math.abs(Number(y) - it.y) <= 2;
    });
    const key = k ?? `${it.page}|${it.y}|${col}`;
    groups.set(key, [...(groups.get(key) ?? []), it]);
  }
  const lines: Line[] = [...groups.entries()]
    .map(([k, its]) => {
      const [p, y, col] = k.split("|");
      return { page: Number(p), y: Number(y), x: Math.min(...its.map((i) => i.x)), h: Math.max(...its.map((i) => i.h)), text: joinLine(its), col: col as Line["col"] };
    })
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);

  const fields: FormField[] = [];
  let current: FormField | null = null;
  let lastLabel: Line | null = null;
  let started = false; // skip the title block until the first section heading
  // Section headings print larger (13pt) than labels and answers (10 to 12pt).
  const isHeading = (l: Line) => l.col === "head" && l.h >= 12.5;

  for (const line of lines) {
    // Everything after the "Anything else" heading is its answer, whichever column it starts in.
    if (current?.key === "anything_else" && !isHeading(line)) {
      current.value = `${current.value} ${line.text}`.trim();
      continue;
    }
    if (line.col === "head") {
      if (isHeading(line)) {
        started = true;
        if (/anything else/i.test(line.text)) {
          current = { key: "anything_else", label: line.text, value: "", page: line.page };
          fields.push(current);
        } else {
          current = null;
        }
        lastLabel = null;
        continue;
      }
      continue;
    }
    if (!started) continue;
    if (line.col === "label") {
      // A label that wraps onto a second line has no answer beside it. Join it to the label above.
      const hasAnswer = lines.some((l) => l.col === "answer" && l.page === line.page && Math.abs(l.y - line.y) <= 4);
      if (current && lastLabel && lastLabel.page === line.page && lastLabel.y - line.y < 17 && !hasAnswer && !/\?$/.test(current.label)) {
        current.label = `${current.label} ${line.text}`;
        current.key = keyFor(current.label);
        lastLabel = line;
        continue;
      }
      current = { key: keyFor(line.text), label: line.text, value: "", page: line.page };
      fields.push(current);
      lastLabel = line;
      continue;
    }
    if (current) current.value = `${current.value} ${line.text}`.trim();
  }

  // Keep founders apart: founder, founder_2 ...
  let n = 0;
  for (const f of fields) if (f.key === "founder") f.key = `founder_${++n}`;
  const byKey: Record<string, string> = {};
  for (const f of fields) byKey[f.key] = byKey[f.key] ? `${byKey[f.key]} ${f.value}` : f.value;
  return { fields, byKey };
}

export type FounderInfo = { key: string; name: string | null; role: string | null; linkedin: string | null; bio: string };

/** LinkedIn links sometimes wrap onto the next line after a hyphen ("ritu-" then "hegde-example"). */
const LINKEDIN = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/(?:[A-Za-z0-9_]+-\s?)*[A-Za-z0-9_]+\/?/gi;

export function findLinkedIn(text: string): string[] {
  return [...text.matchAll(LINKEDIN)].map((m) => m[0]);
}

/** Splits a founder answer: "Rahul Mehta, CEO. 10 years in ... linkedin.com/in/rahul". */
export function parseFounder(key: string, text: string): FounderInfo {
  const raw = findLinkedIn(text)[0] ?? null;
  const linkedin = raw ? raw.replace(/\s+/g, "") : null;
  const clean = (raw ? text.replace(raw, "") : text).replace(/LinkedIn:\s*/i, "").replace(/\s+/g, " ").trim();
  const m = clean.match(/^((?:Dr\.\s+)?[A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*){0,3})(?:,\s*([^.]+?))?(?:\.\s+|\s+(?=Background:)|\.?$)(.*)$/);
  if (!m) return { key, name: null, role: null, linkedin, bio: clean };
  return { key, name: m[1].trim(), role: m[2]?.trim() ?? null, linkedin, bio: m[3].replace(/^Background:\s*/i, "").trim() };
}
