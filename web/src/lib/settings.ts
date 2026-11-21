// What each setting accepts, and who may change it (PRD 13.13). Checked on the server.

import type { Role } from "./actor";

type Rule = { who: Role[]; parse: (v: unknown) => unknown; label: string };

const oneOf = (...xs: string[]) => (v: unknown) => {
  if (typeof v !== "string" || !xs.includes(v)) throw new Error(`Choose one of: ${xs.join(", ")}.`);
  return v;
};
const number = (min: number, max: number) => (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Enter a number from ${min} to ${max}.`);
  return Math.round(n * 1000) / 1000;
};
const emails = (v: unknown) => {
  const o = (v ?? {}) as Record<string, unknown>;
  const out: Record<string, string | null> = {};
  for (const k of ["riya", "kushal", "aditya"]) {
    const e = String(o[k] ?? "").trim();
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error(`${k}: that is not an email address.`);
    out[k] = e || null;
  }
  return out;
};

export const SETTINGS: Record<string, Rule> = {
  daily_cost_cap_usd: { who: ["kushal"], parse: number(0.5, 100), label: "Daily cost cap (USD)" },
  default_headline_lens: { who: ["kushal"], parse: oneOf("revealed", "public"), label: "Default headline lens" },
  blind_sample_rate: { who: ["kushal"], parse: number(0.05, 0.5), label: "Blind sample rate" },
  sector_flag_strength: { who: ["kushal"], parse: oneOf("soft", "hard"), label: "Outside the four sectors" },
  research_mode: { who: ["kushal"], parse: oneOf("replay", "live", "off"), label: "Research mode" },
  outreach_mode: { who: ["kushal"], parse: oneOf("simulate", "live"), label: "Outreach mode" },
  attendees: { who: ["riya", "kushal"], parse: emails, label: "Call attendees" },
  inr_per_usd: { who: ["kushal"], parse: number(50, 150), label: "Rupees per US dollar" },
};

export function checkSetting(key: string, role: Role, value: unknown): { ok: true; value: unknown } | { ok: false; error: string; status: number } {
  const rule = SETTINGS[key];
  if (!rule) return { ok: false, error: "Unknown setting.", status: 404 };
  if (!rule.who.includes(role)) return { ok: false, error: `Only ${rule.who.map((w) => w[0].toUpperCase() + w.slice(1)).join(" or ")} can change this.`, status: 403 };
  try {
    return { ok: true, value: rule.parse(value) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Not a valid value.", status: 400 };
  }
}
