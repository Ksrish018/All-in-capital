import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { CRITERIA, ThesisCardSchema } from "@/lib/thesis/card";
import { recommend, label, type Ratings } from "@/lib/thesis/recommend";
import { redactText, type FounderRef } from "@/lib/intake/redact";
import { normName } from "@/lib/intake/checks";
import { MAX_FETCHES, ResearchClient, looksLikeInjection, type ResearchMode } from "@/lib/research/client";
import { QUESTIONS } from "./fields";
import { buildSources, extractTrack1, type Claim } from "./extract";
import { readResult, runTrack2, type MatchFacts } from "./research";
import { applyLinks, compareDeckForm, fieldName, type Inconsistency, type Strength } from "./compare";
import { matchClaims } from "./match";
import { A3_VERSION, buildPack, scoreCriterion, type CriterionDef, type EvidenceItem, type Score } from "./score";
import { scrubNames } from "./memo";
import { currentCardRow } from "@/lib/thesis/current";
import { companyTags, recallCorrections } from "@/lib/gates";
import { assignBlind } from "@/lib/gates-server";
import { writeSummary } from "./summary";

// Steps 6 to 13. "full" runs everything. "short" (a cheap check hit) reads the deck and form and compares them,
// so Riya still sees where they disagree, but skips research and scoring to save cost.

export class ScreeningFailed extends Error {}

type Row = {
  id: string; field: string; status: string; value: unknown; unit: string | null; quote: string | null;
  source_type: string | null; source_ref: string | null; track: string; check_id: string | null;
  strength: Strength; vague: boolean; url: string | null; linked_to: string | null; note: string | null;
};

const ORDER = ["cheap_checks_done", "extracted", "researched", "compared", "scored"];
const done = (last: string | null, step: string) => ORDER.indexOf(last ?? "") >= ORDER.indexOf(step);

async function step(id: string, status: string | null, lastStep: string) {
  const db = createAdminClient();
  await db.from("applications").update({ ...(status ? { status } : {}), last_step: lastStep }).eq("id", id);
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  }));
  return out;
}

export async function runScreening(id: string, mode: "full" | "short"): Promise<{ inconsistencies: Inconsistency[]; flags: CodeFlag[] }> {
  const db = createAdminClient();
  const { data: app } = await db.from("applications").select("*").eq("id", id).single();
  const [{ data: docs }, { data: founderRows }, { data: settings }] = await Promise.all([
    db.from("documents").select("kind, redacted").eq("application_id", id),
    db.from("founders").select("founder_key, name, email, phone, linkedin_url, role, bio").eq("application_id", id).order("founder_key"),
    db.from("settings").select("key, value"),
  ]);
  const setting = (k: string) => settings?.find((s) => s.key === k)?.value;
  const founders: FounderRef[] = (founderRows ?? []).map((f) => ({ id: f.founder_key, name: f.name, linkedin: f.linkedin_url, email: f.email, phone: f.phone }));
  const form = (docs?.find((d) => d.kind === "form")?.redacted as { fields?: { key: string; label: string; value: string }[] } | null)?.fields ?? null;
  const deck = (docs?.find((d) => d.kind === "deck")?.redacted as { pages?: { page: number; text: string }[] } | null)?.pages ?? null;
  const sources = buildSources(form, deck);
  const ev = (local: string) => `${id.slice(0, 8)}_${local}`;
  let last: string | null = app.last_step;

  // Step 6. Track 1.
  if (!done(last, "extracted")) {
    await step(id, mode === "full" ? "extracting" : null, "extracting");
    await db.from("evidence").delete().eq("application_id", id);
    const { claims, injection } = await extractTrack1({ applicationId: id, sources, founders });
    const rows = claims.map((c, i) => ({
      id: ev(`e${i + 1}`), application_id: id, field: c.field, status: c.status, value: c.value,
      unit: c.unit, quote: c.quote, source_type: c.source_ref?.split(":")[0] ?? null, source_ref: c.source_ref, track: "1",
      strength: c.status === "unknown" ? "none" : "founder_says", vague: c.vague,
    }));
    if (rows.length) {
      const { error } = await db.from("evidence").insert(rows);
      if (error) throw new Error(`Could not save evidence: ${error.message}`);
    }
    // Caught by the model or by code: text in the deck or form that tries to instruct the AI.
    if (injection || [...sources.values()].some(looksLikeInjection)) {
      await db.from("evidence").insert({ id: ev("inj1"), application_id: id, field: "injection", status: "yes", track: "code", source_type: "system", note: "The deck or form contains text aimed at the AI. It was ignored." });
    }
    await step(id, null, last = "extracted");
  }

  const load = async () => ((await db.from("evidence").select("*").eq("application_id", id)).data ?? []) as Row[];
  let rows = await load();
  const toClaim = (r: Row): Claim => ({
    field: r.field, status: r.status as Claim["status"],
    // Numbers come back as numbers, even from rows saved before this fix.
    value: r.value === null || r.value === undefined ? null : r.status === "number" && Number.isFinite(Number(r.value)) ? Number(r.value) : (r.value as string),
    unit: r.unit, quote: r.quote, source_ref: r.source_ref, vague: r.vague,
  });
  const t1 = rows.filter((r) => r.track === "1");
  const claims = t1.map((r) => ({ ...toClaim(r), id: r.id }));
  const valueOf = (field: string) => t1.find((r) => r.field === field && r.status !== "unknown");

  // Step 7. Sufficiency, in code: which questions are still open.
  const open = QUESTIONS.filter((q) => q.fields.every((f) => !valueOf(f))).map((q) => q.question);

  // Step 8. Track 2. Only on the full path.
  const researchMode = (process.env.RESEARCH_MODE ?? setting("research_mode") ?? "replay") as ResearchMode;
  if (mode === "full" && !done(last, "researched")) {
    await step(id, "researching", "researching");
    await db.from("evidence").delete().eq("application_id", id).eq("track", "2");
    await db.from("research_fetches").delete().eq("application_id", id);
    const match: MatchFacts = {
      name: app.company_name,
      city: (valueOf("company.city")?.quote as string | undefined) ?? form?.find((f) => f.key === "location")?.value ?? null,
      product: form?.find((f) => f.key === "one_line")?.value ?? String(valueOf("company.what_built")?.quote ?? app.company_name),
      sector: form?.find((f) => f.key === "sector")?.value ?? null,
      founders: (founderRows ?? []).map((f) => ({ id: f.founder_key, summary: `${f.role ?? "founder"}. ${f.bio ?? ""}`.trim() })),
    };
    const client = new ResearchClient(researchMode, normName(app.company_name));
    const t2 = await runTrack2({ applicationId: id, client, match, founderNames: (founderRows ?? []).map((f) => f.name), website: app.website, founders });
    const now = new Date().toISOString();
    if (t2.facts.length) {
      await db.from("evidence").insert(t2.facts.map((f, i) => ({
        id: ev(`w${i + 1}`), application_id: id, field: f.field ?? `web.${f.check}`, status: "text", value: f.statement,
        quote: f.quote, source_type: "web", source_ref: f.url, url: f.url, fetched_at: now, track: "2", check_id: f.check, strength: "found_by_us",
      })));
    }
    if (t2.log.length) {
      await db.from("research_fetches").insert(t2.log.map((l) => ({
        application_id: id, check_id: l.check, attempt: Math.min(2, l.attempt), query_or_url: l.query, outcome: l.outcome, error: l.error ?? null, mode: researchMode,
      })));
    }
    if (t2.injection) await db.from("evidence").upsert({ id: ev("inj2"), application_id: id, field: "injection", status: "yes", track: "code", source_type: "system", note: "A web page found in research contains text aimed at the AI. It was ignored." });
    await step(id, null, last = "researched");
    rows = await load();
  }

  // Step 9. Compare.
  const { found, textPairs } = compareDeckForm(claims);
  const inconsistencies: Inconsistency[] = [...found];
  if (!done(last, "compared")) {
    const web = rows.filter((r) => r.track === "2");
    const shortId = (r: Row) => r.id.split("_").pop()!;
    const res = await matchClaims({
      applicationId: id,
      claims: claims.filter((c) => c.quote).map((c) => ({ id: c.id.split("_").pop()!, field: c.field, source: c.source_ref ?? "", quote: c.quote! })),
      // Links can carry a founder's name as a slug, so they are redacted like everything else.
      web: web.map((w) => ({ id: shortId(w), statement: String(w.value ?? ""), quote: w.quote ?? "", url: redactText(w.url ?? "", founders) })),
      pairs: textPairs,
      founders,
    });
    const applied = applyLinks(claims.map((c) => c.id.split("_").pop()!), web.map(shortId), res.links);
    for (const [cid, s] of applied.claim) if (s !== "founder_says") await db.from("evidence").update({ strength: s }).eq("id", ev(cid));
    for (const [wid, w] of applied.web) await db.from("evidence").update({ strength: w.strength, linked_to: w.linked ? ev(w.linked) : null }).eq("id", ev(wid));
    for (const p of res.pairs) {
      const pair = textPairs.find((t) => t.id === p.pair_id);
      if (pair && !p.agree) {
        inconsistencies.push({ field: pair.field, form: pair.form.quote ?? "", deck: pair.deck.quote ?? "", gap_percent: null, severity: "High", note: p.note });
      }
    }
    await db.from("evidence").delete().eq("application_id", id).eq("track", "code").like("field", "inconsistency%");
    if (inconsistencies.length) {
      await db.from("evidence").insert(inconsistencies.map((x, i) => ({
        id: ev(`x${i + 1}`), application_id: id, field: `inconsistency.${x.field}`, status: "text", value: x, track: "code", source_type: "system", strength: "conflict", note: x.note,
      })));
    }
    if (mode === "full") await step(id, null, (last = "compared"));
    rows = await load();
  } else {
    for (const r of rows.filter((x) => x.field.startsWith("inconsistency."))) {
      const x = r.value as Inconsistency;
      if (!inconsistencies.some((i) => i.field === x.field && i.deck === x.deck)) inconsistencies.push(x);
    }
  }

  const flags = codeFlags(rows, form);
  // Unscored applications keep only firm regulatory facts. A stated dependence needs the judge's view first.
  if (mode === "short") return { inconsistencies, flags: flags.filter((f) => f.id !== "regulatory_exposure" || f.firm) };

  // Steps 10 and 11. Context packs and scores.
  const cardRow = await currentCardRow();
  const card = ThesisCardSchema.parse({ ...cardRow, public_register: cardRow.public_register });
  const { data: brief } = await db.from("briefs").select("*").eq("application_id", id).maybeSingle();
  const cheapFlags = (brief?.flags ?? []) as { id: string; label: string; with?: string; severity: string; why: string; evidence: unknown[] }[];
  const overlap = cheapFlags.find((f) => f.id === "portfolio_conflict" || f.id === "portfolio_overlap_note");

  if (!done(last, "scored")) {
    await step(id, "scoring", "scoring");
    const { data: memos } = await db.from("memo_passages").select("id, company, decision, criteria, text, split").eq("split", "build");
    const memoItems = (memos ?? []).map((m) => ({ id: m.id as string, company: m.company as string, decision: m.decision as string, text: scrubNames(m.text as string, [m.company as string]).slice(0, 900), criteria: m.criteria as string[] }));
    const evidence: (EvidenceItem & { check: string | null })[] = rows
      .filter((r) => (r.track === "1" || r.track === "2" || r.track === "riya") && r.quote)
      .map((r) => ({ id: r.id.split("_").pop()!, field: r.field, source: redactText(r.source_ref ?? r.url ?? "", founders), quote: redactText(r.quote!, founders), strength: r.strength, vague: r.vague, web: r.track === "2" || r.track === "riya", check: r.check_id }));
    const partnerRules = (cardRow.partner_rules ?? []) as string[];
    // Loop C: up to three of Riya's rule corrections on similar companies, as context only.
    const tags = companyTags({
      sector: form?.find((f) => f.key === "sector")?.value,
      sellsToBusinesses: valueOf("company.sells_to_businesses")?.status === "yes" ? true : valueOf("company.sells_to_businesses")?.status === "no" ? false : null,
      revenueType: String(valueOf("traction.revenue_type")?.value ?? ""),
    });
    const { data: corrections } = await db.from("corrections").select("id, criterion_id, kind, rule_status, tags, created_at, old_rating, new_rating, reason").eq("kind", "rule").neq("application_id", id);
    const scored = await pool(card.criteria.filter((c) => c.id !== "C4"), 3, (c) =>
      scoreCriterion({
        applicationId: id, criterion: c as CriterionDef, partnerRules, founders,
        pack: buildPack(c as CriterionDef, evidence, memoItems, recallCorrections(corrections ?? [], c.id, tags)),
      }),
    );
    // C4 comes from the portfolio check, in code.
    const c4: Score = {
      criterion_id: "C4",
      rating: overlap?.id === "portfolio_conflict" ? 0 : overlap ? 2 : 4,
      evidence_strength: "found_by_us",
      reason: overlap ? `${overlap.label}: ${overlap.with}. ${overlap.why}` : "No portfolio company is paid by the same buyer for the same job.",
      evidence_refs: [], memo_refs: [], missing: [], capped_note: null, injection: false,
    };
    const all = [...scored, c4];
    await db.from("criterion_scores").delete().eq("application_id", id);
    await db.from("criterion_scores").insert(all.map((s) => ({
      application_id: id, criterion_id: s.criterion_id, rating: s.rating, strength: s.evidence_strength, reason: s.reason,
      evidence_refs: s.evidence_refs.map(ev), memo_refs: s.memo_refs, missing: s.missing, prompt_version: s.criterion_id === "C4" ? "code" : A3_VERSION, capped_note: s.capped_note,
    })));
    if (all.some((s) => s.injection)) await db.from("evidence").upsert({ id: ev("inj3"), application_id: id, field: "injection", status: "yes", track: "code", source_type: "system", note: "Text aimed at the AI was found while scoring. It was ignored." });
    await step(id, null, last = "scored");
  }

  // Step 12. Recommend, in code.
  const { data: scores } = await db.from("criterion_scores").select("*").eq("application_id", id);
  const ratings = Object.fromEntries((scores ?? []).map((s) => [s.criterion_id, s.rating])) as Ratings;
  const headline = (setting("default_headline_lens") === "public" ? "public" : "revealed") as "public" | "revealed";
  const rec = recommend(card, ratings, headline, { sectorFlag: setting("sector_flag_strength") === "hard" ? "hard" : "soft" });
  const head = headline === "public" ? rec.public : rec.revealed;

  // Step 13. The brief.
  rows = await load();
  const nothing = ((await db.from("research_fetches").select("check_id, outcome, error").eq("application_id", id)).data ?? []);
  const checks = ["exists", "founders", "market", "news", "red_flags"];
  const CHECK_NAME: Record<string, string> = { exists: "Company exists", founders: "Founder track record", market: "Market and competitors", news: "Press and funding", red_flags: "Red flags" };
  const gaps = [
    ...(deck ? [] : [{ item: "No deck", note: "Only the form was sent. Every number comes from the form." }]),
    ...checks
      .filter((c) => !rows.some((r) => r.track === "2" && r.check_id === c))
      .map((c) => {
        const tries = nothing.filter((n) => n.check_id === c);
        const why = tries.find((t) => t.outcome === "wrong_match")
          ? "A result about a different company or person with the same name was dropped."
          : tries.find((t) => t.error)?.error ?? (researchMode === "replay" ? "nothing in the recorded research" : "nothing found");
        return { item: CHECK_NAME[c], note: `Searched ${Math.max(1, tries.length)} time${tries.length === 1 ? "" : "s"}. ${why[0].toUpperCase()}${why.slice(1)}.` };
      }),
    ...open.map((q) => ({ item: q, note: "The deck and form do not say. Code checked the fields that settle it." })),
  ];
  // G11: when none of Riya's past rule corrections share a tag with this company, the system is on its own.
  // Say so, so she reads the ratings with more care (the "defence drone" case, PRD 24.8).
  const myTags = companyTags({
    sector: form?.find((f) => f.key === "sector")?.value,
    sellsToBusinesses: valueOf("company.sells_to_businesses")?.status === "yes" ? true : valueOf("company.sells_to_businesses")?.status === "no" ? false : null,
    revenueType: String(valueOf("traction.revenue_type")?.value ?? ""),
  });
  const { data: pastRules } = await db.from("corrections").select("tags, rule_status").eq("kind", "rule").neq("application_id", id);
  const close = (pastRules ?? []).filter((c) => c.rule_status !== "declined" && (c.tags as string[]).some((t) => myTags.includes(t)));
  if (close.length === 0) {
    gaps.push({
      item: "No close past example",
      note: (pastRules ?? []).length
        ? `None of Riya's ${(pastRules ?? []).length} past rule corrections match this company's sector or business model${myTags.length ? ` (${myTags.join(", ")})` : ""}. The ratings lean on the Thesis Card alone, so read them with more care.`
        : "There are no past rule corrections yet. The ratings lean on the Thesis Card alone.",
    });
  }
  const ratingFlags: CodeFlag[] = [];
  if (ratings.C1 === 0) ratingFlags.push({ id: "later_stage", label: "Later stage", severity: "High", short_circuit: false, why: "Rated as later stage than the fund invests in.", evidence: [] });
  if (ratings.C3 === 0) ratingFlags.push({ id: "regulatory_bet", label: "Regulatory bet", severity: "High", short_circuit: false, why: "The model depends on regulation or partners becoming friendlier. It cannot be GO.", evidence: [] });
  // The judge saw no regulatory problem (C3 Adequate or better), so the early warning is withdrawn.
  const kept = flags.filter((f) => !(f.id === "regulatory_exposure" && !f.firm && (ratings.C3 ?? 1) >= 3));
  const allFlags = dedupe([...cheapFlags.map((f) => f as unknown as CodeFlag), ...kept, ...ratingFlags]);
  const nameOf = Object.fromEntries(card.criteria.map((c) => [c.id, c.name]));
  const summary = await writeSummary({
    applicationId: id,
    company: app.company_name,
    oneLine: form?.find((f) => f.key === "one_line")?.value ?? "",
    headline: label(head.recommendation),
    lensNote: rec.lensNote,
    flags: allFlags.map((f) => f.label),
    ratings: CRITERIA.map((c) => {
      const s = scores?.find((x) => x.criterion_id === c);
      return { id: c, name: nameOf[c], rating: s?.rating ?? 1, reason: s?.reason ?? "Not rated." };
    }),
    gaps: gaps.map((g) => g.item),
    founders,
  });
  const sectorText = `${form?.find((f) => f.key === "sector")?.value ?? ""} ${valueOf("company.sector_inferred")?.quote ?? valueOf("company.sector_inferred")?.value ?? ""}`;
  await db.from("briefs").upsert({
    application_id: id,
    rec_public: rec.public.recommendation,
    rec_revealed: rec.revealed.recommendation,
    headline_lens: headline,
    lens_note: rec.lensNote,
    summary: summary.summary,
    flags: allFlags,
    gaps,
    inconsistencies,
    call_only_signals: summary.call_signals,
    scores: { public: { score: rec.public.score, reasons: rec.public.reasons }, revealed: { score: rec.revealed.score, reasons: rec.revealed.reasons } },
    research_mode: researchMode,
    aditya_on_call: /deep ?tech/i.test(sectorText),
    history: [...((brief?.history as unknown[]) ?? []), ...(brief?.summary && brief.rec_revealed ? [{ at: brief.created_at, summary: brief.summary, rec: brief.rec_revealed }] : [])],
  }, { onConflict: "application_id" });
  await db.from("applications").update({
    status: "brief_ready", last_step: "brief", brief_ready_at: new Date().toISOString(),
    status_reason: `${label(head.recommendation)} on the ${headline} lens`, short_circuit_flags: allFlags.map((f) => f.id), research_question: null,
  }).eq("id", id);
  await assignBlind(id);
  return { inconsistencies, flags };
}

export type CodeFlag = {
  id: string; label: string; severity: "Critical" | "High" | "Soft"; short_circuit: boolean; why: string;
  evidence: { quote: string; source: string; ref: string }[]; with?: string;
  /** A hard fact, such as lending without a licence. The judge's rating never withdraws it. */
  firm?: boolean;
};

function dedupe(flags: CodeFlag[]): CodeFlag[] {
  const seen = new Set<string>();
  return flags.filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)));
}

/** Flags that come from the evidence, in code (PRD Step 9 and the gold set). */
export function codeFlags(rows: Pick<Row, "track" | "field" | "status" | "quote" | "source_ref" | "vague" | "note" | "value">[], form: { key: string; value: string }[] | null): CodeFlag[] {
  const flags: CodeFlag[] = [];
  const t1 = rows.filter((r) => r.track === "1");
  const quoteOf = (r: (typeof t1)[number]) => ({ quote: r.quote ?? "", source: r.source_ref?.split(":")[0] ?? "", ref: r.source_ref?.startsWith("deck:") ? `Deck, page ${r.source_ref.slice(6)}` : `Form: ${r.source_ref?.slice(5) ?? ""}` });

  // The sector chosen against what the product really is.
  const selected = (form?.find((f) => f.key === "sector")?.value ?? "").toLowerCase();
  const b2b = t1.find((r) => r.field === "company.sells_to_businesses" && r.status === "yes");
  if (selected.includes("consumer") && b2b) {
    const pays = t1.find((r) => r.field === "company.who_pays" && r.quote);
    flags.push({ id: "sector_label_mismatch", label: "Sector label does not fit", severity: "High", short_circuit: false,
      why: `The founder chose "${form?.find((f) => f.key === "sector")?.value}", but businesses pay for it, so it sells to businesses, not consumers.`,
      evidence: [b2b, pays].filter(Boolean).map((r) => quoteOf(r!)) });
  }

  // A vague deck: claims with no number and almost no numbers anywhere in the deck.
  const deckRows = t1.filter((r) => r.source_ref?.startsWith("deck:"));
  const vague = deckRows.filter((r) => r.vague);
  const numbers = deckRows.filter((r) => r.status === "number" && r.value !== null && !r.vague);
  if (vague.length >= 2 && numbers.length < 3) {
    flags.push({ id: "vague_deck", label: "Vague deck", severity: "High", short_circuit: false,
      why: "The deck makes claims with no numbers or base. They can never support a rating above Weak.", evidence: vague.slice(0, 3).map(quoteOf) });
  }

  // Regulatory exposure: depends on friendly rules, or takes credit risk without a licence.
  // Only rules, licences and partners count. "Depends on GST portal data formats" is a technical risk, not a regulatory one.
  const dep = t1.find((r) => r.field === "risk.depends_on_rule_change" && r.status === "yes" && /rule|regulat|licen|RBI|SEBI|NBFC|bank|card network|policy|law|permission|compliance|aggregator|partner/i.test(r.quote ?? ""));
  const lending = t1.find((r) => r.field === "risk.lending_funded_by" && /first-loss|not registered|own (savings|balance sheet)|founder'?s? savings|agreement in principle/i.test(r.quote ?? ""));
  if (dep || lending) {
    flags.push({ id: "regulatory_exposure", label: "Regulatory exposure", severity: "High", short_circuit: false, firm: Boolean(lending),
      why: lending ? "The company carries credit risk without its own lending licence, or its lending partner is not yet firm." : "The model works only while rules or partners stay friendly.",
      evidence: [dep, lending].filter(Boolean).map((r) => quoteOf(r!)) });
  }

  const inj = rows.find((r) => r.field === "injection");
  if (inj) flags.push({ id: "injection_attempt", label: "Text aimed at the AI", severity: "High", short_circuit: false, why: inj.note ?? "This document contains text aimed at the AI. It was ignored.", evidence: [] });
  return flags;
}

export { fieldName };

/**
 * Riya asked for more research on a named question (Gate 1). One more search, within the 12-fetch cap.
 * New facts join Track 2, then compare and scoring run again from that point.
 */
export async function researchQuestion(id: string): Promise<void> {
  const db = createAdminClient();
  const { data: app } = await db.from("applications").select("*").eq("id", id).single();
  const { count } = await db.from("research_fetches").select("id", { count: "exact", head: true }).eq("application_id", id);
  const question = (app?.research_question ?? "").trim();
  const done = async () => { await db.from("applications").update({ last_step: "researched" }).eq("id", id); };
  if (!app || !question || (count ?? 0) >= MAX_FETCHES) {
    if (app && (count ?? 0) >= MAX_FETCHES) {
      await db.from("research_fetches").insert({ application_id: id, check_id: "question", attempt: 1, query_or_url: question, outcome: "failed", error: "fetch limit of 12 reached", mode: "off" });
    }
    return done();
  }
  const [{ data: founderRows }, { data: docs }, { data: settings }] = await Promise.all([
    db.from("founders").select("founder_key, name, email, phone, linkedin_url, role, bio").eq("application_id", id).order("founder_key"),
    db.from("documents").select("kind, redacted").eq("application_id", id),
    db.from("settings").select("key, value"),
  ]);
  const founders: FounderRef[] = (founderRows ?? []).map((f) => ({ id: f.founder_key, name: f.name, linkedin: f.linkedin_url, email: f.email, phone: f.phone }));
  const form = (docs?.find((d) => d.kind === "form")?.redacted as { fields?: { key: string; value: string }[] } | null)?.fields ?? null;
  const mode = (process.env.RESEARCH_MODE ?? settings?.find((s) => s.key === "research_mode")?.value ?? "replay") as ResearchMode;
  const client = new ResearchClient(mode, normName(app.company_name));
  const match: MatchFacts = {
    name: app.company_name,
    city: form?.find((f) => f.key === "location")?.value ?? null,
    product: form?.find((f) => f.key === "one_line")?.value ?? app.company_name,
    sector: form?.find((f) => f.key === "sector")?.value ?? null,
    founders: (founderRows ?? []).map((f) => ({ id: f.founder_key, summary: `${f.role ?? "founder"}. ${f.bio ?? ""}`.trim() })),
  };
  const query = `${app.company_name} ${question}`;
  const res = await client.search("news", query);
  const now = new Date().toISOString();
  const { count: webCount } = await db.from("evidence").select("id", { count: "exact", head: true }).eq("application_id", id).eq("track", "2");
  let n = webCount ?? 0;
  if (!res.ok || res.results.length === 0) {
    await db.from("research_fetches").insert({ application_id: id, check_id: "question", attempt: 1, query_or_url: query, outcome: res.ok ? "empty" : res.outcome, error: res.ok ? null : res.reason, mode });
    return done();
  }
  for (const r of res.results.slice(0, 2)) {
    const read = await readResult({ applicationId: id, check: "news", result: r, match, founders });
    const outcome = read.injection ? "injection" : !read.same ? "wrong_match" : read.facts.length ? "filled" : "empty";
    await db.from("research_fetches").insert({ application_id: id, check_id: "question", attempt: 1, query_or_url: r.url, outcome, error: outcome === "wrong_match" ? read.mismatch.slice(0, 2).join("; ") : null, mode });
    if (outcome !== "filled") continue;
    await db.from("evidence").insert(read.facts.map((f) => ({
      id: `${id.slice(0, 8)}_w${++n}`, application_id: id, field: f.field ?? "web.question", status: "text", value: f.statement,
      quote: f.quote, source_type: "web", source_ref: r.url, url: r.url, fetched_at: now, track: "2", check_id: "question", strength: "found_by_us",
    })));
  }
  return done();
}
