import type { TimerState } from "./types";

export function revealMsFor(questionText: string): number {
  return Math.min(12000, 400 + questionText.length * 100);
}

export function newTimer(questionText: string, answerSeconds: number, now: number): TimerState {
  const revealMs = revealMsFor(questionText);
  return {
    totalMs: revealMs + answerSeconds * 1000,
    revealMs,
    elapsedBeforeResumeMs: 0,
    resumedAt: now,
    paused: false,
  };
}

export function effectiveElapsed(t: TimerState, now: number): number {
  const e = t.paused ? t.elapsedBeforeResumeMs : t.elapsedBeforeResumeMs + (now - t.resumedAt);
  return Math.max(0, Math.min(e, t.totalMs));
}

export function pauseTimer(t: TimerState, now: number): TimerState {
  if (t.paused) return t;
  return { ...t, paused: true, elapsedBeforeResumeMs: effectiveElapsed(t, now) };
}

export function resumeTimer(t: TimerState, now: number): TimerState {
  if (!t.paused) return t;
  return { ...t, paused: false, resumedAt: now };
}

export function isExpired(t: TimerState, now: number): boolean {
  return !t.paused && effectiveElapsed(t, now) >= t.totalMs;
}

export function remainingMs(t: TimerState, now: number): number {
  return Math.max(0, t.totalMs - effectiveElapsed(t, now));
}
