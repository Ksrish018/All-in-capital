import { currentActor } from "@/lib/actor";
import { act, body } from "@/lib/api";
import { GateError, recordGate2 } from "@/lib/gates-server";
import { boardColumn } from "@/lib/gates";
import { createAdminClient } from "@/lib/supabase/server";

// POST /api/sign-off. Bulk sign off, allowed only where Riya agreed with the system and nothing is flagged.
export async function POST(req: Request) {
  const b = await body<{ ids: string[] }>(req);
  const actor = await currentActor();
  return act(async () => {
    if (actor.role !== "kushal") throw new GateError("Only Kushal signs off.", 403);
    const ids = (b.ids ?? []).filter((x) => typeof x === "string");
    if (ids.length === 0) throw new GateError("Pick at least one.");
    const db = createAdminClient();
    const [{ data: apps }, { data: briefs }, { data: reviews }] = await Promise.all([
      db.from("applications").select("id, status").in("id", ids),
      db.from("briefs").select("application_id, flags").in("application_id", ids),
      db.from("reviews").select("application_id, decision, agreed_with_system, created_at").in("application_id", ids).eq("gate", 1).order("created_at", { ascending: false }),
    ]);
    let signed = 0;
    for (const a of apps ?? []) {
      const r = reviews?.find((x) => x.application_id === a.id);
      const flags = (briefs?.find((x) => x.application_id === a.id)?.flags ?? []) as { severity: string; id: string }[];
      const col = boardColumn({ status: a.status, agreed: r?.agreed_with_system ?? null, flags });
      // Disagreements and flags are opened one by one, never signed in bulk.
      if (col !== "agreed" || !r || (r.decision !== "go" && r.decision !== "pass")) continue;
      await recordGate2({ id: a.id, role: actor.role, decision: r.decision });
      signed++;
    }
    return { signed, skipped: ids.length - signed };
  });
}
