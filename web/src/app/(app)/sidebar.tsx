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

/** The tilted red flag from the fund's site, drawn in CSS. */
export function Flag({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block -rotate-6 rounded-[3px] bg-accent-strong px-2 py-0.5 font-display text-[15px] leading-tight font-extrabold italic tracking-tight text-white ${className}`}
    >
      ALL IN
    </span>
  );
}

export function Sidebar({ role }: { role: string }) {
  const path = usePathname();
  return (
    // The sidebar stays charcoal in both themes, like the header on the fund's site.
    <aside className="flex w-full shrink-0 flex-col bg-sidebar text-[#f4f4f4] md:sticky md:top-0 md:h-screen md:w-60">
      <Link href="/" className="flex items-center gap-3 px-5 pt-5 pb-3 md:pt-6 md:pb-6">
        <Flag />
        <span className="leading-tight">
          <span className="block font-display text-[15px] font-bold">All In Capital</span>
          <span className="block text-[12px] text-[#a3a3a3]">Application triage</span>
        </span>
      </Link>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 [scrollbar-width:none] md:block md:flex-1 md:space-y-0.5 md:overflow-y-auto md:pb-0">
        {NAV.map((item) => {
          const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 transition-colors ${
                active ? "bg-accent-strong font-semibold text-white" : "text-[#cfcfcf] hover:bg-white/8 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <form action={setWorkingAs} className="flex items-center gap-3 border-t border-white/10 px-5 py-3 md:block md:py-5">
        <div className="text-[12px] tracking-wide text-[#a3a3a3] uppercase">Working as</div>
        <div className="flex flex-1 gap-1 rounded-full bg-white/6 p-1 md:mt-2" role="group" aria-label="Working as">
          {PEOPLE.map((p) => (
            <button
              key={p.role}
              name="role"
              value={p.role}
              aria-pressed={p.role === role}
              className={`flex-1 rounded-full px-2 py-1 text-[13px] transition-colors ${
                p.role === role ? "bg-white font-semibold text-[#1f1f1f]" : "text-[#cfcfcf] hover:text-white"
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
