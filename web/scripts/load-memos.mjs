// Splits the 12 deal memos into short tagged passages and stores them in memo_passages (PRD step S3).
// The memo text comes from the local PDF, which is kept out of the public repository.
// Tags come from seed/fund/memo_tags.json. Usage: npm run db:memos
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import nextEnv from "@next/env";
import { extractText, getDocumentProxy } from "unpdf";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
nextEnv.loadEnvConfig(root);

const pdfPath = path.join(root, "Decks", "MESA_T2_Case 03_Deal Memos.pdf");
if (!fs.existsSync(pdfPath)) {
  console.log(`Memo PDF not found at ${pdfPath}. Skipping. (It is kept local and is not in the repository.)`);
  process.exit(0);
}

const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(pdfPath)));
const { text } = await extractText(pdf, { mergePages: true });
const clean = text.replace(/\s+/g, " ").trim();

const tags = JSON.parse(fs.readFileSync(path.join(root, "seed", "fund", "memo_tags.json"), "utf8")).memos;
const SECTIONS = [
  ["what", /What it does\./],
  ["founder", /Founder assessment\./],
  ["risks", /Risks and open questions\./],
  ["why", /Why we (?:invested|passed)\./],
];

const passages = [];
for (const memo of tags) {
  const start = clean.search(new RegExp(`Memo ${memo.n}:`));
  const next = tags.find((m) => m.n === memo.n + 1);
  const end = next ? clean.search(new RegExp(`Memo ${next.n}:`)) : clean.length;
  if (start < 0 || end < 0) throw new Error(`Could not find memo ${memo.n} (${memo.company}) in the PDF`);
  const body = clean.slice(start, end);

  const marks = SECTIONS.map(([key, re]) => [key, body.search(re)]);
  for (const [key, at] of marks) if (at < 0) throw new Error(`Memo ${memo.n}: section "${key}" not found`);
  for (let i = 0; i < marks.length; i++) {
    const [key, at] = marks[i];
    const until = i + 1 < marks.length ? marks[i + 1][1] : body.length;
    const passage = body.slice(at, until).trim();
    passages.push({
      id: `memo_${memo.id}_${key}`,
      memo_n: memo.n,
      section: key,
      company: memo.company,
      decision: memo.decision,
      sector: memo.sector,
      criteria: memo.tags[key],
      split: memo.split,
      text: passage,
    });
  }
}

const ref = new URL(process.env.SUPABASE_URL).hostname.split(".")[0];
const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST,
  port: 5432,
  user: `postgres.${ref}`,
  password: process.env.SUPABASE_DB_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await c.connect();
for (const p of passages) {
  await c.query(
    `insert into public.memo_passages (id, memo_n, section, company, decision, sector, criteria, split, text)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (id) do update set memo_n = excluded.memo_n, section = excluded.section, company = excluded.company,
       decision = excluded.decision, sector = excluded.sector, criteria = excluded.criteria,
       split = excluded.split, text = excluded.text`,
    [p.id, p.memo_n, p.section, p.company, p.decision, p.sector, p.criteria, p.split, p.text],
  );
}
await c.end();

const words = passages.map((p) => p.text.split(" ").length);
console.log(`memo passages: ${passages.length} (${Math.min(...words)} to ${Math.max(...words)} words each)`);
console.log(`build set: ${passages.filter((p) => p.split === "build").length}, test set: ${passages.filter((p) => p.split === "test").length}`);
