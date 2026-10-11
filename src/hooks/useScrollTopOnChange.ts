"use client";

import { useEffect } from "react";

/** スクロールにかける時間（距離に応じて伸ばす。長すぎると操作の邪魔になるので上限を設ける） */
const MIN_MS = 300;
const MAX_MS = 700;

/** 最初は速く、最後はゆっくり止まる（easeOutCubic） */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * key が変わったら、ページ最上部へ EaseOut でスクロールする。
 * 問題の表示時や問題終了時（判定画面・結果画面への切り替え）に、画面の頭から見せるために使う。
 * スクロール中にユーザーが操作したら止める。動きを減らす設定の端末では一瞬で移動する。
 */
export function useScrollTopOnChange(key: string | null): void {
  useEffect(() => {
    if (key === null || typeof window === "undefined") return;
    const startY = window.scrollY;
    if (startY <= 0) return;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      window.scrollTo(0, 0);
      return;
    }

    const duration = Math.min(MAX_MS, MIN_MS + startY * 0.4);
    const startAt = performance.now();
    let frame = 0;
    let cancelled = false;
    const cancel = () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
    const step = (now: number) => {
      if (cancelled) return;
      const t = Math.min(1, (now - startAt) / duration);
      window.scrollTo(0, Math.round(startY * (1 - easeOutCubic(t))));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    // ユーザーが自分でスクロールし始めたら、それを優先する
    const opts = { passive: true } as const;
    window.addEventListener("wheel", cancel, opts);
    window.addEventListener("touchstart", cancel, opts);
    window.addEventListener("keydown", cancel);
    return () => {
      cancel();
      window.removeEventListener("wheel", cancel);
      window.removeEventListener("touchstart", cancel);
      window.removeEventListener("keydown", cancel);
    };
  }, [key]);
}
