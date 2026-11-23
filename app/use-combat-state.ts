"use client";
import { useCallback, useLayoutEffect, useRef, useState, type SetStateAction } from "react";

// Real combat advances outside React. A hit must consume shields, roll defenses
// and emit numbers once, even if React batches frames or replays an updater.
export function useCombatState(initial: number, synchronous: boolean) {
  const [value, publish] = useState(initial);
  const current = useRef({ value, synchronous });
  useLayoutEffect(() => {
    if (!synchronous || current.current.synchronous !== synchronous) current.current.value = value;
    current.current.synchronous = synchronous;
  }, [value, synchronous]);
  const setValue = useCallback((next: SetStateAction<number>) => {
    if (!synchronous) { publish(next); return; }
    const resolved = typeof next === "function" ? next(current.current.value) : next;
    current.current.value = resolved;
    publish(resolved);
  }, [synchronous]);
  const readValue = useCallback(() => current.current.value, []);
  return [value, setValue, readValue] as const;
}
