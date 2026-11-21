import { NextResponse } from "next/server";
import { currentActor } from "@/lib/actor";
import { body } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/server";

// POST /api/applications/:id/delete. A founder asked for their data to be deleted (DPDP Act, PRD 8.6).
// Removes the files, the application and everything linked to it. It cannot be undone, so the company name must be typed.
export async function POST(req: Request, ctx: RouteContext<"/api/applications/[id]/delete">) {
  const { id } = await ctx.params;
  const b = await body<{ confirm: string }>(req);
  const actor = await currentActor();
  if (actor.role !== "riya") return NextResponse.json({ error: "Only Riya deletes founder data." }, { status: 403 });
  const db = createAdminClient();
  const { data: app } = await db.from("applications").select("company_name").eq("id", id).maybeSingle();
  if (!app) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (String(b.confirm ?? "").trim() !== app.company_name) return NextResponse.json({ error: "Type the company name exactly to confirm." }, { status: 400 });
  const { data: docs } = await db.from("documents").select("storage_path").eq("application_id", id);
  if (docs?.length) await db.storage.from("applications").remove(docs.map((d) => d.storage_path));
  // Model call logs keep their row for cost history, but lose the link and the input text.
  await db.from("llm_calls").update({ application_id: null, input: { deleted: true }, output: null }).eq("application_id", id);
  await db.from("applications").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
