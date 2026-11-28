import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, REQUEST_ACCESS_URL, accessCookie, verifyPass } from "@/lib/demo";

// Personal access link from the portfolio: /access?pass=… sets a session that ends when the link does.
export async function GET(req: NextRequest) {
  const exp = verifyPass(req.nextUrl.searchParams.get("pass"));
  if (!exp) {
    return new NextResponse(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Link expired</title></head>
<body style="font:16px/1.55 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px"><main style="max-width:420px">
<h1>This access link has expired</h1><p><a href="/">Explore the read-only demo</a> or <a href="${REQUEST_ACCESS_URL}">request a new link</a>.</p></main></body></html>`,
      { status: 403, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.cookies.set(ACCESS_COOKIE, accessCookie(exp), { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: new Date(exp) });
  return res;
}
