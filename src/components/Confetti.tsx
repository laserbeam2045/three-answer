"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";

const COLORS = ["#fbbf24", "#f59e0b", "#fde68a", "#f43f5e", "#3b82f6", "#22c55e", "#ffffff"];

/**
 * 正解時の紙吹雪。fireKey が変わるたびに発火する。
 * prefers-reduced-motion の環境では何もしない。
 */
export default function Confetti({
  fireKey,
  intensity = 1,
}: {
  fireKey: string | number;
  /** 1 = 通常の正解、2 = 結果画面の高得点など派手にしたいとき */
  intensity?: number;
}) {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const shoot = (originX: number, angle: number) =>
      confetti({
        particleCount: Math.round(70 * intensity),
        spread: 62,
        startVelocity: 55,
        angle,
        origin: { x: originX, y: 0.9 },
        colors: COLORS,
        scalar: 1.05,
        ticks: 220,
        disableForReducedMotion: true,
      });

    // 左右から打ち上げ
    shoot(0.08, 62);
    shoot(0.92, 118);

    // 少し遅れて中央から大きく broadcast
    const t1 = setTimeout(
      () =>
        confetti({
          particleCount: Math.round(60 * intensity),
          spread: 100,
          startVelocity: 42,
          origin: { x: 0.5, y: 0.72 },
          colors: COLORS,
          scalar: 0.95,
          ticks: 200,
          disableForReducedMotion: true,
        }),
      220
    );

    // 上からひらひら
    const t2 = setTimeout(
      () =>
        confetti({
          particleCount: Math.round(40 * intensity),
          spread: 120,
          startVelocity: 18,
          gravity: 0.55,
          decay: 0.93,
          origin: { x: 0.5, y: 0 },
          colors: COLORS,
          scalar: 1.1,
          ticks: 260,
          disableForReducedMotion: true,
        }),
      420
    );

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [fireKey, intensity]);

  return null;
}
