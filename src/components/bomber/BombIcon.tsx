"use client";

import { useId } from "react";

/** 金縁の爆弾。導火線の先で火花がまたたく。urgent で小刻みに震える */
export default function BombIcon({
  className = "",
  urgent = false,
  lit = true,
}: {
  className?: string;
  urgent?: boolean;
  /** false で火花なし（クリア後など） */
  lit?: boolean;
}) {
  const gradId = `bomb-body-${useId().replace(/:/g, "")}`;
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden
      className={`${urgent ? "bomb-shake-fast" : lit ? "bomb-shake" : ""} ${className}`}
    >
      <defs>
        <radialGradient id={gradId} cx="38%" cy="36%" r="70%">
          <stop offset="0%" stopColor="#3a4466" />
          <stop offset="55%" stopColor="#151a2a" />
          <stop offset="100%" stopColor="#05070d" />
        </radialGradient>
      </defs>
      {/* 導火線 */}
      <path d="M40 18 C 44 10, 50 10, 52 6" fill="none" stroke="#c9a54a" strokeWidth="2.5" strokeLinecap="round" />
      {/* 口金 */}
      <rect x="33" y="15" width="10" height="7" rx="1.5" transform="rotate(35 38 18)" fill="#a8862a" stroke="#f6e3a1" strokeWidth="1" />
      {/* 本体 */}
      <circle cx="30" cy="38" r="20" fill={`url(#${gradId})`} stroke="#e2c05b" strokeWidth="2" />
      <ellipse cx="23" cy="30" rx="5" ry="3" fill="#ffffff" opacity="0.18" transform="rotate(-35 23 30)" />
      {/* 火花 */}
      {lit && (
        <g className="bomb-spark" style={{ transformOrigin: "53px 5px" }}>
          <path
            d="M53 0 L55 3.5 L59 2 L56.5 5.5 L60 8 L55.5 7.5 L54 11 L52 7.5 L47.5 8.5 L50.5 5 L47.5 2 L51.5 3.2 Z"
            fill="#fde68a"
            stroke="#f59e0b"
            strokeWidth="0.8"
          />
        </g>
      )}
    </svg>
  );
}
