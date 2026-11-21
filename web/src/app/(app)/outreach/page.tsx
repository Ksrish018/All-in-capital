import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { currentActor } from "@/lib/actor";
import { formatSlot, type Slot } from "@/lib/outreach/rules";
import { CallTap, Composer, ConversationActions, RunAgent } from "./parts";

const STATUS: Record<string, string> = {
  draft_ready: "Draft waiting", sent: "Sent, waiting for a reply", followup_1_ready: "Follow up 1 waiting", followup_1_sent: "Follow up 1 sent",
  followup_2_ready: "Follow up 2 waiting", followup_2_sent: "Follow up 2 sent", no_response: "No response", scheduling: "Scheduling",
  booked: "Booked", declined: "Declined", with_riya: "With Riya", closed: "Closed", call_done: "Call done",
};
const LABEL: Record<string, string> = {
  picked_slot: "Picked a slot", interested_new_time: "Interested, new time", interested_no_time: "Interested, no time",
  not_interested: "Not interested", unclear: "Unclear", out_of_office: "Out of office",
};

/** Outreach (PRD 13.8): drafts to send, live conversations, and what the agent handed to Riya. */
export default async function OutreachPage() {
  const actor = await currentActor();
  const db = createAdminClient();
  const [{ data: rows }, { data: modeRow }] = await Promise.all([
    db.from("outreach").select("*, applications(company_name), emails(*), replies(*)").order("created_at", { ascending: false }),
    db.from("settings").select("value").eq("key", "outreach_mode").maybeSingle(),
  ]);
  const mode = modeRow?.value === "live" ? "live" : "simulate";
  type Email = { id: string; kind: string; draft_subject: string; draft_body: string; sent_subject: string | null; sent_at: string | null; to_address: string | null; slots: Slot[]; created_at: string };
  type Reply = { id: string; body: string; label: string | null; confidence: number | null; received_at: string };
  type Row = {
    id: string; application_id: string; outcome: string; status: string; reason: string | null; founder_email: string | null; paused: boolean;
    scheduling_round: number; slots_offered: Slot[]; next_step_at: string | null; handoff_reason: string | null;
    company: string; emails: Email[]; replies: Reply[];
  };
  const all: Row[] = (rows ?? []).map((o) => ({
    ...o,
    company: (o.applications as unknown as { company_name: string })?.company_name ?? "",
    emails: ((o.emails ?? []) as Email[]).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    replies: ((o.replies ?? []) as Reply[]).sort((a, b) => a.received_at.localeCompare(b.received_at)),
  }));
  const drafts = all.flatMap((o) => o.emails.filter((e) => !e.sent_at).map((e) => ({ o, e })));
  const live = all.filter((o) => ["sent", "followup_1_sent", "followup_2_sent", "scheduling", "booked"].includes(o.status) && !o.emails.some((e) => !e.sent_at));
  const withRiya = all.filter((o) => ["with_riya", "no_response"].includes(o.status));
  const done = all.filter((o) => ["closed", "declined", "call_done"].includes(o.status));
  const isRiya = actor.role === "riya";

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">All In Capital · Gate 3</div>
          <h1 className="mt-3 text-[40px] leading-[1.05] md:text-[56px]">Out<em className="text-accent">reach</em></h1>
          <p className="mt-3 max-w-2xl text-[15px] text-muted">Every email is drafted for Riya and leaves only when she clicks send. There is no send all.</p>
        </div>
        {actor.role !== "aditya" ? <RunAgent /> : null}
      </div>
      <div className="hairline mt-6" />
      <p role="note" className={`mt-6 border-l pl-4 text-[13px] ${mode === "live" ? "border-flag text-flag" : "border-needs-human text-needs-human"}`}>
        {mode === "live"
          ? "Live mode. Emails go out from Riya's Gmail and calendar invites are real."
          : "Simulate mode. Every step runs, but no email leaves and no calendar event is made. Founder replies can be simulated below. Kushal switches to live in Settings."}
      </p>

      <section aria-label="To send" className="mt-8">
        <div className="flex items-baseline justify-between"><h2 className="text-[26px]">To send</h2><span className="font-display text-[22px] text-muted">{drafts.length}</span></div>
        {drafts.length === 0 ? <p className="mt-2 text-muted">No drafts waiting. New ones appear after Kushal signs off, or when the agent needs a reply sent.</p> : (
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {drafts.map(({ o, e }) => (
              <article key={e.id} className="panel p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/applications/${o.application_id}`} className="font-display text-[22px] hover:underline">{o.company}</Link>
                  <span className={`text-[11px] tracking-[0.14em] uppercase ${o.outcome === "go" ? "text-go" : "text-pass"}`}>{o.outcome === "go" ? "GO" : "PASS"} · {e.kind.replace("_", " ")}</span>
                </div>
                {o.reason ? <p className="mt-1 line-clamp-2 text-[12px] text-muted">{o.reason}</p> : null}
                {e.slots?.length ? <div className="mt-3 flex flex-wrap gap-1.5">{e.slots.map((s) => <span key={s.start} className="rounded-full border border-brass/60 px-2.5 py-0.5 text-[11.5px] text-brass">{formatSlot(s)}</span>)}</div> : null}
                <Composer id={e.id} to={e.to_address ?? o.founder_email ?? ""} subject={e.draft_subject} body={e.draft_body} canSend={isRiya} live={mode === "live"} />
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Live" className="mt-10">
        <div className="flex items-baseline justify-between"><h2 className="text-[26px]">Live</h2><span className="font-display text-[22px] text-muted">{live.length}</span></div>
        {live.length === 0 ? <p className="mt-2 text-muted">No open conversations.</p> : (
          <ul className="panel mt-3 divide-y divide-border">
            {live.map((o) => {
              const last = o.replies.at(-1);
              return (
                <li key={o.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto]">
                  <div>
                    <div className="font-display text-[19px]">{o.company}</div>
                    <div className="text-[12px] text-muted">{STATUS[o.status]}{o.paused ? " · paused" : ""}{o.scheduling_round ? ` · round ${o.scheduling_round}` : ""}</div>
                  </div>
                  <div className="text-[12.5px]">
                    {o.status === "booked" && o.slots_offered?.[0] ? <div className="text-go">Call on {formatSlot(o.slots_offered[0])}</div> : null}
                    {last ? <div><span className="text-muted">Last reply:</span> “{last.body.slice(0, 120)}” {last.label ? <span className="text-brass">({LABEL[last.label]})</span> : null}</div> : <div className="text-muted">No reply yet.</div>}
                    {o.next_step_at && o.status !== "booked" ? <div className="text-muted">Next check {new Date(o.next_step_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div> : null}
                  </div>
                  <ConversationActions id={o.id} paused={o.paused} isRiya={isRiya} simulate={mode === "simulate" && actor.role !== "aditya" && o.status !== "booked"} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="With Riya" className="mt-10">
        <div className="flex items-baseline justify-between"><h2 className="text-[26px]">With Riya</h2><span className="font-display text-[22px] text-muted">{withRiya.length}</span></div>
        {withRiya.length === 0 ? <p className="mt-2 text-muted">Nothing handed over.</p> : (
          <ul className="mt-3 space-y-2">
            {withRiya.map((o) => (
              <li key={o.id} className="panel-sm border-l-2 border-l-needs-human px-4 py-3 text-[13px]">
                <span className="font-display text-[17px]">{o.company}</span> <span className="text-needs-human">· {o.handoff_reason ?? STATUS[o.status]}</span>
                {o.replies.at(-1) ? <p className="mt-1 text-muted">“{o.replies.at(-1)!.body.slice(0, 200)}”</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Done" className="mt-10">
        <div className="flex items-baseline justify-between"><h2 className="text-[26px]">Done</h2><span className="font-display text-[22px] text-muted">{done.length}</span></div>
        {done.length === 0 ? <p className="mt-2 text-muted">Nothing finished yet.</p> : (
          <ul className="panel mt-3 divide-y divide-border">
            {done.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <span><span className="font-display text-[17px]">{o.company}</span> <span className="text-[12px] text-muted">· {STATUS[o.status]}</span></span>
                {o.status === "call_done" ? <CallTap appId={o.application_id} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
