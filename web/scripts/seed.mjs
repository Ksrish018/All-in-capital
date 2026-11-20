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
await c.end();
