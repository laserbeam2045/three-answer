"use client";

import type { BomberPanelView } from "@/lib/types";

/**
 * パネル問題のパネル一覧（難読漢字など）。最初から全部の出題を並べておき、
 * 正解したパネルから答え（読み）と答えた人の名前が出て、金色に埋まっていく。
 */
export default function BomberPanels({ panels }: { panels: BomberPanelView[] }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 sm:gap-3 w-full">
      {panels.map((p, i) => (
        <div
          key={`${i}-${p.display ? "open" : "closed"}`}
          className={`slot flex flex-col items-center justify-center gap-0.5 px-1 py-2 sm:py-3 min-h-20 sm:min-h-24 text-center ${
            p.display ? "flip-in border-gold gold-glow" : ""
          } ${p.isYou ? "slot-you" : ""}`}
        >
          <span
            className={`font-display font-extrabold leading-tight break-all ${
              p.display ? "text-ink/70 text-base sm:text-xl" : "text-ink text-xl sm:text-3xl"
            }`}
          >
            {p.prompt}
          </span>
          {p.display ? (
            <>
              <span className="font-display text-gilt text-sm sm:text-lg font-extrabold leading-tight">{p.display}</span>
              <span className="text-[10px] sm:text-xs text-muted truncate max-w-full">{p.by}</span>
            </>
          ) : (
            <span className="text-muted text-xs sm:text-sm font-black">？</span>
          )}
        </div>
      ))}
    </div>
  );
}
