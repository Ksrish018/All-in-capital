import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, tag } from "../helpers";

// Files git tracks. The repository is public, so nothing secret may be in them.
const tracked = execSync("git ls-files", { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);

const SECRET_PATTERNS: [string, RegExp][] = [
  ["Gemini key", /AQ\.[A-Za-z0-9_-]{30,}/],
  ["Google API key", /AIza[0-9A-Za-z_-]{30,}/],
  ["Cloudflare gateway token", /cfut_[A-Za-z0-9]{20,}/],
  ["Langfuse secret key", /sk-lf-[0-9a-f-]{20,}/],
  ["Tavily key", /tvly-[A-Za-z0-9_-]{16,}/],
  ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]{16,}/],
  ["Google client secret", /GOCSPX-[A-Za-z0-9_-]{16,}/],
  ["Google refresh token", /1\/\/0[A-Za-z0-9_-]{30,}/],
];

describe("repository safety", () => {
  // Checking the tester (PRD 19.4): the scanner must catch a fake key of every kind.
  it(tag("High", "S0", "the secret scanner catches fake keys"), () => {
    const fakes: Record<string, string> = {
      "Gemini key": "AQ." + "x".repeat(40),
      "Google API key": "AIza" + "x".repeat(35),
      "Cloudflare gateway token": "cfut_" + "x".repeat(40),
      "Langfuse secret key": "sk-lf-" + "0".repeat(30),
      "Tavily key": "tvly-" + "x".repeat(20),
      "Supabase secret key": "sb_secret_" + "x".repeat(20),
      "Google client secret": "GOCSPX-" + "x".repeat(20),
      "Google refresh token": "1//0" + "x".repeat(40),
    };
    for (const [name, re] of SECRET_PATTERNS) expect(re.test(fakes[name]), name).toBe(true);
  });

  it(tag("Critical", "S1", "no secrets in tracked files"), () => {
    const hits: string[] = [];
    for (const f of tracked) {
      if (/\.(png|jpg|ico|woff2?|lock)$/.test(f)) continue;
      const text = fs.readFileSync(path.join(ROOT, f), "utf8");
      for (const [name, re] of SECRET_PATTERNS) if (re.test(text)) hits.push(`${name} in ${f}`);
    }
    expect(hits).toEqual([]);
  });

  it(tag("Critical", "S2", ".env is never tracked"), () => {
    expect(tracked.filter((f) => /(^|\/)\.env($|\.local)/.test(f))).toEqual([]);
  });

  it(tag("High", "S3", "course PDFs are never tracked (public repository)"), () => {
    expect(tracked.filter((f) => f.toLowerCase().endsWith(".pdf"))).toEqual([]);
  });

  it(tag("High", "S4", ".env.example lists every key with an empty value for secrets"), () => {
    const example = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
    for (const key of [
      "GEMINI_API_KEY", "CLOUDFLARE_AIG_TOKEN", "LANGFUSE_SECRET_KEY", "TAVILY_API_KEY",
      "SUPABASE_SECRET_KEY", "SUPABASE_DB_PASSWORD", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN",
    ]) {
      expect(example).toMatch(new RegExp(`^${key}=$`, "m"));
    }
  });
});
