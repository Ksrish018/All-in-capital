import { currentActor } from "@/lib/actor";
import { Sidebar } from "./sidebar";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const actor = await currentActor();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar role={actor.role} />
      <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-6">{children}</main>
    </div>
  );
}
