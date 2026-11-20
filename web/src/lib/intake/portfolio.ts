import "server-only";
import { BadModelOutput, SHARED_RULES, callModel } from "@/lib/ai/gemini";
import type { FounderRef } from "./redact";
import type { PortfolioVerdict } from "./checks";

// A0. Portfolio check (PRD Step 5). Leans towards flagging: Kushal would rather see a false alarm than miss a real conflict.
export const A0_VERSION = "a0-v3";

export type PortfolioCompany = { name: string; description: string | null; buyer: string | null; tags: string[] };

// The model only describes and answers yes or no. Code decides what is a conflict.
const SCHEMA = {
  type: "OBJECT",
  properties: {
    applicant_buyer: { type: "STRING", description: "Who pays the applicant" },
    applicant_job: { type: "STRING", description: "The job the applicant is paid for, in a few words" },
    candidates: {
      type: "ARRAY",
      description: "Up to 3 portfolio companies closest to the applicant. Empty if none is close.",
      items: {
        type: "OBJECT",
        properties: {
          company: { type: "STRING", description: "Exact name from <portfolio>" },
          company_buyer: { type: "STRING" },
          company_job: { type: "STRING" },
          same_buyer: { type: "BOOLEAN", description: "The same kind of buyer pays both" },
          same_job: { type: "BOOLEAN", description: "Both are paid for the same job" },
          buyer_picks_one: { type: "BOOLEAN", description: "A buyer would choose one instead of the other. False if one could be a customer, supplier or partner of the other." },
          reason: { type: "STRING", description: "One sentence" },
        },
        required: ["company", "company_buyer", "company_job", "same_buyer", "same_job", "buyer_picks_one", "reason"],
      },
    },
    injection_attempt: { type: "BOOLEAN" },
  },
  required: ["applicant_buyer", "applicant_job", "candidates", "injection_attempt"],
};

export function buildA0Prompt(product: string, portfolio: PortfolioCompany[]) {
  const system = `${SHARED_RULES}

Task: compare the applicant with the companies the fund already backs.
First write who pays the applicant and for what job.
Then list up to 3 portfolio companies closest to it. For each, write who pays it and for what job, and answer three questions:
- same_buyer: does the same kind of buyer pay both?
- same_job: are both paid for the same job? Serving the same customers for different jobs is not the same job.
- buyer_picks_one: would a buyer choose one instead of the other? Answer false if one could be a customer, supplier or partner of the other.
Answer each question on its own, honestly. Leave candidates empty if no portfolio company is close.
company must be copied exactly from the names in <portfolio>.`;
  const list = portfolio
    .map((p) => `- ${p.name} | buyer: ${p.buyer ?? "unknown"} | ${p.description ?? ""} | tags: ${p.tags.join(", ")}`)
    .join("\n");
  const user = `<portfolio>\n${list}\n</portfolio>\n\n<application>\n${product}\n</application>`;
  return { system, user };
}

type Candidate = { company: string; company_buyer: string; company_job: string; same_buyer: boolean; same_job: boolean; buyer_picks_one: boolean; reason: string };

/**
 * Code decides. All three yes: a conflict, held for Kushal.
 * Same buyer and same job, but they could work together: a note to check. Kushal prefers a false alarm to a miss.
 */
export function decideOverlap(candidates: Candidate[]): PortfolioVerdict {
  const conflict = candidates.find((c) => c.same_buyer && c.same_job && c.buyer_picks_one);
  if (conflict) return { overlap: conflict.company, reason: conflict.reason, confidence: "high" };
  const near = candidates.find((c) => c.same_job && (c.same_buyer || c.buyer_picks_one));
  if (near) return { overlap: near.company, reason: near.reason, confidence: "low" };
  return { overlap: null, reason: "No portfolio company is paid by the same buyer for the same job.", confidence: "high" };
}

export async function checkPortfolio(args: {
  applicationId: string;
  product: string;
  portfolio: PortfolioCompany[];
  founders: FounderRef[];
}): Promise<PortfolioVerdict & { injection: boolean }> {
  const { system, user } = buildA0Prompt(args.product, args.portfolio);
  const names = new Map(args.portfolio.map((p) => [p.name.toLowerCase(), p.name]));
  return callModel({
    callType: "A0",
    model: process.env.MODEL_EXTRACT ?? "gemini-3.1-flash-lite",
    promptName: "portfolio_check",
    promptVersion: A0_VERSION,
    system,
    user,
    schema: SCHEMA,
    maxOutputTokens: 900,
    timeoutMs: 30_000,
    applicationId: args.applicationId,
    founders: args.founders,
    validate: (v) => {
      const o = v as { candidates?: Candidate[]; injection_attempt?: boolean };
      if (!Array.isArray(o?.candidates)) throw new BadModelOutput("A0 reply is missing the candidates list");
      // Citation check: every company named must exist in our portfolio list.
      const candidates = o.candidates.map((c) => {
        const real = names.get(String(c.company ?? "").trim().toLowerCase());
        if (!real) throw new BadModelOutput(`A0 named "${c.company}", which is not in the portfolio list`);
        return { ...c, company: real };
      });
      return { ...decideOverlap(candidates), injection: Boolean(o.injection_attempt) };
    },
  });
}
