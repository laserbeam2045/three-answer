"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TimerState } from "@/lib/types";
import { effectiveElapsed, LEAD_IN_MS } from "@/lib/time";

/**
 * 問題文を1文字ずつ出す（タイプライター）。カクつかないように:
 * - まだ出ていない部分も透明のまま置いておき、折り返し・中央寄せ・高さを最初から最後の形に固定する
 *   （1文字増えるたびに行が左右にずれたり、行が増えて下が押し下げられたりしない）
 * - 時計は出題・再開のときに一度だけサーバー時刻に合わせ、あとは端末の時計（performance.now）で進める
 *   （通信のたびの時刻補正で、表示が前後に跳ねない）
 * - 100ms ごとの再描画ではなく requestAnimationFrame で見て、文字数が変わったときだけ描き直す
 */
export default function Typewriter(props: { text: string; timer: TimerState | null; nowServer: () => number }) {
  // 問題が変わったら作り直す（前の問題の文字数が一瞬残らないように）
  return <TypewriterText key={props.text} {...props} />;
}

function TypewriterText({
  text,
  timer,
  nowServer,
}: {
  text: string;
  timer: TimerState | null;
  nowServer: () => number;
}) {
  // サロゲートペア（𠮟 など）を途中で切らないよう、コードポイント単位で数える
  const chars = useMemo(() => Array.from(text), [text]);
  const total = chars.length;

  // 同じ値のタイマーが通信のたびに新しいオブジェクトで届くので、値が変わったときだけ合わせ直す
  const timerKey = timer
    ? `${timer.resumedAt}:${timer.elapsedBeforeResumeMs}:${timer.paused ? 1 : 0}:${timer.revealMs}:${timer.totalMs}`
    : "";
  const timerRef = useRef(timer);
  timerRef.current = timer;
  const nowRef = useRef(nowServer);
  nowRef.current = nowServer;

  const countAt = (elapsed: number, t: TimerState) => {
    const typeMs = Math.max(1, t.revealMs - LEAD_IN_MS);
    const p = Math.max(0, Math.min(1, (elapsed - LEAD_IN_MS) / typeMs));
    return Math.floor(p * total);
  };

  const [count, setCount] = useState(() => (timer ? countAt(effectiveElapsed(timer, nowServer()), timer) : total));
  // 戻さない（時刻の合わせ直しで文字が消えないように）
  const shownRef = useRef({ count });

  useEffect(() => {
    const t = timerRef.current;
    if (!t) {
      shownRef.current.count = total;
      setCount(total);
      return;
    }
    const baseElapsed = effectiveElapsed(t, nowRef.current());
    const basePerf = performance.now();
    let raf = 0;
    const step = () => {
      const elapsed = t.paused ? baseElapsed : baseElapsed + (performance.now() - basePerf);
      const next = Math.max(shownRef.current.count, countAt(elapsed, t));
      if (next !== shownRef.current.count) {
        shownRef.current.count = next;
        setCount(next);
      }
      if (next < total && !t.paused) raf = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(raf);
  }, [timerKey, total]);

  const shown = Math.min(count, total);
  const typing = shown < total;
  return (
    <>
      {chars.slice(0, shown).join("")}
      {typing && <span className="typewriter-caret" aria-hidden />}
      {typing && (
        <span className="invisible" aria-hidden>
          {chars.slice(shown).join("")}
        </span>
      )}
    </>
  );
}
