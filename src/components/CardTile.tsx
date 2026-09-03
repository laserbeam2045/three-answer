"use client";

import type { Role } from "@/lib/types";

type TileState = "normal" | "selected" | "disabled" | "revealed";
type TileSize = "sm" | "md" | "lg" | "hand";

const ROLE_BAR: Record<Role, string> = {
  A: "bg-player-a",
  B: "bg-player-b",
  C: "bg-player-c",
};

const SIZE_CLS: Record<TileSize, string> = {
  sm: "min-w-12 px-2 pt-1.5 pb-2.5 text-sm",
  md: "min-w-16 px-3 pt-2 pb-3.5 text-base",
  lg: "min-w-20 px-4 pt-3 pb-4.5 text-xl",
  // 手札用: スマホでは小さく、sm以上でmd相当
  hand: "min-w-11 px-1.5 pt-1.5 pb-2.5 text-sm sm:min-w-16 sm:px-3 sm:pt-2 sm:pb-3.5 sm:text-base",
};

/** ひらがなの札。和紙質感と二重の縁取り、下端にプレイヤー色の帯 */
export default function CardTile({
  word,
  state = "normal",
  size = "md",
  role = null,
  onClick,
  flip = false,
  className = "",
}: {
  word: string;
  state?: TileState;
  size?: TileSize;
  role?: Role | null;
  onClick?: () => void;
  flip?: boolean;
  className?: string;
}) {
  const disabled = state === "disabled";
  const clickable = !!onClick && !disabled;

  const cls = [
    "card-tile relative inline-flex items-center justify-center tracking-wide whitespace-nowrap",
    SIZE_CLS[size],
    state === "selected" ? "selected" : "",
    state === "revealed" ? "revealed" : "",
    disabled ? "opacity-45 pointer-events-none" : "",
    clickable ? "cursor-pointer" : "cursor-default",
    flip ? "flip-in" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const bar = role ? (
    <span
      aria-hidden
      className={`absolute inset-x-2 bottom-1.5 h-1 rounded-full ${ROLE_BAR[role]}`}
    />
  ) : null;

  if (clickable) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {word}
        {bar}
      </button>
    );
  }
  return (
    <span className={cls}>
      {word}
      {bar}
    </span>
  );
}
