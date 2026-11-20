import { requireMember } from "@/lib/auth";
import { Sidebar } from "./sidebar";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const member = await requireMember();
  return (
    <div className="flex min-h-screen">
      <Sidebar name={member.name} role={member.role} />
      <main className="flex-1 px-8 py-6">{children}</main>
    </div>
  );
}
