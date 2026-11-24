// PRD 24.8 step 5: what Riya changes, counted on the TRAINING rows only. The sealed test rows are never read here.
// Prints counts and patterns, never names or full emails.
import fs from "node:fs";
import path from "node:path";
import { cleanEmails, loadExports } from "../src/lib/loops/data";
import { PRAISE, bodyOf, editClass, threeChecks, voiceChecks } from "../src/lib/outreach/checks";

const root = path.resolve(import.meta.dirname, "..", "..");
const data = loadExports(root);
if (!data) process.exit(0);
const split = JSON.parse(fs.readFileSync(path.join(root, "evals", "loops", "split.json"), "utf8"));
const cleaning = JSON.parse(fs.readFileSync(path.join(root, "evals", "loops", "cleaning.json"), "utf8"));
const train = cleanEmails(data.emails, cleaning).kept.filter((r) => split.email.train.includes(r.row_id));
const changed = train.filter((r) => editClass(r.system_draft, r.riya_final_email) !== "kept");
const count: Record<string, number> = {};
const add = (k: string, yes: boolean) => { if (yes) count[k] = (count[k] ?? 0) + 1; };
const firstNumber = (t: string) => /[\d,.]+%?/.exec(bodyOf(t).split("\n")[0] ?? "")?.[0] ?? null;
for (const r of changed) {
  const d = r.system_draft, s = r.riya_final_email;
  const dv = voiceChecks(d, { deeptech: r.sector === "Deeptech" }), sv = voiceChecks(s, { deeptech: r.sector === "Deeptech" });
  add("praise removed", PRAISE.test(d) && !PRAISE.test(s));
  add("opener number swapped for another", !!firstNumber(d) && firstNumber(d) !== firstNumber(s));
  add("opener given a number (was praise or name)", !firstNumber(d) && !!firstNumber(s));
  add("fact framed as rare or unusual for its stage", !dv.factOpener && sv.factOpener);
  add("two Tuesday or Thursday slots added", !dv.twoSlots && sv.twoSlots);
  add("fund pitch cut", !dv.noPitch && sv.noPitch);
  add("sign-off changed to 'Riya / All In Capital'", !dv.signOff && sv.signOff);
  add("greeting changed to 'Hi {name},'", !dv.greeting && sv.greeting);
  add("Aditya line added for deeptech", r.sector === "Deeptech" && !/Aditya/.test(d) && /Aditya/.test(s));
  add("shortened by 20+ words", threeChecks(d).words - threeChecks(s).words >= 20);
  add("vague question replaced by a specific one", (d.match(/\?/g) ?? []).length !== (s.match(/\?/g) ?? []).length || !/how many|what share|how much|which|were those|do those|is that/i.test(d));
}
const opener = train.map((r) => (bodyOf(r.riya_final_email).split("\n")[0] ?? "").replace(/^[^a-z]*?(\d[\d,.]*%?)/i, "N").replace(/\b(pre-seed|seed)\b/gi, "{stage}"));
const shapes = opener.map((o) => /is (rare|unusual) for an? /i.test(o) ? "N ... is rare/unusual for a {stage} {category}" : "other").reduce((m, k) => ({ ...m, [k]: (m[k] ?? 0) + 1 }), {} as Record<string, number>);
const asks = train.map((r) => /(Could we do|Would 30 minutes|Do you have) 30 minutes|Would 30 minutes/.exec(r.riya_final_email)?.[0] ?? "other").reduce((m, k) => ({ ...m, [k]: (m[k] ?? 0) + 1 }), {} as Record<string, number>);
const questions = train.map((r) => /^(How many|What share|How much|Were those|Do those|Is that|Which|What)\b/m.exec(bodyOf(r.riya_final_email).split("\n")[1] ?? "")?.[1] ?? "other").reduce((m, k) => ({ ...m, [k]: (m[k] ?? 0) + 1 }), {} as Record<string, number>);
console.log(`Training rows ${train.length}, changed by Riya ${changed.length}.`);
console.log("Edit types, most common first:");
for (const [k, v] of Object.entries(count).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(2)}  ${k}`);
console.log("Opener shape in her sent emails:", shapes);
console.log("Ask wording:", asks);
console.log("Question starts:", questions);
const words = train.map((r) => threeChecks(r.riya_final_email).words).sort((a, b) => a - b);
console.log(`Body length in words: median ${words[Math.floor(words.length / 2)]}, max ${words.at(-1)}.`);
