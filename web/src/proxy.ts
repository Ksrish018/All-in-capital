import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, DEMO_MESSAGE, REQUEST_ACCESS_URL, validAccessCookie } from "@/lib/demo";

/**
 * The app has no login (by design). Before it is ever reachable online it needs a password in front of it
 * (PRD 16.2, open question Q13). If APP_PASSWORD is set, every page and API asks for it with the browser's
 * own sign-in box. The worker routes are left to their own shared secret, so the scheduler can reach them.
 * Locally, with APP_PASSWORD unset, nothing changes.
 */
export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/worker/")) return NextResponse.next();
  // Read-only demo for portfolio visitors: every API write needs a personal access link (see lib/demo.ts).
  const write = req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";
  if (write && req.nextUrl.pathname.startsWith("/api/") && !validAccessCookie(req.cookies.get(ACCESS_COOKIE)?.value)) {
    return NextResponse.json({ error: DEMO_MESSAGE, demo: true, requestAccess: REQUEST_ACCESS_URL }, { status: 403 });
  }
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const given = decoded.slice(decoded.indexOf(":") + 1);
    if (given.length === password.length && equal(given, password)) return NextResponse.next();
  }
  return new NextResponse("A password is needed to open the triage app.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="All In Capital triage", charset="UTF-8"' },
  });
}

/** Compares without stopping early, so timing does not reveal how much of the password was right. */
function equal(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = {
  // Everything except Next's own static files and the icon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
