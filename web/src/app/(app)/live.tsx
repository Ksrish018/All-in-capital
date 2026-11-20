"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Keeps the pipeline live: asks the server for fresh data every few seconds while the tab is visible.
 * The browser never reads the database itself (no login, so row level security blocks it).
 */
export function LiveRefresh({ everySeconds = 5, paused = false }: { everySeconds?: number; paused?: boolean }) {
  const router = useRouter();
  const [last, setLast] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (paused) return;
    const tick = setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === "visible" && Date.now() - last >= everySeconds * 1000) {
        router.refresh();
        setLast(Date.now());
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [router, everySeconds, last, paused]);

  const secs = Math.max(0, Math.round((now - last) / 1000));
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[12px] text-muted">
      {paused ? (
        <>Sample data · not live</>
      ) : (
        <>
          <span className="live-dot" aria-hidden="true" />
          <span>
            Live <span className="tabular-nums">· updated {secs}s ago</span>
          </span>
        </>
      )}
    </span>
  );
}
