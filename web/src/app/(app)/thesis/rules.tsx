"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type RuleRow = { id: string; criterion_id: string; old_rating: number | null; new_rating: number | null; reason: string; rule_status: string; company: string; tags: string[] };

/** Riya's rule corrections, reviewed together by Kushal (PRD 11.1). Accepting never edits the card. */
export function PendingRules({ rows, canDecide }: { rows: RuleRow[]; canDecide: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (rows.length === 0) return <p className="text-muted">None yet. Riya&apos;s rule corrections collect here for you to review together.</p>;
  return (
    <ul className="mt-2 space-y-3">
      {rows.map((r) => (
        <li key={r.id} className="rounded-[10px] border border-border p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[13px]"><span className="font-mono text-[11px] text-muted">{r.criterion_id}</span> on {r.company}: {r.old_rating} to {r.new_rating}</span>
            <span className={`text-[10.5px] tracking-[0.14em] uppercase ${r.rule_status === "accepted" ? "text-go" : r.rule_status === "declined" ? "text-muted" : "text-needs-human"}`}>{r.rule_status}</span>
          </div>
          <p className="mt-1 text-[13px]">“{r.reason}”</p>
          {r.tags.length ? <p className="mt-1 text-[11px] text-muted">Recalled for: {r.tags.join(", ")}</p> : null}
          {canDecide && r.rule_status === "pending" ? (
            <div className="mt-2 flex gap-2">
              {(["accepted", "declined"] as const).map((s) => (
                <button key={s} disabled={busy === r.id} className={`btn ${s === "accepted" ? "btn-primary" : "btn-secondary"}`} onClick={async () => {
                  setBusy(r.id);
                  await fetch(`/api/corrections/${r.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: s }) });
                  setBusy(null);
                  router.refresh();
                }}>{s === "accepted" ? "Keep as context" : "Decline"}</button>
              ))}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
