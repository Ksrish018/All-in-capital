import { NextResponse } from "next/server";
import { currentActor } from "@/lib/actor";
import { body } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/server";
import { OutreachError, decideStyleNote } from "@/lib/outreach/agent";

// POST /api/style-notes. Riya rolls her style notes back to an earlier version (Loop D, PRD 11.3),
// or approves or declines a note her edits proposed (G12): { candidate_id, decision, scope }.
export async function POST(req: Request) {
  const b = await body<{ version?: number; candidate_id?: string; decision?: "approve" | "decline"; scope?: "kind" | "all" }>(req);
  const actor = await currentActor();
  if (actor.role !== "riya") return NextResponse.json({ error: "Only Riya changes her style notes." }, { status: 403 });
  if (b.candidate_id) {
    try {
      await decideStyleNote({ id: b.candidate_id, decision: b.decision === "approve" ? "approve" : "decline", scope: b.scope === "all" ? "all" : "kind", role: actor.role });
      return NextResponse.json({ ok: true });
    } catch (e) {
      const status = e instanceof OutreachError ? e.status : 500;
      return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save." }, { status });
    }
  }
  const db = createAdminClient();
  const { data: v } = await db.from("style_notes").select("version").eq("version", Number(b.version)).maybeSingle();
  if (!v) return NextResponse.json({ error: "No such version." }, { status: 404 });
  await db.from("style_notes").update({ active: false }).eq("active", true);
  await db.from("style_notes").update({ active: true }).eq("version", v.version);
  return NextResponse.json({ ok: true });
}
