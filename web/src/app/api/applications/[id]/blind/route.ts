import { currentActor } from "@/lib/actor";
import { act, body } from "@/lib/api";
import { recordBlindView } from "@/lib/gates-server";

// POST /api/applications/:id/blind. Riya records her own view before the system's view is shown.
export async function POST(req: Request, ctx: RouteContext<"/api/applications/[id]/blind">) {
  const { id } = await ctx.params;
  const b = await body<{ view: "go" | "pass" | "unsure" }>(req);
  const actor = await currentActor();
  const view = b.view === "go" || b.view === "pass" ? b.view : "unsure";
  return act(() => recordBlindView(id, actor.role, view));
}
