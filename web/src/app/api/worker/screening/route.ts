import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runScreeningWorker } from "@/lib/intake/screen";

export const maxDuration = 300;

// POST /api/worker/screening. Called by the scheduler with the shared secret (PRD 15.3 and 16.2).
export async function POST(req: Request) {
  const secret = process.env.WORKER_SECRET ?? process.env.CRON_SECRET ?? "";
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const ok = secret.length > 0 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  // The database scheduler calls every minute with ?budget=55, so each run starts about one batch (G1).
  const budget = Number(new URL(req.url).searchParams.get("budget"));
  return NextResponse.json(await runScreeningWorker(budget > 0 ? { budgetMs: Math.min(budget, 240) * 1000 } : {}));
}

// Vercel Cron calls GET with "Authorization: Bearer $CRON_SECRET". Set CRON_SECRET to the same value as WORKER_SECRET.
export const GET = POST;
