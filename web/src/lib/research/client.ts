import "server-only";
import fs from "node:fs";
import path from "node:path";

// The research client (PRD Step 8 and 19.2a).
// replay: returns recorded results from evals/fixtures, so tests are repeatable and free.
// live: calls Tavily with the blocked-site list on every search.

export type ResearchMode = "replay" | "live" | "off";
export type CheckId = "exists" | "founders" | "market" | "news" | "red_flags";
export type WebResult = { url: string; title: string; text: string };
export type FetchOutcome = { ok: true; results: WebResult[] } | { ok: false; reason: string; outcome: "failed" | "blocked" };

/** Never searched or fetched: logins, social sites and sellers of contact data (PRD 8.6). */
export const BLOCKED_DOMAINS = [
  "linkedin.com", "instagram.com", "facebook.com", "rocketreach.co", "zoominfo.com",
  "apollo.io", "contactout.com", "signalhire.com", "leadiq.com", "lusha.com",
];

export const MAX_FETCHES = 12;
export const MAX_TRIES_PER_CHECK = 2;

const host = (u: string) => {
  try {
    return new URL(u.startsWith("http") ? u : `https://${u}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
export const isBlocked = (u: string) => BLOCKED_DOMAINS.some((d) => host(u) === d || host(u).endsWith(`.${d}`));
/** Reserved test domains never resolve. The case applicants all use them. */
export const isPlaceholder = (u: string) => /\.(example|test|invalid|localhost)$/i.test(host(u));

type Synthetic = { applicants: Record<string, { pages: { check: string; url: string; title: string; snippet: string }[] }>; injection_fixture: { url: string; title: string; snippet: string } };
let synthetic: Synthetic | null = null;
function fixtures(): Synthetic {
  if (!synthetic) {
    const p = path.resolve(process.cwd(), "..", "evals", "fixtures", "research", "applicants_synthetic.json");
    synthetic = fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf8")) as Synthetic) : { applicants: {}, injection_fixture: { url: "", title: "", snippet: "" } };
  }
  return synthetic;
}

const CHECK_KEY: Record<CheckId, string> = { exists: "exists", founders: "founders", market: "market", news: "news", red_flags: "red_flags" };

/** A budget shared by every fetch for one application. The thirteenth never runs. */
export class Budget {
  used = 0;
  constructor(readonly max = MAX_FETCHES) {}
  take(): boolean {
    if (this.used >= this.max) return false;
    this.used++;
    return true;
  }
}

export class ResearchClient {
  constructor(readonly mode: ResearchMode, readonly companyKey: string, readonly withInjection = false) {}

  async extract(url: string): Promise<FetchOutcome> {
    if (isBlocked(url)) return { ok: false, reason: "not allowed: this site is on the blocked list", outcome: "blocked" };
    if (isPlaceholder(url)) return { ok: false, reason: "site could not be reached", outcome: "failed" };
    if (this.mode !== "live") return { ok: false, reason: "site could not be reached (replay mode has no recording of it)", outcome: "failed" };
    try {
      const res = await fetch("https://api.tavily.com/extract", {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
        headers: { "content-type": "application/json", authorization: `Bearer ${process.env.TAVILY_API_KEY ?? ""}` },
        body: JSON.stringify({ urls: [url.startsWith("http") ? url : `https://${url}`] }),
      });
      const body = await res.json();
      const r = body?.results?.[0];
      if (!res.ok || !r?.raw_content) return { ok: false, reason: "site could not be reached", outcome: "failed" };
      return { ok: true, results: [{ url: r.url, title: r.url, text: String(r.raw_content) }] };
    } catch {
      return { ok: false, reason: "site could not be reached", outcome: "failed" };
    }
  }

  async search(check: CheckId, query: string): Promise<FetchOutcome> {
    if (this.mode === "replay") {
      const pages = fixtures().applicants[this.companyKey]?.pages.filter((p) => p.check === CHECK_KEY[check]) ?? [];
      const results = pages.map((p) => ({ url: p.url, title: p.title, text: p.snippet }));
      if (this.withInjection && check === "news") {
        const inj = fixtures().injection_fixture;
        results.push({ url: inj.url, title: inj.title, text: inj.snippet });
      }
      return { ok: true, results };
    }
    if (this.mode === "off") return { ok: true, results: [] };
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
        headers: { "content-type": "application/json", authorization: `Bearer ${process.env.TAVILY_API_KEY ?? ""}` },
        body: JSON.stringify({ query, max_results: 3, search_depth: "basic", exclude_domains: BLOCKED_DOMAINS }),
      });
      const body = await res.json();
      if (!res.ok) return { ok: false, reason: `search failed (${res.status})`, outcome: "failed" };
      const results = (body?.results ?? [])
        .filter((r: { url: string }) => !isBlocked(r.url))
        .map((r: { url: string; title: string; content: string }) => ({ url: r.url, title: r.title, text: String(r.content ?? "").slice(0, 8000) }));
      return { ok: true, results };
    } catch {
      return { ok: false, reason: "search could not be reached", outcome: "failed" };
    }
  }
}

/** Cuts a page to about 2,000 tokens around the useful part (PRD Step 8). */
export function clean(text: string, maxChars = 8000): string {
  return text.replace(/\s+/g, " ").trim().slice(0, maxChars);
}

/** Text that tries to instruct the model. Caught in code as well as by the model. */
export function looksLikeInjection(text: string): boolean {
  return /ignore (all |any )?(previous|prior|earlier|your) (instructions|rules)|rate (this|the) company \d|you are now|system:/i.test(text);
}
