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
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface">
      <div className="px-5 py-5">
        <div className="text-[15px] font-semibold">All In Capital</div>
        <div className="text-muted">Triage</div>
      </div>
      <nav className="flex-1 px-2">
        {NAV.map((item) => {
          const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`block rounded-md px-3 py-2 ${active ? "bg-accent/10 font-medium text-accent" : "text-text hover:bg-bg"}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <form action={setWorkingAs} className="border-t border-border px-5 py-4">
        <div className="text-muted">Working as</div>
        <div className="mt-2 flex gap-1" role="group" aria-label="Working as">
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
