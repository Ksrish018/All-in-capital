import { currentActor } from "@/lib/actor";
import { act, body } from "@/lib/api";
import { applyCorrection } from "@/lib/gates-server";

// POST /api/corrections. A fact correction fixes this company. A rule correction also waits for Kushal (Loop C).
export async function POST(req: Request) {
  const b = await body<{ application_id: string; criterion_id: string; rating: number; reason: string; kind: "fact" | "rule" }>(req);
  const actor = await currentActor();
  return act(() =>
    applyCorrection({
      id: String(b.application_id), role: actor.role, criterion: String(b.criterion_id), rating: Number(b.rating),
      reason: String(b.reason ?? ""), kind: b.kind === "rule" ? "rule" : "fact",
    }),
  );
}
