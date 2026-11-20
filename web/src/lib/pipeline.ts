// The live pipeline: which board column each application status belongs to, in plain words.
// Every status in the database maps to exactly one stage (tested in tests/quick/pipeline.test.ts).

export const STATUSES = [
  "received", "queued", "parsing", "screening", "short_circuited", "extracting",
  "researching", "scoring", "brief_ready", "riya_decided", "hold_conflict",
  "signed_off_go", "signed_off_pass", "hold", "needs_attention", "paused_cost_cap",
] as const;
export type Status = (typeof STATUSES)[number];

export const STAGES = [
  { id: "intake", label: "Intake", hint: "Arrived and waiting", statuses: ["received", "queued"] },
  { id: "checks", label: "Cheap checks", hint: "Reading files, quick flags", statuses: ["parsing", "screening"] },
  { id: "research", label: "Research", hint: "Facts, research, scoring", statuses: ["extracting", "researching", "scoring"] },
  { id: "riya", label: "Riya", hint: "Gate 1 review", statuses: ["short_circuited", "brief_ready"] },
  { id: "kushal", label: "Kushal", hint: "Gate 2 sign off", statuses: ["riya_decided", "hold_conflict"] },
  { id: "decided", label: "Decided", hint: "GO, PASS or hold", statuses: ["signed_off_go", "signed_off_pass", "hold"] },
] as const satisfies readonly { id: string; label: string; hint: string; statuses: readonly Status[] }[];
export type StageId = (typeof STAGES)[number]["id"];

/** Statuses that are not a place in the flow. They stay in the column of the last step they reached. */
export const STALLED: readonly Status[] = ["needs_attention", "paused_cost_cap"];

/** Work the system is doing right now. These cards pulse. */
export const ACTIVE: readonly Status[] = ["parsing", "screening", "extracting", "researching", "scoring"];

/** Cheap checks are done and the application waits for full screening (milestone M3). Not working, just waiting. */
export const WAITING_STEP = "cheap_checks_done";

export function isWorking(status: Status, lastStep?: string | null): boolean {
  return ACTIVE.includes(status) && lastStep !== WAITING_STEP;
}

export const STATUS_LABEL: Record<Status, string> = {
  received: "Received",
  queued: "Waiting in queue",
  parsing: "Reading the files",
  screening: "Running cheap checks",
  short_circuited: "Flagged early",
  extracting: "Pulling out facts",
  researching: "Researching",
  scoring: "Scoring",
  brief_ready: "Brief ready",
  riya_decided: "Riya decided",
  hold_conflict: "Held: portfolio conflict",
  signed_off_go: "GO",
  signed_off_pass: "PASS",
  hold: "On hold",
  needs_attention: "Needs attention",
  paused_cost_cap: "Paused: cost cap",
};

export type Tone = "go" | "pass" | "hold" | "flag" | "needs-human" | "active" | "plain";
export function toneOf(status: Status, flags: string[] = [], lastStep?: string | null): Tone {
  if (status === "signed_off_go") return "go";
  if (status === "signed_off_pass") return "pass";
  if (status === "hold" || status === "hold_conflict") return "hold";
  if (STALLED.includes(status)) return "needs-human";
  if (status === "short_circuited" || flags.some((f) => !SOFT_FLAGS.includes(f))) return "flag";
  if (isWorking(status, lastStep)) return "active";
  return "plain";
}

export function stageOf(status: Status, lastStep?: string | null): StageId {
  const look = STALLED.includes(status) ? ((lastStep as Status | null | undefined) ?? "received") : status;
  return (STAGES.find((s) => (s.statuses as readonly string[]).includes(look)) ?? STAGES[0]).id;
}

/** Which column is waiting on the person who is working right now. */
export function waitingOn(role: string): StageId | null {
  return role === "riya" ? "riya" : role === "kushal" ? "kushal" : null;
}

/** Flags that inform but never stop an application. Shown, but not as a red edge. */
export const SOFT_FLAGS = ["outside_core_sectors", "portfolio_overlap_note"];

const FLAG_LABEL: Record<string, string> = {
  later_stage: "Later stage",
  outside_core_sectors: "Outside the four sectors",
  capital_intensive: "Heavy on capital",
  likely_excluded: "Likely excluded",
  portfolio_conflict: "Portfolio conflict",
  portfolio_overlap_note: "Check portfolio",
  possible_duplicate: "Possible duplicate",
  injection_attempt: "Text aimed at the AI",
};

export function flagLabel(flag: string): string {
  if (FLAG_LABEL[flag]) return FLAG_LABEL[flag];
  const s = flag.replaceAll("_", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export type PipelineApp = {
  id: string;
  company_name: string;
  source: "public_form" | "warm_intro";
  status: Status;
  status_reason: string | null;
  last_step: string | null;
  short_circuit_flags: string[];
  received_at: string;
};
export type PipelineEvent = { id: number | string; company: string; to_status: Status; note: string | null; actor: string; at: string };

/**
 * Sample data for previewing the design before real applications arrive (open /?sample=1).
 * These are the ten case applicants. The page labels it clearly as sample data.
 */
export function samplePipeline(now = Date.now()): { apps: PipelineApp[]; events: PipelineEvent[] } {
  const t = (min: number) => new Date(now - min * 60_000).toISOString();
  const a = (id: string, company_name: string, status: Status, min: number, extra: Partial<PipelineApp> = {}): PipelineApp => ({
    id, company_name, status, received_at: t(min), source: "public_form",
    status_reason: null, last_step: null, short_circuit_flags: [], ...extra,
  });
  const apps: PipelineApp[] = [
    a("s1", "Pumpwise", "queued", 2),
    a("s2", "GrainKind", "parsing", 4),
    a("s3", "CAPilot", "screening", 6, { status_reason: "No deck. Scoring from the form only." }),
    a("s4", "Yatrika", "researching", 11, { short_circuit_flags: ["vague_deck"], status_reason: "Fetched 6 of 10 pages" }),
    a("s5", "RentRoute", "needs_attention", 14, {
      last_step: "scoring", short_circuit_flags: ["regulatory_bet"], status_reason: "Model reply did not match the format twice",
    }),
    a("s6", "Settlr", "short_circuited", 20, { short_circuit_flags: ["later_stage"], status_reason: "Series A, raising INR 30 Cr" }),
    a("s7", "StockSathi", "brief_ready", 25, { source: "warm_intro", short_circuit_flags: ["regulatory_exposure"] }),
    a("s8", "CareCorner", "brief_ready", 31, { short_circuit_flags: ["outside_core_sectors"] }),
    a("s9", "Talkbook", "hold_conflict", 38, { short_circuit_flags: ["portfolio_conflict"], status_reason: "Overlaps with MeetRecord" }),
    a("s10", "EarnWise", "signed_off_pass", 55, { short_circuit_flags: ["regulatory_exposure"] }),
  ];
  const e = (i: number, company: string, to_status: Status, min: number, note: string | null = null, actor = "system"): PipelineEvent => ({
    id: `e${i}`, company, to_status, note, actor, at: t(min),
  });
  const events: PipelineEvent[] = [
    e(1, "Pumpwise", "queued", 2),
    e(2, "GrainKind", "parsing", 3),
    e(3, "Yatrika", "researching", 5, "Fetched 6 of 10 pages"),
    e(4, "RentRoute", "needs_attention", 7, "Model reply did not match the format twice"),
    e(5, "CAPilot", "screening", 8, "No deck. Scoring from the form only."),
    e(6, "CareCorner", "brief_ready", 12),
    e(7, "Talkbook", "hold_conflict", 30, "Overlaps with MeetRecord"),
    e(8, "EarnWise", "signed_off_pass", 41, null, "kushal"),
  ];
  return { apps, events };
}
