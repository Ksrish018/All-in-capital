import { currentActor } from "@/lib/actor";
import { act, body } from "@/lib/api";
import { recordGate1, recordGate2 } from "@/lib/gates-server";
import type { Decision } from "@/lib/gates";

// POST /api/reviews. Records a Gate 1 decision (Riya) or a Gate 2 sign off (Kushal).
export async function POST(req: Request) {
  const b = await body<{ application_id: string; gate: 1 | 2; decision: Decision; reason: string; notes: string; seconds: number }>(req);
  const actor = await currentActor();
  return act(() =>
    b.gate === 2
      ? recordGate2({ id: String(b.application_id), role: actor.role, decision: b.decision as Decision, note: b.reason, seconds: b.seconds })
      : recordGate1({ id: String(b.application_id), role: actor.role, decision: b.decision as Decision, reason: b.reason, notes: b.notes, seconds: b.seconds }),
  );
}
