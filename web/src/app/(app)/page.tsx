import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { currentActor } from "@/lib/actor";
import {
  ACTIVE, STAGES, STATUS_LABEL, ago, flagLabel, samplePipeline, stageOf, toneOf, waitingOn,
  type PipelineApp, type PipelineEvent, type StageId, type Tone,
} from "@/lib/pipeline";
import { LiveRefresh } from "./live";

// Flow bar shades: grey at intake, deepening to the fund's red at the gates.
const SHADE: Record<StageId, string> = {
  intake: "bg-[#6b6b6b]",
  checks: "bg-[#8a3a37]",
  research: "bg-[#a8322f]",
  riya: "bg-[#c62f2b]",
  kushal: "bg-[#ff534f]",
  decided: "bg-[#3d3d3d]",
};

const TONE_TEXT: Record<Tone, string> = {
  go: "text-go", pass: "text-pass", hold: "text-hold", flag: "text-flag",
  "needs-human": "text-needs-human", active: "text-accent", plain: "text-muted",
};
const TONE_RING: Record<Tone, string> = {
  go: "border-go/50", pass: "border-border", hold: "border-hold/60", flag: "border-flag/50",
  "needs-human": "border-needs-human", active: "border-accent/60", plain: "border-border",
};

async function load(): Promise<{ apps: PipelineApp[]; events: PipelineEvent[] }> {
  const db = createAdminClient();
  const [{ data: apps }, { data: events }] = await Promise.all([
    db.from("applications")
      .select("id, company_name, source, status, status_reason, last_step, short_circuit_flags, received_at")
      .order("received_at", { ascending: false }),
    db.from("events")
      .select("id, to_status, note, actor, at, applications(company_name)")
      .not("application_id", "is", null)
      .order("at", { ascending: false })
      .limit(8),
  ]);
  return {
    apps: (apps ?? []) as PipelineApp[],
    events: (events ?? []).map((e) => ({
      id: e.id, to_status: e.to_status, note: e.note, actor: e.actor, at: e.at,
      company: (e.applications as unknown as { company_name: string } | null)?.company_name ?? "Unknown",
    })) as PipelineEvent[],
  };
}

/** Reads the pipeline and stamps the time it was read, so every "ago" on the page uses one clock. */
async function getData(sample: boolean) {
  const now = Date.now();
  return { ...(sample ? samplePipeline(now) : await load()), now };
}

export default async function PipelinePage({ searchParams }: PageProps<"/">) {
  const sample = (await searchParams).sample === "1";
  const actor = await currentActor();
  const { apps, events, now } = await getData(sample);

  const byStage = Object.fromEntries(STAGES.map((s) => [s.id, [] as PipelineApp[]])) as Record<StageId, PipelineApp[]>;
  for (const a of apps) byStage[stageOf(a.status, a.last_step)].push(a);
  const total = apps.length;
  const mine = waitingOn(actor.role);
  const waiting = mine ? byStage[mine].length : 0;
  const attention = apps.filter((a) => toneOf(a.status) === "needs-human").length;
  const working = apps.filter((a) => ACTIVE.includes(a.status)).length;
  const longest = apps
    .filter((a) => stageOf(a.status, a.last_step) !== "decided")
    .sort((x, y) => x.received_at.localeCompare(y.received_at))
    .slice(0, 3);

  return (
    <div className="max-w-[1400px]">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-tight font-bold md:text-[34px]">
            Every application, <span className="relative inline-block italic text-accent">live
              <svg aria-hidden="true" viewBox="0 0 100 12" preserveAspectRatio="none" className="absolute -bottom-1.5 left-0 h-2 w-full text-accent">
                <path d="M2 8 C 25 3, 45 11, 62 6 S 90 4, 98 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <p className="mt-2 text-muted">From arrival to Kushal&apos;s sign off. People decide every outcome.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LiveRefresh paused={sample} />
          <Link
            href={sample ? "/" : "/?sample=1"}
            className="rounded-full border border-border px-3 py-1 text-[12px] text-muted hover:border-accent hover:text-text"
          >
            {sample ? "Show real data" : "Preview with sample data"}
          </Link>
        </div>
      </div>

      {sample ? (
        <p role="note" className="mt-4 rounded-xl border border-needs-human/60 bg-needs-human/10 px-4 py-2 text-needs-human">
          Sample data. These are the ten case applicants placed at made-up stages to preview the design. Nothing here is real.
        </p>
      ) : null}

      {/* C: the flow and the live feed */}
      <section aria-label="Where every application is" className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col rounded-2xl border border-border bg-surface p-5 md:p-6">
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
            <div>
              <div className="font-display text-[44px] leading-none font-extrabold tabular-nums">{total}</div>
              <div className="mt-1 text-muted">applications in the pipeline</div>
            </div>
            <Stat n={working} label="being worked on now" tone="text-accent" />
            <Stat n={attention} label="need attention" tone={attention ? "text-needs-human" : "text-muted"} />
            {mine ? <Stat n={waiting} label={`waiting on ${actor.name}`} tone={waiting ? "text-text" : "text-muted"} /> : null}
          </div>

          {/* One bar, one segment per stage, width by count */}
          <div className="mt-6 flex h-9 w-full gap-1 overflow-hidden rounded-full bg-surface-2" role="img"
            aria-label={STAGES.map((s) => `${s.label}: ${byStage[s.id].length}`).join(", ")}>
            {total === 0 ? (
              <div className="flex flex-1 items-center justify-center text-[12px] text-muted">Empty. The bar fills as applications arrive.</div>
            ) : (
              STAGES.filter((s) => byStage[s.id].length > 0).map((s) => (
                <div
                  key={s.id}
                  style={{ flexGrow: byStage[s.id].length }}
                  className={`${SHADE[s.id]} flex min-w-9 basis-0 items-center justify-center font-semibold text-white tabular-nums`}
                  title={`${s.label}: ${byStage[s.id].length}`}
                >
                  {byStage[s.id].length}
                </div>
              ))
            )}
          </div>
          <ol className="mt-3 mb-5 grid grid-cols-3 gap-x-4 gap-y-2 sm:grid-cols-6">
            {STAGES.map((s) => (
              <li key={s.id} className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`size-2.5 shrink-0 rounded-full ${SHADE[s.id]}`} aria-hidden="true" />
                  <span className="text-[12px] whitespace-nowrap text-muted">{s.label.replace("Cheap checks", "Checks")}</span>
                </div>
                <div className="pl-4 font-semibold tabular-nums">{byStage[s.id].length}</div>
              </li>
            ))}
          </ol>

          {longest.length > 0 ? (
            <div className="mt-auto border-t border-border pt-4">
              <div className="text-[12px] tracking-wide text-muted uppercase">Waiting longest</div>
              <ul className="mt-2 flex flex-wrap gap-2">
                {longest.map((a) => (
                  <li key={a.id} className="rounded-full border border-border bg-surface-2 px-3 py-1 text-[13px]">
                    <span className="font-semibold">{a.company_name}</span>{" "}
                    <span className="text-muted">
                      in {STAGES.find((s) => s.id === stageOf(a.status, a.last_step))!.label} · {ago(a.received_at, now)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 md:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-bold">What just happened</h2>
            {!sample ? <span className="live-dot" aria-hidden="true" /> : null}
          </div>
          {events.length === 0 ? (
            <p className="mt-4 text-muted">Nothing yet. Each step every application takes will show here as it happens.</p>
          ) : (
            <ol className="mt-3 space-y-0">
              {events.map((e, i) => (
                <li key={e.id} className="relative flex gap-3 pb-3 last:pb-0">
                  <div className="flex flex-col items-center">
                    <span className={`mt-1.5 size-2.5 rounded-full ${i === 0 ? "bg-accent" : "bg-border"}`} aria-hidden="true" />
                    {i < events.length - 1 ? <span className="mt-1 w-px flex-1 bg-border" aria-hidden="true" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate">
                        <span className="font-semibold">{e.company}</span>{" "}
                        <span className={TONE_TEXT[toneOf(e.to_status)]}>{STATUS_LABEL[e.to_status].toLowerCase()}</span>
                      </span>
                      <span className="shrink-0 text-[12px] text-muted tabular-nums">{ago(e.at, now)}</span>
                    </div>
                    {e.note || e.actor !== "system" ? (
                      <div className="truncate text-[12px] text-muted">
                        {e.actor !== "system" ? `by ${e.actor.charAt(0).toUpperCase() + e.actor.slice(1)}` : ""}
                        {e.note && e.actor !== "system" ? " · " : ""}
                        {e.note}
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {/* A: the board */}
      <section aria-label="Pipeline board" className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[18px] font-bold">Board</h2>
          <p className="text-[12px] text-muted">
            <span className="live-dot mr-1.5 align-middle" aria-hidden="true" />working now
            <span className="mx-2">·</span><span className="text-flag">red edge</span> flagged
            <span className="mx-2">·</span><span className="text-needs-human">amber edge</span> needs attention
          </p>
        </div>
        <div className="mt-3 -mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
          <div className="grid min-w-[1080px] grid-cols-6 gap-3">
            {STAGES.map((s, i) => {
              const cards = byStage[s.id];
              const yours = s.id === mine;
              return (
                <div key={s.id} className={`flex min-h-64 flex-col rounded-2xl p-2.5 ${yours ? "bg-accent/10 ring-1 ring-accent/40" : "bg-surface-2/60"}`}>
                  <div className="px-1.5 pt-1 pb-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-bold">
                        <span className="mr-1 text-muted">{i + 1}</span>{s.label}
                      </span>
                      <span className={`rounded-full px-2 text-[12px] font-semibold tabular-nums ${cards.length ? "bg-text text-bg" : "bg-surface text-muted"}`}>
                        {cards.length}
                      </span>
                    </div>
                    <div className="text-[12px] text-muted">{yours ? "Waiting on you" : s.hint}</div>
                  </div>
                  <div className="flex flex-1 flex-col gap-2">
                    {cards.length === 0 ? (
                      <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12px] text-muted">
                        Nothing here
                      </div>
                    ) : (
                      cards.map((a) => <Card key={a.id} a={a} now={now} />)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {total === 0 && !sample ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface px-6 py-8 text-center">
          <div className="font-display text-[18px] font-bold">No applications yet</div>
          <p className="mt-1 text-muted">Upload arrives in milestone M2. Until then, preview the board with sample data.</p>
          <Link href="/?sample=1" className="mt-4 inline-block rounded-full bg-accent-strong px-5 py-2 font-semibold text-white hover:opacity-90">
            Preview with sample data
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div>
      <div className={`font-display text-[24px] leading-none font-bold tabular-nums ${tone}`}>{n}</div>
      <div className="mt-1 text-[12px] text-muted">{label}</div>
    </div>
  );
}

function Card({ a, now }: { a: PipelineApp; now: number }) {
  const tone = toneOf(a.status, a.short_circuit_flags);
  const working = ACTIVE.includes(a.status);
  return (
    <article className={`rounded-xl border bg-surface p-3 transition-colors hover:border-accent ${TONE_RING[tone]}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="min-w-0 text-[14px] font-bold break-words">{a.company_name}</h3>
        {a.source === "warm_intro" ? (
          <span className="rounded-full bg-hold/15 px-2 text-[11px] font-medium text-hold">Warm intro</span>
        ) : null}
      </div>
      <div className={`mt-1 flex items-center gap-1.5 text-[12px] ${TONE_TEXT[tone === "flag" ? (working ? "active" : "plain") : tone]}`}>
        {working ? <span className="live-dot" aria-hidden="true" /> : null}
        <span>{STATUS_LABEL[a.status]}</span>
      </div>
      {a.status_reason ? <p className="mt-1.5 line-clamp-2 text-[12px] text-muted">{a.status_reason}</p> : null}
      {a.short_circuit_flags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {a.short_circuit_flags.map((f) => (
            <span key={f} className="rounded-full border border-flag/50 px-2 text-[11px] text-flag">{flagLabel(f)}</span>
          ))}
        </div>
      ) : null}
      <div className="mt-2 text-[11px] text-muted tabular-nums">Arrived {ago(a.received_at, now)}</div>
    </article>
  );
}
