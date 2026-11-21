import { NextResponse } from "next/server";
import { currentActor } from "@/lib/actor";
import { body } from "@/lib/api";
import { OutreachError, runOutreachTick, simulateReply, takeOver } from "@/lib/outreach/agent";

// POST /api/outreach/:id. Riya takes over, pauses or resumes a conversation. In simulate mode, a founder reply can be added.
export async function POST(req: Request, ctx: RouteContext<"/api/outreach/[id]">) {
  const { id } = await ctx.params;
  const b = await body<{ action: "take_over" | "pause" | "resume" | "simulate_reply"; reply: string }>(req);
  const actor = await currentActor();
  try {
    if (b.action === "simulate_reply") {
      if (actor.role !== "riya" && actor.role !== "kushal") throw new OutreachError("Only Riya or Kushal can do this.", 403);
      await simulateReply(id, String(b.reply ?? ""));
      return NextResponse.json(await runOutreachTick());
    }
    if (b.action !== "take_over" && b.action !== "pause" && b.action !== "resume") throw new OutreachError("Unknown action.");
    await takeOver(id, actor.role, b.action);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof OutreachError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("outreach:", e);
    return NextResponse.json({ error: "That did not work. Try again." }, { status: 500 });
  }
}
