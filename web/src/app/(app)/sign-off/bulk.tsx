"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Bulk sign off, only for the "Agreed with system" column. The server checks the column again. */
export function BulkSignOff({ items }: { items: { id: string; name: string; decision: string | null }[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const toggle = (id: string) => setPicked((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  return (
    <div className="flex flex-1 flex-col gap-2.5">
      {items.map((c) => (
        <div key={c.id} className="panel-sm flex items-start gap-3 p-3.5">
          <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${c.name}`} className="mt-1.5 size-4 accent-[var(--accent-strong)]" />
          <div className="min-w-0 flex-1">
            <Link href={`/applications/${c.id}`} className="font-display text-[18px] hover:underline">{c.name}</Link>
            <div className="text-[12px]">Riya and the system: <span className="font-semibold">{c.decision?.toUpperCase()}</span></div>
          </div>
        </div>
      ))}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
        <button className="btn btn-secondary" onClick={() => setPicked(picked.size === items.length ? new Set() : new Set(items.map((i) => i.id)))}>
          {picked.size === items.length ? "Clear" : "Select all"}
        </button>
        <button disabled={busy || picked.size === 0} className="btn btn-primary" onClick={async () => {
          setBusy(true);
          const res = await fetch("/api/sign-off", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: [...picked] }) });
          const body = await res.json().catch(() => ({}));
          setBusy(false);
          setNote(res.ok ? `Signed off ${body.signed}${body.skipped ? `, ${body.skipped} left to open one by one` : ""}.` : body.error ?? "That did not work.");
          setPicked(new Set());
          router.refresh();
        }}>
          Sign off {picked.size || ""}
        </button>
      </div>
      {note ? <p className="text-[12px] text-muted">{note}</p> : null}
    </div>
  );
}
