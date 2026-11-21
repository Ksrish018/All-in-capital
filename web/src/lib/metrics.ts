// The success metrics and the stop list (PRD 2.4 and 2.5), in plain code so they can be tested.

export const STOP = { overrideRate: 0.4, reviewMinutes: 15, briefHours: 24, replyDays: 3 };

/** Monday of the week, as YYYY-MM-DD, in India time. */
export function weekOf(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 330 * 60_000);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function byWeek<T>(rows: T[], when: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = weekOf(when(r));
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return new Map([...m.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

export const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
export const share = (n: number, of: number) => (of ? n / of : null);

export type Gate1 = { created_at: string; seconds_spent: number | null; agreed_with_system: boolean; system_recommendation: string | null; decision: string; blind: boolean; blind_first_view: string | null };

/** An override is Riya choosing differently from a system that took a side. "Needs a person" is not a side. */
export function isOverride(r: Gate1): boolean | null {
  if (!r.system_recommendation || r.system_recommendation === "needs_human") return null;
  return !r.agreed_with_system;
}

export function overrideRate(rows: Gate1[]): number | null {
  const sided = rows.map(isOverride).filter((x): x is boolean => x !== null);
  return share(sided.filter(Boolean).length, sided.length);
}

/** Stop line 3: more than 40 percent overrides for two weeks in a row. */
export function overrideStop(weekly: (number | null)[]): boolean {
  for (let i = 1; i < weekly.length; i++) {
    const a = weekly[i - 1];
    const b = weekly[i];
    if (a !== null && b !== null && a > STOP.overrideRate && b > STOP.overrideRate) return true;
  }
  return false;
}

/** Stop line 4: after three weeks of the pilot, review time still above 15 minutes. */
export function reviewStop(weeklyMinutes: (number | null)[]): boolean {
  if (weeklyMinutes.length < 3) return false;
  const last = weeklyMinutes.at(-1);
  return last !== null && last !== undefined && last > STOP.reviewMinutes;
}

/** Blind check: how often Riya's own first view matched the system's position. */
export function blindAgreement(rows: Gate1[]): { matched: number; of: number; changedAfterReveal: number } {
  const blind = rows.filter((r) => r.blind && r.blind_first_view && r.system_recommendation);
  return {
    matched: blind.filter((r) => r.blind_first_view === r.system_recommendation).length,
    of: blind.length,
    changedAfterReveal: blind.filter((r) => r.blind_first_view !== "unsure" && r.blind_first_view !== r.decision).length,
  };
}
