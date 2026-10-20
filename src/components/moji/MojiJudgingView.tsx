"use client";

import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import OrnateTitle from "@/components/OrnateTitle";
import MojiPlayersPanel from "@/components/moji/MojiPlayersPanel";
import MojiVerdictEffect from "@/components/moji/MojiVerdictEffect";
import { MOJI_POINTS } from "@/lib/moji/engine";
import type { MojiRevealed } from "@/lib/types";
import type { UseRoomResult } from "@/hooks/useRoom";

/** 最初の1文字を開くまでの「ため」（ms） */
const FIRST_OPEN_MS = 900;
/** 1文字ずつ○×を開いていく間隔（ms） */
const CHAR_STEP_MS = 650;
/** 最後の1文字を開いてから、最終判定を出すまでの「ため」（ms） */
const VERDICT_DELAY_MS = 600;

/** 開いた枠から小さく火花を飛ばす（正解は金の星、不正解は灰） */
function sparkFrom(el: HTMLElement | null, correct: boolean) {
  if (!el || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const r = el.getBoundingClientRect();
  confetti({
    particleCount: correct ? 34 : 18,
    spread: 360,
    startVelocity: correct ? 22 : 12,
    origin: { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight },
    colors: correct ? ["#fff7cc", "#fde68a", "#fbbf24", "#ffffff"] : ["#4b5563", "#6b7280", "#b91c1c"],
    shapes: correct ? ["star"] : ["circle"],
    scalar: correct ? 0.9 : 0.7,
    ticks: correct ? 90 : 70,
    gravity: correct ? 0.8 : 1.2,
    disableForReducedMotion: true,
  });
}

/**
 * 参加者の書いた文字と正解の文字を並べる（結果画面のふりかえりでも使う）。
 * shown: 開いた文字の数（判定画面で1文字ずつ開く）。animate: 開いた瞬間の演出をする
 */
export function MojiChars({
  judged,
  shown = Infinity,
  animate = false,
  wave = false,
  tileRefs,
}: {
  judged: MojiRevealed;
  shown?: number;
  animate?: boolean;
  /** 全員正解のあと、枠が順に跳ねる */
  wave?: boolean;
  tileRefs?: React.RefObject<(HTMLLIElement | null)[]>;
}) {
  return (
    <ol
      className="grid gap-1.5 sm:gap-3 w-full mx-auto"
      style={{ gridTemplateColumns: `repeat(${judged.chars.length}, minmax(0, 1fr))`, maxWidth: `${judged.chars.length * 6}rem` }}
    >
      {judged.chars.map((c, i) => {
        const open = i < shown;
        const effect = !animate
          ? open
            ? c.correct
              ? "border-gold"
              : "border-crimson"
            : ""
          : !open
            ? "moji-pending"
            : wave && c.correct
              ? "moji-wave"
              : c.correct
                ? "moji-hit"
                : "moji-miss";
        return (
          <li
            key={i}
            ref={(el) => {
              if (tileRefs?.current) tileRefs.current[i] = el;
            }}
            className={`slot moji-tile flex flex-col items-center gap-1 px-1 py-2 min-w-0 ${c.isYou ? "slot-you" : ""} ${effect}`}
            style={wave && c.correct ? { animationDelay: `${i * 90}ms, ${600 + i * 90}ms` } : undefined}
          >
            {animate && open && c.correct && !wave && (
              <>
                <span aria-hidden className="panel-rays" />
                <span aria-hidden className="panel-flash" />
                <span aria-hidden className="panel-ring" />
                <span aria-hidden className="panel-ring panel-ring-2" />
              </>
            )}
            {animate && open && !c.correct && <span aria-hidden className="moji-miss-flash" />}
            <span className="text-[10px] sm:text-xs text-muted truncate max-w-full">{c.name}</span>
            <span className="font-display text-2xl sm:text-4xl font-black leading-none h-8 sm:h-11 flex items-center text-ink">
              {c.input || "？"}
            </span>
            <span
              className={`text-lg sm:text-2xl font-black leading-none ${
                open ? (c.correct ? "text-gold" : "text-crimson") : "text-transparent"
              } ${animate && open ? (c.correct ? "panel-stamp" : "moji-slam") : ""}`}
            >
              {c.correct ? "○" : "×"}
            </span>
            <span className={`text-[10px] sm:text-xs ${open && !c.correct ? "text-crimson font-bold" : "text-muted"}`}>
              {open && !c.correct ? `正しくは「${c.expected}」` : " "}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function MojiJudgingView({ room }: { room: UseRoomResult }) {
  const { state, send } = room;
  const judged = state?.moji.judged ?? null;
  const qIndex = state?.qIndex ?? 0;
  const count = judged?.chars.length ?? 0;
  const verdictAt = count + 1;
  const [shown, setShown] = useState(0);
  const [sending, setSending] = useState(false);
  const tileRefs = useRef<(HTMLLIElement | null)[]>([]);
  const skippedRef = useRef(false);

  useEffect(() => {
    setShown(0);
    setSending(false);
    skippedRef.current = false;
    const timers = Array.from({ length: count }, (_, i) => setTimeout(() => setShown((s) => Math.max(s, i + 1)), FIRST_OPEN_MS + i * CHAR_STEP_MS));
    timers.push(
      setTimeout(() => setShown((s) => Math.max(s, verdictAt)), FIRST_OPEN_MS + (count - 1) * CHAR_STEP_MS + VERDICT_DELAY_MS)
    );
    return () => timers.forEach(clearTimeout);
  }, [qIndex, count, verdictAt]);

  // 1文字開くごとに、その枠から火花を飛ばす（スキップしたときは飛ばさない）
  useEffect(() => {
    if (!judged || skippedRef.current || shown < 1 || shown > count) return;
    sparkFrom(tileRefs.current[shown - 1], judged.chars[shown - 1].correct);
  }, [shown, judged, count]);

  if (!state || !judged) return null;

  const cancelled = judged.status === "cancelled";
  const cleared = judged.status === "cleared";
  const done = cancelled || shown >= verdictAt;
  const isLast = state.moji.doneCount >= state.moji.gameLength;

  const onNext = () => {
    if (sending) return;
    setSending(true);
    void send({ type: "next" }).then((ok) => {
      if (!ok) setSending(false);
    });
  };

  return (
    <div className="flex-1 w-full flex overflow-x-clip">
      {done && !cancelled && <MojiVerdictEffect cleared={cleared} fireKey={`m${qIndex}`} />}
      <div
        className="shake-target flex-1 w-full max-w-3xl mx-auto flex flex-col items-center gap-3 sm:gap-5 px-3 sm:px-6 py-3 sm:py-6 select-none"
        onClick={() => {
          if (shown < verdictAt) {
            skippedRef.current = true;
            setShown(verdictAt);
          }
        }}
      >
        <div className="w-full text-center">
          <OrnateTitle className="mb-2">結果</OrnateTitle>
          <p className="font-display text-sm sm:text-base text-ink/90 leading-relaxed">{judged.q}</p>
        </div>

        {cancelled ? (
          <p className="text-center text-sm text-muted">答えている人が抜けたので、この問題は中止です（得点には数えません）。</p>
        ) : (
          <MojiChars judged={judged} shown={shown} animate wave={done && cleared} tileRefs={tileRefs} />
        )}

        <section className="min-h-24 sm:min-h-32 flex flex-col items-center justify-center gap-2 sm:gap-3">
          {done && !cancelled && (
            <div className={cleared ? "rays" : ""}>
              <div
                className={`seal-slam seal text-4xl sm:text-6xl whitespace-nowrap ${
                  cleared ? "gold-glow burst-ring seal-ok" : "seal-ng"
                }`}
              >
                <span className="seal-mark">{cleared ? "○" : "×"}</span>
                {cleared ? "全員正解！" : "不正解"}
              </div>
            </div>
          )}
          {done && cleared && (
            <p className="pop-in font-display text-xl sm:text-2xl font-extrabold text-gold-2">
              +{MOJI_POINTS}点
              <span className="text-sm text-muted font-sans font-normal ml-2">
                （これまで {state.moji.score} / {state.moji.total}点）
              </span>
            </p>
          )}
          {done && (
            <p className="rise-in font-display text-lg sm:text-2xl font-extrabold text-ink text-center">
              答え：<span className="text-gilt">{judged.answer}</span>
              {judged.answer !== judged.reading && <span className="text-base sm:text-lg text-gold-2">（{judged.reading}）</span>}
              <span className="block text-xs sm:text-sm text-muted font-sans font-normal mt-1">
                正答率 {judged.rate}%
                {!cancelled && !cleared && `　／　これまで ${state.moji.score} / ${state.moji.total}点`}
              </span>
            </p>
          )}
        </section>

        {done ? (
          <div className="pop-in mt-auto pt-2 flex flex-col items-center gap-3 w-full">
            {state.you.isHost ? (
              <button type="button" onClick={onNext} disabled={sending} className="btn-gold text-lg px-10 py-3">
                {sending ? "読み込み中…" : isLast ? "結果発表へ" : "次の問題へ"}
              </button>
            ) : (
              <p className="text-muted text-sm">ルーム作成者の操作待ち…</p>
            )}
            <MojiPlayersPanel room={room} compact />
          </div>
        ) : (
          <p className="text-muted/70 text-xs mt-auto">タップで演出をスキップ</p>
        )}
      </div>
    </div>
  );
}
