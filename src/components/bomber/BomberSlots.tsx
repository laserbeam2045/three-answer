"use client";

import BombIcon from "@/components/bomber/BombIcon";
import { BOMBER_SLOTS } from "@/lib/bomber/match";
import type { BomberSlotView } from "@/lib/types";

/**
 * 5つの回答枠。埋まった枠は正解の表記、未回答の枠は答える予定の人の名前を出す。
 * 回答中の枠の上には爆弾が乗る。
 */
export default function BomberSlots({
  filled,
  upcoming,
  urgent = false,
  exploded = false,
  heldBy = null,
}: {
  filled: BomberSlotView[];
  /** 未回答の枠を答える人（先頭が今の回答者）。判定後は空でよい */
  upcoming: string[];
  urgent?: boolean;
  /** 判定画面で爆発した枠を示す */
  exploded?: boolean;
  /** 爆発したときに爆弾を持っていた人 */
  heldBy?: string | null;
}) {
  return (
    <div className="grid grid-cols-5 gap-1 sm:gap-3 w-full">
      {Array.from({ length: BOMBER_SLOTS }, (_, i) => {
        const slot = filled[i];
        const isCurrent = !slot && i === filled.length;
        const pendingName = upcoming[i - filled.length];
        return (
          <div key={i} className="relative flex flex-col items-center gap-1 min-w-0 pt-7 sm:pt-9">
            {isCurrent && !exploded && upcoming.length > 0 && (
              <BombIcon urgent={urgent} className="absolute top-0 w-8 h-8 sm:w-11 sm:h-11" />
            )}
            {isCurrent && exploded && (
              <span className="absolute top-0 text-2xl sm:text-3xl explode-pop" aria-hidden>
                💥
              </span>
            )}
            <div
              className={`slot w-full min-h-16 sm:min-h-24 flex flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 text-center ${
                slot ? "flip-in border-gold-3" : ""
              } ${isCurrent && !exploded ? "slot-you bomber-current" : ""} ${slot?.isYou ? "slot-you" : ""}`}
            >
              <span className="font-display text-gold-3 text-[10px] sm:text-xs font-bold leading-none">
                {i + 1}
              </span>
              {slot ? (
                <span className="font-display text-gilt text-xs sm:text-lg font-extrabold leading-tight break-all">
                  {slot.display}
                </span>
              ) : (
                <span className="text-muted text-sm sm:text-xl font-black leading-tight">？</span>
              )}
            </div>
            <span
              className={`text-[10px] sm:text-xs truncate max-w-full ${
                slot ? (slot.isYou ? "text-gold" : "text-ink/80") : isCurrent ? "text-gold-2 font-bold" : "text-muted"
              }`}
            >
              {slot ? slot.name : isCurrent && exploded ? (heldBy ?? "") : (pendingName ?? "")}
            </span>
          </div>
        );
      })}
    </div>
  );
}
