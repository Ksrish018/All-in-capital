import Link from "next/link";
import { currentActor } from "@/lib/actor";
import { createAdminClient } from "@/lib/supabase/server";
import { Sidebar } from "./sidebar";

/** The cost cap alert (M7): shown on every page while applications are paused by the cap. */
async function capAlert(): Promise<string | null> {
  const db = createAdminClient();
  const { count } = await db.from("applications").select("id", { count: "exact", head: true }).eq("status", "paused_cost_cap");
  if (!count) return null;
  return `The daily cost cap is reached. ${count} application${count === 1 ? " is" : "s are"} paused at a saved step and will carry on tomorrow, or as soon as Kushal raises the cap.`;
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [actor, alert] = await Promise.all([currentActor(), capAlert()]);
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar role={actor.role} />
      <main className="aurora min-w-0 flex-1 overflow-x-clip px-4 py-6 md:px-10 md:py-8">
        {alert ? (
          <div role="alert" className="mx-auto mb-6 flex max-w-[1400px] flex-wrap items-center justify-between gap-3 rounded-[12px] border border-flag/60 bg-flag/10 px-5 py-3 text-[13px] text-flag">
            <span>{alert}</span>
            <Link href="/cost" className="btn btn-secondary">See cost</Link>
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
