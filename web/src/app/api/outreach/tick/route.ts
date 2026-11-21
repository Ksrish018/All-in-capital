import { NextResponse } from "next/server";
import { can, currentActor } from "@/lib/actor";
import { runOutreachTick } from "@/lib/outreach/agent";

// POST /api/outreach/tick. "Check for replies now" from the Outreach page. The scheduler also runs it every 10 minutes.
export async function POST() {
  const actor = await currentActor();
  if (!can.gate1(actor.role)) return NextResponse.json({ error: "Only Riya or Kushal can run the agent." }, { status: 403 });
  return NextResponse.json(await runOutreachTick());
}
