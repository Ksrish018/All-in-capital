// How a model request leaves the system (PRD 15.2, Section 24 gap G3).
// Two routes: Cloudflare AI Gateway (Gemini's own format) and Portkey (the OpenAI chat format, Portkey turns it into Gemini).
// Both get the same backoff: wait 1 s, 2 s, 4 s with a little jitter, up to 4 tries, on "too busy" and server errors.
// Pure apart from fetch, so the retry rules are tested without a network.

export type ModelRequest = {
  model: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxOutputTokens: number;
  timeoutMs: number;
  thinking?: "minimal" | "low" | "medium" | "high";
  /** 0 for judging and reading. A little more for writing, which can loop at 0. */
  temperature?: number;
  meta: { applicationId: string | null; callType: string };
};

export type ModelReply = { text: string; inTok: number; outTok: number; attempts: number; route: Route };

export type Route = "cloudflare" | "portkey";

/** The provider was busy or down after every retry. The work waits in the queue, it is never dropped. */
export class ModelBusy extends Error {}

/** A request the provider refused for a reason a retry cannot fix (bad key, bad request). */
export class ModelRefused extends Error {}

export const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
export const MAX_ATTEMPTS = 4;

/** 1 s, 2 s, 4 s, each with up to 25 percent random wobble so twenty callers do not retry in step. */
export function backoffMs(attempt: number, random = Math.random): number {
  const base = 1000 * 2 ** (attempt - 1);
  return Math.round(base * (1 + 0.25 * random()));
}

export function chooseRoute(env: Record<string, string | undefined> = process.env): Route {
  return env.AI_ROUTE === "portkey" && env.PORTKEY_API_KEY ? "portkey" : "cloudflare";
}

/** Gemini schemas use upper-case types. The OpenAI format wants lower case. */
export function toOpenAiSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(toOpenAiSchema);
  if (!s || typeof s !== "object") return s;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) out[k] = k === "type" && typeof v === "string" ? v.toLowerCase() : toOpenAiSchema(v);
  return out;
}

type Built = { url: string; init: RequestInit; read: (body: Record<string, unknown>) => { text: string; inTok: number; outTok: number } };

export function buildRequest(route: Route, r: ModelRequest, env: Record<string, string | undefined> = process.env): Built {
  if (route === "portkey") {
    return {
      url: "https://api.portkey.ai/v1/chat/completions",
      init: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-portkey-api-key": env.PORTKEY_API_KEY ?? "",
          "x-portkey-provider": "google",
          authorization: `Bearer ${env.GEMINI_API_KEY ?? ""}`,
          // Portkey's own retry is off: ours below is the single place the rule lives, on both routes.
          "x-portkey-metadata": JSON.stringify({ application_id: r.meta.applicationId ?? "none", call: r.meta.callType }),
        },
        body: JSON.stringify({
          model: r.model,
          temperature: r.temperature ?? 0,
          max_tokens: r.maxOutputTokens,
          messages: [
            { role: "system", content: r.system },
            { role: "user", content: r.user },
          ],
          response_format: { type: "json_schema", json_schema: { name: "reply", schema: toOpenAiSchema(r.schema) } },
          ...(r.thinking ? { reasoning_effort: r.thinking === "minimal" ? "low" : r.thinking } : {}),
        }),
      },
      read: (b) => {
        const choice = (b.choices as { message?: { content?: string } }[] | undefined)?.[0];
        const usage = (b.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number };
        return { text: choice?.message?.content ?? "", inTok: usage.prompt_tokens ?? 0, outTok: usage.completion_tokens ?? 0 };
      },
    };
  }
  const acct = env.CLOUDFLARE_ACCOUNT_ID;
  const gw = env.CLOUDFLARE_GATEWAY_ID;
  if (!acct || !gw) throw new ModelRefused("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_GATEWAY_ID must be set");
  return {
    url: `https://gateway.ai.cloudflare.com/v1/${acct}/${gw}/google-ai-studio/v1beta/models/${encodeURIComponent(r.model)}:generateContent`,
    init: {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY ?? "",
        "cf-aig-authorization": `Bearer ${env.CLOUDFLARE_AIG_TOKEN ?? ""}`,
        "cf-aig-metadata": JSON.stringify({ application_id: r.meta.applicationId ?? "none", call: r.meta.callType }),
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: r.system }] },
        contents: [{ role: "user", parts: [{ text: r.user }] }],
        generationConfig: {
          temperature: r.temperature ?? 0,
          maxOutputTokens: r.maxOutputTokens,
          responseMimeType: "application/json",
          responseSchema: r.schema,
          ...(r.thinking ? { thinkingConfig: { thinkingLevel: r.thinking } } : {}),
        },
      }),
    },
    read: (b) => {
      const usage = (b.usageMetadata ?? {}) as { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
      const parts = ((b.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined)?.[0]?.content?.parts ?? []);
      return {
        text: parts.map((p) => p.text ?? "").join(""),
        inTok: usage.promptTokenCount ?? 0,
        outTok: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
      };
    },
  };
}

/** Sends one request with backoff. Returns the reply, or throws ModelBusy (retry later) or ModelRefused (a person must look). */
export async function sendWithBackoff(
  r: ModelRequest,
  deps: { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; random?: () => number; env?: Record<string, string | undefined>; onAttempt?: (a: { attempt: number; status: number | "network"; ms: number }) => void } = {},
): Promise<ModelReply> {
  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((ok) => setTimeout(ok, ms)));
  const route = chooseRoute(deps.env);
  const built = buildRequest(route, r, deps.env);
  let last = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const started = Date.now();
    let status: number | "network" = "network";
    try {
      const res = await doFetch(built.url, { ...built.init, signal: AbortSignal.timeout(r.timeoutMs) });
      status = res.status;
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      deps.onAttempt?.({ attempt, status, ms: Date.now() - started });
      if (res.ok) return { ...built.read(body), attempts: attempt, route };
      const message = String((body.error as { message?: string } | undefined)?.message ?? "").slice(0, 200);
      last = `${route} returned ${res.status}${message ? `: ${message}` : ""}`;
      if (!RETRY_STATUSES.has(res.status)) throw new ModelRefused(last);
    } catch (e) {
      if (e instanceof ModelRefused) throw e;
      if (status === "network") {
        deps.onAttempt?.({ attempt, status, ms: Date.now() - started });
        last = `${route}: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    if (attempt < MAX_ATTEMPTS) await sleep(backoffMs(attempt, deps.random));
  }
  throw new ModelBusy(`The AI model was busy after ${MAX_ATTEMPTS} tries (${last}). The application waits in the queue and is tried again.`);
}
