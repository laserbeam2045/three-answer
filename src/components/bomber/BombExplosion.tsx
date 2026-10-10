"use client";

import { useEffect, useState } from "react";
import confetti from "canvas-confetti";

const FIRE = ["#fff7cc", "#fde047", "#fb923c", "#f97316", "#ef4444", "#b91c1c"];
const SMOKE = ["#4b5563", "#374151", "#1f2937", "#6b7280"];

/** 中心から放射するギザギザの爆発形（spikes 本のトゲ） */
function burstPath(spikes: number, outer: number, inner: number, jitter: number, seed: number): string {
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer * (1 - jitter * (((i * 37 + seed) % 7) / 7)) : inner;
    const a = (Math.PI * i) / spikes - Math.PI / 2;
    pts.push(`${(100 + r * Math.cos(a)).toFixed(1)},${(100 + r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join("L")}Z`;
}

const BURST_OUTER = burstPath(14, 96, 60, 0.25, 3);
const BURST_MID = burstPath(12, 80, 50, 0.3, 5);
const BURST_INNER = burstPath(10, 62, 40, 0.3, 1);

/**
 * 時間切れの大爆発。全画面のフラッシュ → 爆炎と「Boom!!」→ 衝撃波・火の粉・煙 → 画面の揺れ。
 * 約1.8秒で消える。prefers-reduced-motion では文字だけを短く出す。
 */
export default function BombExplosion({ fireKey }: { fireKey: string | number }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const hide = setTimeout(() => setVisible(false), reduce ? 900 : 1900);
    if (reduce) return () => clearTimeout(hide);

    // 画面の揺れ
    document.body.classList.add("screen-shake");
    const unshake = setTimeout(() => document.body.classList.remove("screen-shake"), 750);

    // 火の玉（中心から全方向に）
    const blast = (count: number, velocity: number, colors: string[], scalar: number, ticks: number) =>
      confetti({
        particleCount: count,
        spread: 360,
        startVelocity: velocity,
        origin: { x: 0.5, y: 0.45 },
        colors,
        shapes: ["circle"],
        scalar,
        ticks,
        gravity: 0.6,
        decay: 0.9,
        disableForReducedMotion: true,
      });
    blast(140, 55, FIRE, 1.4, 120);
    const t1 = setTimeout(() => blast(90, 32, FIRE, 2.2, 90), 80);
    // 煙と破片
    const t2 = setTimeout(() => {
      blast(60, 22, SMOKE, 2.6, 160);
      confetti({
        particleCount: 50,
        spread: 360,
        startVelocity: 45,
        origin: { x: 0.5, y: 0.45 },
        colors: ["#111827", "#78350f", "#a8862a"],
        shapes: ["square"],
        scalar: 0.9,
        ticks: 200,
        gravity: 1.4,
        disableForReducedMotion: true,
      });
    }, 160);
    // 降ってくる火の粉
    const t3 = setTimeout(
      () =>
        confetti({
          particleCount: 60,
          spread: 160,
          startVelocity: 20,
          angle: 270,
          origin: { x: 0.5, y: 0 },
          colors: ["#fde047", "#fb923c"],
          shapes: ["circle"],
          scalar: 0.6,
          ticks: 260,
          gravity: 0.5,
          disableForReducedMotion: true,
        }),
      350
    );

    return () => {
      [hide, unshake, t1, t2, t3].forEach(clearTimeout);
      document.body.classList.remove("screen-shake");
    };
  }, [fireKey]);

  if (!visible) return null;

  return (
    <div aria-hidden className="boom-overlay pointer-events-none fixed inset-0 z-40 overflow-hidden">
      <div className="boom-flash absolute inset-0" />
      <div className="boom-ring absolute left-1/2 top-[45%]" />
      <div className="boom-ring boom-ring-2 absolute left-1/2 top-[45%]" />
      <div className="boom-smoke absolute left-1/2 top-[45%]" />
      <svg viewBox="0 0 200 200" className="boom-burst absolute left-1/2 top-[45%] w-[min(92vw,560px)]">
        <defs>
          <linearGradient id="boom-text" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fffbe6" />
            <stop offset="45%" stopColor="#fde047" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
        </defs>
        <g className="boom-spin">
          <path d={BURST_OUTER} fill="#b91c1c" stroke="#450a0a" strokeWidth="2" strokeLinejoin="round" />
          <path d={BURST_MID} fill="#f97316" />
          <path d={BURST_INNER} fill="#fde047" />
        </g>
        <g className="boom-text">
          <text
            x="100"
            y="112"
            textAnchor="middle"
            fontSize="46"
            fontWeight="900"
            fontStyle="italic"
            fontFamily="'Arial Black', 'Impact', 'Noto Sans JP', sans-serif"
            fill="url(#boom-text)"
            stroke="#3b0a0a"
            strokeWidth="5"
            strokeLinejoin="round"
            paintOrder="stroke"
            transform="rotate(-8 100 100)"
          >
            Boom!!
          </text>
        </g>
      </svg>
    </div>
  );
}
