import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { BadModelOutput, CostCapReached, PiiBlocked, spentTodayUsd } from "@/lib/ai/gemini";
import { researchQuestion, runScreening } from "@/lib/screening/run";
import { assignBlind } from "@/lib/gates-server";
import { queue } from "@/lib/db";
import { parseFormItems, parseFounder, type FormField } from "./form";
import { UnreadablePdf, deckPages, looksScanned, pdfItems, type DeckPage } from "./pdf";
import { redactText, type FounderRef } from "./redact";
import { outcome, runCheapChecks, type Flag } from "./checks";
import { checkPortfolio } from "./portfolio";

// The screening pipeline for milestone M2: parse, redact, cheap checks, short brief (PRD Steps 3 to 5).
// Each step saves its result before the next begins, so a stopped worker picks up where it left off.

export const QUEUE = "screening";
export type ScreeningJob = { application_id: string };
export const BUCKET = "applications";
export const CHEAP_CHECKS_DONE = "cheap_checks_done";

/** Waiting for work that a person or a later milestone must do. Never processed again by this worker. */
const SETTLED = new Set(["short_circuited", "hold_conflict", "brief_ready", "riya_decided", "signed_off_go", "signed_off_pass", "hold"]);
/** Steps after the cheap checks. An application on one of these resumes full screening. */
const FULL_STEPS = new Set([CHEAP_CHECKS_DONE, "extracting", "extracted", "researching", "researched", "compared", "scoring", "scored"]);

class NeedsAttention extends Error {}

type ParsedDoc = { form?: { fields: FormField[]; byKey: Record<string, string> }; deck?: { pages: DeckPage[] } };

async function setStatus(id: string, status: string, extra: Record<string, unknown> = {}) {
  const db = createAdminClient();
  const { error } = await db.from("applications").update({ status, ...extra }).eq("id", id);
  if (error) throw new Error(`Could not update status: ${error.message}`);
}

async function download(path: string): Promise<Uint8Array> {
  const db = createAdminClient();
  const { data, error } = await db.storage.from(BUCKET).download(path);
  if (error || !data) throw new NeedsAttention(`The file ${path.split("/").pop()} could not be found in storage`);
  return new Uint8Array(await data.arrayBuffer());
}

export async function screenApplication(id: string): Promise<void> {
  const db = createAdminClient();
  const { data: app } = await db.from("applications").select("*").eq("id", id).single();
  if (!app) return; // deleted while waiting
  if (SETTLED.has(app.status)) return;
  // Riya asked for more research on a named question: one more round, then compare and score again.
  if (app.last_step === "research_question") {
    await researchQuestion(id);
    await runScreening(id, "full");
    return;
  }
  // Cheap checks already passed: carry on with full screening from the last saved step.
  if (FULL_STEPS.has(app.last_step ?? "")) {
    await runScreening(id, "full");
    return;
  }

  // Step 3. Parse.
  if (app.last_step !== "parsed") {
    await setStatus(id, "parsing", { status_reason: null, last_step: "parsing" });
    const { data: docs } = await db.from("documents").select("*").eq("application_id", id);
    for (const doc of docs ?? []) {
      let parsed: ParsedDoc;
      try {
        const { items, pages } = await pdfItems(await download(doc.storage_path));
        if (doc.kind === "form") {
          const form = parseFormItems(items);
          if (form.fields.length < 5) throw new NeedsAttention("The form could not be read. It may be a scan or a different template.");
          parsed = { form };
        } else {
          const dp = deckPages(items, pages);
          if (looksScanned(dp)) throw new NeedsAttention("The deck could not be read. It looks like a scan with no text.");
          parsed = { deck: { pages: dp } };
        }
      } catch (e) {
        if (e instanceof UnreadablePdf) throw new NeedsAttention(`The ${doc.kind} could not be read. The file may be broken.`);
        throw e;
      }
      await db.from("documents").update({ parsed }).eq("id", doc.id);

      if (parsed.form) {
        const keys = Object.keys(parsed.form.byKey).filter((k) => k.startsWith("founder_"));
        for (const [i, k] of keys.entries()) {
          const f = parseFounder(k, parsed.form.byKey[k]);
          await db.from("founders").upsert(
            { application_id: id, founder_key: `F${i + 1}`, name: f.name, role: f.role, bio: f.bio, linkedin_url: f.linkedin },
            { onConflict: "application_id,founder_key" },
          );
        }
        const name = parsed.form.byKey.company_name?.replace(/\s*\(.*\)\s*$/, "").trim();
        const site = parsed.form.byKey.website?.trim();
        if (name || site) await db.from("applications").update({ ...(name ? { company_name: name } : {}), ...(site ? { website: site } : {}) }).eq("id", id);
      }
    }
    await db.from("applications").update({ last_step: "parsed" }).eq("id", id);
  }

  // Step 4. Redact.
  await setStatus(id, "screening", { last_step: "screening" });
  const [{ data: docs }, { data: founderRows }, { data: fresh }] = await Promise.all([
    db.from("documents").select("*").eq("application_id", id),
    db.from("founders").select("founder_key, name, email, phone, linkedin_url").eq("application_id", id),
    db.from("applications").select("*").eq("id", id).single(),
  ]);
  const founders: FounderRef[] = (founderRows ?? []).map((f) => ({ id: f.founder_key, name: f.name, linkedin: f.linkedin_url, email: f.email, phone: f.phone }));
  const formDoc = docs?.find((d) => d.kind === "form");
  const deckDoc = docs?.find((d) => d.kind === "deck");
  const form = (formDoc?.parsed as ParsedDoc | undefined)?.form;
  const deck = (deckDoc?.parsed as ParsedDoc | undefined)?.deck;

  // A warm intro with no form still gets a minimal form from what Riya typed.
  const fields: FormField[] = form?.fields ?? [
    { key: "company_name", label: "Company name", value: fresh.company_name, page: 1 },
    ...(fresh.website ? [{ key: "website", label: "Website", value: fresh.website, page: 1 }] : []),
    ...(fresh.intro_notes ? [{ key: "intro_notes", label: "Notes from the warm intro", value: fresh.intro_notes, page: 1 }] : []),
  ];
  const byKey = form?.byKey ?? Object.fromEntries(fields.map((f) => [f.key, f.value]));
  const redFields = fields.map((f) => ({ ...f, value: redactText(f.value, founders) }));
  const redPages = deck?.pages.map((p) => ({ page: p.page, text: redactText(p.text, founders) }));
  if (formDoc) await db.from("documents").update({ redacted: { fields: redFields } }).eq("id", formDoc.id);
  if (deckDoc && redPages) await db.from("documents").update({ redacted: { pages: redPages } }).eq("id", deckDoc.id);

  // Step 5. Cheap checks. Only redacted text reaches the model.
  const [{ data: portfolio }, { data: others }, { data: settings }] = await Promise.all([
    db.from("portfolio_companies").select("name, description, buyer, tags"),
    db.from("applications").select("id, company_name, website").neq("id", id).lt("received_at", fresh.received_at),
    db.from("settings").select("key, value").in("key", ["inr_per_usd", "sector_flag_strength"]),
  ]);
  const setting = (k: string) => settings?.find((s) => s.key === k)?.value;
  const red = (k: string) => redFields.find((f) => f.key === k)?.value;
  const product = [
    red("one_line") && `One-line description: ${red("one_line")}`,
    red("built") && `What they built: ${red("built")}`,
    red("customers") && `Customers: ${red("customers")}`,
    red("sector") && `Sector selected: ${red("sector")}`,
    !form && red("intro_notes") && `Notes: ${red("intro_notes")}`,
    !form && redPages?.[0] && `Deck page 1: ${redPages[0].text.slice(0, 600)}`,
  ].filter(Boolean).join("\n");
  const verdict = product
    ? await checkPortfolio({ applicationId: id, product, portfolio: (portfolio ?? []) as never, founders })
    : null;

  const flags = runCheapChecks({
    fields, byKey, others: others ?? [], portfolio: verdict,
    inrPerUsd: Number(setting("inr_per_usd") ?? 85),
    sectorFlag: setting("sector_flag_strength") === "hard" ? "hard" : "soft",
    fullReview: fresh.full_review,
  });
  const result = outcome(flags);
  const gaps = [
    !deckDoc ? { item: "No deck", note: "Only the form was sent. Scoring will rely on the form." } : null,
    !formDoc ? { item: "No form", note: "A warm intro without a form response." } : null,
    result !== "continue" ? { item: "Research skipped", note: "A cheap check hit, so the research loop did not run. Riya can run the full review." } : null,
  ].filter(Boolean);
  const briefFlags: (Flag | { id: string; label: string; severity: string; short_circuit: boolean; why: string; evidence: [] })[] = [...flags];
  if (verdict?.injection) {
    briefFlags.push({ id: "injection_attempt", label: "Text aimed at the AI", severity: "High", short_circuit: false, why: "This document contains text aimed at the AI. It was ignored.", evidence: [] });
  }

  const hitLabels = flags.filter((f) => f.short_circuit).map((f) => f.label.toLowerCase());
  const summary =
    result === "hold_conflict"
      ? `Held for Kushal: possible portfolio conflict with ${flags.find((f) => f.id === "portfolio_conflict")?.with}. Kushal speaks to the portfolio founder first.`
      : result === "short_circuited"
        ? `Likely pass, needs a person: ${hitLabels.join(", ")}. Research was skipped to save cost.`
        : `Cheap checks done${flags.length ? `. ${flags.length === 1 ? "One flag is" : `${flags.length} flags are`} kept for the full review` : ", nothing found"}${fresh.full_review ? ". Full review asked for by a person" : ""}.`;

  await db.from("briefs").upsert(
    {
      application_id: id,
      rec_public: result === "hold_conflict" ? "hold" : result === "short_circuited" ? "needs_human" : null,
      rec_revealed: result === "hold_conflict" ? "hold" : result === "short_circuited" ? "needs_human" : null,
      headline_lens: "revealed",
      summary,
      flags: briefFlags,
      gaps,
    },
    { onConflict: "application_id" },
  );

  if (result === "continue") {
    await setStatus(id, "screening", { short_circuit_flags: briefFlags.map((f) => f.id), last_step: CHEAP_CHECKS_DONE, status_reason: null });
    await runScreening(id, "full");
    return;
  }

  // Short path: read the deck and form and compare them, so Riya still sees where they disagree.
  // Research and scoring are skipped to save cost (PRD Step 5).
  const short = await runScreening(id, "short");
  const merged = [...briefFlags];
  for (const f of short.flags) if (!merged.some((m) => m.id === f.id)) merged.push(f as never);
  await db.from("briefs").update({ flags: merged, inconsistencies: short.inconsistencies }).eq("application_id", id);
  const flagIds = merged.map((f) => f.id);
  if (result === "hold_conflict") {
    await setStatus(id, "hold_conflict", { short_circuit_flags: flagIds, last_step: "cheap_checks", status_reason: summary });
  } else {
    await setStatus(id, "short_circuited", { short_circuit_flags: flagIds, last_step: "cheap_checks", status_reason: summary, brief_ready_at: new Date().toISOString() });
    await assignBlind(id);
  }
}

/** Runs queued applications until the queue is empty or the time budget is used. Never drops a job. */
export async function runScreeningWorker(opts: { budgetMs?: number } = {}): Promise<{ processed: number; failed: number }> {
  const db = createAdminClient();
  const deadline = Date.now() + (opts.budgetMs ?? 240_000);
  const { data: conc } = await db.from("settings").select("value").eq("key", "worker_concurrency").single();
  const concurrency = Math.max(1, Number(conc?.value ?? 4));
  let processed = 0;
  let failed = 0;

  // Applications paused by the cost cap go back in line once there is budget again.
  const { data: cap } = await db.from("settings").select("value").eq("key", "daily_cost_cap_usd").single();
  if ((await spentTodayUsd()) < Number(cap?.value ?? 5)) {
    const { data: paused } = await db.from("applications").select("id").eq("status", "paused_cost_cap");
    for (const p of paused ?? []) {
      await setStatus(p.id, "queued", { status_reason: null });
      await queue.send<ScreeningJob>(QUEUE, { application_id: p.id });
    }
  }

  while (Date.now() < deadline) {
    // Full screening can take a few minutes, so a message stays hidden for ten before it comes back.
    const batch = await queue.read<ScreeningJob>(QUEUE, 600, concurrency);
    if (batch.length === 0) break;
    await Promise.all(
      batch.map(async (msg) => {
        const id = msg.message.application_id;
        try {
          await screenApplication(id);
          await queue.remove(QUEUE, msg.msg_id);
          processed++;
        } catch (e) {
          failed++;
          const reason = e instanceof Error ? e.message : String(e);
          if (e instanceof CostCapReached) {
            await setStatus(id, "paused_cost_cap", { status_reason: reason });
            await queue.remove(QUEUE, msg.msg_id);
          } else if (e instanceof NeedsAttention || e instanceof PiiBlocked || e instanceof BadModelOutput || msg.read_ct >= 3) {
            // Nothing is silently dropped: the application keeps a plain reason and Riya can re-queue it.
            const plain = e instanceof BadModelOutput ? `The model gave a bad answer twice (${reason}).` : reason;
            await setStatus(id, "needs_attention", { status_reason: msg.read_ct >= 3 && !(e instanceof NeedsAttention || e instanceof BadModelOutput) ? `Failed three times. Last error: ${reason}` : plain });
            await queue.remove(QUEUE, msg.msg_id);
          }
          // Otherwise the message reappears after its timeout and is tried again.
        }
      }),
    );
  }
  return { processed, failed };
}
