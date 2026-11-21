import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { can, currentActor } from "@/lib/actor";
import { REVIEW_STATUSES, systemPosition, type SystemRec } from "@/lib/gates";
import { BriefView } from "../applications/[id]/brief";
import { QueueKeys } from "./queue-keys";

const LABEL: Record<string, string> = { go: "GO", pass: "PASS", hold: "Hold" };

/** Gate 1 (PRD 13.6): the queue on the left, oldest first, and the brief on the right. */
export default async function ReviewPage({ searchParams }: PageProps<"/review">) {
  const actor = await currentActor();
  const db = createAdminClient();
  const { data: apps } = await db
    .from("applications")
    .select("id, company_name, status, blind, blind_first_view, brief_ready_at, received_at, sent_back_note")
    .in("status", [...REVIEW_STATUSES])
    .order("brief_ready_at", { ascending: true, nullsFirst: false });
  const ids = (apps ?? []).map((a) => a.id);
  const { data: briefs } = ids.length ? await db.from("briefs").select("application_id, rec_public, rec_revealed, headline_lens").in("application_id", ids) : { data: [] };
  const queue = (apps ?? []).map((a) => {
    const b = briefs?.find((x) => x.application_id === a.id);
    const rec = (b?.headline_lens === "public" ? b?.rec_public : b?.rec_revealed) as SystemRec;
    return { ...a, system: systemPosition(rec, a.status), hidden: a.blind && !a.blind_first_view };
  });
  const sp = await searchParams;
  const current = typeof sp.id === "string" && queue.some((q) => q.id === sp.id) ? sp.id : queue[0]?.id;
  const at = queue.findIndex((q) => q.id === current);

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="rise flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">All In Capital · Gate 1</div>
          <h1 className="mt-3 text-[40px] leading-[1.05] md:text-[56px]">Review</h1>
        </div>
        <p className="text-[12px] text-muted">
          <kbd className="rounded border border-border px-1">J</kbd> <kbd className="rounded border border-border px-1">K</kbd> move ·{" "}
          <kbd className="rounded border border-border px-1">A</kbd> agree · <kbd className="rounded border border-border px-1">C</kbd> change ·{" "}
          <kbd className="rounded border border-border px-1">R</kbd> research
        </p>
      </div>
      <div className="hairline mt-6" />
      {!can.gate1(actor.role) ? (
        <p className="mt-6 border-l border-needs-human pl-4 text-[13px] text-needs-human">You are working as {actor.name}. Gate 1 is for Riya or Kushal, so the actions are hidden.</p>
      ) : null}

      {queue.length === 0 ? (
        <div className="panel rise mt-8 px-6 py-12 text-center">
          <div className="eyebrow">All clear</div>
          <div className="mt-2 font-display text-[30px]">Nothing waiting for review</div>
          <p className="mt-2 text-muted">New briefs appear here, oldest first, as soon as screening finishes.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
          <nav aria-label="Review queue" className="xl:sticky xl:top-8 xl:self-start">
            <div className="eyebrow">{queue.length} waiting</div>
            <ol className="panel mt-3 max-h-[70vh] divide-y divide-border overflow-y-auto">
              {queue.map((q, i) => (
                <li key={q.id}>
                  <Link
                    href={`/review?id=${q.id}`}
                    aria-current={q.id === current ? "page" : undefined}
                    className={`block px-4 py-3 transition-colors duration-200 ${q.id === current ? "bg-surface-2" : "hover:bg-surface-2/50"}`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-display text-[17px]">{q.company_name}</span>
                      <span className="text-[11px] text-muted tabular-nums">{i + 1}</span>
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-muted">
                      {q.hidden ? <span className="text-needs-human">Blind check</span> : q.system ? `System: ${LABEL[q.system]}` : "System: needs a person"}
                      {q.status === "short_circuited" ? " · stopped early" : ""}
                      {q.sent_back_note ? <span className="text-needs-human"> · sent back</span> : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
          <div className="min-w-0">
            {current ? <BriefView id={current} back={{ href: "/review", label: "Review queue" }} /> : null}
          </div>
          <QueueKeys prev={at > 0 ? queue[at - 1].id : null} next={at >= 0 && at < queue.length - 1 ? queue[at + 1].id : null} />
        </div>
      )}
    </div>
  );
}
