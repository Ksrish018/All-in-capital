import { NextResponse, after } from "next/server";
import { can, currentActor } from "@/lib/actor";
import { createAdminClient } from "@/lib/supabase/server";
import { queue } from "@/lib/db";
import { QUEUE, runScreeningWorker, type ScreeningJob } from "@/lib/intake/screen";

export const maxDuration = 300;

// POST /api/applications/:id/requeue. Riya or Kushal re-queues after a fix, or asks for the full review anyway.
export async function POST(req: Request, ctx: RouteContext<"/api/applications/[id]/requeue">) {
  const { id } = await ctx.params;
  const actor = await currentActor();
  if (!can.gate1(actor.role)) return NextResponse.json({ error: "Only Riya or Kushal can do this." }, { status: 403 });
  const { mode } = (await req.json().catch(() => ({}))) as { mode?: "full_review" | "retry" };

  const db = createAdminClient();
  const { data: app } = await db.from("applications").select("status, last_step").eq("id", id).single();
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const allowed = mode === "full_review" ? ["short_circuited"] : ["needs_attention", "paused_cost_cap"];
  if (!allowed.includes(app.status)) {
    return NextResponse.json({ error: `This cannot be done while the status is ${app.status.replaceAll("_", " ")}.` }, { status: 409 });
  }
  await db
    .from("applications")
    .update({
      status: "queued",
      status_reason: mode === "full_review" ? `Full review asked for by ${actor.name}` : `Re-queued by ${actor.name}`,
      ...(mode === "full_review" ? { full_review: true, last_step: "parsed" } : {}),
    })
    .eq("id", id);
  await queue.send<ScreeningJob>(QUEUE, { application_id: id });
  after(() => runScreeningWorker().catch((e) => console.error("screening worker:", e)));
  return NextResponse.json({ ok: true });
}
