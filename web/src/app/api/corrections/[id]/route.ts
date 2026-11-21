import { currentActor } from "@/lib/actor";
import { act, body } from "@/lib/api";
import { decideRule } from "@/lib/gates-server";

// POST /api/corrections/:id. Kushal accepts or declines a pending rule correction.
export async function POST(req: Request, ctx: RouteContext<"/api/corrections/[id]">) {
  const { id } = await ctx.params;
  const b = await body<{ status: "accepted" | "declined" }>(req);
  const actor = await currentActor();
  return act(() => decideRule({ correctionId: id, role: actor.role, status: b.status === "accepted" ? "accepted" : "declined" }));
}
