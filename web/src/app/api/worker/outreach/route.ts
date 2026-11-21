import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { runOutreachTick } from "@/lib/outreach/agent";

export const maxDuration = 300;

// POST /api/worker/outreach. Called every 10 minutes by the scheduler, with the shared secret (PRD 15.4).
// In simulate mode a test may pass ?now= to move the clock forward, so follow ups on day 3 and day 7 can be checked.
export async function POST(req: Request) {
  const secret = process.env.WORKER_SECRET ?? "";
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!(secret.length > 0 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret)))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const at = new URL(req.url).searchParams.get("now");
  let now = new Date();
  if (at) {
    const { data } = await createAdminClient().from("settings").select("value").eq("key", "outreach_mode").maybeSingle();
    if (data?.value === "live") return NextResponse.json({ error: "The clock can only be moved in simulate mode." }, { status: 409 });
    now = new Date(at);
  }
  return NextResponse.json(await runOutreachTick(now));
}
