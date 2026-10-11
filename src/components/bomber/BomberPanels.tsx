"use client";

import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { BOMBER_POINTS } from "@/lib/bomber/match";
import type { BomberPanelView } from "@/lib/types";

/** 正解演出を出しておく時間 */
const HIT_MS = 1800;

/**
 * パネル問題のパネル一覧（難読漢字など）。最初から全部の出題を並べておき、
 * 正解したパネルから答え（読み）と答えた人の名前が出て、金色に埋まっていく。
 * 並びはデータの順（易しい順）で、上の段から下の段へ、左から右へ。
 * 今まさに埋まったパネルは、光の筋・衝撃波・紙吹雪・「+10」で派手に開く。
 * 結果画面では答えられなかったパネルも読みを出す（`display` があって `by` が無いパネルは灰色で表示）。
 */
export default function BomberPanels({ panels }: { panels: BomberPanelView[] }) {
  const boxRefs = useRef<(HTMLDivElement | null)[]>([]);
  // 前回描画時に開いていたパネル（初回は null＝演出しない）
  const prevOpen = useRef<boolean[] | null>(null);
  const [hits, setHits] = useState<number[]>([]);
  // 演出を消すタイマー。ポーリングのたびに effect が走るので、cleanup では消さず unmount 時だけ止める
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  useEffect(() => {
    const open = panels.map((p) => !!p.display);
    const prev = prevOpen.current;
    prevOpen.current = open;
    if (!prev) return;
    const fresh = open.flatMap((o, i) => (o && !prev[i] ? [i] : []));
    if (fresh.length === 0) return;
    setHits((h) => [...h, ...fresh]);
    timers.current.push(window.setTimeout(() => setHits((h) => h.filter((i) => !fresh.includes(i))), HIT_MS));

    if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      for (const i of fresh) {
        const el = boxRefs.current[i];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const origin = { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight };
        const common = { origin, disableForReducedMotion: true, zIndex: 60 };
        // 星の大爆発＋遅れて舞う金の紙吹雪
        confetti({
          ...common,
          particleCount: 90,
          spread: 360,
          startVelocity: 32,
          colors: ["#ffffff", "#fff7cc", "#fde68a", "#e2c05b", "#fbbf24"],
          shapes: ["star"],
          scalar: 1.1,
          ticks: 90,
          gravity: 0.55,
        });
        const later = window.setTimeout(() => {
          confetti({
            ...common,
            particleCount: 60,
            spread: 120,
            angle: 90,
            startVelocity: 26,
            colors: ["#fde68a", "#e2c05b", "#f472b6", "#60a5fa", "#34d399"],
            shapes: ["square", "circle"],
            scalar: 0.9,
            ticks: 140,
            gravity: 0.7,
          });
        }, 180);
        timers.current.push(later);
      }
    }
  }, [panels]);

  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 sm:gap-3 w-full">
      {panels.map((p, i) => {
        const hit = hits.includes(i);
        // 結果画面で、誰も答えられなかったパネル
        const missed = !!p.display && !p.by;
        return (
          <div
            key={`${i}-${p.display ? "open" : "closed"}`}
            ref={(el) => {
              boxRefs.current[i] = el;
            }}
            className={`slot relative flex flex-col items-center justify-center gap-0.5 px-1 py-2 sm:py-3 min-h-20 sm:min-h-24 text-center ${
              missed ? "opacity-60" : p.display ? `border-gold gold-glow ${hit ? "panel-hit" : "flip-in"}` : ""
            } ${p.isYou ? "slot-you" : ""}`}
          >
            {hit && (
              <>
                <span aria-hidden className="panel-rays" />
                <span aria-hidden className="panel-ring" />
                <span aria-hidden className="panel-ring panel-ring-2" />
                <span aria-hidden className="panel-flash" />
                <span
                  aria-hidden
                  className="plus-float absolute left-1/2 -top-2 z-20 font-display text-gold-2 text-xl sm:text-3xl font-black pointer-events-none"
                >
                  +{BOMBER_POINTS}
                </span>
              </>
            )}
            <span
              className={`relative font-display font-extrabold leading-tight break-all ${
                p.display ? "text-ink/70 text-base sm:text-xl" : "text-ink text-xl sm:text-3xl"
              }`}
            >
              {p.prompt}
            </span>
            {p.display ? (
              <>
                <span
                  className={`relative font-display text-sm sm:text-lg font-extrabold leading-tight ${
                    missed ? "text-ink/80" : "text-gilt"
                  } ${hit ? "panel-stamp" : ""}`}
                >
                  {p.display}
                </span>
                <span className="relative text-[10px] sm:text-xs text-muted truncate max-w-full">{p.by ?? "だれも答えられず"}</span>
              </>
            ) : (
              <span className="text-muted text-xs sm:text-sm font-black">？</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
