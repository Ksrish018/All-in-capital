"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { setWorkingAs } from "./actions";

export const NAV = [
  { href: "/", label: "Inbox" },
  { href: "/review", label: "Review" },
  { href: "/sign-off", label: "Sign off" },
  { href: "/outreach", label: "Outreach" },
  { href: "/thesis", label: "Thesis Card" },
  { href: "/backtest", label: "Back test" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/cost", label: "Cost" },
  { href: "/settings", label: "Settings" },
] as const;

const PEOPLE = [
  { role: "riya", name: "Riya" },
  { role: "kushal", name: "Kushal" },
  { role: "aditya", name: "Aditya" },
] as const;

export function Sidebar({ role }: { role: string }) {
  const path = usePathname();
  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-border bg-surface md:sticky md:top-0 md:h-screen md:w-56 md:border-r md:border-b-0">
      <div className="px-5 pt-4 pb-2 md:py-5">
        <div className="text-[15px] font-semibold">All In Capital</div>
        <div className="text-muted">Triage</div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-2 pb-2 [scrollbar-width:none] md:block md:flex-1 md:overflow-y-auto md:pb-0">
        {NAV.map((item) => {
          const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`block shrink-0 whitespace-nowrap rounded-md px-3 py-2 ${active ? "bg-accent/10 font-medium text-accent" : "text-text hover:bg-bg"}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <form action={setWorkingAs} className="flex items-center gap-3 border-t border-border px-5 py-3 md:block md:py-4">
        <div className="text-muted">Working as</div>
        <div className="flex flex-1 gap-1 md:mt-2" role="group" aria-label="Working as">
          {PEOPLE.map((p) => (
            <button
              key={p.role}
              name="role"
              value={p.role}
              aria-pressed={p.role === role}
              className={`flex-1 rounded-md border px-2 py-1 ${
                p.role === role ? "border-accent bg-accent text-on-accent" : "border-border hover:bg-bg"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </form>
    </aside>
  );
}
