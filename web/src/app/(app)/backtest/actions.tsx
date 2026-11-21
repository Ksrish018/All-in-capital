"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

async function post(url: string, data: unknown = {}) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  const body = await res.json().catch(() => ({}));
  return res.ok ? { ok: true as const } : { ok: false as const, error: (body.error as string) ?? "That did not work." };
}

export function BacktestActions({ version, status, canRun, hasRun, n1 }: { version: number; status: string; canRun: boolean; hasRun: boolean; n1: number }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <span className={`rounded-full border px-3.5 py-1 text-[11px] tracking-[0.14em] uppercase ${status === "approved" ? "border-go/60 text-go" : "border-brass/70 text-brass"}`}>
        Version {version} · {status}
      </span>
      {canRun ? (
        <>
          <button disabled={busy} className="btn btn-secondary" onClick={async () => {
            setBusy(true);
            const r = await post(`/api/thesis/${version}/backtest`);
            setBusy(false);
            setMsg(r.ok ? "Running. It takes a few minutes. Refresh to see the new run." : r.error);
          }}>{hasRun ? "Run again" : "Run back test"}</button>
          {status !== "approved" ? (
            <button disabled={busy || !hasRun || n1 > 0} title={!hasRun ? "Run the back test on this version first." : n1 > 0 ? "A funded company was marked PASS with no flag." : ""} className="btn btn-primary" onClick={async () => {
              setBusy(true);
              const r = await post(`/api/thesis/${version}/approve`);
              setBusy(false);
              setMsg(r.ok ? `Version ${version} approved. New applications are scored against it.` : r.error);
              router.refresh();
            }}>Approve version {version}</button>
          ) : null}
        </>
      ) : <span className="text-[12px] text-muted">Only Kushal runs the back test and approves a version.</span>}
      {msg ? <span className="text-[12px] text-muted">{msg}</span> : null}
    </div>
  );
}

export function VerdictEditor({ id, verdict, note, reason, canEdit, labels }: { id: string; verdict: string; note: string; reason: string | null; canEdit: boolean; labels: Record<string, string> }) {
  const router = useRouter();
  const [v, setV] = useState(verdict);
  const [n, setN] = useState(note);
  const [saved, setSaved] = useState(false);
  if (!canEdit) {
    return (
      <div className="mt-2 text-[12px]">
        <span className="text-brass">{labels[verdict]}</span>{reason ? <span className="text-muted">: {reason}</span> : null}
        {note ? <div className="mt-1">Kushal: “{note}”</div> : null}
      </div>
    );
  }
  return (
    <div className="mt-2 space-y-2">
      {reason ? <p className="text-[11.5px] text-muted">Suggested: {reason}</p> : null}
      <div className="segmented" role="tablist" aria-label="Verdict">
        {Object.entries(labels).map(([k, l]) => <button key={k} role="tab" aria-selected={v === k} onClick={() => { setV(k); setSaved(false); }}>{l}</button>)}
      </div>
      <div className="flex gap-2">
        <input value={n} onChange={(e) => { setN(e.target.value); setSaved(false); }} maxLength={200} placeholder="A line of your own"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[12.5px] outline-none focus:border-brass" />
        <button className="btn btn-secondary" onClick={async () => {
          const r = await post(`/api/backtest/${id}`, { verdict: v, note: n });
          if (r.ok) { setSaved(true); router.refresh(); }
        }}>{saved ? "Saved" : "Save"}</button>
      </div>
    </div>
  );
}
