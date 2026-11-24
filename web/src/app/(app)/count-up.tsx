"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number that counts up when it first appears, and glides when it changes on a live refresh.
 * Shows the final value straight away for screen readers and for people who turn motion off.
 */
export function CountUp({ value, ms = 900, className = "" }: { value: number; ms?: number; className?: string }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = value;
      const id = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(id);
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(a + (value - a) * eased));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);

  return (
    <span className={`tabular-nums ${className}`} aria-label={String(value)}>
      <span aria-hidden="true">{shown}</span>
    </span>
  );
}
