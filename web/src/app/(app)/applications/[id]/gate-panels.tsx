"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// The action panels for Gate 1 (Riya) and Gate 2 (Kushal), plus the blind step and inline corrections.
// Time on the page is recorded quietly and never shown as pressure (PRD 13.6).

async function post(url: string, data: unknown): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  const body = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, ...body } : { ok: false, error: body.error ?? "That did not work. Try again." };
}

/** Seconds since this panel opened for this application. Never shown, only saved with the decision. */
function useSeconds() {
  const start = useRef(0);
  useEffect(() => {
    start.current = performance.now();
  }, []);
  return () => (start.current === 0 ? 0 : Math.round((performance.now() - start.current) / 1000));
}

const LABEL: Record<string, string> = { go: "GO", pass: "PASS", hold: "Hold" };

export function Gate1Panel({ id, system, canResearch }: { id: string; system: "go" | "pass" | "hold" | null; canResearch: boolean }) {
  const router = useRouter();
  const seconds = useSeconds();
  const [mode, setMode] = useState<"idle" | "change" | "research">("idle");
  const [choice, setChoice] = useState<"go" | "pass" | "hold">(system === "go" ? "pass" : "go");
  const [reason, setReason] = useState("");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "go" | "pass" | "hold", why?: string) {
    setBusy(true);
    setError(null);
    const r = await post("/api/reviews", { application_id: id, gate: 1, decision, reason: why, seconds: seconds() });
    setBusy(false);
    if (!r.ok) return setError(r.error!);
    router.refresh();
  }

  async function research() {
    setBusy(true);
    setError(null);
    const r = await post(`/api/applications/${id}/research`, { question });
    setBusy(false);
    if (!r.ok) return setError(r.error!);
    router.refresh();
  }

  // Keyboard: A agrees, C opens change, R opens research (PRD 13.6).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // preventDefault stops the same keystroke from landing in the field that opens.
      if (e.key === "a" && system && !busy) { e.preventDefault(); void decide(system); }
      if (e.key === "c") { e.preventDefault(); setMode("change"); }
      if (e.key === "r" && canResearch) { e.preventDefault(); setMode("research"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="panel border-brass/60 p-5" id="gate1">
      <div className="eyebrow text-brass">Gate 1 · Your review</div>
      {system ? (
        <button disabled={busy} onClick={() => decide(system)} className="btn btn-primary mt-3 w-full justify-center" data-action="agree">
          Agree: {LABEL[system]} <kbd className="ml-1 text-[10px] opacity-60">A</kbd>
        </button>
      ) : (
        <p className="mt-2 text-[12.5px] text-muted">The system needs a person here. Choose GO, PASS or Hold with a one-line reason.</p>
      )}
      <div className="mt-2 flex gap-2">
        <button onClick={() => setMode(mode === "change" ? "idle" : "change")} className="btn btn-secondary flex-1 justify-center">
          {system ? "Change" : "Decide"} <kbd className="text-[10px] opacity-60">C</kbd>
        </button>
        {canResearch ? (
          <button onClick={() => setMode(mode === "research" ? "idle" : "research")} className="btn btn-secondary flex-1 justify-center">
            Research <kbd className="text-[10px] opacity-60">R</kbd>
          </button>
        ) : null}
      </div>

      {mode === "change" ? (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <div className="segmented w-full" role="tablist" aria-label="Your decision">
            {(["go", "pass", "hold"] as const).map((d) => (
              <button key={d} role="tab" aria-selected={choice === d} onClick={() => setChoice(d)} className="flex-1">
                {LABEL[d]}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="eyebrow">One-line reason</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} autoFocus
              className="mt-1.5 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none focus:border-brass" placeholder="Why you see it differently" />
          </label>
          <button disabled={busy} onClick={() => decide(choice, reason)} className="btn btn-primary w-full justify-center">Save {LABEL[choice]}</button>
        </div>
      ) : null}

      {mode === "research" ? (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <label className="block">
            <span className="eyebrow">What should we look up?</span>
            <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={200} autoFocus
              className="mt-1.5 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none focus:border-brass" placeholder="Is the NBFC partnership signed?" />
          </label>
          <p className="text-[11.5px] text-muted">One more search round runs, within the limit of 12 fetches. The brief updates when it is done.</p>
          <button disabled={busy} onClick={research} className="btn btn-primary w-full justify-center">Ask for research</button>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-[12px] text-flag">{error}</p> : null}
    </div>
  );
}

export function Gate2Panel({ id, riya, riyaReason, agreed }: { id: string; riya: "go" | "pass" | "hold" | null; riyaReason: string | null; agreed: boolean | null }) {
  const router = useRouter();
  const seconds = useSeconds();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function decide(decision: "go" | "pass" | "hold" | "send_back") {
    setBusy(true);
    setError(null);
    const r = await post("/api/reviews", { application_id: id, gate: 2, decision, reason: note, seconds: seconds() });
    setBusy(false);
    if (!r.ok) return setError(r.error!);
    router.refresh();
  }
  return (
    <div className="panel border-brass/60 p-5">
      <div className="eyebrow text-brass">Gate 2 · Kushal signs off</div>
      {riya ? (
        <p className="mt-2 text-[13px]">
          Riya chose <span className="font-semibold">{LABEL[riya]}</span>
          {agreed === false ? <span className="text-needs-human">, differing from the system</span> : agreed ? ", agreeing with the system" : ""}.
          {riyaReason ? <span className="mt-1 block text-muted">“{riyaReason}”</span> : null}
        </p>
      ) : (
        <p className="mt-2 text-[13px] text-muted">Held for a possible portfolio conflict. Speak to the portfolio founder first.</p>
      )}
      <label className="mt-3 block">
        <span className="eyebrow">Note</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200}
          className="mt-1.5 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none focus:border-brass" placeholder="Needed if you differ from Riya or send it back" />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button disabled={busy} onClick={() => decide("go")} className={`btn justify-center ${riya === "go" ? "btn-primary" : "btn-secondary"}`}>Sign off GO</button>
        <button disabled={busy} onClick={() => decide("pass")} className={`btn justify-center ${riya === "pass" ? "btn-primary" : "btn-secondary"}`}>Sign off PASS</button>
        <button disabled={busy} onClick={() => decide("hold")} className="btn btn-secondary justify-center">Hold</button>
        <button disabled={busy} onClick={() => decide("send_back")} className="btn btn-secondary justify-center">Send back</button>
      </div>
      {error ? <p className="mt-3 text-[12px] text-flag">{error}</p> : null}
      <p className="mt-3 text-[11px] text-muted">Nothing reaches a founder before this sign off.</p>
    </div>
  );
}

/** The blind step: Riya records her own view before the system's recommendation is shown. */
export function BlindGate({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function pick(view: "go" | "pass" | "unsure") {
    setBusy(true);
    await post(`/api/applications/${id}/blind`, { view });
    router.refresh();
    // The reveal must never be missed: if the refresh has not redrawn the page shortly, reload it.
    setTimeout(() => window.location.reload(), 1200);
  }
  return (
    <section aria-label="Record your view first">
      <div className="eyebrow">Recommendation</div>
      <div className="panel mt-3 border-needs-human/60 p-6">
        <div className="eyebrow text-needs-human">Blind check</div>
        <p className="mt-2 font-display text-[22px] leading-snug">Record your view first.</p>
        <p className="mt-1 text-[13px] text-muted">This one is in the blind sample. Read the evidence and choose before the system&apos;s view is shown. It measures how much the recommendation sways a review.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["go", "pass", "unsure"] as const).map((v) => (
            <button key={v} disabled={busy} onClick={() => pick(v)} className="btn btn-secondary">{v === "unsure" ? "Unsure" : v.toUpperCase()}</button>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Inline correction on a criterion row: rating, one-line reason, fact or rule (Loop C). */
export function CorrectForm({ id, criterion, rating }: { id: string; criterion: string; rating: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(rating);
  const [reason, setReason] = useState("");
  const [kind, setKind] = useState<"fact" | "rule">("fact");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open) return <button onClick={() => setOpen(true)} className="text-[12px] text-brass hover:underline">Correct this rating</button>;
  return (
    <div className="mt-2 space-y-3 rounded-[10px] border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="eyebrow">New rating</span>
        <div className="segmented" role="tablist" aria-label="New rating">
          {[0, 1, 2, 3, 4].map((n) => (
            <button key={n} role="tab" aria-selected={value === n} onClick={() => setValue(n)}>{n}</button>
          ))}
        </div>
        <div className="segmented" role="tablist" aria-label="Kind of correction">
          <button role="tab" aria-selected={kind === "fact"} onClick={() => setKind("fact")}>Fact, this company</button>
          <button role="tab" aria-selected={kind === "rule"} onClick={() => setKind("rule")}>Rule, similar companies</button>
        </div>
      </div>
      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={140}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none focus:border-brass" placeholder="One-line reason, under 140 characters" />
      <p className="text-[11px] text-muted">
        {kind === "rule" ? "A rule correction is shown to the scorer for similar companies and waits for Kushal. It never changes the Thesis Card." : "A fact correction changes this company only."}
      </p>
      <div className="flex gap-2">
        <button disabled={busy} className="btn btn-primary" onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await post("/api/corrections", { application_id: id, criterion_id: criterion, rating: value, reason, kind });
          setBusy(false);
          if (!r.ok) return setError(r.error!);
          setOpen(false);
          router.refresh();
        }}>Save correction</button>
        <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {error ? <p className="text-[12px] text-flag">{error}</p> : null}
    </div>
  );
}

/** Riya's own research, stored apart from what the system found. */
export function AddEvidence({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!open) return <button onClick={() => setOpen(true)} className="mt-3 text-[12px] text-brass hover:underline">Add your own finding</button>;
  return (
    <div className="mt-3 space-y-2 rounded-[10px] border border-border p-4">
      <textarea value={quote} onChange={(e) => setQuote(e.target.value)} rows={2} placeholder="Paste what you found"
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none focus:border-brass" />
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://where-you-found-it"
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px] outline-none focus:border-brass" />
      <div className="flex gap-2">
        <button className="btn btn-primary" onClick={async () => {
          const r = await post(`/api/applications/${id}/evidence`, { quote, url });
          if (!r.ok) return setError(r.error!);
          setOpen(false);
          setQuote("");
          setUrl("");
          router.refresh();
        }}>Save finding</button>
        <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {error ? <p className="text-[12px] text-flag">{error}</p> : null}
    </div>
  );
}
