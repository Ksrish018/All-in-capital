import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { currentActor } from "@/lib/actor";
import { SIGN_OFF_STATUSES, boardColumn, type BoardColumn } from "@/lib/gates";
import { BulkSignOff } from "./bulk";

const COLUMNS: { id: BoardColumn; label: string; hint: string }[] = [
  { id: "agreed", label: "Agreed with system", hint: "Can be signed off together" },
  { id: "disagreed", label: "Riya differed", hint: "Open one by one" },
  { id: "flagged", label: "Flagged", hint: "Open one by one" },
  { id: "conflict", label: "Hold for conflict", hint: "Speak to the portfolio founder first" },
];
const REC: Record<string, string> = { go: "GO", pass: "PASS", needs_human: "Needs a person", hold: "Hold" };

/** Gate 2 (PRD 13.7): every application Riya has decided, plus portfolio conflicts. */
export default async function SignOffPage() {
  const actor = await currentActor();
  const db = createAdminClient();
  const { data: apps } = await db.from("applications").select("id, company_name, status, status_reason").in("status", [...SIGN_OFF_STATUSES]).order("received_at");
  const ids = (apps ?? []).map((a) => a.id);
  const [{ data: briefs }, { data: reviews }] = ids.length
    ? await Promise.all([
        db.from("briefs").select("application_id, rec_public, rec_revealed, headline_lens, flags").in("application_id", ids),
        db.from("reviews").select("application_id, decision, agreed_with_system, reason, system_recommendation, created_at").in("application_id", ids).eq("gate", 1).order("created_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];
  const cards = (apps ?? []).map((a) => {
    const b = briefs?.find((x) => x.application_id === a.id);
    const r = reviews?.find((x) => x.application_id === a.id);
    const flags = (b?.flags ?? []) as { id: string; label: string; severity: string }[];
    return {
      ...a, flags, riya: r?.decision ?? null, reason: r?.reason ?? null, agreed: r?.agreed_with_system ?? null,
      system: r?.system_recommendation ?? (b?.headline_lens === "public" ? b?.rec_public : b?.rec_revealed) ?? null,
      column: boardColumn({ status: a.status, agreed: r?.agreed_with_system ?? null, flags }),
    };
  });
  const isKushal = actor.role === "kushal";

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="rise">
        <div className="eyebrow">All In Capital · Gate 2</div>
        <h1 className="mt-3 text-[40px] leading-[1.05] md:text-[56px]">Sign <em className="text-accent">off</em></h1>
        <p className="mt-3 max-w-2xl text-[15px] text-muted">Nobody is rejected or advanced on their own. Nothing reaches a founder before Kushal signs off here.</p>
      </div>
      <div className="hairline mt-6" />
      {!isKushal ? <p className="mt-6 border-l border-needs-human pl-4 text-[13px] text-needs-human">You are working as {actor.name}. Only Kushal signs off, so the actions are hidden.</p> : null}

      <div className="mt-6 -mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
        <div className="grid min-w-[1000px] grid-cols-4 gap-4">
          {COLUMNS.map((col) => {
            const list = cards.filter((c) => c.column === col.id);
            return (
              <section key={col.id} aria-label={col.label} className="flex min-h-80 flex-col rounded-[14px] border border-border bg-surface-2/40 p-3">
                <div className="px-1 pt-1 pb-3">
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-[20px]">{col.label}</h2>
                    <span className="font-display text-[20px] text-muted tabular-nums">{list.length}</span>
                  </div>
                  <div className="text-[11px] tracking-[0.12em] text-muted uppercase">{col.hint}</div>
                </div>
                {col.id === "agreed" && isKushal && list.length ? (
                  <BulkSignOff items={list.map((c) => ({ id: c.id, name: c.company_name, decision: c.riya }))} />
                ) : (
                  <div className="flex flex-1 flex-col gap-2.5">
                    {list.length === 0 ? (
                      <div className="flex flex-1 items-center justify-center rounded-[10px] border border-dashed border-border py-8 text-[12px] text-muted italic">Nothing here</div>
                    ) : (
                      list.map((c) => (
                        <Link key={c.id} href={`/applications/${c.id}`} className="panel-sm block p-3.5 transition-colors duration-200 hover:border-brass/70">
                          <div className="font-display text-[18px]">{c.company_name}</div>
                          <div className="mt-1 text-[12px]">
                            {c.riya ? <>Riya: <span className="font-semibold">{REC[c.riya] ?? c.riya}</span></> : "Not reviewed"}
                            <span className="text-muted"> · System: {c.system ? REC[c.system] : "none"}</span>
                          </div>
                          {c.reason ? <p className="mt-1 line-clamp-2 text-[12px] text-muted">“{c.reason}”</p> : null}
                          {c.flags.filter((f) => f.severity !== "Soft").length ? (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {c.flags.filter((f) => f.severity !== "Soft").map((f) => (
                                <span key={f.id} className="rounded-[3px] border border-flag/40 px-1.5 text-[10.5px] text-flag">{f.label}</span>
                              ))}
                            </div>
                          ) : null}
                        </Link>
                      ))
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
