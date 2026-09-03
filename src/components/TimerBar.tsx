"use client";

import type { UseRoomResult } from "@/hooks/useRoom";
import { useTimer } from "@/hooks/useTimer";

/** 残り時間の金のゲージ。残り10秒で赤に変わる */
export default function TimerBar({ room }: { room: UseRoomResult }) {
  const timer = room.state?.timer ?? null;
  const { remainingMs, remainingSec, inReveal } = useTimer(timer, room.nowServer);

  if (!timer) return null;

  if (inReveal) {
    return (
      <div className="w-full flex items-center gap-3 py-1">
        <div className="gauge flex-1" />
        <span className="text-xs sm:text-sm text-muted animate-pulse whitespace-nowrap">
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
      <div className="gauge flex-1">
        <div className={`gauge-fill ${low ? "low" : ""}`} style={{ width: `${ratio * 100}%` }} />
      </div>
      <span
        className={`w-12 text-right font-display text-xl font-extrabold tabular-nums ${
          low ? "text-player-a" : "text-gold-2"
        }`}
      >
        {remainingSec}
        <span className="text-xs font-normal text-muted ml-0.5 font-sans">秒</span>
      </span>
    </div>
  );
}
