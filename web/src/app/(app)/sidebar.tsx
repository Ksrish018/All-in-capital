"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

export function Sidebar({ name, role }: { name: string; role: string }) {
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
      <div className="border-t border-border px-5 py-4">
        <div className="font-medium">{name}</div>
        <div className="text-muted capitalize">{role}</div>
        <form action="/auth/sign-out" method="post" className="mt-2">
          <button className="text-accent underline">Sign out</button>
        </form>
      </div>
    </aside>
  );
}
