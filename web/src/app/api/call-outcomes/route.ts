import { NextResponse } from "next/server";
import { currentActor } from "@/lib/actor";
import { body } from "@/lib/api";
import { OutreachError, recordCallOutcome } from "@/lib/outreach/agent";

// POST /api/call-outcomes. The one tap the day after a call: was it worth 30 minutes? (Step 20, Loop G)
export async function POST(req: Request) {
  const b = await body<{ application_id: string; worth: boolean; note: string }>(req);
  const actor = await currentActor();
  try {
    await recordCallOutcome({ appId: String(b.application_id), role: actor.role, worth: Boolean(b.worth), note: b.note });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof OutreachError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "That did not work." }, { status: 500 });
  }
}
