import { currentActor } from "@/lib/actor";
import { act, body } from "@/lib/api";
import { addRiyaEvidence } from "@/lib/gates-server";

// POST /api/applications/:id/evidence. Riya adds her own research, kept apart from what the system found.
export async function POST(req: Request, ctx: RouteContext<"/api/applications/[id]/evidence">) {
  const { id } = await ctx.params;
  const b = await body<{ quote: string; url: string; criterion: string }>(req);
  const actor = await currentActor();
  return act(() => addRiyaEvidence({ id, role: actor.role, quote: String(b.quote ?? ""), url: String(b.url ?? ""), criterion: b.criterion || undefined }));
}
