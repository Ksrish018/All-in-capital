import "server-only";
import { BadModelOutput, SHARED_RULES, callModel } from "@/lib/ai/gemini";
import type { FounderRef } from "@/lib/intake/redact";
import type { Links, TextPair } from "./compare";

// A2 in Step 9: matches founder claims to what research found, and checks deck and form text that is worded differently.
export const A2_COMPARE_VERSION = "a2-compare-v1";

const SCHEMA = {
  type: "OBJECT",
  properties: {
    links: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          web_id: { type: "STRING" },
          claim_id: { type: "STRING", nullable: true },
          result: { type: "STRING", enum: ["confirmed", "conflict", "unrelated"] },
        },
        required: ["web_id", "claim_id", "result"],
      },
    },
    pairs: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { pair_id: { type: "STRING" }, agree: { type: "BOOLEAN" }, note: { type: "STRING" } },
        required: ["pair_id", "agree", "note"],
      },
    },
    injection_attempt: { type: "BOOLEAN" },
  },
  required: ["links", "pairs", "injection_attempt"],
};

export async function matchClaims(args: {
  applicationId: string;
  claims: { id: string; field: string; source: string; quote: string }[];
  web: { id: string; statement: string; quote: string; url: string }[];
  pairs: TextPair[];
  founders: FounderRef[];
}): Promise<Links> {
  if (args.web.length === 0 && args.pairs.length === 0) return { links: [], pairs: [] };
  const system = `${SHARED_RULES}

Task: line up what a founder claims with what independent research found, for a pre-seed fund.
For each web fact, find the founder claim it speaks to, if any:
- confirmed: the web fact says the same thing as the claim.
- conflict: the web fact says something different, for example a different number of locations, or competitors where the deck says there are none.
- unrelated: no claim is about the same thing. Use claim_id null.
For each pair, the form and the deck describe the same thing in different words. Say if they agree. Note the difference in one plain sentence.
A web fact can speak to more than one claim. If it agrees with one claim and disagrees with another, for example the deck and the form say different things, return one link for each.
Never decide who is right. Only say whether they match.`;
  const user = `<claims>
${args.claims.map((c) => `${c.id} | ${c.field} | ${c.source} | "${c.quote}"`).join("\n") || "(none)"}
</claims>
<web_facts>
${args.web.map((w) => `${w.id} | ${w.statement} | "${w.quote}" | ${w.url}`).join("\n") || "(none)"}
</web_facts>
<pairs>
${args.pairs.map((p) => `${p.id} | ${p.field} | form: "${p.form.quote}" | deck: "${p.deck.quote}"`).join("\n") || "(none)"}
</pairs>`;
  const claimIds = new Set(args.claims.map((c) => c.id));
  const webIds = new Set(args.web.map((w) => w.id));
  const pairIds = new Set(args.pairs.map((p) => p.id));
  return callModel({
    callType: "A2",
    model: process.env.MODEL_EXTRACT ?? "gemini-3.1-flash-lite",
    promptName: "compare_tracks",
    promptVersion: A2_COMPARE_VERSION,
    system,
    user,
    schema: SCHEMA,
    maxOutputTokens: 3000,
    timeoutMs: 45_000,
    thinking: "low",
    applicationId: args.applicationId,
    founders: args.founders,
    validate: (v) => {
      const o = v as Links;
      if (!Array.isArray(o?.links) || !Array.isArray(o?.pairs)) throw new BadModelOutput("A2 compare reply is incomplete");
      // Citation check: every id must exist in what we sent.
      for (const l of o.links) {
        if (!webIds.has(l.web_id) || (l.claim_id && !claimIds.has(l.claim_id))) throw new BadModelOutput(`A2 compare cited an id that does not exist (${l.web_id} or ${l.claim_id})`);
      }
      return { links: o.links, pairs: o.pairs.filter((p) => pairIds.has(p.pair_id)) };
    },
  });
}
