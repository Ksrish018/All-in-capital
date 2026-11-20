import { createUserClient } from "@/lib/supabase/server";

// Launch day strip groups (PRD Section 13.3). The numbers must always add up to the total.
const GROUPS: { label: string; statuses: string[]; tone: string }[] = [
  { label: "Received", statuses: ["received"], tone: "text-text" },
  { label: "In queue", statuses: ["queued"], tone: "text-text" },
  {
    label: "Processing",
    statuses: ["parsing", "screening", "extracting", "researching", "scoring"],
    tone: "text-accent",
  },
  {
    label: "Brief ready or decided",
    statuses: [
      "short_circuited", "brief_ready", "riya_decided", "hold_conflict",
      "signed_off_go", "signed_off_pass", "hold",
    ],
    tone: "text-go",
  },
  { label: "Needs attention", statuses: ["needs_attention", "paused_cost_cap"], tone: "text-needs-human" },
];

export default async function InboxPage() {
  const supabase = await createUserClient();
  const { data: apps } = await supabase
    .from("applications")
    .select("id, company_name, source, status, received_at")
    .order("received_at", { ascending: false });
  const rows = apps ?? [];
  const counts = GROUPS.map((g) => rows.filter((a) => g.statuses.includes(a.status)).length);

  return (
    <div>
      <h1 className="text-[22px] font-semibold">Inbox</h1>
      <p className="mt-1 text-muted">Every application, from arrival to decision.</p>

      <section aria-label="Where every application is" className="mt-6 grid grid-cols-5 gap-3">
        {GROUPS.map((g, i) => (
          <div key={g.label} className="rounded-lg border border-border bg-surface px-4 py-3">
            <div className={`text-[22px] font-semibold ${g.tone}`}>{counts[i]}</div>
            <div className="text-muted">{g.label}</div>
          </div>
        ))}
      </section>
      <p className="mt-2 text-muted">Total: {rows.length}</p>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-border bg-surface px-6 py-10 text-center">
          <div className="text-[16px] font-medium">No applications yet</div>
          <p className="mt-1 text-muted">Upload a form and deck, or add a warm intro. Upload arrives in milestone M2.</p>
        </div>
      ) : (
        <table className="mt-8 w-full border-collapse text-[13px]">
          <thead className="text-left text-muted">
            <tr>
              <th className="py-2">Company</th>
              <th>Source</th>
              <th>Status</th>
              <th>Received</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-t border-border">
                <td className="py-2 font-medium">{a.company_name}</td>
                <td>{a.source === "warm_intro" ? "Warm intro" : "Public form"}</td>
                <td>{a.status.replaceAll("_", " ")}</td>
                <td>{new Date(a.received_at).toLocaleString("en-IN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
