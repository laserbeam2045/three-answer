"use client";

import { useEffect, useReducer } from "react";
import type { TimerState } from "@/lib/types";
import { effectiveElapsed, remainingMs as calcRemainingMs, LEAD_IN_MS } from "@/lib/time";

export interface UseTimerResult {
  elapsedMs: number;
  remainingMs: number;
  remainingSec: number;
  /** タイプライター表示（問題読み上げ）中か */
  inReveal: boolean;
  /** 0..1。タイプライターの進捗 */
  revealProgress: number;
  /** 問題文が出る前の「タメ」の最中か（「問題」演出を出す） */
  inLeadIn: boolean;
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
    return {
      elapsedMs: 0,
      remainingMs: 0,
      remainingSec: 0,
      inReveal: false,
      revealProgress: 0,
      inLeadIn: false,
    };
  }

  const now = nowServer();
  const elapsedMs = effectiveElapsed(timer, now);
  const remainingMs = calcRemainingMs(timer, now);
  // タイプライターは「タメ」の後から始まる
  const typeMs = Math.max(1, timer.revealMs - LEAD_IN_MS);
  const revealProgress = Math.max(0, Math.min(1, (elapsedMs - LEAD_IN_MS) / typeMs));

  return {
    elapsedMs,
    remainingMs,
    remainingSec: Math.max(0, Math.ceil(remainingMs / 1000)),
    inReveal: elapsedMs < timer.revealMs,
    revealProgress,
    inLeadIn: elapsedMs < LEAD_IN_MS,
  };
}
