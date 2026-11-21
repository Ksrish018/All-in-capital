import { NextResponse } from "next/server";
import { currentActor } from "@/lib/actor";
import { body } from "@/lib/api";
import { OutreachError, sendEmail } from "@/lib/outreach/agent";

// POST /api/emails/:id/send. Riya's click, and only Riya's click, sends an email (Gate 3, N4).
export async function POST(req: Request, ctx: RouteContext<"/api/emails/[id]/send">) {
  const { id } = await ctx.params;
  const b = await body<{ to: string; subject: string; body: string }>(req);
  const actor = await currentActor();
  try {
    await sendEmail({ emailId: id, role: actor.role, to: String(b.to ?? ""), subject: String(b.subject ?? ""), body: String(b.body ?? "") });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof OutreachError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("send:", e);
    return NextResponse.json({ error: "The email was not sent. Try again." }, { status: 500 });
  }
}
