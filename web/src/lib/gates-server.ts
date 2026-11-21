import "server-only";
import { after } from "next/server";
import { startOutreach } from "@/lib/outreach/agent";
import { createAdminClient } from "@/lib/supabase/server";
import { ThesisCardSchema } from "@/lib/thesis/card";
import { currentCardRow } from "@/lib/thesis/current";
import { label, recommend, type Ratings } from "@/lib/thesis/recommend";
import { companyTags, joinsBlindSample, systemPosition, validateCorrection, validateGate1, type Decision, type SystemRec } from "./gates";
import type { Role } from "./actor";

export class GateError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

async function userId(role: Role): Promise<string> {
  const db = createAdminClient();
  const { data } = await db.from("users").select("id").eq("role", role).single();
  if (!data) throw new GateError("Unknown person.", 403);
  return data.id;
}

/** Recomputes both lenses in code after a rating changes. The model is not asked again. */
export async function recomputeRecommendation(id: string): Promise<void> {
  const db = createAdminClient();
  const [{ data: cardRow }, { data: scores }, { data: settings }] = await Promise.all([
    currentCardRow().then((data) => ({ data })),
    db.from("criterion_scores").select("criterion_id, rating").eq("application_id", id),
    db.from("settings").select("key, value"),
  ]);
  if (!scores?.length) return;
  const setting = (k: string) => settings?.find((s) => s.key === k)?.value;
  const card = ThesisCardSchema.parse(cardRow);
  const headline = setting("default_headline_lens") === "public" ? "public" : "revealed";
  const rec = recommend(card, Object.fromEntries(scores.map((s) => [s.criterion_id, s.rating])) as Ratings, headline, {
    sectorFlag: setting("sector_flag_strength") === "hard" ? "hard" : "soft",
  });
  await db.from("briefs").update({
    rec_public: rec.public.recommendation, rec_revealed: rec.revealed.recommendation, headline_lens: headline, lens_note: rec.lensNote,
    scores: { public: { score: rec.public.score, reasons: rec.public.reasons }, revealed: { score: rec.revealed.score, reasons: rec.revealed.reasons } },
  }).eq("application_id", id);
  const head = headline === "public" ? rec.public : rec.revealed;
  await db.from("applications").update({ status_reason: `${label(head.recommendation)} on the ${headline} lens, after a correction` }).eq("id", id);
}

/** Puts a PASS into the blind sample when the sample would fall below the set rate. Called when a brief is ready. */
export async function assignBlind(id: string): Promise<void> {
  const db = createAdminClient();
  const [{ data: brief }, { data: rate }] = await Promise.all([
    db.from("briefs").select("rec_public, rec_revealed, headline_lens").eq("application_id", id).maybeSingle(),
    db.from("settings").select("value").eq("key", "blind_sample_rate").maybeSingle(),
  ]);
  const { data: app } = await db.from("applications").select("status").eq("id", id).single();
  const rec = (brief?.headline_lens === "public" ? brief?.rec_public : brief?.rec_revealed) as SystemRec;
  const isPass = systemPosition(rec, app?.status ?? "") === "pass";
  if (!isPass) return;
  const { data: briefs } = await db.from("briefs").select("application_id, rec_public, rec_revealed, headline_lens").neq("application_id", id);
  const ids = (briefs ?? []).filter((b) => (b.headline_lens === "public" ? b.rec_public : b.rec_revealed) === "pass" || b.rec_revealed === "needs_human").map((b) => b.application_id);
  const { data: others } = ids.length ? await db.from("applications").select("id, status, blind").in("id", ids) : { data: [] };
  const passes = (others ?? []).filter((o) => o.status !== "hold_conflict");
  const join = joinsBlindSample(true, passes.length, passes.filter((o) => o.blind).length, Number(rate?.value ?? 0.1));
  if (join) await db.from("applications").update({ blind: true }).eq("id", id);
}

export async function recordBlindView(id: string, role: Role, view: "go" | "pass" | "unsure") {
  if (role !== "riya" && role !== "kushal") throw new GateError("Only Riya or Kushal reviews.", 403);
  const db = createAdminClient();
  const { data: app } = await db.from("applications").select("blind, blind_first_view").eq("id", id).single();
  if (!app?.blind) throw new GateError("This application is not in the blind sample.");
  if (app.blind_first_view) return;
  await db.from("applications").update({ blind_first_view: view }).eq("id", id);
}

export async function recordGate1(input: { id: string; role: Role; decision: Decision; reason?: string; notes?: string; seconds?: number }) {
  if (input.role !== "riya" && input.role !== "kushal") throw new GateError("Only Riya or Kushal can review at Gate 1.", 403);
  const db = createAdminClient();
  const [{ data: app }, { data: brief }] = await Promise.all([
    db.from("applications").select("status, blind, blind_first_view").eq("id", input.id).single(),
    db.from("briefs").select("rec_public, rec_revealed, headline_lens").eq("application_id", input.id).maybeSingle(),
  ]);
  if (!app) throw new GateError("Not found.", 404);
  if (!["brief_ready", "short_circuited"].includes(app.status)) throw new GateError(`This application is ${app.status.replaceAll("_", " ")}, not waiting for Gate 1.`, 409);
  if (app.blind && !app.blind_first_view) throw new GateError("This one is in the blind sample. Record your own view first.", 409);
  const rec = (brief?.headline_lens === "public" ? brief?.rec_public : brief?.rec_revealed) as SystemRec;
  const system = systemPosition(rec, app.status);
  const v = validateGate1({ decision: input.decision, reason: input.reason, system });
  if (!v.ok) throw new GateError(v.error);
  const { error } = await db.from("reviews").insert({
    application_id: input.id, gate: 1, reviewer_id: await userId(input.role), decision: input.decision, agreed_with_system: v.agreed,
    reason: input.reason?.trim() || null, notes: input.notes?.trim() || null, blind: app.blind, blind_first_view: app.blind_first_view,
    // The system's position as Riya saw it: a stopped-early brief reads as PASS, not "needs a person".
    seconds_spent: Math.max(0, Math.round(input.seconds ?? 0)), system_recommendation: system ?? rec,
  });
  if (error) throw new GateError(error.message);
  await db.from("applications").update({ status: "riya_decided", status_reason: `${input.role === "riya" ? "Riya" : "Kushal"} chose ${input.decision.toUpperCase()}${v.agreed ? ", agreeing with the system" : ""}` }).eq("id", input.id);
}

export async function recordGate2(input: { id: string; role: Role; decision: Decision; note?: string; seconds?: number }) {
  if (input.role !== "kushal") throw new GateError("Only Kushal signs off.", 403);
  const db = createAdminClient();
  const { data: app } = await db.from("applications").select("status").eq("id", input.id).single();
  if (!app) throw new GateError("Not found.", 404);
  if (!["riya_decided", "hold_conflict", "hold"].includes(app.status)) throw new GateError(`This application is ${app.status.replaceAll("_", " ")}, not waiting for sign off.`, 409);
  if (input.decision === "send_back" && !input.note?.trim()) throw new GateError("Add a note for Riya when you send it back.");
  const { data: g1 } = await db.from("reviews").select("decision").eq("application_id", input.id).eq("gate", 1).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const agreed = g1 ? g1.decision === input.decision : input.decision === "hold";
  if (!agreed && input.decision !== "send_back" && !input.note?.trim()) throw new GateError("You differ from Riya. Add a one-line reason.");
  const { error } = await db.from("reviews").insert({
    application_id: input.id, gate: 2, reviewer_id: await userId("kushal"), decision: input.decision,
    agreed_with_system: agreed || input.decision === "send_back", reason: input.note?.trim() || (agreed ? null : "Sent back"),
    seconds_spent: Math.max(0, Math.round(input.seconds ?? 0)), system_recommendation: g1?.decision ?? null, note_to_riya: input.decision === "send_back" ? input.note : null,
  });
  if (error) throw new GateError(error.message);
  const next = { go: "signed_off_go", pass: "signed_off_pass", hold: "hold", send_back: "brief_ready" }[input.decision];
  // Step 14: GO and PASS start outreach. The first draft is written after this reply, for Riya to send.
  if (input.decision === "go" || input.decision === "pass") {
    const outcome = input.decision;
    after(() => startOutreach(input.id, outcome).catch((e) => console.error("outreach start:", e)));
  }
  await db.from("applications").update({
    status: next,
    status_reason: input.decision === "send_back" ? `Sent back by Kushal: ${input.note}` : `Kushal signed off ${input.decision.toUpperCase()}`,
    sent_back_note: input.decision === "send_back" ? input.note : null,
  }).eq("id", input.id);
}

export async function applyCorrection(input: { id: string; role: Role; criterion: string; rating: number; reason: string; kind: "fact" | "rule" }) {
  if (input.role === "aditya" && input.kind === "rule") throw new GateError("Rule corrections come from Riya or Kushal.", 403);
  const err = validateCorrection(input);
  if (err) throw new GateError(err);
  const db = createAdminClient();
  const { data: app } = await db.from("applications").select("status").eq("id", input.id).single();
  if (!app || !["brief_ready", "short_circuited"].includes(app.status)) throw new GateError("Ratings can be corrected only while the application waits for Gate 1.", 409);
  const { data: score } = await db.from("criterion_scores").select("rating").eq("application_id", input.id).eq("criterion_id", input.criterion).maybeSingle();
  if (!score) throw new GateError("This criterion has no rating yet.", 404);
  const { data: ev } = await db.from("evidence").select("field, status, value").eq("application_id", input.id).eq("track", "1");
  const { data: form } = await db.from("documents").select("parsed").eq("application_id", input.id).eq("kind", "form").maybeSingle();
  const fields = ((form?.parsed as { form?: { fields: { key: string; value: string }[] } } | null)?.form?.fields) ?? [];
  const tags = companyTags({
    sector: fields.find((f) => f.key === "sector")?.value,
    sellsToBusinesses: ev?.find((e) => e.field === "company.sells_to_businesses")?.status === "yes" ? true : ev?.find((e) => e.field === "company.sells_to_businesses")?.status === "no" ? false : null,
    revenueType: String(ev?.find((e) => e.field === "traction.revenue_type")?.value ?? ""),
  });
  await db.from("corrections").insert({
    application_id: input.id, criterion_id: input.criterion, old_rating: score.rating, new_rating: input.rating, reason: input.reason.trim(),
    kind: input.kind, tags, rule_status: input.kind === "rule" ? "pending" : null, created_by: await userId(input.role),
  });
  // A fact correction changes this company only. A rule correction does too, and waits for Kushal before it shapes anything else.
  await db.from("criterion_scores").update({ rating: input.rating, capped_note: `Corrected by ${input.role === "riya" ? "Riya" : input.role === "kushal" ? "Kushal" : "Aditya"} from ${score.rating}: ${input.reason.trim()}` })
    .eq("application_id", input.id).eq("criterion_id", input.criterion);
  await recomputeRecommendation(input.id);
}

export async function decideRule(input: { correctionId: string; role: Role; status: "accepted" | "declined" }) {
  if (input.role !== "kushal") throw new GateError("Only Kushal decides on rule corrections.", 403);
  const db = createAdminClient();
  await db.from("corrections").update({ rule_status: input.status, decided_by: await userId("kushal"), decided_at: new Date().toISOString() }).eq("id", input.correctionId).eq("kind", "rule");
}

export async function addRiyaEvidence(input: { id: string; role: Role; quote: string; url: string; criterion?: string }) {
  if (input.role !== "riya" && input.role !== "kushal") throw new GateError("Only Riya or Kushal adds research here.", 403);
  if (!input.quote.trim()) throw new GateError("Paste the finding.");
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    throw new GateError("Add the link where you found it.");
  }
  const db = createAdminClient();
  const { count } = await db.from("evidence").select("id", { count: "exact", head: true }).eq("application_id", input.id).eq("track", "riya");
  await db.from("evidence").insert({
    id: `${input.id.slice(0, 8)}_r${(count ?? 0) + 1}`, application_id: input.id, field: input.criterion ? `riya.${input.criterion}` : "riya.note",
    status: "text", value: input.quote.trim(), quote: input.quote.trim().slice(0, 600), source_type: "riya", source_ref: url.toString(), url: url.toString(),
    fetched_at: new Date().toISOString(), track: "riya", strength: "none",
  });
}
