import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, tag } from "../helpers";

// Static checks on the migration SQL. The live database check runs in the critical job.
const sql = fs.readFileSync(path.join(ROOT, "supabase/migrations/0001_init.sql"), "utf8");
const tables = [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);

describe("database schema", () => {
  it(tag("Critical", "D1", "every table is in the Row Level Security list"), () => {
    const rlsBlock = sql.slice(sql.indexOf("foreach t in array"));
    for (const t of tables) expect(rlsBlock).toContain(`'${t}'`);
  });

  it(tag("Critical", "D2", "an email can only be marked sent by a person"), () => {
    expect(sql).toMatch(/constraint sent_needs_person check \(sent_at is null or sent_by is not null\)/);
  });

  it(tag("Critical", "D3", "needs_attention always carries a reason"), () => {
    expect(sql).toMatch(/needs_attention_has_reason/);
  });

  it(tag("High", "D4", "disagreeing with the system needs a reason, and corrections are one line"), () => {
    expect(sql).toMatch(/reason_when_disagreeing/);
    expect(sql).toMatch(/length\(reason\) between 1 and 140/);
  });

  it(tag("High", "D5", "follow ups and scheduling rounds are capped at two"), () => {
    expect(sql).toMatch(/followups_sent between 0 and 2/);
    expect(sql).toMatch(/scheduling_round between 0 and 2/);
  });

  it(tag("High", "D6", "the storage bucket is private"), () => {
    expect(sql).toMatch(/values \('applications', 'applications', false\)/);
  });
});
