"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";

const GOLD = ["#fff7cc", "#fde68a", "#f6e3a1", "#e2c05b", "#fbbf24", "#ffffff"];
const COLORS = ["#fbbf24", "#f43f5e", "#3b82f6", "#22c55e", "#a855f7", "#ffffff"];

/**
 * クリア時の打ち上げ花火。左右・中央で金と色とりどりの花火が順に開き、
 * 最後に左右から紙吹雪を大きく打ち上げる。
 */
export default function ClearFireworks({ fireKey }: { fireKey: string | number }) {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const firework = (x: number, y: number, colors: string[], count = 90) =>
      confetti({
        particleCount: count,
        spread: 360,
        startVelocity: 30,
        origin: { x, y },
        colors,
        shapes: ["star", "circle"],
        scalar: 1.1,
        ticks: 140,
        gravity: 0.7,
        decay: 0.92,
        disableForReducedMotion: true,
      });

    const shots: [number, number, number, string[]][] = [
      [0, 0.5, 0.35, GOLD],
      [250, 0.2, 0.3, COLORS],
      [450, 0.8, 0.3, COLORS],
      [700, 0.35, 0.18, GOLD],
      [900, 0.65, 0.2, GOLD],
      [1150, 0.5, 0.25, COLORS],
    ];
    const timers = shots.map(([ms, x, y, colors]) => setTimeout(() => firework(x, y, colors), ms));

    // 締めの紙吹雪
    timers.push(
      setTimeout(() => {
        for (const [x, angle] of [
          [0, 60],
          [1, 120],
        ] as const) {
          confetti({
            particleCount: 120,
            spread: 70,
            startVelocity: 65,
            angle,
            origin: { x, y: 0.95 },
            colors: [...GOLD, ...COLORS],
            ticks: 260,
            disableForReducedMotion: true,
          });
        }
      }, 1400)
    );
    return () => timers.forEach(clearTimeout);
  }, [fireKey]);

  return null;
}
