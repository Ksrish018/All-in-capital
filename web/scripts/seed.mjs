// Seeds reference data: the portfolio draft. (People are seeded by migration 0002.)
// Safe to run more than once. Usage: npm run db:seed
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import nextEnv from "@next/env";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
nextEnv.loadEnvConfig(root);
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

// Portfolio draft from seed/fund/portfolio.json.
const portfolio = JSON.parse(fs.readFileSync(path.join(root, "seed", "fund", "portfolio.json"), "utf8"));
for (const co of portfolio.companies) {
  await c.query(
    `insert into public.portfolio_companies (name, description, sector, buyer, tags, source)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (name) do update set description = excluded.description, sector = excluded.sector,
       buyer = excluded.buyer, tags = excluded.tags, source = excluded.source`,
    [co.name, co.description, co.sector, co.buyer, co.tags, co.source],
  );
}
console.log(`portfolio: ${portfolio.companies.length} companies`);

// Thesis Card drafts, one file per version (thesis_card_v1.json, thesis_card_v2.json, ...).
// Never overwrites a version that Kushal has approved.
const cardFiles = fs.readdirSync(path.join(root, "seed", "fund")).filter((f) => /^thesis_card_v\d+\.json$/.test(f)).sort();
for (const file of cardFiles) {
  const card = JSON.parse(fs.readFileSync(path.join(root, "seed", "fund", file), "utf8"));
  const existing = await c.query("select status from public.thesis_cards where version = $1", [card.version]);
  if (existing.rows[0] && existing.rows[0].status !== "draft") {
    console.log(`thesis card v${card.version}: already ${existing.rows[0].status}, left unchanged`);
    continue;
  }
  await c.query(
    `insert into public.thesis_cards
       (version, status, note, criteria, weights_public, weights_revealed, thresholds, hard_flags,
        partner_rules, rating_scale, public_register, public_thesis_sources)
     values ($1, 'draft', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     on conflict (version) do update set note = excluded.note, criteria = excluded.criteria,
       weights_public = excluded.weights_public, weights_revealed = excluded.weights_revealed,
       thresholds = excluded.thresholds, hard_flags = excluded.hard_flags, partner_rules = excluded.partner_rules,
       rating_scale = excluded.rating_scale, public_register = excluded.public_register,
       public_thesis_sources = excluded.public_thesis_sources`,
    [
      card.version, card.note, JSON.stringify(card.criteria), JSON.stringify(card.weights_public),
      JSON.stringify(card.weights_revealed), JSON.stringify(card.thresholds), JSON.stringify(card.hard_flags),
      JSON.stringify(card.partner_rules), JSON.stringify(card.rating_scale), JSON.stringify(card.public_register),
      JSON.stringify(card.public_register.sources),
    ],
  );
  console.log(`thesis card v${card.version}: draft saved`);
}
await c.end();
