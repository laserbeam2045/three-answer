"use client";

import type { Role, SeatView } from "@/lib/types";

const ROLE_BG: Record<Role, string> = {
  A: "bg-player-a",
  B: "bg-player-b",
  C: "bg-player-c",
};

export default function SeatBadge({ seat, isYou }: { seat: SeatView; isYou: boolean }) {
  const occupied = seat.token !== null;

  return (
    <div className="inline-flex items-center gap-1.5 sm:gap-2 min-w-0 max-w-full">
      <span
        className={`shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs sm:text-sm font-extrabold text-white shadow ${ROLE_BG[seat.role]} ${occupied ? "" : "opacity-40"}`}
      >
        {seat.role}
      </span>
      <span className="min-w-0 flex items-center gap-1.5">
        <span
          className={`truncate font-bold text-sm sm:text-base ${occupied ? "text-ink" : "text-muted font-normal"}`}
        >
          {seat.name ?? "空席"}
        </span>
        {isYou && (
          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-panel-2 border border-line text-muted">
            あなた
          </span>
        )}
        {occupied && (
          <span
            aria-label={seat.active ? "オンライン" : "オフライン"}
            title={seat.active ? "オンライン" : "オフライン"}
            className={`shrink-0 w-2 h-2 rounded-full ${seat.active ? "bg-player-c" : "bg-muted/50"}`}
          />
        )}
        {seat.locked && (
          <span className="shrink-0 text-gold text-sm font-bold" title="決定済み">
            ✓
          </span>
        )}
      </span>
    </div>
  );
}
