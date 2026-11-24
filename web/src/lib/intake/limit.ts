import "server-only";
import { createHmac } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";

// G2: an open form is an open door (Lecture 8). Uploads are counted per visitor per hour.
// The visitor is a keyed hash of the address, so no raw address is stored. Hits are deleted after two days.

/** Behind the team password every visitor is the team, so the limit only guards against a stuck script. */
export const TEAM_MULTIPLIER = 10;

export function visitorKey(req: Request, secret = process.env.WORKER_SECRET ?? "local"): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  return createHmac("sha256", secret).update(ip).digest("hex").slice(0, 32);
}

export function limitFor(setting: unknown, teamOnly: boolean): number {
  const base = Math.max(1, Number(setting ?? 30) || 30);
  return teamOnly ? base * TEAM_MULTIPLIER : base;
}

export class TooManyUploads extends Error {}

/** Records this upload, or refuses it with a plain message when the visitor is over the hourly limit. */
export async function checkUploadLimit(req: Request): Promise<void> {
  const db = createAdminClient();
  const visitor = visitorKey(req);
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const [{ data: setting }, { count }] = await Promise.all([
    db.from("settings").select("value").eq("key", "upload_limit_per_hour").maybeSingle(),
    db.from("intake_hits").select("visitor", { count: "exact", head: true }).eq("visitor", visitor).gte("at", since),
  ]);
  const limit = limitFor(setting?.value, !!process.env.APP_PASSWORD);
  if ((count ?? 0) >= limit) {
    throw new TooManyUploads(`Too many uploads from here in the last hour (limit ${limit}). Nothing was lost: try the rest in a little while, or ask Kushal to raise the limit in Settings.`);
  }
  await db.from("intake_hits").insert({ visitor });
}
