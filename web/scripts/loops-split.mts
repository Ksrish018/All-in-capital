// PRD 24.8 steps 1 and 2: clean the Seed data 2 exports and seal the test sets. Run once.
// Writes evals/loops/split.json with row IDs, counts and seals only (no names, no email text).
// Usage: npm run loops:split            (refuses to change an existing seal)
//        npm run loops:split -- --reseal (only if the cleaning rules change, and say why in the commit)
import fs from "node:fs";
import path from "node:path";
import { cleanEmails, loadExports, seal, splitEmails, splitScreens, type Cleaning } from "../src/lib/loops/data";
import { threeChecks } from "../src/lib/outreach/checks";

const root = path.resolve(import.meta.dirname, "..", "..");
const out = path.join(root, "evals", "loops", "split.json");
const data = loadExports(root);
if (!data) { console.error("Seed data 2 is not on this machine. Nothing to split."); process.exit(1); }
if (fs.existsSync(out) && !process.argv.includes("--reseal")) { console.error("The test sets are already sealed (evals/loops/split.json). Pass --reseal only if the cleaning rules changed."); process.exit(1); }

const cleaning = JSON.parse(fs.readFileSync(path.join(root, "evals", "loops", "cleaning.json"), "utf8")) as Cleaning;
const { kept, dropped } = cleanEmails(data.emails, cleaning);
const emailSplit = splitEmails(kept, 1 / 3);
const screens = data.screens.filter((r) => !cleaning.screening.drop.some((d) => d.row_id === r.row_id));
const screenSplit = splitScreens(screens, 0.3);
const count = (ids: string[]) => ids.reduce((m, id) => { const t = kept.find((r) => r.row_id === id)!.founder_type; return { ...m, [t]: (m[t] ?? 0) + 1 }; }, {} as Record<string, number>);

const result = {
  note: "PRD 24.8. Test rows are never read while writing prompts or rules. The seal is a SHA-256 over the test rows' full content; eval:loops refuses to run if it does not match.",
  sealed_at: new Date().toISOString().slice(0, 10),
  email: { rows_in_export: data.emails.length, dropped, clean: kept.length, test: emailSplit.test, train: emailSplit.train, test_by_type: count(emailSplit.test), train_by_type: count(emailSplit.train), seal: seal(kept, emailSplit.test) },
  screening: { rows_in_export: data.screens.length, clean: screens.length, rule: "the latest 30 percent by date", test: screenSplit.test, train: screenSplit.train, seal: seal(screens, screenSplit.test) },
};
fs.writeFileSync(out, JSON.stringify(result, null, 2) + "\n");

const pass = (ids: string[], col: "system_draft" | "riya_final_email") => kept.filter((r) => ids.includes(r.row_id)).filter((r) => threeChecks(r[col]).all).length;
const all = kept.map((r) => r.row_id);
console.log(`Emails: ${data.emails.length} in export, ${dropped.length} dropped (${dropped.map((d) => d.row_id).join(", ")}), ${kept.length} clean.`);
console.log(`  test ${emailSplit.test.length} ${JSON.stringify(count(emailSplit.test))}, train ${emailSplit.train.length} ${JSON.stringify(count(emailSplit.train))}`);
console.log(`  three checks, old drafts: all ${pass(all, "system_draft")}/${all.length}, test ${pass(emailSplit.test, "system_draft")}/${emailSplit.test.length}`);
console.log(`  three checks, Riya sent:  all ${pass(all, "riya_final_email")}/${all.length}, test ${pass(emailSplit.test, "riya_final_email")}/${emailSplit.test.length}`);
console.log(`Screening: ${screens.length} rows, test = latest ${screenSplit.test.length}, train ${screenSplit.train.length}.`);
console.log(`Sealed in ${path.relative(root, out)}.`);
