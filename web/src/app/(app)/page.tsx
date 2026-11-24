import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { currentActor } from "@/lib/actor";
import {
  STAGES, STATUS_LABEL, ago, flagLabel, isWorking, samplePipeline, stageOf, toneOf, waitingOn,
  type PipelineApp, type PipelineEvent, type StageId, type Tone,
} from "@/lib/pipeline";
import { LiveRefresh } from "./live";
import { CountUp } from "./count-up";

// Each stage has its own jewel tone from the theme: pewter, topaz, sapphire, ruby, gold, emerald.
const SHADE: Record<StageId, string> = {
  intake: "bg-stage-1",
  checks: "bg-stage-2",
  research: "bg-stage-3",
  riya: "bg-stage-4",
  kushal: "bg-stage-5",
  decided: "bg-stage-6",
};

const STAGE_TEXT: Record<StageId, string> = {
  intake: "text-stage-1",
  checks: "text-stage-2",
  research: "text-stage-3",
  riya: "text-stage-4",
  kushal: "text-stage-5",
  decided: "text-stage-6",
};
const STAGE_VAR: Record<StageId, string> = {
  intake: "var(--stage-1)", checks: "var(--stage-2)", research: "var(--stage-3)", riya: "var(--stage-4)", kushal: "var(--stage-5)", decided: "var(--stage-6)",
};
const TONE_DOT: Record<Tone, string> = {
  go: "text-go", pass: "text-pass", hold: "text-hold", flag: "text-flag",
  "needs-human": "text-needs-human", active: "text-sapphire", plain: "text-pewter",
};

const TONE_TEXT: Record<Tone, string> = {
  go: "text-go", pass: "text-pass", hold: "text-hold", flag: "text-flag",
  "needs-human": "text-needs-human", active: "text-sapphire", plain: "text-muted",
};
const TONE_EDGE: Record<Tone, string> = {
  go: "before:bg-go", pass: "before:bg-[var(--edge)]", hold: "before:bg-hold", flag: "before:bg-flag",
  "needs-human": "before:bg-needs-human", active: "before:bg-sapphire", plain: "before:bg-[var(--edge)]",
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
  const working = apps.filter((a) => isWorking(a.status, a.last_step)).length;
  const longest = apps
    .filter((a) => stageOf(a.status, a.last_step) !== "decided")
    .sort((x, y) => x.received_at.localeCompare(y.received_at))
    .slice(0, 3);

  return (
    <div className="mx-auto max-w-[1400px]">
      {/* Header */}
      <header className="rise">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="eyebrow">All In Capital · Pipeline</div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/applications/new"
              className="btn btn-primary"
            >
              Add applications
            </Link>
            <LiveRefresh paused={sample} />
            <Link
              href={sample ? "/" : "/?sample=1"}
              className="btn btn-secondary"
            >
              {sample ? "Show real data" : "Preview with sample data"}
            </Link>
          </div>
        </div>
        <h1 className="mt-3 text-[40px] leading-[1.05] md:text-[60px]">
          Every application, <em className="text-accent">live</em>
        </h1>
        <p className="mt-3 max-w-xl text-[15px] text-muted">From arrival to Kushal&apos;s sign off. People decide every outcome.</p>
        <div className="hairline mt-6" />
      </header>

      {sample ? (
        <p role="note" className="mt-6 border-l border-needs-human pl-4 text-[13px] text-needs-human">
          Sample data. The ten case applicants, placed at made-up stages to preview the design. Nothing here is real.
        </p>
      ) : null}

      {/* The flow and the live feed */}
      <section aria-label="Where every application is" className="rise mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" style={{ animationDelay: "80ms" }}>
        <div className="flex flex-col panel p-6 md:p-8">
          <div className="flex flex-wrap items-end gap-x-9 gap-y-5">
            <div>
              <div className="font-display text-[84px] leading-[0.85]"><CountUp value={total} /></div>
              <div className="eyebrow mt-3">In the pipeline</div>
            </div>
            <Stat n={working} label="Being worked on" tone={working ? "text-sapphire" : "text-muted"} />
            <Stat n={attention} label="Need attention" tone={attention ? "text-needs-human" : "text-muted"} />
            {mine ? <Stat n={waiting} label={`Waiting on ${actor.name}`} tone={waiting ? "text-text" : "text-muted"} /> : null}
          </div>

          {/* One fine bar, one segment per stage, width by count */}
          <div
            className="mt-8 flex h-2.5 w-full gap-[3px]"
            role="img"
            aria-label={STAGES.map((s) => `${s.label}: ${byStage[s.id].length}`).join(", ")}
          >
            {total === 0 ? (
              <div className="h-full flex-1 rounded-full bg-surface-2" />
            ) : (
              STAGES.filter((s) => byStage[s.id].length > 0).map((s) => (
                <div
                  key={s.id}
                  style={{ flexGrow: byStage[s.id].length, animationDelay: `${120 + STAGES.indexOf(s) * 90}ms` }}
                  className={`${SHADE[s.id]} grow h-full basis-0 rounded-full ${byStage[s.id].some((a) => isWorking(a.status, a.last_step)) ? "sheen" : ""}`}
                  title={`${s.label}: ${byStage[s.id].length}`}
                />
              ))
            )}
          </div>
          <ol className="mt-5 mb-6 grid grid-cols-3 gap-x-4 gap-y-4 sm:grid-cols-6">
            {STAGES.map((s) => (
              <li key={s.id} className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`size-2 shrink-0 rounded-full ${SHADE[s.id]}`} aria-hidden="true" />
                  <span className={`text-[11px] tracking-[0.12em] whitespace-nowrap uppercase ${STAGE_TEXT[s.id]}`}>{s.label.replace("Cheap checks", "Checks")}</span>
                </div>
                <div className="mt-1 font-display text-[26px] leading-none"><CountUp value={byStage[s.id].length} /></div>
              </li>
            ))}
          </ol>

          {total === 0 ? (
            <p className="mt-auto text-[13px] text-muted">The bar fills as applications arrive.</p>
          ) : longest.length > 0 ? (
            <div className="mt-auto border-t border-border pt-5">
              <div className="eyebrow">Waiting longest</div>
              <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                {longest.map((a) => (
                  <li key={a.id} className="text-[13px]">
                    <span className="font-display text-[17px]">{a.company_name}</span>{" "}
                    <span className="text-muted">
                      {STAGES.find((s) => s.id === stageOf(a.status, a.last_step))!.label} · {ago(a.received_at, now)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="panel p-6 md:p-8">
          <div className="flex items-center justify-between">
            <h2 className="text-[24px]">What just happened</h2>
            {!sample ? <span className="live-dot" aria-hidden="true" /> : null}
          </div>
          <div className="hairline mt-3 mb-4" />
          {events.length === 0 ? (
            <p className="text-muted">Nothing yet. Each step every application takes will show here as it happens.</p>
          ) : (
            <ol>
              {events.map((e, i) => (
                <li key={e.id} className="flex gap-3 pb-3.5 last:pb-0">
                  <div className="flex flex-col items-center">
                    <span className={`mt-[7px] size-[7px] rounded-full ${TONE_DOT[toneOf(e.to_status)]} ${i === 0 ? "glow-dot" : "bg-current opacity-70"}`} aria-hidden="true" />
                    {i < events.length - 1 ? <span className="mt-1 w-px flex-1 bg-border" aria-hidden="true" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate">
                        <span className="font-display text-[16px]">{e.company}</span>{" "}
                        <span className={`tint ml-1 ${TONE_TEXT[toneOf(e.to_status)]}`}>{STATUS_LABEL[e.to_status].toLowerCase()}</span>
                      </span>
                      <span className="shrink-0 text-[11px] text-muted tabular-nums">{ago(e.at, now)}</span>
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

      {/* The board */}
      <section aria-label="Pipeline board" className="rise mt-12" style={{ animationDelay: "160ms" }}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">Stage by stage</div>
            <h2 className="mt-1 text-[32px] leading-none">The board</h2>
          </div>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
            <span><span className="live-dot dot-current mr-1.5 align-middle text-sapphire" aria-hidden="true" />working now</span>
            <span><span className="mr-1.5 inline-block h-3 w-[2px] bg-flag align-middle" />flagged</span>
            <span><span className="mr-1.5 inline-block h-3 w-[2px] bg-needs-human align-middle" />needs attention</span>
            <span><span className="mr-1.5 inline-block h-3 w-[2px] bg-hold align-middle" />held</span>
          </p>
        </div>
        <div className="hairline mt-4" />
        <div className="mt-5 -mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
          <div className="grid min-w-[1080px] grid-cols-6 gap-4">
            {STAGES.map((s, i) => {
              const cards = byStage[s.id];
              const yours = s.id === mine;
              return (
                <div
                  key={s.id}
                  style={{ borderTopColor: STAGE_VAR[s.id] }}
                  className={`flex min-h-72 flex-col rounded-[14px] border border-t-[3px] p-3 ${yours ? "border-x-brass/70 border-b-brass/70 bg-surface" : "border-x-border border-b-border bg-surface-2/40"}`}
                >
                  <div className="px-1 pt-1 pb-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-display text-[20px] leading-none">
                        <span className={`mr-1.5 text-[13px] italic ${STAGE_TEXT[s.id]}`}>{["i", "ii", "iii", "iv", "v", "vi"][i]}</span>
                        {s.label}
                      </span>
                      <span className={`font-display text-[20px] leading-none ${cards.length ? STAGE_TEXT[s.id] : "text-muted"}`}><CountUp value={cards.length} /></span>
                    </div>
                    <div className={`mt-1.5 text-[11px] tracking-[0.12em] uppercase ${yours ? "text-brass" : "text-muted"}`}>
                      {yours ? "Waiting on you" : s.hint}
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-2.5">
                    {cards.length === 0 ? (
                      <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border px-3 py-6 text-center text-[12px] text-muted italic">
                        Nothing here
                      </div>
                    ) : (
                      cards.map((a, j) => <Card key={a.id} a={a} now={now} delay={200 + j * 60} edge={STAGE_VAR[s.id]} />)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {total === 0 && !sample ? (
        <div className="rise mt-10 panel px-6 py-12 text-center">
          <div className="eyebrow">Ready when they are</div>
          <div className="mt-2 font-display text-[34px] leading-tight">No applications yet</div>
          <p className="mx-auto mt-2 max-w-md text-muted">Upload a form and deck, or add a warm intro. You can also preview the board with sample data.</p>
          <Link
            href="/applications/new"
            className="btn btn-primary mt-6"
          >
            Add applications
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div>
      <div className={`font-display text-[40px] leading-[0.9] ${tone}`}><CountUp value={n} /></div>
      <div className="eyebrow mt-2">{label}</div>
    </div>
  );
}

function Card({ a, now, delay, edge }: { a: PipelineApp; now: number; delay: number; edge: string }) {
  const tone = toneOf(a.status, a.short_circuit_flags, a.last_step);
  const working = isWorking(a.status, a.last_step);
  const statusTone: Tone = working ? "active" : tone === "flag" ? "plain" : tone;
  return (
    <Link
      href={a.id.startsWith("s") && a.id.length < 4 ? "#" : `/applications/${a.id}`}
      style={{ animationDelay: `${delay}ms`, ["--edge" as string]: edge }}
      className={`rise lift relative block overflow-hidden panel-sm p-3.5 pl-4 before:absolute before:inset-y-0 before:left-0 before:w-[3px] hover:border-brass/70 ${TONE_EDGE[tone]} ${working ? "sheen" : ""}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="min-w-0 text-[19px] leading-tight break-words">{a.company_name}</h3>
        {a.source === "warm_intro" ? (
          <span className="text-[10px] tracking-[0.14em] text-brass uppercase">Warm intro</span>
        ) : null}
      </div>
      <div className="mt-1.5">
        <span className={`tint ${statusTone === "active" ? "text-sapphire" : TONE_TEXT[statusTone]}`}>
          {working ? <span className="live-dot" aria-hidden="true" /> : null}
          {a.last_step === "cheap_checks_done" ? "Checks done, waiting" : STATUS_LABEL[a.status]}
        </span>
      </div>
      {a.status_reason && a.last_step !== "cheap_checks_done" ? <p className="mt-1.5 line-clamp-2 text-[12px] text-muted">{a.status_reason}</p> : null}
      {a.short_circuit_flags.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {a.short_circuit_flags.map((f) => (
            <span key={f} className="tint text-[10.5px] text-flag">{flagLabel(f)}</span>
          ))}
        </div>
      ) : null}
      <div className="mt-2.5 text-[11px] text-muted tabular-nums">Arrived {ago(a.received_at, now)}</div>
    </Link>
  );
}
