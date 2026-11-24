import { createAdminClient } from "@/lib/supabase/server";
import { currentActor } from "@/lib/actor";
import { SETTINGS } from "@/lib/settings";
import { AttendeesForm, ChoiceSetting, DeleteFounderData, NumberSetting, ProposedNotes, StyleNotes } from "./forms";

/** Settings (PRD 13.13). Each setting can be changed only by the person who owns it. */
export default async function SettingsPage() {
  const actor = await currentActor();
  const db = createAdminClient();
  const [{ data: rows }, { data: notes }, { data: apps }, { data: proposed }] = await Promise.all([
    db.from("settings").select("key, value"),
    db.from("style_notes").select("version, notes, active, created_at").order("version", { ascending: false }),
    db.from("applications").select("id, company_name").order("company_name"),
    db.from("style_note_candidates").select("id, note, tag, created_at").eq("status", "pending").order("created_at"),
  ]);
  const v = (k: string) => rows?.find((r) => r.key === k)?.value;
  const can = (k: string) => SETTINGS[k].who.includes(actor.role);

  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="rise">
        <div className="eyebrow">All In Capital · Settings</div>
        <h1 className="mt-3 text-[40px] leading-[1.05] md:text-[56px]">Settings</h1>
        <p className="mt-3 text-[15px] text-muted">Working as {actor.name}. Settings you do not own are shown but locked.</p>
      </div>
      <div className="hairline mt-6" />

      <section className="mt-8">
        <h2 className="text-[24px]">Screening</h2>
        <div className="panel mt-3 divide-y divide-border">
          <NumberSetting k="daily_cost_cap_usd" label="Daily cost cap" hint="Applications pause when today's spend reaches this, and resume tomorrow or when it is raised. USD." value={Number(v("daily_cost_cap_usd") ?? 5)} step={0.5} editable={can("daily_cost_cap_usd")} />
          <ChoiceSetting k="default_headline_lens" label="Headline lens" hint="Both lenses are always shown. This one leads the brief." value={String(v("default_headline_lens") ?? "revealed")} options={[["revealed", "Revealed thesis"], ["public", "Public thesis"]]} editable={can("default_headline_lens")} />
          <ChoiceSetting k="sector_flag_strength" label="Outside the four sectors" hint="Soft shows a flag. Hard turns it into a PASS. The fund calls itself sector-agnostic (Q10)." value={String(v("sector_flag_strength") ?? "soft")} options={[["soft", "Soft flag"], ["hard", "Hard rule"]]} editable={can("sector_flag_strength")} />
          <NumberSetting k="blind_sample_rate" label="Blind sample rate" hint="Share of PASS recommendations Riya sees without the system's view first." value={Number(v("blind_sample_rate") ?? 0.1)} step={0.05} editable={can("blind_sample_rate")} />
          <ChoiceSetting k="research_mode" label="Research" hint="Replay uses recorded results, so tests repeat. Live searches the web through Tavily." value={String(v("research_mode") ?? "replay")} options={[["replay", "Replay"], ["live", "Live web"], ["off", "Off"]]} editable={can("research_mode")} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-[24px]">Safety and volume</h2>
        <div className="panel mt-3 divide-y divide-border">
          <NumberSetting k="upload_limit_per_hour" label="Uploads per visitor per hour" hint="Stops a bot or a stuck script flooding the queue. Behind the team password the limit is ten times this. Raise it on announcement day." value={Number(v("upload_limit_per_hour") ?? 30)} step={5} editable={can("upload_limit_per_hour")} />
          <ChoiceSetting k="answer_cache" label="Reuse identical answers" hint="The same model, prompt version and input reuse the stored answer, at no cost. Turn off only to measure a fresh run." value={String(v("answer_cache") ?? "on")} options={[["on", "On"], ["off", "Off"]]} editable={can("answer_cache")} />
          <NumberSetting k="input_retention_days" label="Keep full model inputs for" hint="Days. After this, the stored prompt and reply are cleared each night; counts, cost and prompt version stay (Q18)." value={Number(v("input_retention_days") ?? 30)} step={1} editable={can("input_retention_days")} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-[24px]">Outreach</h2>
        <div className="panel mt-3 divide-y divide-border">
          <ChoiceSetting k="outreach_mode" label="Outreach mode" hint="Simulate runs every step but sends nothing. Live sends from Riya's Gmail and makes real calendar invites." value={String(v("outreach_mode") ?? "simulate")} options={[["simulate", "Simulate"], ["live", "Live"]]} editable={can("outreach_mode")} danger="live" />
          <div className="px-5 py-4">
            <div className="text-[14px]">Call slots</div>
            <p className="text-[12px] text-muted">Tuesday or Thursday, 14:00 to 18:00 India time, 30 minutes, with a working day of notice (Meeting 5).</p>
          </div>
          <AttendeesForm value={(v("attendees") ?? {}) as Record<string, string | null>} editable={can("attendees")} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-[24px]">Riya&apos;s style notes</h2>
        <p className="mt-1 text-[13px] text-muted">Learned from her edits before sending (Loop D). Each edit proposes a note; nothing reaches a draft until Riya approves it, for that kind of company or for every founder. Every change is a new version she can roll back.</p>
        <ProposedNotes notes={(proposed ?? []) as { id: string; note: string; tag: string | null; created_at: string }[]} editable={actor.role === "riya"} />
        <StyleNotes versions={(notes ?? []) as { version: number; notes: string[]; active: boolean; created_at: string }[]} editable={actor.role === "riya"} />
      </section>

      <section className="mt-8">
        <h2 className="text-[24px]">Founder data</h2>
        <p className="mt-1 text-[13px] text-muted">A founder can ask for their data to be deleted (DPDP Act). This removes the files, the application and everything linked to it. It cannot be undone.</p>
        <DeleteFounderData apps={apps ?? []} editable={actor.role === "riya"} />
      </section>
    </div>
  );
}
