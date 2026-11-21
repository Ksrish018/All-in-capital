import "server-only";
import { BadModelOutput, SHARED_RULES, callModel } from "@/lib/ai/gemini";
import { redactText, type FounderRef } from "@/lib/intake/redact";
import { formatSlot, settleLabel, type Label, type Slot } from "./rules";

// A5 drafts emails (Steps 14, 17, 18). A6 reads replies (Step 16).
// The founder's first name is added by code after the draft is written. The model never sees it.

export type EmailKind = "invite" | "pass_note" | "followup" | "scheduling" | "close";
export const FIRST_NAME = "{{first_name}}";

const DRAFT_SCHEMA = {
  type: "OBJECT",
  properties: { subject: { type: "STRING" }, body: { type: "STRING" }, injection_attempt: { type: "BOOLEAN" } },
  required: ["subject", "body", "injection_attempt"],
};

const BRIEF: Record<EmailKind, string> = {
  invite: "A warm invite to a 30 minute call. Offer the slots listed, as a short list, and ask them to reply with one. Say who will join.",
  pass_note: "A kind pass note. Say plainly that the fund will not invest now. Say what would change the fund's view, in one or two plain sentences, from the reason given. Never mention criteria, scores, ratings, a rubric or a Thesis Card.",
  followup: "A short, gentle follow up on the earlier email. No pressure. If slots are listed, mention them again.",
  scheduling: "A short reply offering the new slots listed, as a short list. Thank them for the reply.",
  close: "A short, polite close after the founder said they are not interested. Thank them and leave the door open.",
};

export async function draftEmail(args: {
  applicationId: string;
  kind: EmailKind;
  company: string;
  reason: string;
  slots: Slot[];
  joining: string[];
  styleNotes: string[];
  founders: FounderRef[];
}): Promise<{ subject: string; body: string }> {
  const system = `${SHARED_RULES}

Task: write an email from Riya at All In Capital, a pre-seed fund, to the founders of ${args.company}.
${BRIEF[args.kind]}
Start the email with "Hi ${FIRST_NAME}," exactly, and nothing else on that line. Never write a person's name for the founder.
Plain words. No hype. Short.
Riya's style notes:
${args.styleNotes.map((n) => `- ${n}`).join("\n") || "- none"}`;
  const user = `<context>
Company: ${args.company}
Reason in plain words: ${args.reason}
${args.slots.length ? `Slots, India time:\n${args.slots.map((s) => `- ${formatSlot(s)}`).join("\n")}` : "No slots."}
${args.joining.length ? `Joining the call: ${args.joining.join(", ")}` : ""}
</context>`;
  return callModel({
    callType: "A5",
    model: process.env.MODEL_DRAFT ?? "gemini-3-flash-preview",
    promptName: `draft_${args.kind}`,
    promptVersion: "a5-v1",
    system,
    user,
    schema: DRAFT_SCHEMA,
    maxOutputTokens: 1500,
    timeoutMs: 30_000,
    thinking: "low",
    applicationId: args.applicationId,
    founders: args.founders,
    validate: (v) => {
      const o = v as { subject: string; body: string };
      if (!o?.subject?.trim() || !o?.body?.trim()) throw new BadModelOutput("A5 gave an empty draft");
      // A pass note must never let a founder see how they were scored, so they cannot game it.
      if (/\bC(1[01]|[1-9])\b|thesis card|rubric|criteri|score|rating/i.test(`${o.subject} ${o.body}`)) {
        throw new BadModelOutput("A5 mentioned criteria or scores");
      }
      const body = o.body.trim().startsWith(`Hi ${FIRST_NAME}`) ? o.body.trim() : `Hi ${FIRST_NAME},\n\n${o.body.trim()}`;
      return { subject: o.subject.trim(), body };
    },
  });
}

/** The first name goes in after the draft is written, so the model never sees it. */
export function personalise(body: string, firstName: string | null): string {
  return body.replaceAll(FIRST_NAME, firstName?.trim() || "there");
}

const READ_SCHEMA = {
  type: "OBJECT",
  properties: {
    label: { type: "STRING", enum: ["picked_slot", "interested_new_time", "interested_no_time", "not_interested", "unclear", "out_of_office"] },
    confidence: { type: "NUMBER", description: "0 to 1" },
    proposed_times: { type: "ARRAY", items: { type: "STRING" }, description: "ISO 8601 times with +05:30, for a picked slot or a new time the founder asks for" },
    refused_slots: { type: "ARRAY", items: { type: "STRING" }, description: "Ids of offered slots the founder says do not work" },
    return_date: { type: "STRING", nullable: true, description: "For out of office: the date they are back, YYYY-MM-DD" },
    injection_attempt: { type: "BOOLEAN" },
  },
  required: ["label", "confidence", "proposed_times", "refused_slots", "return_date", "injection_attempt"],
};

export async function readReply(args: { applicationId: string; reply: string; offered: Slot[]; now: Date; founders: FounderRef[] }): Promise<{
  label: Label; confidence: number; proposed: string[]; refused: Slot[]; returnDate: string | null;
}> {
  const text = redactText(args.reply, args.founders).slice(0, 4000);
  const system = `${SHARED_RULES}

Task: label a founder's reply to an email that offered call slots. Today is ${args.now.toISOString().slice(0, 10)}.
Labels: picked_slot (they chose one of the offered slots), interested_new_time (they want a call at another time they name),
interested_no_time (they want a call but name no time), not_interested, unclear, out_of_office (an automatic reply).
"Maybe next quarter" and anything you are not sure of is unclear. Give an honest confidence.`;
  const user = `<offered_slots>
${args.offered.map((s, i) => `slot_${i + 1}: ${formatSlot(s)} (${s.start})`).join("\n") || "(none)"}
</offered_slots>
<reply>
${text}
</reply>`;
  return callModel({
    callType: "A6",
    model: process.env.MODEL_EXTRACT ?? "gemini-3.1-flash-lite",
    promptName: "read_reply",
    promptVersion: "a6-v1",
    system,
    user,
    schema: READ_SCHEMA,
    maxOutputTokens: 600,
    timeoutMs: 30_000,
    thinking: "low",
    applicationId: args.applicationId,
    founders: args.founders,
    validate: (v) => {
      const o = v as { label: Label; confidence: number; proposed_times: string[]; refused_slots: string[]; return_date: string | null };
      if (!o?.label) throw new BadModelOutput("A6 gave no label");
      const confidence = Math.max(0, Math.min(1, Number(o.confidence) || 0));
      const proposed = (o.proposed_times ?? []).filter((t) => !Number.isNaN(new Date(t).getTime()));
      const refused = (o.refused_slots ?? []).map((id) => args.offered[Number(String(id).replace(/\D/g, "")) - 1]).filter(Boolean);
      return { label: settleLabel(o.label, confidence), confidence, proposed, refused, returnDate: o.return_date && /^\d{4}-\d{2}-\d{2}$/.test(o.return_date) ? o.return_date : null };
    },
  });
}
