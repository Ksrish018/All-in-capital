import { z } from "zod";

/** Criterion IDs C1 to C11 (PRD Section 7.2). */
export const CRITERIA = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11"] as const;
export type CriterionId = (typeof CRITERIA)[number];

const weights = z
  .object(Object.fromEntries(CRITERIA.map((c) => [c, z.number().min(0).max(1)])) as Record<CriterionId, z.ZodNumber>)
  .and(z.object({ _reading: z.string() }));

export const ThesisCardSchema = z.object({
  version: z.number().int().positive(),
  status: z.enum(["draft", "approved", "retired"]),
  criteria: z
    .array(
      z.object({
        id: z.enum(CRITERIA),
        name: z.string().min(1),
        meaning: z.string().min(1),
        rate_4: z.string().min(1),
        rate_0: z.string().min(1),
        sources: z.array(z.string()).min(1),
        evidence_fields: z.array(z.string()).min(1),
        deal_breaker: z.boolean(),
      }),
    )
    .length(11),
  weights_public: weights,
  weights_revealed: weights,
  thresholds: z.object({
    go_min: z.number(),
    pass_max: z.number(),
    max_missing_for_go: z.number().int().min(0),
    /** v2: a PASS from the score alone needs a criterion that fails on evidence. Otherwise a person decides. */
    pass_needs_failure: z.boolean().optional(),
  }),
  hard_flags: z.array(z.object({ id: z.string(), when: z.string(), effect: z.string(), note: z.string() })),
  partner_rules: z.array(z.string()),
  public_register: z.object({
    findings: z.array(z.object({ topic: z.string(), says: z.string(), sources: z.array(z.string()) })),
    gaps: z.array(z.object({ item: z.string(), status: z.string(), cost: z.string() })),
    sources: z.record(z.string(), z.string()),
  }),
});

export type ThesisCard = z.infer<typeof ThesisCardSchema>;
export type Lens = "public" | "revealed";

export function lensWeights(card: ThesisCard, lens: Lens): Record<CriterionId, number> {
  const w = lens === "public" ? card.weights_public : card.weights_revealed;
  return Object.fromEntries(CRITERIA.map((c) => [c, w[c]])) as Record<CriterionId, number>;
}
