import { after } from "next/server";
import { can, currentActor } from "@/lib/actor";
import { act, body } from "@/lib/api";
import { GateError } from "@/lib/gates-server";
import { createAdminClient } from "@/lib/supabase/server";
import { queue } from "@/lib/db";
import { QUEUE, runScreeningWorker, type ScreeningJob } from "@/lib/intake/screen";

export const maxDuration = 300;

// POST /api/applications/:id/research. Riya asks for more research on a named question (PRD 15.6).
export async function POST(req: Request, ctx: RouteContext<"/api/applications/[id]/research">) {
  const { id } = await ctx.params;
  const b = await body<{ question: string }>(req);
  const actor = await currentActor();
  return act(async () => {
    if (!can.gate1(actor.role)) throw new GateError("Only Riya or Kushal can ask for research.", 403);
    const question = String(b.question ?? "").trim();
    if (question.length < 4) throw new GateError("Name the question to research.");
    if (question.length > 200) throw new GateError("Keep the question to one line.");
    const db = createAdminClient();
    const { data: app } = await db.from("applications").select("status").eq("id", id).single();
    if (app?.status !== "brief_ready") throw new GateError("More research is for a full brief waiting for Gate 1.", 409);
    await db.from("applications").update({ status: "researching", last_step: "research_question", research_question: question, status_reason: `Researching: ${question}` }).eq("id", id);
    await queue.send<ScreeningJob>(QUEUE, { application_id: id });
    after(() => runScreeningWorker().catch((e) => console.error("screening worker:", e)));
  });
}
