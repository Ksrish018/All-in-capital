"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** J and K move through the review queue (PRD 13.6). */
export function QueueKeys({ prev, next }: { prev: string | null; next: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j" && next) router.push(`/review?id=${next}`);
      if (e.key === "k" && prev) router.push(`/review?id=${prev}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, prev, next]);
  return null;
}
