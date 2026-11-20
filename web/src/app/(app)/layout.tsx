import { currentActor } from "@/lib/actor";
import { Sidebar } from "./sidebar";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const actor = await currentActor();
  return (
    <div className="flex min-h-screen">
      <Sidebar role={actor.role} />
      <main className="flex-1 px-8 py-6">{children}</main>
    </div>
  );
}
