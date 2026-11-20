"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { setWorkingAs } from "./actions";

export const NAV = [
  { href: "/", label: "Pipeline", icon: "pipeline" },
  { href: "/review", label: "Review", icon: "review" },
  { href: "/sign-off", label: "Sign off", icon: "signoff" },
  { href: "/outreach", label: "Outreach", icon: "outreach" },
  { href: "/thesis", label: "Thesis Card", icon: "thesis" },
  { href: "/backtest", label: "Back test", icon: "backtest" },
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/cost", label: "Cost", icon: "cost" },
  { href: "/settings", label: "Settings", icon: "settings" },
] as const;

/** Thin line icons in the spirit of SF Symbols. 1.5 stroke, 16 px. */
const ICON: Record<(typeof NAV)[number]["icon"], string> = {
  pipeline: "M3 5h4v14H3zM10 5h4v9h-4zM17 5h4v5h-4z",
  review: "M4 5h16v11H8l-4 4zM8 9h8M8 12h5",
  signoff: "M4 17c3 0 4-6 6-6s1 5 3 5 3-3 4-3 2 2 3 2M4 20h16",
  outreach: "M3 6h18v12H3zM3 7l9 6 9-6",
  thesis: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 15h7M9 18h4",
  backtest: "M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4M12 8v4l3 2",
  dashboard: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  cost: "M12 3v18M16 7c0-1.7-1.8-3-4-3s-4 1.3-4 3 1.8 3 4 3 4 1.3 4 3-1.8 3-4 3-4-1.3-4-3",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1",
};

function Icon({ name }: { name: keyof typeof ICON }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICON[name]} />
    </svg>
  );
}

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
    <aside className="sticky top-0 z-30 flex w-full shrink-0 flex-col border-b border-[#26231f] bg-sidebar/90 text-[#e9e2d4] backdrop-blur-xl backdrop-saturate-150 md:h-screen md:w-64 md:border-r md:border-b-0">
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
              className={`relative flex min-h-8 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13.5px] transition-colors duration-200 ${
                active ? "bg-white/[0.07] text-[#f1ebe0]" : "text-[#a49b8c] hover:bg-white/[0.04] hover:text-[#f1ebe0]"
              }`}
            >
              <span
                aria-hidden="true"
                className={`absolute top-1/2 left-0 hidden h-4 w-[2px] -translate-y-1/2 rounded-full md:block ${active ? "bg-[#b89b62]" : "bg-transparent"}`}
              />
              <span className={active ? "text-[#b89b62]" : ""}><Icon name={item.icon} /></span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <form action={setWorkingAs} className="flex items-center gap-3 border-t border-[#26231f] px-6 py-3 md:block md:py-6">
        <div className="text-[10px] tracking-[0.22em] text-[#8f877a] uppercase">Working as</div>
        <div className="flex flex-1 gap-0.5 rounded-[9px] border border-white/10 bg-white/[0.04] p-0.5 md:mt-3" role="group" aria-label="Working as">
          {PEOPLE.map((p) => (
            <button
              key={p.role}
              name="role"
              value={p.role}
              aria-pressed={p.role === role}
              className={`flex-1 rounded-[7px] px-2 py-1 text-[12.5px] transition-colors duration-200 ${
                p.role === role
                  ? "bg-white/[0.12] text-[#f1ebe0] shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
                  : "text-[#a49b8c] hover:text-[#f1ebe0]"
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
