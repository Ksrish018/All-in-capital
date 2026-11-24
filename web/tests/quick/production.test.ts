// M9 quick tests (PRD Section 24): retries with backoff, the Portkey route, the upload limit.
import { describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, ModelBusy, ModelRefused, backoffMs, buildRequest, chooseRoute, sendWithBackoff, toOpenAiSchema, type ModelRequest } from "@/lib/ai/route";
import { TEAM_MULTIPLIER, limitFor, visitorKey } from "@/lib/intake/limit";
import { GoogleError, teamRecipients } from "@/lib/google";
import { tag } from "../helpers";

const REQ: ModelRequest = {
  model: "gemini-test", system: "sys", user: "usr", schema: { type: "OBJECT", properties: { a: { type: "STRING" } }, required: ["a"] },
  maxOutputTokens: 100, timeoutMs: 5000, meta: { applicationId: null, callType: "A1" },
};
const ENV = { CLOUDFLARE_ACCOUNT_ID: "acct", CLOUDFLARE_GATEWAY_ID: "gw", GEMINI_API_KEY: "k" };
const gemini = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } });
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function fakeFetch(statuses: number[]) {
  const calls: string[] = [];
  let i = 0;
  const f = (async (url: string) => {
    calls.push(url);
    const s = statuses[Math.min(i++, statuses.length - 1)];
    return s === 0 ? Promise.reject(new Error("socket hang up")) : reply(s, s === 200 ? gemini('{"a":"x"}') : { error: { message: "busy" } });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("retries with backoff (G3)", () => {
  it(tag("High", "P1", "waits 1, 2 then 4 seconds, with at most 25 percent wobble"), () => {
    expect([1, 2, 3].map((a) => backoffMs(a, () => 0))).toEqual([1000, 2000, 4000]);
    expect(backoffMs(3, () => 1)).toBe(5000);
  });

  it(tag("Critical", "P2", "a 429 is retried and the call then succeeds"), async () => {
    const waits: number[] = [];
    const { f, calls } = fakeFetch([429, 429, 200]);
    const r = await sendWithBackoff(REQ, { fetch: f, sleep: async (ms) => void waits.push(ms), random: () => 0, env: ENV });
    expect(r.text).toBe('{"a":"x"}');
    expect(r.attempts).toBe(3);
    expect(calls).toHaveLength(3);
    expect(waits).toEqual([1000, 2000]);
  });

  it(tag("Critical", "P3", "after four busy replies it gives up with ModelBusy, so the work stays queued"), async () => {
    const { f, calls } = fakeFetch([503]);
    await expect(sendWithBackoff(REQ, { fetch: f, sleep: async () => {}, env: ENV })).rejects.toBeInstanceOf(ModelBusy);
    expect(calls).toHaveLength(MAX_ATTEMPTS);
  });

  it(tag("High", "P4", "a network failure is retried like a busy reply"), async () => {
    const { f } = fakeFetch([0, 200]);
    const r = await sendWithBackoff(REQ, { fetch: f, sleep: async () => {}, env: ENV });
    expect(r.attempts).toBe(2);
  });

  it(tag("High", "P5", "a refused request (bad key, bad request) is not retried"), async () => {
    const { f, calls } = fakeFetch([400]);
    await expect(sendWithBackoff(REQ, { fetch: f, sleep: async () => {}, env: ENV })).rejects.toBeInstanceOf(ModelRefused);
    expect(calls).toHaveLength(1);
  });
});

describe("the Portkey route (G3)", () => {
  it(tag("High", "P6", "Portkey is used only when switched on and its key is set"), () => {
    expect(chooseRoute({})).toBe("cloudflare");
    expect(chooseRoute({ AI_ROUTE: "portkey" })).toBe("cloudflare");
    expect(chooseRoute({ AI_ROUTE: "portkey", PORTKEY_API_KEY: "pk" })).toBe("portkey");
  });

  it(tag("High", "P7", "Portkey gets the chat format with the JSON schema in lower case"), () => {
    const b = buildRequest("portkey", REQ, { PORTKEY_API_KEY: "pk", GEMINI_API_KEY: "g" });
    expect(b.url).toBe("https://api.portkey.ai/v1/chat/completions");
    const body = JSON.parse(String(b.init.body));
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(["system", "user"]);
    expect(body.response_format.json_schema.schema).toEqual({ type: "object", properties: { a: { type: "string" } }, required: ["a"] });
    expect((b.init.headers as Record<string, string>)["x-portkey-provider"]).toBe("google");
    expect(b.read({ choices: [{ message: { content: "{}" } }], usage: { prompt_tokens: 3, completion_tokens: 2 } })).toEqual({ text: "{}", inTok: 3, outTok: 2 });
  });

  it(tag("Low", "P8", "schema conversion leaves enums and required lists alone"), () => {
    expect(toOpenAiSchema({ type: "STRING", enum: ["GO", "PASS"] })).toEqual({ type: "string", enum: ["GO", "PASS"] });
  });
});

describe("upload limit (G2)", () => {
  it(tag("High", "P9", "the limit is per visitor, and ten times higher behind the team password"), () => {
    expect(limitFor(30, false)).toBe(30);
    expect(limitFor(30, true)).toBe(30 * TEAM_MULTIPLIER);
    expect(limitFor("nonsense", false)).toBe(30);
  });

  it(tag("High", "P10", "the visitor is a keyed hash, never the raw address"), () => {
    const a = visitorKey(new Request("http://x/", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } }), "s");
    const b = visitorKey(new Request("http://x/", { headers: { "x-forwarded-for": "203.0.113.7" } }), "s");
    const c = visitorKey(new Request("http://x/", { headers: { "x-forwarded-for": "198.51.100.2" } }), "s");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toContain("203");
  });
});

describe("cost cap alert (G6)", () => {
  it(tag("Critical", "P11", "a team alert only goes to the team's own addresses, never a founder"), () => {
    expect(teamRecipients(["k@fund.example"], ["k@fund.example", "r@fund.example", null])).toEqual(["k@fund.example"]);
    expect(() => teamRecipients(["founder@startup.example"], ["k@fund.example"])).toThrow(GoogleError);
  });
});
