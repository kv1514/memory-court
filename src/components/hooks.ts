"use client";

import { useEffect, useState } from "react";

/** Milliseconds since `running` became true (0 when idle). Ticks twice a second. */
export function useElapsed(running: boolean): number {
  const [tick, setTick] = useState<{ start: number; now: number } | null>(null);
  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    const id = window.setInterval(() => setTick({ start, now: Date.now() }), 500);
    return () => {
      window.clearInterval(id);
      setTick(null);
    };
  }, [running]);
  return running && tick ? Math.max(0, tick.now - tick.start) : 0;
}

/** Wall clock that re-renders every `intervalMs` (0 until mounted, so SSR output is stable). */
export function useNow(intervalMs = 5000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const first = window.setTimeout(() => setNow(Date.now()), 0);
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}
