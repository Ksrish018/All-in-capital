import { after } from "next/server";
import { currentActor } from "@/lib/actor";
import { act } from "@/lib/api";
import { GateError } from "@/lib/gates-server";
import { runBacktest } from "@/lib/backtest/run";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 800;

// POST /api/thesis/:version/backtest. Runs the back test on one Thesis Card version (Kushal).
export async function POST(_req: Request, ctx: RouteContext<"/api/thesis/[version]/backtest">) {
  const { version } = await ctx.params;
  const actor = await currentActor();
  return act(async () => {
    if (actor.role !== "kushal") throw new GateError("Only Kushal runs the back test.", 403);
    const v = Number(version);
    const db = createAdminClient();
    const { data: card } = await db.from("thesis_cards").select("id, status").eq("version", v).maybeSingle();
    if (!card) throw new GateError("No such version.", 404);
    // It runs for several minutes, so it continues after this reply. The page shows the new run when it is done.
    after(() => runBacktest(v).catch((e) => console.error("back test:", e)));
    return { started: true };
  });
}
