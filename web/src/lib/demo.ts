import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Read-only demo for portfolio visitors. Anyone can look around; changing anything needs a personal
// access link issued from the portfolio (srish-kulkarni.vercel.app/access), signed with ACCESS_SECRET.
// Demo mode is on only where ACCESS_SECRET is set (Vercel). Scheduled jobs are unaffected: they authenticate with CRON_SECRET, not with this cookie.

export const DEMO_APP = "all-in-capital-triage";
export const ACCESS_COOKIE = "full_access";
export const REQUEST_ACCESS_URL = `https://srish-kulkarni.vercel.app/access?app=${DEMO_APP}`;
export const DEMO_MESSAGE = "This is a read-only demo. Request full access to try this action.";

const secret = () => process.env.ACCESS_SECRET ?? "";
const sign = (s: string) => createHmac("sha256", secret()).update(s).digest("base64url");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** A portfolio access link: base64url(JSON {app, email, exp}) + "." + HMAC. Returns its expiry (ms) or null. */
export function verifyPass(token: string | null | undefined, now = Date.now()): number | null {
  if (!secret() || !token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !same(sig, sign(payload))) return null;
  try {
    const { app, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return app === DEMO_APP && typeof exp === "number" && exp > now ? exp : null;
  } catch {
    return null;
  }
}

/** Cookie value for a session that ends when the link does. */
export const accessCookie = (exp: number) => `${exp}.${sign(`session:${exp}`)}`;

/** Full access with a valid session cookie. Without ACCESS_SECRET (local runs) demo mode is off entirely. */
export function validAccessCookie(value: string | undefined, now = Date.now()): boolean {
  if (!secret()) return true;
  if (!value) return false;
  const [exp, sig] = value.split(".");
  return /^\d+$/.test(exp ?? "") && Number(exp) > now && !!sig && same(sig, sign(`session:${exp}`));
}

/** True for visitors without a valid access link: they can read everything and change nothing. */
export async function isDemo(): Promise<boolean> {
  return !validAccessCookie((await cookies()).get(ACCESS_COOKIE)?.value);
}
