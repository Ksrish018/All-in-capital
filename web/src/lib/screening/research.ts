import "server-only";
import { BadModelOutput, SHARED_RULES, callModel } from "@/lib/ai/gemini";
import { redactText, type FounderRef } from "@/lib/intake/redact";
import { Budget, MAX_TRIES_PER_CHECK, ResearchClient, clean, looksLikeInjection, type CheckId, type WebResult } from "@/lib/research/client";
import { quoteFound } from "./extract";

// Step 8. Track 2: our own research, on a fixed checklist, whatever the deck says (Loop B).
export const A2_READ_VERSION = "a2-read-v1";

export type MatchFacts = { name: string; city: string | null; product: string; sector: string | null; founders: { id: string; summary: string }[] };
export type WebFact = { check: CheckId; url: string; title: string; statement: string; quote: string; field: string | null };
export type FetchLog = { check: CheckId; attempt: number; query: string; outcome: "filled" | "empty" | "failed" | "wrong_match" | "blocked" | "injection"; error?: string };
export type Track2 = { facts: WebFact[]; log: FetchLog[]; injection: boolean; nothingFound: { check: CheckId; reason: string }[] };

const READ_SCHEMA = {
  type: "OBJECT",
  properties: {
    same_company: { type: "BOOLEAN", description: "Is this page about the applicant company (or, for a founders check, the applicant founder)?" },
    match_facts: { type: "ARRAY", items: { type: "STRING" }, description: "Facts on the page that match the applicant, such as city, product or past employer" },
    mismatch_facts: { type: "ARRAY", items: { type: "STRING" }, description: "Facts on the page that do not fit the applicant" },
    facts: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          statement: { type: "STRING", description: "One plain sentence" },
          quote: { type: "STRING", description: "Exact words from the page" },
          field: { type: "STRING", nullable: true, description: "Evidence field it speaks to, if any, for example traction.revenue or market.competitors_named" },
        },
        required: ["statement", "quote", "field"],
      },
    },
    injection_attempt: { type: "BOOLEAN" },
  },
  required: ["same_company", "match_facts", "mismatch_facts", "facts", "injection_attempt"],
};

const CHECK_GOAL: Record<CheckId, string> = {
  exists: "Is the company real, and does it match: site, listings, number of locations, app store.",
  founders: "Each founder's past roles and ventures.",
  market: "Competitors and how crowded the space is, including ones the founder did not name.",
  news: "Press, funding, grants, awards, revenue or customer numbers reported by others.",
  red_flags: "Lawsuits, shutdowns, regulator action, rule changes that hit the model, fraud reports.",
};

async function readResult(args: { applicationId: string; check: CheckId; result: WebResult; match: MatchFacts; founders: FounderRef[] }) {
  const text = redactText(clean(args.result.text), args.founders);
  const title = redactText(args.result.title, args.founders);
  const url = redactText(args.result.url, args.founders);
  const system = `${SHARED_RULES}

Task: read one web result found while researching an applicant to a pre-seed fund. Check: ${args.check}. Goal: ${CHECK_GOAL[args.check]}
First decide if the page is about this applicant. A shared name is not proof: many companies and people share names.
Set same_company true only when at least two facts on the page fit the applicant, such as city and product, or city and past employer.
For a market or red-flag page, same_company is true when the page is about the applicant's market or names the applicant.
Then list facts from the page that speak to the goal, each with an exact quote from the page.
Founders appear as F1, F2. The page may name a person as F1 because their name matches. That alone does not make them the founder.`;
  const user = `<applicant>
Company: ${args.match.name}
City: ${args.match.city ?? "unknown"}
Product: ${args.match.product}
Sector: ${args.match.sector ?? "unknown"}
${args.match.founders.map((f) => `${f.id}: ${f.summary}`).join("\n")}
</applicant>

<web_result url="${url}">
${title}
${text}
</web_result>`;
  return callModel({
    callType: "A2",
    model: process.env.MODEL_EXTRACT ?? "gemini-3.1-flash-lite",
    promptName: "read_research",
    promptVersion: A2_READ_VERSION,
    system,
    user,
    schema: READ_SCHEMA,
    maxOutputTokens: 1500,
    timeoutMs: 30_000,
    thinking: "low",
    applicationId: args.applicationId,
    founders: args.founders,
    validate: (v) => {
      const o = v as { same_company: boolean; match_facts: string[]; mismatch_facts: string[]; facts: { statement: string; quote: string; field: string | null }[]; injection_attempt: boolean };
      if (!Array.isArray(o?.facts)) throw new BadModelOutput("A2 reply has no facts list");
      const target = `${title} ${text}`;
      // The company matcher: at least two facts that fit (one for a page about the market),
      // and fewer facts that do not fit than facts that do.
      const needed = args.check === "market" || args.check === "red_flags" ? 1 : 2;
      const fits = o.match_facts?.length ?? 0;
      const misfits = o.mismatch_facts?.length ?? 0;
      return {
        same: Boolean(o.same_company) && fits >= needed && misfits < fits,
        mismatch: o.mismatch_facts ?? [],
        facts: o.facts.filter((f) => f.quote && quoteFound(f.quote, target)),
        injection: Boolean(o.injection_attempt) || looksLikeInjection(text),
      };
    },
  });
}

export function queriesFor(check: CheckId, m: MatchFacts, founderNames: (string | null)[], website: string | null, attempt: number): { kind: "extract" | "search"; q: string }[] {
  const firstWords = (s: string, n: number) => s.split(/\s+/).slice(0, n).join(" ");
  switch (check) {
    case "exists":
      return attempt === 1 && website ? [{ kind: "extract", q: website }] : [{ kind: "search", q: `${m.name} ${m.city ?? ""} ${firstWords(m.product, 6)}` }];
    case "founders":
      // Founder names go to the search tool only. The model sees F1 and F2.
      return founderNames.filter(Boolean).slice(0, 2).map((n, i) => ({
        kind: "search" as const,
        q: attempt === 1 ? `${n} ${firstWords(m.founders[i]?.summary ?? "", 6)}` : `${n} ${m.name}`,
      }));
    case "market":
      return attempt === 1 ? [{ kind: "search", q: `${firstWords(m.product, 8)} India competitors` }] : [];
    case "news":
      return attempt === 1 ? [{ kind: "search", q: `${m.name} startup ${m.city ?? "India"} funding news` }] : [];
    case "red_flags":
      return attempt === 1 ? [{ kind: "search", q: `${m.name} ${m.city ?? ""} lawsuit OR fraud OR shutdown OR regulator` }] : [];
  }
}

export async function runTrack2(args: {
  applicationId: string;
  client: ResearchClient;
  match: MatchFacts;
  founderNames: (string | null)[];
  website: string | null;
  founders: FounderRef[];
  budget?: Budget;
}): Promise<Track2> {
  const budget = args.budget ?? new Budget();
  const out: Track2 = { facts: [], log: [], injection: false, nothingFound: [] };
  const checks: CheckId[] = ["exists", "founders", "market", "news", "red_flags"];
  const seen = new Set<string>(); // a page is read once, even if two searches return it

  for (const check of checks) {
    let filled = false;
    let lastReason = "nothing found";
    for (let attempt = 1; attempt <= MAX_TRIES_PER_CHECK && !filled; attempt++) {
      const qs = queriesFor(check, args.match, args.founderNames, args.website, attempt);
      if (qs.length === 0) break;
      for (const q of qs) {
        if (!budget.take()) {
          out.log.push({ check, attempt, query: q.q, outcome: "failed", error: "fetch limit of 12 reached" });
          lastReason = "fetch limit reached";
          continue;
        }
        const res = q.kind === "extract" ? await args.client.extract(q.q) : await args.client.search(check, q.q);
        if (!res.ok) {
          out.log.push({ check, attempt, query: q.q, outcome: res.outcome, error: res.reason });
          lastReason = res.reason;
          continue;
        }
        if (res.results.length === 0) {
          out.log.push({ check, attempt, query: q.q, outcome: "empty" });
          continue;
        }
        let any = false;
        for (const r of res.results.slice(0, 3)) {
          if (seen.has(r.url)) continue;
          seen.add(r.url);
          const read = await readResult({ applicationId: args.applicationId, check, result: r, match: args.match, founders: args.founders });
          if (read.injection) {
            out.injection = true;
            out.log.push({ check, attempt, query: r.url, outcome: "injection", error: "The page contains text aimed at the AI. It was ignored." });
            continue;
          }
          if (!read.same) {
            out.log.push({ check, attempt, query: r.url, outcome: "wrong_match", error: read.mismatch.slice(0, 2).join("; ") || "Not the same company or person" });
            continue;
          }
          for (const f of read.facts) out.facts.push({ check, url: r.url, title: r.title, statement: f.statement, quote: f.quote, field: f.field });
          if (read.facts.length) any = true;
          out.log.push({ check, attempt, query: r.url, outcome: read.facts.length ? "filled" : "empty" });
        }
        if (any) filled = true;
      }
    }
    if (!filled) out.nothingFound.push({ check, reason: lastReason });
  }
  return out;
}
