import { NextResponse, after } from "next/server";
import { currentActor } from "@/lib/actor";
import { body } from "@/lib/api";
import { checkSetting } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/server";
import { runScreeningWorker } from "@/lib/intake/screen";

// POST /api/settings. One setting at a time, by the person who owns it (PRD 13.13).
export async function POST(req: Request) {
  const b = await body<{ key: string; value: unknown }>(req);
  const actor = await currentActor();
  const c = checkSetting(String(b.key), actor.role, b.value);
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: c.status });
  const db = createAdminClient();
  // Going live needs at least Riya's address, so invites have someone to come from.
  if (b.key === "outreach_mode" && c.value === "live") {
    const { data } = await db.from("settings").select("value").eq("key", "attendees").maybeSingle();
    if (!(data?.value as Record<string, string | null> | undefined)?.riya) {
      return NextResponse.json({ error: "Add the call attendees' email addresses first." }, { status: 409 });
    }
  }
  await db.from("settings").upsert({ key: b.key, value: c.value });
  // A raised cap lets paused applications carry on straight away.
  if (b.key === "daily_cost_cap_usd") after(() => runScreeningWorker().catch((e) => console.error("worker:", e)));
  return NextResponse.json({ ok: true, value: c.value });
}
