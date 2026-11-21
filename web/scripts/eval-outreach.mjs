// End-to-end outreach checks in simulate mode (PRD Part 2, 19.3 reply tests, 19.3a timing, N4).
// Real people, real routes, simulated founders. Refuses to run in live mode, so nothing can leave the system.
// Usage: npm run eval:outreach   (app on localhost:3000, outreach started for the signed-off case applications)
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import nextEnv from "@next/env";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
nextEnv.loadEnvConfig(root);
const BASE = process.env.APP_URL ?? "http://localhost:3000";
const ref = new URL(process.env.SUPABASE_URL).hostname.split(".")[0];
const db = new pg.Client({ host: process.env.SUPABASE_DB_HOST, port: 5432, user: `postgres.${ref}`, password: process.env.SUPABASE_DB_PASSWORD, database: "postgres", ssl: { rejectUnauthorized: false } });
await db.connect();
const q = async (sql, a = []) => (await db.query(sql, a)).rows;

const mode = (await q("select value from settings where key = 'outreach_mode'"))[0]?.value;
if (mode !== "simulate") {
  console.log("Outreach is in live mode. This eval only runs in simulate mode. Nothing was done.");
  process.exit(1);
}

const as = (role) => async (p, body) => {
  const r = await fetch(`${BASE}${p}`, { method: "POST", headers: { "content-type": "application/json", cookie: `working_as=${role}` }, body: JSON.stringify(body ?? {}) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const riya = as("riya");
const worker = async (now) => (await fetch(`${BASE}/api/worker/outreach${now ? `?now=${encodeURIComponent(now)}` : ""}`, { method: "POST", headers: { authorization: `Bearer ${process.env.WORKER_SECRET}` } })).json();
const outreach = async (co) => (await q("select o.* from outreach o join applications a on a.id = o.application_id where a.company_name = $1", [co]))[0];
const draft = async (co) => (await q("select e.* from emails e join outreach o on o.id = e.outreach_id join applications a on a.id = o.application_id where a.company_name = $1 and e.sent_at is null order by e.created_at", [co]))[0];
const send = async (co, who = riya) => {
  const d = await draft(co);
  if (!d) return { status: 0, body: { error: "no draft" } };
  return who(`/api/emails/${d.id}/send`, { to: `founders@${co.toLowerCase()}.example`, subject: d.draft_subject, body: d.draft_body });
};
const reply = (co, text) => outreach(co).then((o) => riya(`/api/outreach/${o.id}`, { action: "simulate_reply", reply: text }));
const day = (iso, n) => new Date(new Date(iso).getTime() + n * 86_400_000).toISOString();

const results = [];
const check = (severity, id, title, ok, detail = "") => results.push({ severity, id, title, ok: Boolean(ok), detail });

// N4: nobody but Riya can send.
const before = await draft("EarnWise");
check("Critical", "N4-kushal", "Kushal cannot send an email", (await send("EarnWise", as("kushal"))).status === 403);
check("Critical", "N4-aditya", "Aditya cannot send an email", (await send("EarnWise", as("aditya"))).status === 403);
check("Critical", "N4-unsent", "A refused send leaves the draft unsent", (await q("select sent_at from emails where id = $1", [before.id]))[0].sent_at === null);

// PASS note: kind, no criteria, then closed.
check("High", "P-note", "The pass note never mentions criteria, scores or the Thesis Card", !/\bC(1[01]|[1-9])\b|thesis card|rubric|criteri|score|rating/i.test(`${before.draft_subject} ${before.draft_body}`));
check("High", "P-send", "Riya sends the pass note and the record closes", (await send("EarnWise")).status === 200 && (await outreach("EarnWise")).status === "closed");

// GO, Pumpwise: refuses all three, gets new ones, picks one, gets booked, then the one tap.
check("High", "G-send", "Riya sends the GO invite", (await send("Pumpwise")).status === 200 && (await outreach("Pumpwise")).status === "sent");
const offered1 = (await outreach("Pumpwise")).slots_offered;
check("High", "G-aditya", "Deeptech: Aditya joins the call", (await outreach("Pumpwise")).aditya === true && /Aditya/.test((await q("select draft_body from emails e join outreach o on o.id = e.outreach_id join applications a on a.id = o.application_id where a.company_name = 'Pumpwise' order by e.created_at limit 1"))[0].draft_body));
await reply("Pumpwise", "Thanks Riya! None of those times work for us that week, could you suggest some others?");
const p1 = await outreach("Pumpwise");
const offered2 = (await draft("Pumpwise"))?.slots ?? [];
check("High", "G-refuse", "Refusing all three slots gets new ones, none of the refused (19.3)", p1.status === "scheduling" && p1.scheduling_round === 1 && offered2.length === 3 && !offered2.some((s) => offered1.some((o) => o.start === s.start)), `${p1.status}, round ${p1.scheduling_round}`);
await send("Pumpwise");
const pick = offered2[1];
const pickText = new Date(new Date(pick.start).getTime() + 330 * 60_000).toLocaleString("en-IN", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "UTC" });
await reply("Pumpwise", `${pickText} works well for us. See you then.`);
const booked = await outreach("Pumpwise");
check("Critical", "G-book", "A confirmed slot is booked, only after the founder confirms", booked.status === "booked" && booked.calendar_event_id && booked.slots_offered?.[0]?.start === pick.start, `${booked.status}, ${booked.calendar_event_id}`);
await worker(day(pick.end, 1.1));
check("High", "G-done", "The day after the call, it asks for the one tap", (await outreach("Pumpwise")).status === "call_done");
const tap = await riya("/api/call-outcomes", { application_id: booked.application_id, worth: true, note: "Sharp on calibration" });
check("High", "G-tap", "The one tap is saved and the record closes", tap.status === 200 && (await q("select worth_it from call_outcomes where application_id = $1", [booked.application_id]))[0]?.worth_it === true);

// GO, GrainKind: no reply. Day 3 and day 7 follow ups, then no response (19.3a).
await send("GrainKind");
const g0 = await outreach("GrainKind");
await worker(day(g0.first_sent_at, 2.5));
check("High", "E-wait", "No follow up before day 3", (await outreach("GrainKind")).status === "sent");
await worker(day(g0.first_sent_at, 3.1));
check("High", "E-1", "Follow up 1 is drafted on day 3", (await outreach("GrainKind")).status === "followup_1_ready" && Boolean(await draft("GrainKind")));
await send("GrainKind");
await worker(day(g0.first_sent_at, 7.1));
check("High", "E-2", "Follow up 2 is drafted on day 7", (await outreach("GrainKind")).status === "followup_2_ready");
await send("GrainKind");
await worker(day(g0.first_sent_at, 10.1));
const g3 = await outreach("GrainKind");
check("High", "E-none", "After two follow ups, no response, and Riya is told", g3.status === "no_response" && g3.followups_sent === 2, `${g3.status}, ${g3.followups_sent}`);

// GO, CAPilot: not interested, then a polite close.
await send("CAPilot");
await reply("CAPilot", "Thank you for reaching out. We have decided to raise only from strategic investors, so we are not interested at this stage.");
check("High", "R-close", "Not interested drafts a polite close for Riya", (await draft("CAPilot"))?.kind === "close");
await send("CAPilot");
check("High", "R-declined", "Sending the close marks it declined", (await outreach("CAPilot")).status === "declined");

// GO, StockSathi: "Maybe next quarter" is unclear and goes to Riya (19.3).
await send("StockSathi");
await reply("StockSathi", "Maybe next quarter.");
const s = await outreach("StockSathi");
check("High", "R-unclear", "\"Maybe next quarter\" is unclear and goes to Riya", s.status === "with_riya", `${s.status}: ${s.handoff_reason}`);

// N4 in the data: every sent email has Riya behind it, and every one was simulated here.
const riyaId = (await q("select id from users where role = 'riya'"))[0].id;
const sent = await q("select sent_by, simulated from emails where sent_at is not null");
check("Critical", "N4-data", "Every sent email was sent by Riya", sent.length > 0 && sent.every((e) => e.sent_by === riyaId), `${sent.length} sent`);
check("Critical", "SIM", "Nothing left the system: every send was simulated", sent.every((e) => e.simulated === true));

const failed = results.filter((r) => !r.ok);
const critical = failed.filter((r) => r.severity === "Critical").length;
await q("insert into eval_runs (kind, passed, failed, critical_failed, detail) values ('outreach', $1, $2, $3, $4)", [results.length - failed.length, failed.length, critical, JSON.stringify(results)]);
await db.end();
for (const r of results) console.log(`${r.ok ? "pass" : "FAIL"}  ${r.severity.padEnd(8)} ${r.id.padEnd(11)} ${r.title}${r.ok || !r.detail ? "" : `  (${r.detail})`}`);
console.log(`\n${results.length - failed.length} of ${results.length} passed. ${failed.length} failed, ${critical} Critical.`);
process.exit(critical ? 1 : 0);
