"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { setWorkingAs } from "./actions";

export const NAV = [
  { href: "/", label: "Pipeline" },
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

/** The fund's tilted flag, in a deeper oxblood. */
export function Flag({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block -rotate-6 rounded-[2px] bg-[#a3231f] px-2 py-0.5 font-sans text-[12px] leading-tight font-extrabold italic tracking-tight text-[#f1ebe0] ${className}`}
    >
      ALL IN
    </span>
  );
}

export function Sidebar({ role }: { role: string }) {
  const path = usePathname();
  return (
    // Ink in both themes. Ivory text, brass details.
    <aside className="flex w-full shrink-0 flex-col border-[#26231f] bg-sidebar text-[#e9e2d4] md:sticky md:top-0 md:h-screen md:w-64 md:border-r">
      <Link href="/" className="flex items-center gap-3 px-6 pt-6 pb-4 md:pt-8 md:pb-2">
        <Flag />
        <span className="leading-tight">
          <span className="block font-[family-name:var(--font-instrument)] text-[22px] leading-none">All In Capital</span>
        </span>
      </Link>
      <div className="hidden px-6 pb-6 md:block">
        <div className="mt-2 text-[10px] tracking-[0.22em] text-[#8f877a] uppercase">Application triage</div>
        <div className="mt-4 h-px bg-gradient-to-r from-[#b89b62] to-transparent" />
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 [scrollbar-width:none] md:block md:flex-1 md:space-y-0.5 md:overflow-y-auto md:pb-0">
        {NAV.map((item) => {
          const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex shrink-0 items-center gap-3 whitespace-nowrap rounded-md px-3 py-2 text-[13.5px] transition-colors duration-300 ${
                active ? "bg-white/[0.05] text-[#f1ebe0]" : "text-[#a49b8c] hover:text-[#f1ebe0]"
              }`}
            >
              <span
                aria-hidden="true"
                className={`hidden h-4 w-px md:block ${active ? "bg-[#b89b62]" : "bg-transparent"}`}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <form action={setWorkingAs} className="flex items-center gap-3 border-t border-[#26231f] px-6 py-3 md:block md:py-6">
        <div className="text-[10px] tracking-[0.22em] text-[#8f877a] uppercase">Working as</div>
        <div className="flex flex-1 gap-1 md:mt-3" role="group" aria-label="Working as">
          {PEOPLE.map((p) => (
            <button
              key={p.role}
              name="role"
              value={p.role}
              aria-pressed={p.role === role}
              className={`flex-1 rounded-full border px-2 py-1 text-[12.5px] transition-colors duration-300 ${
                p.role === role
                  ? "border-[#b89b62] text-[#f1ebe0]"
                  : "border-transparent text-[#a49b8c] hover:text-[#f1ebe0]"
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
