import "server-only";

// Gmail and Google Calendar through the official APIs (PRD 8.6: the cleanest lawful source first).
// Used only in live outreach mode. In simulate mode nothing here is called.

export class GoogleError extends Error {
  constructor(message: string, readonly lasting: boolean) {
    super(message);
  }
}

let cached: { token: string; until: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN ?? "",
      grant_type: "refresh_token",
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new GoogleError(`Google sign-in failed (${body.error ?? res.status})`, true);
  cached = { token: body.access_token, until: Date.now() + Number(body.expires_in ?? 3000) * 1000 };
  return cached.token;
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000), headers: { ...(init.headers ?? {}), authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const lasting = res.status === 400 || res.status === 403 || res.status === 404;
    throw new GoogleError(`Google returned ${res.status}: ${String(body?.error?.message ?? "").slice(0, 160)}`, lasting);
  }
  return body as T;
}

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** send_email. Only reachable from Riya's click (N4). */
export async function gmailSend(input: { to: string; subject: string; body: string; threadId?: string | null; inReplyTo?: string | null }) {
  const headers = [`To: ${input.to}`, `Subject: ${input.subject}`, "Content-Type: text/plain; charset=UTF-8", ...(input.inReplyTo ? [`In-Reply-To: ${input.inReplyTo}`, `References: ${input.inReplyTo}`] : [])];
  const raw = b64url(`${headers.join("\r\n")}\r\n\r\n${input.body}`);
  return call<{ id: string; threadId: string }>("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw, ...(input.threadId ? { threadId: input.threadId } : {}) }),
  });
}

/** read_thread: only the stored thread, never other mail. */
export async function gmailReadThread(threadId: string): Promise<{ id: string; from: string; date: string; text: string }[]> {
  const t = await call<{ messages: { id: string; internalDate: string; payload: { headers: { name: string; value: string }[]; body?: { data?: string }; parts?: { mimeType: string; body?: { data?: string } }[] } }[] }>(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=full`,
  );
  const decode = (d?: string) => (d ? Buffer.from(d.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8") : "");
  return (t.messages ?? []).map((m) => ({
    id: m.id,
    from: m.payload.headers.find((h) => h.name.toLowerCase() === "from")?.value ?? "",
    date: new Date(Number(m.internalDate)).toISOString(),
    text: decode(m.payload.parts?.find((p) => p.mimeType === "text/plain")?.body?.data ?? m.payload.body?.data),
  }));
}

/** find_slots and check_slot read free and busy times only. */
export async function calendarBusy(fromIso: string, toIso: string): Promise<{ start: string; end: string }[]> {
  const r = await call<{ calendars: Record<string, { busy: { start: string; end: string }[] }> }>("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    body: JSON.stringify({ timeMin: fromIso, timeMax: toIso, items: [{ id: "primary" }] }),
  });
  return Object.values(r.calendars ?? {}).flatMap((c) => c.busy ?? []);
}

/** book_event: a 30 minute event with a Meet link. Google sends the invites. */
export async function calendarBook(input: { summary: string; start: string; end: string; attendees: string[]; description: string }) {
  return call<{ id: string; htmlLink: string }>("https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all", {
    method: "POST",
    body: JSON.stringify({
      summary: input.summary,
      description: input.description,
      start: { dateTime: input.start },
      end: { dateTime: input.end },
      attendees: input.attendees.map((email) => ({ email })),
      conferenceData: { createRequest: { requestId: `allin-${Date.now()}`, conferenceSolutionKey: { type: "hangoutsMeet" } } },
    }),
  });
}
