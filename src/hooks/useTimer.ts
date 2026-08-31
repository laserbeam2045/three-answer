"use client";

import { useEffect, useReducer } from "react";
import type { TimerState } from "@/lib/types";
import { effectiveElapsed, remainingMs as calcRemainingMs } from "@/lib/time";

export interface UseTimerResult {
  elapsedMs: number;
  remainingMs: number;
  remainingSec: number;
  /** タイプライター表示（問題読み上げ）中か */
  inReveal: boolean;
  /** 0..1。タイプライターの進捗 */
  revealProgress: number;
}

/**
 * 100ms間隔で再レンダーし、サーバー補正時刻ベースのタイマー値を返す。
 * timer.paused 中は effectiveElapsed が凍結されるため、値も自動的に止まる。
 */
export function useTimer(timer: TimerState | null, nowServer: () => number): UseTimerResult {
  const [, force] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!timer) return;
    const id = setInterval(force, 100);
    return () => clearInterval(id);
  }, [timer]);

  if (!timer) {
    return { elapsedMs: 0, remainingMs: 0, remainingSec: 0, inReveal: false, revealProgress: 0 };
  }

  const now = nowServer();
  const elapsedMs = effectiveElapsed(timer, now);
  const remainingMs = calcRemainingMs(timer, now);
  const revealProgress =
    timer.revealMs > 0 ? Math.min(1, elapsedMs / timer.revealMs) : 1;

  return {
    elapsedMs,
    remainingMs,
    remainingSec: Math.max(0, Math.ceil(remainingMs / 1000)),
    inReveal: elapsedMs < timer.revealMs,
    revealProgress,
  };
}
