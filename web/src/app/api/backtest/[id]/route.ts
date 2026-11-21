import { currentActor } from "@/lib/actor";
import { act, body } from "@/lib/api";
import { GateError } from "@/lib/gates-server";
import { createAdminClient } from "@/lib/supabase/server";

// POST /api/backtest/:id. Kushal changes a verdict and adds a line of his own (PRD 13.10).
export async function POST(req: Request, ctx: RouteContext<"/api/backtest/[id]">) {
  const { id } = await ctx.params;
  const b = await body<{ verdict: string; note: string }>(req);
  const actor = await currentActor();
  return act(async () => {
    if (actor.role !== "kushal") throw new GateError("Only Kushal sets a verdict.", 403);
    if (!["fund_likely_wrong", "system_likely_wrong", "too_early"].includes(String(b.verdict))) throw new GateError("Pick a verdict.");
    const note = String(b.note ?? "").trim();
    if (note.length > 200) throw new GateError("Keep the note to one line.");
    const db = createAdminClient();
    const { data: kushal } = await db.from("users").select("id").eq("role", "kushal").single();
    await db.from("backtest_results").update({ verdict: b.verdict, kushal_note: note || null, verdict_by: kushal?.id }).eq("id", id);
  });
}
