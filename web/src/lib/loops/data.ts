// Seed data 2 for the two loops (PRD 24.8, steps 1 and 2): read, clean, and split with a sealed test set.
// The exports hold founder names, so they stay in the gitignored "Seed data 2" folder. Only row IDs,
// counts and hashes are written to the repository (evals/loops/).
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** RFC 4180 CSV: quoted fields may hold commas, quotes ("") and new lines. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x !== ""));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

export type EmailRow = {
  row_id: string; date_sent: string; founder_name: string; startup: string; founder_type: string; sector: string;
  stage: string; city: string; founder_background: string; traction_facts: string; system_draft: string; riya_final_email: string;
};
export type ScreenRow = {
  row_id: string; date: string; startup: string; founder_type: string; sector: string; stage: string; city: string;
  application_summary: string; system_score: string; system_call: string; riya_final_call: string; riya_reason: string;
};

export type Cleaning = { email: { drop: { row_id: string; why: string }[] }; screening: { drop: { row_id: string; why: string }[] } };

export const SEED2 = (root: string) => path.join(root, "Seed data 2");

export function loadExports(root: string): { emails: EmailRow[]; screens: ScreenRow[] } | null {
  const dir = SEED2(root);
  const e = path.join(dir, "AIC_B6_Loop2_Email_Export.csv");
  const s = path.join(dir, "AIC_B6_Loop1_Screening_Export.csv");
  if (!fs.existsSync(e) || !fs.existsSync(s)) return null;
  return {
    emails: parseCsv(fs.readFileSync(e, "utf8")) as unknown as EmailRow[],
    screens: parseCsv(fs.readFileSync(s, "utf8")) as unknown as ScreenRow[],
  };
}

/** Step 1: drop exact copies (same draft and same sent email for the same startup) and the rows the cleaning file names. */
export function cleanEmails(rows: EmailRow[], cleaning: Cleaning): { kept: EmailRow[]; dropped: { row_id: string; why: string }[] } {
  const seen = new Map<string, string>();
  const dropped: { row_id: string; why: string }[] = [];
  const kept: EmailRow[] = [];
  const named = new Map(cleaning.email.drop.map((d) => [d.row_id, d.why]));
  for (const r of rows) {
    const key = `${r.startup}\u0000${r.system_draft.trim()}\u0000${r.riya_final_email.trim()}`;
    if (seen.has(key)) { dropped.push({ row_id: r.row_id, why: `exact copy of ${seen.get(key)}` }); continue; }
    seen.set(key, r.row_id);
    if (named.has(r.row_id)) { dropped.push({ row_id: r.row_id, why: named.get(r.row_id)! }); continue; }
    kept.push(r);
  }
  return { kept, dropped };
}

/** A stable order that does not depend on the file: rows are sorted by a hash of their ID. */
const rank = (id: string) => createHash("sha256").update(`aic-split-v1:${id}`).digest("hex");

/** Step 2 for emails: a test share from every founder type, so a thin type is never missing from the test. */
export function splitEmails(rows: EmailRow[], share: number): { test: string[]; train: string[] } {
  const byType = new Map<string, EmailRow[]>();
  for (const r of rows) byType.set(r.founder_type, [...(byType.get(r.founder_type) ?? []), r]);
  const test: string[] = [];
  for (const group of byType.values()) {
    const sorted = [...group].sort((a, b) => rank(a.row_id).localeCompare(rank(b.row_id)));
    // At least two from any type with four or more rows, so a thin type is tested on more than one email.
    const n = Math.max(group.length >= 4 ? 2 : 1, Math.round(group.length * share));
    test.push(...sorted.slice(0, n).map((r) => r.row_id));
  }
  const t = new Set(test);
  return { test: test.sort(), train: rows.filter((r) => !t.has(r.row_id)).map((r) => r.row_id).sort() };
}

/** Step 2 for screening: the latest calls are the test, because the thesis moves and new calls are the ones that matter. */
export function splitScreens(rows: ScreenRow[], share: number): { test: string[]; train: string[] } {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const n = Math.round(rows.length * share);
  return { test: sorted.slice(-n).map((r) => r.row_id).sort(), train: sorted.slice(0, -n).map((r) => r.row_id).sort() };
}

/** The seal: one hash over the test rows' full content. If a test row changes or moves, the seal breaks. */
export function seal(rows: { row_id: string }[], ids: string[]): string {
  const set = new Set(ids);
  const body = rows.filter((r) => set.has(r.row_id)).sort((a, b) => a.row_id.localeCompare(b.row_id)).map((r) => JSON.stringify(r)).join("\n");
  return createHash("sha256").update(body).digest("hex");
}
