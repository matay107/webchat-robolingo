"use client";

import { useEffect, useRef } from "react";

/**
 * Runs `task` now and then `intervalMs` after each run finishes. Chained timeouts rather
 * than setInterval, so a slow response never overlaps the next request. Skips runs while
 * the tab is hidden and aborts the in-flight run on unmount. `task` handles its own errors;
 * a rejection here only means "try again next tick".
 */
export function usePolling(task: (signal: AbortSignal) => Promise<void>, intervalMs: number) {
  const taskRef = useRef(task);
  useEffect(() => {
    taskRef.current = task;
  });

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      if (!document.hidden) {
        try {
          await taskRef.current(controller.signal);
        } catch {
          // Next tick retries.
        }
      }
      if (!controller.signal.aborted) timer = setTimeout(tick, intervalMs);
    }

    void tick();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [intervalMs]);
}
