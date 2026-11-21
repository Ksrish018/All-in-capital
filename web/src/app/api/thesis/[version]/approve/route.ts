import { currentActor } from "@/lib/actor";
import { act } from "@/lib/api";
import { GateError } from "@/lib/gates-server";
import { createAdminClient } from "@/lib/supabase/server";

// POST /api/thesis/:version/approve. Kushal approves a version, only after a back test ran on that exact version
// and nothing funded was marked PASS with no flag (N1).
export async function POST(_req: Request, ctx: RouteContext<"/api/thesis/[version]/approve">) {
  const { version } = await ctx.params;
  const actor = await currentActor();
  return act(async () => {
    if (actor.role !== "kushal") throw new GateError("Only Kushal approves a Thesis Card version.", 403);
    const db = createAdminClient();
    const { data: card } = await db.from("thesis_cards").select("id, version, status, backtest_run_id").eq("version", Number(version)).maybeSingle();
    if (!card) throw new GateError("No such version.", 404);
    if (card.status === "approved") return { approved: card.version };
    if (!card.backtest_run_id) throw new GateError("Run the back test on this version first.", 409);
    const { data: rows } = await db.from("backtest_results").select("real_decision, rec_revealed, ratings").eq("run_id", card.backtest_run_id);
    if (!rows?.length) throw new GateError("The back test on this version has not finished.", 409);
    const n1 = rows.filter((r) => r.real_decision === "invested" && r.rec_revealed === "pass" && !Object.values(r.ratings as Record<string, number>).some((v) => v === 0));
    if (n1.length) throw new GateError("A funded company was marked PASS with no flag. This version cannot be approved.", 409);
    const { data: kushal } = await db.from("users").select("id").eq("role", "kushal").single();
    await db.from("thesis_cards").update({ status: "retired" }).eq("status", "approved");
    await db.from("thesis_cards").update({ status: "approved", approved_by: kushal?.id, approved_at: new Date().toISOString() }).eq("id", card.id);
    return { approved: card.version };
  });
}
