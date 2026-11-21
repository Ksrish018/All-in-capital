import { NextResponse } from "next/server";
import { currentActor } from "@/lib/actor";
import { body } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/server";

// POST /api/style-notes. Riya rolls her style notes back to an earlier version (Loop D, PRD 11.3).
export async function POST(req: Request) {
  const b = await body<{ version: number }>(req);
  const actor = await currentActor();
  if (actor.role !== "riya") return NextResponse.json({ error: "Only Riya changes her style notes." }, { status: 403 });
  const db = createAdminClient();
  const { data: v } = await db.from("style_notes").select("version").eq("version", Number(b.version)).maybeSingle();
  if (!v) return NextResponse.json({ error: "No such version." }, { status: 404 });
  await db.from("style_notes").update({ active: false }).eq("active", true);
  await db.from("style_notes").update({ active: true }).eq("version", v.version);
  return NextResponse.json({ ok: true });
}
