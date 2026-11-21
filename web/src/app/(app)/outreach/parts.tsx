"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

async function post(url: string, data: unknown = {}) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  const body = await res.json().catch(() => ({}));
  return res.ok ? { ok: true as const, body } : { ok: false as const, error: (body.error as string) ?? "That did not work." };
}

const field = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none focus:border-brass";

/** Gate 3: Riya reads, edits and sends. The button says plainly where the email goes from. */
export function Composer({ id, to, subject, body, canSend, live }: { id: string; to: string; subject: string; body: string; canSend: boolean; live: boolean }) {
  const router = useRouter();
  const [t, setT] = useState(to);
  const [s, setS] = useState(subject);
  const [b, setB] = useState(body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-4 space-y-2">
      <label className="block"><span className="eyebrow">To</span><input value={t} onChange={(e) => setT(e.target.value)} placeholder="founder@company.com" className={`${field} mt-1`} disabled={!canSend} /></label>
      <label className="block"><span className="eyebrow">Subject</span><input value={s} onChange={(e) => setS(e.target.value)} className={`${field} mt-1`} disabled={!canSend} /></label>
      <label className="block"><span className="eyebrow">Email</span><textarea value={b} onChange={(e) => setB(e.target.value)} rows={9} className={`${field} mt-1 leading-relaxed`} disabled={!canSend} /></label>
      {canSend ? (
        <button disabled={busy} className="btn btn-primary" onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await post(`/api/emails/${id}/send`, { to: t, subject: s, body: b });
          setBusy(false);
          if (!r.ok) return setError(r.error);
          router.refresh();
        }}>{live ? "Send from your Gmail" : "Send (simulated, nothing leaves)"}</button>
      ) : <p className="text-[12px] text-muted">Only Riya sends. Switch to Riya to send this.</p>}
      {error ? <p className="text-[12px] text-flag">{error}</p> : null}
    </div>
  );
}

export function ConversationActions({ id, paused, isRiya, simulate }: { id: string; paused: boolean; isRiya: boolean; simulate: boolean }) {
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    const r = await post(`/api/outreach/${id}`, { action, ...extra });
    setNote(r.ok ? (r.body?.log?.join("; ") || "Done.") : r.error);
    router.refresh();
  };
  return (
    <div className="flex flex-col items-start gap-2 md:items-end">
      {isRiya ? (
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={() => act(paused ? "resume" : "pause")}>{paused ? "Resume" : "Pause"}</button>
          <button className="btn btn-secondary" onClick={() => act("take_over")}>Take over</button>
        </div>
      ) : null}
      {simulate ? (
        <div className="flex w-full max-w-sm gap-2">
          <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Simulate the founder's reply" className={field} />
          <button className="btn btn-secondary" onClick={() => { void act("simulate_reply", { reply }); setReply(""); }}>Add</button>
        </div>
      ) : null}
      {note ? <p className="max-w-sm text-[11.5px] text-muted">{note}</p> : null}
    </div>
  );
}

export function RunAgent() {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      {note ? <span className="text-[12px] text-muted">{note}</span> : null}
      <button className="btn btn-secondary" onClick={async () => {
        const r = await post("/api/outreach/tick");
        setNote(r.ok ? (r.body.stepped ? r.body.log.join("; ") : "Nothing due.") : r.error);
        router.refresh();
      }}>Check for replies now</button>
    </div>
  );
}

/** Step 20: one tap the day after a call. */
export function CallTap({ appId }: { appId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const tap = async (worth: boolean) => {
    await post("/api/call-outcomes", { application_id: appId, worth, note });
    router.refresh();
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[12.5px]">Was this call worth 30 minutes?</span>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional line" className="rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-[12px] outline-none focus:border-brass" />
      <button className="btn btn-primary" onClick={() => tap(true)}>Yes</button>
      <button className="btn btn-secondary" onClick={() => tap(false)}>No</button>
    </div>
  );
}
