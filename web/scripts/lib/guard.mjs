// G5: test and live are separate (Lecture 8). Eval and demo scripts write applications, change settings
// and delete test rows, so they refuse to run against the live database unless told so on purpose.
export function refuseOnLive(what) {
  if (process.env.DB_ROLE === "live" && !process.argv.includes("--allow-live")) {
    console.error(`${what} writes test data, and DB_ROLE is "live". Point .env at the test database, or pass --allow-live if you really mean it.`);
    process.exit(2);
  }
}

/**
 * Eval scripts upload many applications from one machine, which the hourly upload limit (G2) rightly refuses.
 * They start from a clean count instead. Nothing to restore if a run stops half-way. Test database only (see above).
 */
export async function clearUploadCount(q) {
  await q("delete from intake_hits where at > now() - interval '1 hour'");
}
