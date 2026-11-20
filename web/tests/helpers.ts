import fs from "node:fs";
import path from "node:path";

/** Repository root (one level above web/). */
export const ROOT = path.resolve(__dirname, "..", "..");

export function readJson<T = unknown>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")) as T;
}

/** Every test case carries a severity (PRD Section 19.0). Critical failures block release. */
export type Severity = "Critical" | "High" | "Low";
export const tag = (severity: Severity, id: string, title: string) => `[${severity}] ${id}: ${title}`;
