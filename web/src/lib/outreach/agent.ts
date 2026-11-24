import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { BadModelOutput, SHARED_RULES, callModel } from "@/lib/ai/gemini";
import type { FounderRef } from "@/lib/intake/redact";
import { GoogleError, calendarBook, calendarBusy, gmailReadThread, gmailSend } from "@/lib/google";
import { draftEmail, personalise, readReply, type EmailKind } from "./ai";
import { formatSlot, nextOnReply, nextWithoutReply, pickSlots, type Slot } from "./rules";
import { companyTags } from "@/lib/gates";
import { noCloseNote, notesFor, tagged } from "./notes";

// The reply and scheduling agent (PRD Section 10). A state machine in the database.
// Each run reads the state, does one step, writes the new state and stops. It never loops inside a run.

export class OutreachError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

type Mode = "simulate" | "live";
const db = () => createAdminClient();

async function mode(): Promise<Mode> {
  const { data } = await db().from("settings").select("value").eq("key", "outreach_mode").maybeSingle();
  return data?.value === "live" ? "live" : "simulate";
}
/** The active notes, as stored (general ones plain, kind-specific ones with a [tag] in front). */
async function allStyleNotes(): Promise<string[]> {
  const { data } = await db().from("style_notes").select("notes").eq("active", true).order("version", { ascending: false }).limit(1).maybeSingle();
  return (data?.notes as string[]) ?? [];
}
/** What the first invite is written from: the traction facts on record (already redacted) and a one-line profile. */
async function inviteFacts(appId: string): Promise<{ facts: string; profile: string } | null> {
  const [{ data: ev }, { data: doc }] = await Promise.all([
    db().from("evidence").select("field, quote, value, track").eq("application_id", appId).or("field.like.traction.%,field.like.unit.%"),
    db().from("documents").select("redacted").eq("application_id", appId).eq("kind", "form").maybeSingle(),
  ]);
  const lines = [...new Set((ev ?? []).map((e) => String(e.quote ?? e.value ?? "").trim()).filter((q) => q && q !== "null"))].slice(0, 8);
  if (!lines.length) return null;
  const fields = ((doc?.redacted as { fields?: { key: string; value: string }[] } | null)?.fields ?? []);
  const get = (k: string) => fields.find((x) => x.key === k)?.value ?? "";
  return { facts: lines.map((l) => `- ${l}`).join("\n"), profile: [`Stage: ${get("stage")}`, `Sector: ${get("sector")}`, `What it does: ${get("one_line")}`].join("\n") };
}

/** The company's sector, as the tag style notes and corrections share. */
async function sectorTag(appId: string): Promise<string | null> {
  const { data } = await db().from("documents").select("redacted").eq("application_id", appId).eq("kind", "form").maybeSingle();
  const fields = ((data?.redacted as { fields?: { key: string; value: string }[] } | null)?.fields ?? []);
  return companyTags({ sector: fields.find((f) => f.key === "sector")?.value }).find((t) => t.startsWith("sector:")) ?? null;
}
async function founderRefs(appId: string): Promise<{ refs: FounderRef[]; first: string | null; email: string | null }> {
  const { data } = await db().from("founders").select("founder_key, name, email, phone, linkedin_url").eq("application_id", appId).order("founder_key");
  const refs = (data ?? []).map((f) => ({ id: f.founder_key, name: f.name, email: f.email, phone: f.phone, linkedin: f.linkedin_url }));
  const f1 = data?.[0];
  const first = f1?.name ? f1.name.replace(/^(Dr|Mr|Mrs|Ms|Prof)\.?\s+/i, "").split(/\s+/)[0] : null;
  return { refs, first, email: f1?.email ?? null };
}

async function freeSlots(m: Mode, now: Date, refused: Slot[]): Promise<Slot[]> {
  const busy = m === "live" ? await calendarBusy(now.toISOString(), new Date(now.getTime() + 21 * 86_400_000).toISOString()) : [];
  return pickSlots(now, busy, refused);
}

async function writeDraft(o: { id: string; application_id: string; reason: string | null; aditya: boolean }, kind: EmailKind, slots: Slot[], to: string | null) {
  const { data: app } = await db().from("applications").select("company_name").eq("id", o.application_id).single();
  const f = await founderRefs(o.application_id);
  const joining = kind === "invite" || kind === "scheduling" || kind === "followup" ? ["Riya", "Kushal", ...(o.aditya ? ["Aditya"] : [])] : [];
  const tag = await sectorTag(o.application_id);
  const all = await allStyleNotes();
  // A first invite offers two slots, as Riya does (Q19). Later scheduling emails still offer three.
  const offer = kind === "invite" ? slots.slice(0, 2) : slots;
  const facts = kind === "invite" ? await inviteFacts(o.application_id) : null;
  const d = await draftEmail({
    applicationId: o.application_id, kind, company: app!.company_name, reason: o.reason ?? "", slots: offer, joining,
    styleNotes: notesFor(all, tag), founders: f.refs, facts: facts?.facts, profile: facts?.profile,
  });
  const kindName = tag?.replace("sector:", "") ?? null;
  const notes = [
    d.note ?? null,
    noCloseNote(all, tag) ? `No close past example: none of your style notes is for ${kindName} companies yet, so this draft leans on general habits. Read it with more care.` : null,
  ].filter(Boolean);
  await db().from("emails").insert({
    outreach_id: o.id, kind, draft_subject: d.subject, draft_body: personalise(d.body, f.first), slots: offer, to_address: to ?? f.email,
    draft_note: notes.length ? notes.join(" ") : null,
  });
}

/** Step 14. After Kushal signs off GO or PASS, draft the first email for Riya. HOLD gets no email. */
export async function startOutreach(appId: string, outcome: "go" | "pass") {
  const { data: existing } = await db().from("outreach").select("id").eq("application_id", appId).maybeSingle();
  if (existing) return;
  const [{ data: brief }, { data: scores }] = await Promise.all([
    db().from("briefs").select("summary, aditya_on_call, flags").eq("application_id", appId).maybeSingle(),
    db().from("criterion_scores").select("criterion_id, rating, reason").eq("application_id", appId).order("rating").limit(2),
  ]);
  // For a pass, the reason is what would change the fund's view, from the weakest points, in plain words.
  const reason = outcome === "go"
    ? brief?.summary ?? "The founders know their customers and their numbers."
    : [((brief?.flags ?? []) as { label: string; why: string }[]).filter((f) => f.why).slice(0, 2).map((f) => f.why).join(" "), ...(scores ?? []).map((s) => s.reason)].filter(Boolean).join(" ").slice(0, 900);
  const f = await founderRefs(appId);
  const { data: o, error } = await db().from("outreach").insert({
    application_id: appId, outcome, status: "draft_ready", founder_email: f.email, reason, aditya: Boolean(brief?.aditya_on_call),
    attendees: ["founder", "riya", "kushal", ...(brief?.aditya_on_call ? ["aditya"] : [])],
  }).select("*").single();
  if (error || !o) throw new Error(`Could not start outreach: ${error?.message}`);
  const slots = outcome === "go" ? await freeSlots(await mode(), new Date(), []) : [];
  if (slots.length) await db().from("outreach").update({ slots_offered: slots }).eq("id", o.id);
  await writeDraft(o, outcome === "go" ? "invite" : "pass_note", slots, f.email);
}

/** Gate 3. Riya's click is the only way an email leaves (N4). There is no "send all". */
export async function sendEmail(input: { emailId: string; role: string; to: string; subject: string; body: string }) {
  if (input.role !== "riya") throw new OutreachError("Only Riya sends emails, from her own Gmail.", 403);
  const to = input.to.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new OutreachError("Add the founder's email address.");
  if (!input.subject.trim() || !input.body.trim()) throw new OutreachError("The email needs a subject and a body.");
  const { data: email } = await db().from("emails").select("*, outreach(*)").eq("id", input.emailId).single();
  if (!email) throw new OutreachError("Not found.", 404);
  if (email.sent_at) throw new OutreachError("This email was already sent.", 409);
  const o = email.outreach as { id: string; application_id: string; status: string; gmail_thread_id: string | null; followups_sent: number; scheduling_round: number; first_sent_at: string | null; outcome: string };
  const m = await mode();
  let messageId: string;
  let threadId = o.gmail_thread_id;
  if (m === "live") {
    try {
      const r = await gmailSend({ to, subject: input.subject, body: input.body, threadId });
      messageId = r.id;
      threadId = r.threadId;
    } catch (e) {
      const reason = e instanceof GoogleError ? e.message : "Gmail could not be reached";
      if (e instanceof GoogleError && e.lasting) await db().from("outreach").update({ status: "with_riya", handoff_reason: `Email could not be sent: ${reason}` }).eq("id", o.id);
      throw new OutreachError(`The email was not sent. ${reason}`, 502);
    }
  } else {
    messageId = `sim-${randomUUID()}`;
    threadId = threadId ?? `sim-thread-${randomUUID()}`;
  }
  const { data: riya } = await db().from("users").select("id").eq("role", "riya").single();
  const now = new Date().toISOString();
  await db().from("emails").update({ sent_subject: input.subject, sent_body: input.body, to_address: to, sent_by: riya!.id, sent_at: now, gmail_message_id: messageId, simulated: m === "simulate" }).eq("id", input.emailId);

  const kind = email.kind as EmailKind;
  const next: Record<string, unknown> = { gmail_thread_id: threadId, founder_email: to, last_message_at: now };
  if (kind === "invite") Object.assign(next, { status: "sent", first_sent_at: now, next_step_at: new Date(Date.now() + 3 * 86_400_000).toISOString() });
  if (kind === "followup") Object.assign(next, { status: o.followups_sent >= 2 ? "followup_2_sent" : "followup_1_sent", next_step_at: new Date(Date.now() + 4 * 86_400_000).toISOString() });
  if (kind === "scheduling") Object.assign(next, { status: "scheduling", next_step_at: new Date(Date.now() + 3 * 86_400_000).toISOString() });
  if (kind === "pass_note") Object.assign(next, { status: "closed", next_step_at: null });
  if (kind === "close") Object.assign(next, { status: "declined", next_step_at: null });
  await db().from("outreach").update(next).eq("id", o.id);

  // Loop D: Riya's edits become short style notes, versioned so she can roll them back.
  if (input.body.trim() !== String(email.draft_body ?? "").trim()) await learnStyle(String(email.draft_body ?? ""), input.body, await sectorTag(o.application_id), input.emailId).catch(() => {});
}

/** Loop D, G12: an edit proposes a note. Nothing reaches a draft until Riya approves it in Settings. */
async function learnStyle(draft: string, sent: string, tag: string | null, emailId: string) {
  const current = notesFor(await allStyleNotes(), tag);
  const note = await callModel({
    callType: "A5", model: process.env.MODEL_EXTRACT ?? "gemini-3.1-flash-lite", promptName: "style_note", promptVersion: "a5-style-v1",
    system: `${SHARED_RULES}\n\nTask: Riya edited an email draft before sending. Write one short style note (under 15 words) that captures the lasting habit in her edit, or an empty string if the edit was only about facts for this one email.`,
    user: `<draft>\n${draft.slice(0, 2000)}\n</draft>\n<sent>\n${sent.slice(0, 2000)}\n</sent>\n<current_notes>\n${current.join("\n")}\n</current_notes>`,
    schema: { type: "OBJECT", properties: { note: { type: "STRING" } }, required: ["note"] },
    maxOutputTokens: 200, timeoutMs: 20_000, thinking: "low", applicationId: null, founders: [],
    validate: (v) => {
      const n = String((v as { note?: string })?.note ?? "").trim();
      if (n.length > 140) throw new BadModelOutput("Style note too long");
      return n;
    },
  });
  if (!note || current.some((c) => c.toLowerCase() === note.toLowerCase())) return;
  const { data: pending } = await db().from("style_note_candidates").select("note").eq("status", "pending");
  if ((pending ?? []).some((p) => p.note.toLowerCase() === note.toLowerCase())) return;
  await db().from("style_note_candidates").insert({ note, tag, email_id: emailId });
}

/**
 * Riya approves or declines a proposed note (G12). Approving makes a new version, so she can still roll back.
 * scope "kind" keeps the note to companies of the same sector; "all" applies it to every founder.
 */
export async function decideStyleNote(input: { id: string; decision: "approve" | "decline"; scope: "kind" | "all"; role: string }) {
  if (input.role !== "riya") throw new OutreachError("Only Riya decides on her style notes.", 403);
  const { data: c } = await db().from("style_note_candidates").select("*").eq("id", input.id).maybeSingle();
  if (!c || c.status !== "pending") throw new OutreachError("That note is not waiting for a decision.", 404);
  await db().from("style_note_candidates").update({ status: input.decision === "approve" ? "approved" : "declined", decided_at: new Date().toISOString() }).eq("id", c.id);
  if (input.decision === "decline") return;
  const current = await allStyleNotes();
  const { data: last } = await db().from("style_notes").select("version").order("version", { ascending: false }).limit(1).maybeSingle();
  await db().from("style_notes").update({ active: false }).eq("active", true);
  await db().from("style_notes").insert({ version: (last?.version ?? 0) + 1, notes: [...current, tagged(c.note, input.scope === "kind" ? c.tag : null)].slice(-24), active: true });
}

/** Simulate mode only: record a founder reply so every step of the agent can be tried without real email. */
export async function simulateReply(outreachId: string, body: string) {
  if ((await mode()) !== "simulate") throw new OutreachError("Replies can only be simulated in simulate mode.", 409);
  if (!body.trim()) throw new OutreachError("Write the founder's reply.");
  await db().from("replies").insert({ outreach_id: outreachId, body: body.trim(), simulated: true });
  await db().from("outreach").update({ next_step_at: new Date().toISOString() }).eq("id", outreachId);
}

const OPEN = ["sent", "followup_1_sent", "followup_2_sent", "scheduling", "booked"];

/** One run of the agent. Each due conversation gets exactly one step. */
export async function runOutreachTick(now = new Date()): Promise<{ stepped: number; log: string[] }> {
  const m = await mode();
  const { data: rows } = await db().from("outreach").select("*").in("status", OPEN).eq("paused", false);
  const log: string[] = [];
  let stepped = 0;
  for (const o of rows ?? []) {
    const { count: waitingDrafts } = await db().from("emails").select("id", { count: "exact", head: true }).eq("outreach_id", o.id).is("sent_at", null);
    if ((waitingDrafts ?? 0) > 0) continue; // a draft is waiting for Riya: nothing to do until she sends it
    try {
      const did = await stepOne(o, m, now);
      if (did) {
        stepped++;
        log.push(`${o.id.slice(0, 8)}: ${did}`);
      }
    } catch (e) {
      // A passing failure is tried again next run. A lasting one goes to Riya now (PRD 10.3).
      if (e instanceof GoogleError && e.lasting) {
        await db().from("outreach").update({ status: "with_riya", handoff_reason: e.message }).eq("id", o.id);
        log.push(`${o.id.slice(0, 8)}: handed to Riya (${e.message})`);
      } else log.push(`${o.id.slice(0, 8)}: will retry (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  return { stepped, log };
}

async function stepOne(o: Record<string, unknown> & { id: string; application_id: string; status: string; gmail_thread_id: string | null; slots_offered: Slot[]; slots_refused: Slot[]; scheduling_round: number; followups_sent: number; first_sent_at: string | null; paused_until: string | null; next_step_at: string | null; outcome: string; aditya: boolean; reason: string | null; founder_email: string | null; calendar_event_id: string | null }, m: Mode, now: Date): Promise<string | null> {
  // After the call: the day after, ask whether it was worth 30 minutes (Step 20).
  if (o.status === "booked") {
    if (o.next_step_at && new Date(o.next_step_at) <= now) {
      await db().from("outreach").update({ status: "call_done", next_step_at: null }).eq("id", o.id);
      return "call done, one tap requested";
    }
    return null;
  }

  // New replies first. Live: only the stored thread is read, never other mail.
  if (m === "live" && o.gmail_thread_id) {
    const { data: ours } = await db().from("emails").select("gmail_message_id").eq("outreach_id", o.id);
    const { data: seen } = await db().from("replies").select("gmail_message_id").eq("outreach_id", o.id);
    const known = new Set([...(ours ?? []), ...(seen ?? [])].map((x) => x.gmail_message_id));
    for (const msg of await gmailReadThread(o.gmail_thread_id)) {
      if (!known.has(msg.id)) await db().from("replies").insert({ outreach_id: o.id, gmail_message_id: msg.id, body: msg.text, received_at: msg.date });
    }
  }
  const { data: reply } = await db().from("replies").select("*").eq("outreach_id", o.id).eq("handled", false).order("received_at").limit(1).maybeSingle();

  if (reply) {
    const f = await founderRefs(o.application_id);
    const r = await readReply({ applicationId: o.application_id, reply: reply.body, offered: o.slots_offered, now, founders: f.refs });
    await db().from("replies").update({ label: r.label, confidence: r.confidence, proposed_times: r.proposed, return_date: r.returnDate, handled: true }).eq("id", reply.id);
    const next = nextOnReply({ label: r.label, offered: o.slots_offered, refused: [...o.slots_refused, ...r.refused], round: o.scheduling_round, proposed: r.proposed, returnDate: r.returnDate, now });
    await db().from("outreach").update({ last_message_at: reply.received_at }).eq("id", o.id);

    if (next.do === "book") {
      // Book only after the founder confirms, and only if the slot is still free.
      const busy = m === "live" ? await calendarBusy(next.slot.start, next.slot.end) : [];
      if (busy.length) {
        const fresh = await freeSlots(m, now, [...o.slots_refused, next.slot]);
        await db().from("outreach").update({ status: "scheduling", scheduling_round: Math.min(2, o.scheduling_round + 1), slots_offered: fresh }).eq("id", o.id);
        await writeDraft(o, "scheduling", fresh, o.founder_email);
        return `${r.label}: slot taken, new slots drafted`;
      }
      const { data: settings } = await db().from("settings").select("value").eq("key", "attendees").maybeSingle();
      const team = (settings?.value ?? {}) as Record<string, string | null>;
      const guests = [o.founder_email, team.riya, team.kushal, o.aditya ? team.aditya : null].filter((x): x is string => Boolean(x));
      const { data: app } = await db().from("applications").select("company_name").eq("id", o.application_id).single();
      const event = m === "live"
        ? await calendarBook({ summary: `All In Capital x ${app!.company_name}`, start: next.slot.start, end: next.slot.end, attendees: guests, description: "A 30 minute first call." })
        : { id: `sim-event-${randomUUID()}` };
      await db().from("outreach").update({
        status: "booked", calendar_event_id: event.id, slots_offered: [next.slot],
        next_step_at: new Date(new Date(next.slot.end).getTime() + 86_400_000).toISOString(),
      }).eq("id", o.id);
      return `${r.label}: booked ${formatSlot(next.slot)}`;
    }
    if (next.do === "offer_slots") {
      const fresh = await freeSlots(m, now, next.refused);
      await db().from("outreach").update({ status: "scheduling", scheduling_round: next.round, slots_offered: fresh, slots_refused: next.refused }).eq("id", o.id);
      await writeDraft(o, "scheduling", fresh, o.founder_email);
      return `${r.label}: round ${next.round}, new slots drafted for Riya`;
    }
    if (next.do === "draft_close") {
      await writeDraft(o, "close", [], o.founder_email);
      return "not interested: close drafted for Riya";
    }
    if (next.do === "pause_until") {
      await db().from("outreach").update({ paused_until: next.date, next_step_at: next.date }).eq("id", o.id);
      return `out of office until ${next.date}`;
    }
    await db().from("outreach").update({ status: "with_riya", handoff_reason: next.reason }).eq("id", o.id);
    return `${r.label}: handed to Riya`;
  }

  // No reply: Loop E.
  if (!o.first_sent_at) return null;
  const w = nextWithoutReply({ firstSentAt: o.first_sent_at, followupsSent: o.followups_sent, now, pausedUntil: o.paused_until });
  if (w.do === "wait") {
    if (o.next_step_at !== w.until) await db().from("outreach").update({ next_step_at: w.until }).eq("id", o.id);
    return null;
  }
  if (w.do === "no_response") {
    await db().from("outreach").update({ status: "no_response", handoff_reason: "No reply after two follow ups." }).eq("id", o.id);
    return "no response after two follow ups";
  }
  await db().from("outreach").update({ status: w.n === 1 ? "followup_1_ready" : "followup_2_ready", followups_sent: w.n }).eq("id", o.id);
  await writeDraft(o, "followup", o.outcome === "go" ? o.slots_offered : [], o.founder_email);
  return `follow up ${w.n} drafted for Riya`;
}

/** Riya takes over a conversation, or pauses and resumes the agent on it. */
export async function takeOver(outreachId: string, role: string, action: "take_over" | "pause" | "resume") {
  if (role !== "riya") throw new OutreachError("Only Riya takes over a conversation.", 403);
  const patch = action === "take_over" ? { status: "with_riya", handoff_reason: "Riya took over." } : { paused: action === "pause" };
  await db().from("outreach").update(patch).eq("id", outreachId);
}

/** Step 20: the one tap the day after a call. Feeds Loop G. */
export async function recordCallOutcome(input: { appId: string; role: string; worth: boolean; note?: string }) {
  if (!["riya", "kushal", "aditya"].includes(input.role)) throw new OutreachError("Unknown person.", 403);
  const { data: u } = await db().from("users").select("id").eq("role", input.role).single();
  await db().from("call_outcomes").upsert({ application_id: input.appId, worth_it: input.worth, note: input.note?.trim() || null, recorded_by: u?.id });
  await db().from("outreach").update({ status: "closed" }).eq("application_id", input.appId).eq("status", "call_done");
}
