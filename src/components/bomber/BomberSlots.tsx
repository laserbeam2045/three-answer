"use client";

import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import BombIcon from "@/components/bomber/BombIcon";
import { BOMBER_POINTS, BOMBER_SLOTS } from "@/lib/bomber/match";
import type { BomberSlotView } from "@/lib/types";

/**
 * 回答枠。埋まった枠は正解の表記、未回答の枠は答える予定の人の名前を出す。
 * 回答中の枠の上には爆弾が乗る。
 * 折り返しありの問題（6〜15枠）は5枠ずつの段にし、段ごとに向きを変えて並べる（ジグザグ）。
 * 1段目の5枠目の真下が6枠目、2段目の左端の真下が11枠目＝同じ人が続けて答える。同じ列は同じ人。
 * 最後の段が5つに満たないときは、その段の進む向きの後ろ側を空ける。
 */
export default function BomberSlots({
  filled,
  upcoming,
  target = BOMBER_SLOTS,
  urgent = false,
  exploded = false,
  heldBy = null,
}: {
  filled: BomberSlotView[];
  /** 未回答の枠を答える人（先頭が今の回答者）。判定後は空でよい */
  upcoming: string[];
  /** 枠の数（5、または折り返しありの 10） */
  target?: number;
  urgent?: boolean;
  /** 判定画面で爆発した枠を示す */
  exploded?: boolean;
  /** 爆発したときに爆弾を持っていた人 */
  heldBy?: string | null;
}) {
  const live = upcoming.length > 0;
  const boxRefs = useRef<(HTMLDivElement | null)[]>([]);
  const prevCount = useRef(filled.length);
  // 回答中に今まさに埋まった枠（きらめきと「+10」を出す）
  const [hitIndex, setHitIndex] = useState<number | null>(null);

  useEffect(() => {
    const prev = prevCount.current;
    prevCount.current = filled.length;
    if (!live || filled.length <= prev) return;
    const i = filled.length - 1;
    setHitIndex(i);
    const el = boxRefs.current[i];
    if (!el || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    confetti({
      particleCount: 45,
      spread: 360,
      startVelocity: 18,
      origin: { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight },
      colors: ["#fff7cc", "#fde68a", "#e2c05b", "#fbbf24"],
      shapes: ["star", "circle"],
      scalar: 0.8,
      ticks: 70,
      gravity: 0.4,
      disableForReducedMotion: true,
    });
  }, [filled.length, live]);

  // r 段目の列 c の枠（0始まり）。偶数段は左→右、奇数段は右→左。target を超える枠は空き
  const columns = Array.from({ length: BOMBER_SLOTS }, (_, c) => c);
  const rows = Array.from({ length: Math.ceil(target / BOMBER_SLOTS) }, (_, r) =>
    columns.map((c) => r * BOMBER_SLOTS + (r % 2 === 0 ? c : BOMBER_SLOTS - 1 - c))
  );
  const compact = rows.length > 1;

  return (
    <div className="w-full flex flex-col gap-1">
      {rows.map((row, r) => (
        <div key={r} className="w-full">
          {r > 0 && (
            <p
              className={`text-[10px] sm:text-xs text-gold-3 font-bold tracking-wider -mb-1 ${
                r % 2 === 1 ? "text-right pr-1" : "text-left pl-1"
              }`}
            >
              {r % 2 === 1 ? "↩" : "↪"} {r * BOMBER_SLOTS}枠目から折り返し
            </p>
          )}
          <div className="grid grid-cols-5 gap-1 sm:gap-3 w-full">
            {row.map((i) => {
              if (i >= target) return <div key={i} aria-hidden />;
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
                  {live && hitIndex === i && slot && (
                    <span
                      key={`plus-${i}-${slot.display}`}
                      aria-hidden
                      className="plus-float absolute left-1/2 top-6 sm:top-8 z-10 font-display text-gold-2 text-lg sm:text-2xl font-black pointer-events-none"
                    >
                      +{BOMBER_POINTS}
                    </span>
                  )}
                  <div
                    ref={(el) => {
                      boxRefs.current[i] = el;
                    }}
                    className={`slot w-full ${compact ? "min-h-14 sm:min-h-20" : "min-h-16 sm:min-h-24"} flex flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 text-center ${
                      // 回答中は「今埋まった枠」だけを動かす（判定画面では全枠をめくる）
                      slot ? (live ? (hitIndex === i ? "slot-hit border-gold" : "border-gold-3") : "flip-in border-gold-3") : ""
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
        </div>
      ))}
    </div>
  );
}
