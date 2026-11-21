// Gate permission checks against the running app (PRD 3.2): each person sends real requests with their own cookie.
// Usage: node scripts/eval-gates.mjs <application id waiting for Gate 1>   (app on localhost:3000)
const BASE = process.env.APP_URL ?? "http://localhost:3000";
const id = process.argv[2];
if (!id) throw new Error("Pass an application id that is waiting for Gate 1");

const as = (role) => async (path, body) => {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json", cookie: `working_as=${role}` }, body: JSON.stringify(body) });
  return res.status;
};
const aditya = as("aditya");
const riya = as("riya");
const kushal = as("kushal");

const checks = [];
const check = (label, got, want) => checks.push({ label, ok: got === want, got, want });

check("Aditya cannot decide at Gate 1", await aditya("/api/reviews", { application_id: id, gate: 1, decision: "go", reason: "x" }), 403);
check("Aditya cannot sign off", await aditya("/api/reviews", { application_id: id, gate: 2, decision: "go" }), 403);
check("Aditya cannot bulk sign off", await aditya("/api/sign-off", { ids: [id] }), 403);
check("Aditya cannot make a rule correction", await aditya("/api/corrections", { application_id: id, criterion_id: "C7", rating: 2, reason: "x", kind: "rule" }), 403);
check("Aditya cannot ask for research", await aditya(`/api/applications/${id}/research`, { question: "Is it real?" }), 403);
check("Riya cannot sign off at Gate 2", await riya("/api/reviews", { application_id: id, gate: 2, decision: "go" }), 403);
check("Riya cannot decide on rule corrections", await riya("/api/corrections/00000000-0000-0000-0000-000000000000", { status: "accepted" }), 403);
check("Kushal cannot sign off before Riya decides", await kushal("/api/reviews", { application_id: id, gate: 2, decision: "go" }), 409);
check("Riya decides at Gate 1", await riya("/api/reviews", { application_id: id, gate: 1, decision: "go", reason: "Credit partner letter seen, worth a call", seconds: 60 }), 200);
check("A rating cannot be corrected after Gate 1", await riya("/api/corrections", { application_id: id, criterion_id: "C7", rating: 2, reason: "late change", kind: "fact" }), 409);
check("Kushal signs off at Gate 2", await kushal("/api/reviews", { application_id: id, gate: 2, decision: "go", seconds: 25 }), 200);
check("Nothing can be signed off twice", await kushal("/api/reviews", { application_id: id, gate: 2, decision: "pass", reason: "again" }), 409);

for (const c of checks) console.log(`${c.ok ? "pass" : "FAIL"}  ${c.label}${c.ok ? "" : ` (got ${c.got}, want ${c.want})`}`);
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed} of ${checks.length} passed.`);
process.exit(failed ? 1 : 0);
