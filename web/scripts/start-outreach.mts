// Starts outreach for applications Kushal signed off before outreach existed (or after a reset).
// Usage: npx tsx --conditions=react-server scripts/start-outreach.mts
import path from "node:path";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(path.resolve(import.meta.dirname, "..", ".."));
const { createAdminClient } = await import("../src/lib/supabase/server");
const { startOutreach } = await import("../src/lib/outreach/agent");
const db = createAdminClient();
const { data: apps } = await db.from("applications").select("id, company_name, status").in("status", ["signed_off_go", "signed_off_pass"]);
const { data: existing } = await db.from("outreach").select("application_id");
const have = new Set((existing ?? []).map((o) => o.application_id));
for (const a of apps ?? []) {
  if (have.has(a.id)) continue;
  await startOutreach(a.id, a.status === "signed_off_go" ? "go" : "pass");
  console.log(`started outreach: ${a.company_name} (${a.status === "signed_off_go" ? "GO" : "PASS"})`);
}
process.exit(0);
