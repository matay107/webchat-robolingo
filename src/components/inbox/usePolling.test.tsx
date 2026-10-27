// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePolling } from "./usePolling";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const setHidden = (hidden: boolean) => Object.defineProperty(document, "hidden", { configurable: true, value: hidden });

describe("usePolling", () => {
  it("runs immediately, then again after each interval", async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePolling(task, 1000));

    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(task).toHaveBeenCalledTimes(3);
  });

  it("never overlaps: the next run waits for a slow one to finish", async () => {
    let finish!: () => void;
    const task = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderHook(() => usePolling(task, 1000));

    await vi.advanceTimersByTimeAsync(5000);
    expect(task).toHaveBeenCalledTimes(1);

    finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("skips work while the tab is hidden", async () => {
    setHidden(true);
    const task = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePolling(task, 1000));

    await vi.advanceTimersByTimeAsync(3000);
    expect(task).not.toHaveBeenCalled();
    setHidden(false);
  });

  it("aborts the in-flight run and stops on unmount", async () => {
    const signals: AbortSignal[] = [];
    const task = vi.fn(async (signal: AbortSignal) => void signals.push(signal));
    const { unmount } = renderHook(() => usePolling(task, 1000));
    await vi.advanceTimersByTimeAsync(0);

    unmount();
    await vi.advanceTimersByTimeAsync(5000);

    expect(task).toHaveBeenCalledTimes(1);
    expect(signals[0].aborted).toBe(true);
  });

  it("keeps polling after a failed run", async () => {
    const task = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValue(undefined);
    renderHook(() => usePolling(task, 1000));

    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(2);
  });
});
