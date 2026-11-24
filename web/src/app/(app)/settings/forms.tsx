"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

async function save(key: string, value: unknown) {
  const res = await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, value }) });
  const body = await res.json().catch(() => ({}));
  return res.ok ? null : (body.error as string) ?? "That did not work.";
}

function Row({ label, hint, children, note }: { label: string; hint: string; children: React.ReactNode; note: string | null }) {
  return (
    <div className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div>
        <div className="text-[14px]">{label}</div>
        <p className="text-[12px] text-muted">{hint}</p>
        {note ? <p className={`mt-1 text-[12px] ${note === "Saved." ? "text-go" : "text-flag"}`}>{note}</p> : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function NumberSetting({ k, label, hint, value, step, editable }: { k: string; label: string; hint: string; value: number; step: number; editable: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(String(value));
  const [note, setNote] = useState<string | null>(null);
  return (
    <Row label={label} hint={hint} note={note}>
      <div className="flex gap-2">
        <input type="number" step={step} value={v} onChange={(e) => setV(e.target.value)} disabled={!editable}
          className="w-28 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-right text-[13px] tabular-nums outline-none focus:border-brass disabled:opacity-60" />
        {editable ? <button className="btn btn-secondary" onClick={async () => { const e = await save(k, Number(v)); setNote(e ?? "Saved."); router.refresh(); }}>Save</button> : <span className="self-center text-[11px] text-muted">Locked</span>}
      </div>
    </Row>
  );
}

export function ChoiceSetting({ k, label, hint, value, options, editable, danger }: { k: string; label: string; hint: string; value: string; options: [string, string][]; editable: boolean; danger?: string }) {
  const router = useRouter();
  const [v, setV] = useState(value);
  const [note, setNote] = useState<string | null>(null);
  return (
    <Row label={label} hint={hint} note={note}>
      <div className="segmented" role="tablist" aria-label={label}>
        {options.map(([val, text]) => (
          <button key={val} role="tab" aria-selected={v === val} disabled={!editable} onClick={async () => {
            if (val === danger && !window.confirm(`Switch ${label.toLowerCase()} to ${text}? Real emails and invites will go out when Riya sends.`)) return;
            const e = await save(k, val);
            if (!e) setV(val);
            setNote(e ?? "Saved.");
            router.refresh();
          }}>{text}</button>
        ))}
      </div>
    </Row>
  );
}

export function AttendeesForm({ value, editable }: { value: Record<string, string | null>; editable: boolean }) {
  const [v, setV] = useState({ riya: value.riya ?? "", kushal: value.kushal ?? "", aditya: value.aditya ?? "" });
  const [note, setNote] = useState<string | null>(null);
  return (
    <Row label="Call attendees" hint="Riya and Kushal join every first call. Aditya joins for deeptech. Needed only in live mode." note={note}>
      <div className="grid gap-2 sm:grid-cols-3">
        {(["riya", "kushal", "aditya"] as const).map((k) => (
          <input key={k} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} disabled={!editable} placeholder={`${k}@fund.com`}
            className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[13px] outline-none focus:border-brass disabled:opacity-60" />
        ))}
        {editable ? <button className="btn btn-secondary sm:col-span-3 sm:justify-self-end" onClick={async () => setNote((await save("attendees", v)) ?? "Saved.")}>Save attendees</button> : null}
      </div>
    </Row>
  );
}

export function StyleNotes({ versions, editable }: { versions: { version: number; notes: string[]; active: boolean; created_at: string }[]; editable: boolean }) {
  const router = useRouter();
  return (
    <ul className="mt-3 space-y-3">
      {versions.map((s) => (
        <li key={s.version} className={`panel p-4 ${s.active ? "border-brass/70" : ""}`}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px]">Version {s.version}{s.active ? <span className="ml-2 text-[11px] tracking-[0.14em] text-brass uppercase">In use</span> : null}</span>
            {editable && !s.active ? <button className="btn btn-secondary" onClick={async () => { await fetch("/api/style-notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: s.version }) }); router.refresh(); }}>Roll back to this</button> : null}
          </div>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13px] text-muted">{s.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </li>
      ))}
    </ul>
  );
}

export function DeleteFounderData({ apps, editable }: { apps: { id: string; company_name: string }[]; editable: boolean }) {
  const router = useRouter();
  const [id, setId] = useState("");
  const [confirm, setConfirm] = useState("");
  const [note, setNote] = useState<string | null>(null);
  if (!editable) return <p className="mt-3 text-[12px] text-muted">Only Riya can delete founder data.</p>;
  const name = apps.find((a) => a.id === id)?.company_name;
  return (
    <div className="panel mt-3 flex flex-wrap items-end gap-3 p-5">
      <label className="block"><span className="eyebrow">Application</span>
        <select value={id} onChange={(e) => { setId(e.target.value); setConfirm(""); }} className="mt-1 block rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[13px]">
          <option value="">Choose</option>
          {apps.map((a) => <option key={a.id} value={a.id}>{a.company_name}</option>)}
        </select>
      </label>
      {id ? (
        <label className="block"><span className="eyebrow">Type {name} to confirm</span>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1 block rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[13px] outline-none focus:border-flag" />
        </label>
      ) : null}
      <button disabled={!id || confirm !== name} className="btn btn-secondary text-flag" onClick={async () => {
        const res = await fetch(`/api/applications/${id}/delete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm }) });
        const body = await res.json().catch(() => ({}));
        setNote(res.ok ? `${name} and all its data were deleted.` : body.error);
        setId("");
        setConfirm("");
        router.refresh();
      }}>Delete permanently</button>
      {note ? <p className="w-full text-[12px] text-muted">{note}</p> : null}
    </div>
  );
}

/** G12: notes Riya's edits proposed. A one-off edit is declined; a habit is approved for its kind or for all. */
export function ProposedNotes({ notes, editable }: { notes: { id: string; note: string; tag: string | null; created_at: string }[]; editable: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  if (!notes.length) return <p className="mt-3 text-[13px] text-muted">No proposed notes waiting.</p>;
  const decide = async (id: string, decision: "approve" | "decline", scope: "kind" | "all") => {
    const res = await fetch("/api/style-notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ candidate_id: id, decision, scope }) });
    const b = await res.json().catch(() => ({}));
    setError(res.ok ? null : b.error ?? "Could not save.");
    router.refresh();
  };
  return (
    <div className="mt-3 panel border-needs-human/50 p-4">
      <div className="eyebrow text-needs-human">Waiting for Riya · {notes.length}</div>
      <ul className="mt-2 divide-y divide-border">
        {notes.map((n) => (
          <li key={n.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <span className="text-[13px]">
              {n.note}
              {n.tag ? <span className="tint ml-2 text-sapphire">{n.tag.replace("sector:", "")}</span> : null}
            </span>
            {editable ? (
              <span className="flex flex-wrap gap-2">
                {n.tag ? <button className="btn btn-secondary" onClick={() => decide(n.id, "approve", "kind")}>Use for {n.tag.replace("sector:", "")}</button> : null}
                <button className="btn btn-secondary" onClick={() => decide(n.id, "approve", "all")}>Use for everyone</button>
                <button className="btn btn-secondary" onClick={() => decide(n.id, "decline", "kind")}>One-off, decline</button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? <p className="mt-2 text-[12px] text-flag">{error}</p> : null}
    </div>
  );
}
