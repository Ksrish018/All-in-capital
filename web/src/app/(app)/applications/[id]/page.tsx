import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { can, currentActor } from "@/lib/actor";
import { STATUS_LABEL, ago, isWorking, type Status } from "@/lib/pipeline";
import type { FormField } from "@/lib/intake/form";
import { Requeue } from "./requeue";
import { CallSignals, Criteria, Disagree, Lenses, Research, type CriterionScore, type Ev } from "./sections";
import { LiveRefresh } from "../../live";

type BriefFlag = { id: string; label: string; severity: string; short_circuit: boolean; why: string; with?: string; evidence: { quote: string; source: string; ref: string }[] };

const REC: Record<string, { label: string; tone: string }> = {
  go: { label: "GO", tone: "text-go" },
  pass: { label: "PASS", tone: "text-pass" },
  needs_human: { label: "Likely pass, needs a person", tone: "text-needs-human" },
  hold: { label: "Hold for Kushal", tone: "text-hold" },
};

const FLAG_TONE: Record<string, { edge: string; text: string }> = {
  hold: { edge: "before:bg-hold", text: "text-hold" },
  "needs-human": { edge: "before:bg-needs-human", text: "text-needs-human" },
  flag: { edge: "before:bg-flag", text: "text-flag" },
};

/** One clock for the whole page, read when the data is read. */
async function readClock() {
  return Date.now();
}

export default async function ApplicationPage({ params }: PageProps<"/applications/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = createAdminClient();
  const actor = await currentActor();
  const [{ data: app }, { data: brief }, { data: docs }, { data: founders }, { data: calls }, { data: events }, { data: card }, { data: scores }, { data: evidenceRows }, { data: fetches }] = await Promise.all([
    db.from("applications").select("*").eq("id", id).maybeSingle(),
    db.from("briefs").select("*").eq("application_id", id).maybeSingle(),
    db.from("documents").select("kind, parsed").eq("application_id", id),
    db.from("founders").select("founder_key, name, role, bio, linkedin_url").eq("application_id", id).order("founder_key"),
    db.from("llm_calls").select("call_type, prompt_name, prompt_version, model, cost_usd, status, created_at").eq("application_id", id).order("created_at"),
    db.from("events").select("id, actor, from_status, to_status, note, at").eq("application_id", id).order("at"),
    db.from("thesis_cards").select("version, status, criteria").order("version", { ascending: false }).limit(1).maybeSingle(),
    db.from("criterion_scores").select("criterion_id, rating, strength, reason, evidence_refs, memo_refs, missing, capped_note").eq("application_id", id),
    db.from("evidence").select("id, field, quote, source_ref, url, strength, track, check_id, vague, value").eq("application_id", id),
    db.from("research_fetches").select("check_id, outcome, error, query_or_url").eq("application_id", id),
  ]);
  if (!app) notFound();

  const form = (docs?.find((d) => d.kind === "form")?.parsed as { form?: { fields: FormField[] } } | null)?.form;
  const deck = (docs?.find((d) => d.kind === "deck")?.parsed as { deck?: { pages: { page: number; text: string }[] } } | null)?.deck;
  const f = (k: string) => form?.fields.find((x) => x.key === k)?.value;
  const flags = (brief?.flags ?? []) as BriefFlag[];
  const gaps = (brief?.gaps ?? []) as { item: string; note: string }[];
  const status = app.status as Status;
  const working = isWorking(status, app.last_step) || ["received", "queued"].includes(status);
  const now = await readClock();
  const rec = brief?.rec_revealed ? REC[brief.rec_revealed] : null;
  const scored = (scores ?? []).length > 0;
  const evidence = new Map(((evidenceRows ?? []) as Ev[]).map((e) => [e.id, e]));
  const web = ((evidenceRows ?? []) as Ev[]).filter((e) => e.track === "2");
  const names = Object.fromEntries(((card?.criteria ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const memoIds = [...new Set((scores ?? []).flatMap((x) => x.memo_refs as string[]))];
  const { data: memoRows } = memoIds.length ? await db.from("memo_passages").select("id, company, section, decision").in("id", memoIds) : { data: [] };
  const memos = new Map((memoRows ?? []).map((m) => [m.id as string, { company: m.company as string, section: m.section as string, decision: m.decision as string }]));

  return (
    <div className="rise mx-auto max-w-[1400px]">
      {/* 1. Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="eyebrow hover:text-text">← Pipeline</Link>
        {working ? <LiveRefresh /> : null}
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-[44px] leading-[1.02] md:text-[64px]">{app.company_name}</h1>
          {f("one_line") ? <p className="mt-3 max-w-3xl font-display text-[20px] leading-snug text-muted italic">{f("one_line")}</p> : null}
        </div>
        <span className="rounded-full border border-brass/70 px-4 py-1.5 text-[12px] tracking-[0.12em] text-brass uppercase">
          {app.last_step === "cheap_checks_done" ? "Checks done, waiting for M3" : STATUS_LABEL[status]}
        </span>
      </div>
      <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3 text-[13px]">
        {[
          ["Sector", f("sector")],
          ["Stage", f("stage")],
          ["Raising", f("amount_raising")],
          ["Source", app.source === "warm_intro" ? `Warm intro${app.introduced_by ? `, ${app.introduced_by}` : ""}` : "Public form"],
          ["Received", `${new Date(app.received_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`],
        ].filter(([, v]) => v).map(([k, v]) => (
          <div key={k}>
            <dt className="eyebrow">{k}</dt>
            <dd className="mt-1">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="hairline mt-6" />

      {app.status === "needs_attention" ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-l-2 border-needs-human bg-needs-human/5 px-5 py-4">
          <div>
            <div className="eyebrow text-needs-human">Needs attention</div>
            <p className="mt-1">{app.status_reason}</p>
          </div>
          {can.gate1(actor.role) ? <Requeue id={app.id} mode="retry" label="Fix and re-queue" /> : null}
        </div>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-10">
          {/* 2. Flags first, because a flag can end the review */}
          <section aria-label="Flags">
            <div className="eyebrow">Flags</div>
            {flags.length === 0 ? (
              <p className="mt-3 text-muted">{brief ? "No cheap check hit." : working ? "The cheap checks have not run yet." : "No flags."}</p>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {flags.map((fl) => {
                  const tone = fl.id === "portfolio_conflict" ? "hold" : fl.severity === "Soft" ? "needs-human" : "flag";
                  return (
                    <article key={fl.id} className={`relative overflow-hidden panel p-5 before:absolute before:inset-y-0 before:left-0 before:w-[2px] ${FLAG_TONE[tone].edge}`}>
                      <div className="flex items-baseline justify-between gap-3">
                        <h2 className="text-[22px] leading-tight">{fl.label}{fl.with ? <span className="text-muted">: {fl.with}</span> : null}</h2>
                        <span className={`shrink-0 text-[10px] tracking-[0.14em] uppercase ${FLAG_TONE[tone].text}`}>
                          {fl.severity === "Soft" ? "Soft" : fl.short_circuit ? "Stops research" : fl.severity}
                        </span>
                      </div>
                      <p className="mt-2 text-[13.5px]">{fl.why}</p>
                      {fl.evidence.length ? (
                        <ul className="mt-3 space-y-2 border-t border-border pt-3">
                          {fl.evidence.map((e, i) => (
                            <li key={i} className="text-[12.5px]">
                              <span className="text-muted">“</span>{e.quote}<span className="text-muted">”</span>
                              <span className="ml-2 text-[11px] tracking-wide text-brass">{e.ref}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* 3. Recommendation, worked out in code. Both lenses once scored. */}
          {brief && scored ? <Lenses brief={brief} /> : null}
          {brief && !scored ? (
            <section aria-label="Recommendation">
              <div className="eyebrow">Recommendation</div>
              <div className="mt-3 panel p-6">
                {rec ? (
                  <div className={`font-display text-[30px] leading-tight ${rec.tone}`}>{rec.label}</div>
                ) : (
                  <div className="font-display text-[26px] leading-tight text-muted">Not scored yet</div>
                )}
                <p className="mt-2 max-w-3xl text-[14px]">{brief.summary}</p>
                <p className="mt-3 text-[12px] text-muted">
                  The recommendation comes from rules in code, never from the model. A person decides every outcome.
                </p>
              </div>
            </section>
          ) : null}

          {/* 4. Each criterion with its evidence */}
          <Criteria scores={(scores ?? []) as CriterionScore[]} names={names} evidence={evidence} memos={memos} />

          {/* 6. Deck and form disagree */}
          <Disagree items={(brief?.inconsistencies ?? []) as never} />

          {/* 7. Only a call can tell */}
          <CallSignals signals={(brief?.call_only_signals ?? []) as string[]} aditya={Boolean(brief?.aditya_on_call)} />

          {/* Our research, kept apart from the founder's story */}
          <Research web={web} fetches={fetches ?? []} mode={brief?.research_mode ?? null} />

          {/* 5. What we could not find */}
          {gaps.length ? (
            <section aria-label="Gaps">
              <div className="eyebrow">What we could not find</div>
              <ul className="mt-3 space-y-2">
                {gaps.map((g) => (
                  <li key={g.item} className="border-l border-border-strong pl-4">
                    <span className="font-display text-[17px]">{g.item}.</span> <span className="text-muted">{g.note}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* The form, as the founder wrote it */}
          {form ? (
            <section aria-label="Form answers">
              <div className="eyebrow">Form answers</div>
              <dl className="mt-3 divide-y divide-border panel">
                {form.fields.map((fl) => (
                  <div key={fl.key} className="grid gap-1 px-5 py-3 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-6">
                    <dt className="text-[12px] text-muted">{fl.label}</dt>
                    <dd className="text-[13.5px]">{fl.value || <span className="text-muted italic">blank</span>}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : app.intro_notes ? (
            <section aria-label="Warm intro notes">
              <div className="eyebrow">Notes from the warm intro</div>
              <p className="mt-3 panel p-5">{app.intro_notes}</p>
            </section>
          ) : null}

          {deck ? (
            <section aria-label="Deck">
              <div className="eyebrow">Deck · {deck.pages.length} pages</div>
              <div className="mt-3 space-y-2">
                {deck.pages.map((p) => (
                  <details key={p.page} className="panel px-5 py-3">
                    <summary className="cursor-pointer text-[13px]">
                      <span className="text-brass">Deck, page {p.page}</span>{" "}
                      <span className="text-muted">{p.text.split("\n")[0]?.slice(0, 80)}</span>
                    </summary>
                    <pre className="mt-3 font-sans text-[13px] whitespace-pre-wrap text-muted">{p.text}</pre>
                  </details>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {/* Side panel: actions, founders, trail */}
        <aside className="space-y-6 lg:sticky lg:top-8 lg:self-start">
          {app.status === "short_circuited" && can.gate1(actor.role) ? (
            <div className="panel border-brass/60 p-5">
              <div className="eyebrow text-brass">Research was skipped</div>
              <p className="mt-2 text-[13px] text-muted">A cheap check hit, so the costly research did not run. If you think the flag is wrong, send it back for the full review.</p>
              <div className="mt-4"><Requeue id={app.id} mode="full_review" label="Run full review anyway" /></div>
            </div>
          ) : null}

          {founders?.length ? (
            <div className="panel p-5">
              <div className="eyebrow">Founders</div>
              <ul className="mt-3 space-y-3">
                {founders.map((fd) => (
                  <li key={fd.founder_key}>
                    <div className="font-display text-[18px]">{fd.name ?? fd.founder_key} <span className="text-[12px] text-muted not-italic">{fd.founder_key}{fd.role ? `, ${fd.role}` : ""}</span></div>
                    {fd.bio ? <p className="text-[12.5px] text-muted">{fd.bio}</p> : null}
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-border pt-3 text-[11px] text-muted">
                Names and links stay in the database. Models only ever see {founders.map((x) => x.founder_key).join(" and ")}.
              </p>
            </div>
          ) : null}

          <div className="panel p-5">
            <div className="eyebrow">Trail</div>
            <ol className="mt-3 space-y-2">
              {(events ?? []).map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                  <span>
                    {STATUS_LABEL[e.to_status as Status] ?? e.to_status}
                    {e.actor !== "system" ? <span className="text-muted"> · {e.actor}</span> : null}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted tabular-nums">{ago(e.at, now)}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* 9. Footer facts */}
          <div className="space-y-1 px-1 text-[11.5px] text-muted">
            <div>Thesis Card v{card?.version ?? "?"} ({card?.status ?? "none"})</div>
            {[...new Set((calls ?? []).map((c) => `${c.call_type} ${c.prompt_name} ${c.prompt_version} on ${c.model}`))].map((c) => <div key={c}>{c}</div>)}
            <div>Cost so far: ${Number(app.cost_usd ?? 0).toFixed(4)}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
