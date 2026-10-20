"use client";

import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import ClearFireworks from "@/components/bomber/ClearFireworks";
import Confetti from "@/components/Confetti";

const ASH = ["#4b5563", "#6b7280", "#374151", "#7f1d1d", "#b91c1c"];

/**
 * ひと文字リーグの最終判定の全画面演出。
 * - 全員正解: 金の閃光 → 画面いっぱいの光の筋 → 打ち上げ花火と紙吹雪
 * - 不正解: 画面が揺れ、中央に大きな × が叩きつけられ、ふちが赤く脈打ち、灰が降る
 * prefers-reduced-motion では CSS 側で消える（紙吹雪も canvas-confetti が止める）。
 */
export default function MojiVerdictEffect({ cleared, fireKey }: { cleared: boolean; fireKey: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    const hide = setTimeout(() => setVisible(false), 2700);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (cleared || reduce) return () => clearTimeout(hide);

    document.body.classList.add("screen-shake");
    const unshake = setTimeout(() => document.body.classList.remove("screen-shake"), 750);
    // 灰が上から降る
    const ash = setTimeout(
      () =>
        confetti({
          particleCount: 70,
          spread: 160,
          startVelocity: 12,
          angle: 270,
          origin: { x: 0.5, y: -0.05 },
          colors: ASH,
          shapes: ["circle"],
          scalar: 0.8,
          gravity: 0.5,
          ticks: 260,
          disableForReducedMotion: true,
        }),
      250
    );
    return () => {
      clearTimeout(hide);
      clearTimeout(unshake);
      clearTimeout(ash);
      document.body.classList.remove("screen-shake");
    };
  }, [cleared, fireKey]);

  if (cleared) {
    return (
      <>
        <ClearFireworks fireKey={`fw-${fireKey}`} />
        <Confetti fireKey={`cf-${fireKey}`} intensity={1.6} />
        {visible && (
          <div aria-hidden className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
            <div className="absolute inset-0 flash-gold" />
            <div className="moji-glory" />
          </div>
        )}
      </>
    );
  }
  if (!visible) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
      <div className="absolute inset-0 flash-crimson" />
      <div className="absolute inset-0 moji-fail-vignette" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="moji-big-x">×</span>
      </div>
    </div>
  );
}
