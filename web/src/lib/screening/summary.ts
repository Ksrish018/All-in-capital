import "server-only";
import { BadModelOutput, SHARED_RULES, callModel } from "@/lib/ai/gemini";
import type { FounderRef } from "@/lib/intake/redact";

// Step 13. A4 writes the two-line summary and the signals only a call can test. Code builds everything else.
export const A4_VERSION = "a4-v1";

const SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING", description: "Two short lines for the partners, in plain words, no hype" },
    call_signals: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Up to three things only a call can test, each one plain sentence, for example 'Ask how they would rebuild the cohort sheet. Watch how they respond when pushed.'",
    },
    injection_attempt: { type: "BOOLEAN" },
  },
  required: ["summary", "call_signals", "injection_attempt"],
};

export async function writeSummary(args: {
  applicationId: string;
  company: string;
  oneLine: string;
  headline: string;
  lensNote: string | null;
  flags: string[];
  ratings: { id: string; name: string; rating: number; reason: string }[];
  gaps: string[];
  founders: FounderRef[];
}): Promise<{ summary: string; call_signals: string[] }> {
  const system = `${SHARED_RULES}

Task: write two short lines that tell a partner at a pre-seed fund what matters about this application, and up to three signals only a call can test.
Plain words. No hype. Do not repeat the recommendation word for word. Do not invent facts that are not in the input.
Pass on structure, not people: if the company is a poor fit, say what in the model does not fit, kindly.
Founders appear as F1, F2.`;
  const user = `<application>
Company: ${args.company}. ${args.oneLine}
Recommendation: ${args.headline}${args.lensNote ? `. ${args.lensNote}` : ""}
Flags: ${args.flags.join("; ") || "none"}
Ratings:
${args.ratings.map((r) => `${r.id} ${r.name}: ${r.rating} of 4. ${r.reason}`).join("\n")}
Could not find: ${args.gaps.join("; ") || "nothing"}
</application>`;
  return callModel({
    callType: "A4",
    model: process.env.MODEL_DRAFT ?? "gemini-3-flash-preview",
    promptName: "write_summary",
    promptVersion: A4_VERSION,
    system,
    user,
    schema: SCHEMA,
    maxOutputTokens: 1200,
    timeoutMs: 30_000,
    thinking: "low",
    applicationId: args.applicationId,
    founders: args.founders,
    validate: (v) => {
      const o = v as { summary: string; call_signals: string[] };
      if (typeof o?.summary !== "string" || !o.summary.trim()) throw new BadModelOutput("A4 gave no summary");
      return { summary: o.summary.trim(), call_signals: (o.call_signals ?? []).slice(0, 3) };
    },
  });
}
