"use client";

import type { UseRoomResult } from "@/hooks/useRoom";
import { useTimer } from "@/hooks/useTimer";

export default function TimerBar({ room }: { room: UseRoomResult }) {
  const timer = room.state?.timer ?? null;
  const { remainingMs, remainingSec, inReveal } = useTimer(timer, room.nowServer);

  if (!timer) return null;

  if (inReveal) {
    return (
      <div className="w-full flex items-center gap-3 py-1">
        <div className="flex-1 h-2.5 rounded-full bg-panel-2 border border-line overflow-hidden" />
        <span className="text-sm text-muted animate-pulse whitespace-nowrap">
          問題を読んでいます…
        </span>
      </div>
    );
  }

  const answerTotalMs = Math.max(1, timer.totalMs - timer.revealMs);
  const ratio = Math.max(0, Math.min(1, remainingMs / answerTotalMs));
  const low = remainingSec <= 10;

  return (
    <div className="w-full flex items-center gap-3 py-1">
      <div className="flex-1 h-2.5 rounded-full bg-panel-2 border border-line overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-100 ease-linear ${
            low ? "bg-player-a" : "bg-gold"
          }`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <span
        className={`w-12 text-right text-lg font-extrabold tabular-nums ${
          low ? "text-player-a" : "text-ink"
        }`}
      >
        {remainingSec}
        <span className="text-xs font-normal text-muted ml-0.5">秒</span>
      </span>
    </div>
  );
}
