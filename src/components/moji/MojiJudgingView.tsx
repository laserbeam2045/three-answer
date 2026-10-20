"use client";

import { useEffect, useState } from "react";
import Confetti from "@/components/Confetti";
import OrnateTitle from "@/components/OrnateTitle";
import MojiPlayersPanel from "@/components/moji/MojiPlayersPanel";
import type { MojiRevealed } from "@/lib/types";
import type { UseRoomResult } from "@/hooks/useRoom";

/** 1文字ずつ○×を開いていく間隔（ms） */
const CHAR_STEP_MS = 450;

/** 参加者の書いた文字と正解の文字を並べる（結果画面のふりかえりでも使う） */
export function MojiChars({ judged, shown = Infinity }: { judged: MojiRevealed; shown?: number }) {
  return (
    <ol
      className="grid gap-1.5 sm:gap-3 w-full mx-auto"
      style={{ gridTemplateColumns: `repeat(${judged.chars.length}, minmax(0, 1fr))`, maxWidth: `${judged.chars.length * 6}rem` }}
    >
      {judged.chars.map((c, i) => {
        const open = i < shown;
        return (
          <li
            key={i}
            className={`slot flex flex-col items-center gap-1 px-1 py-2 min-w-0 ${c.isYou ? "slot-you" : ""} ${
              open ? (c.correct ? "border-gold" : "border-crimson") : ""
            }`}
          >
            <span className="text-[10px] sm:text-xs text-muted truncate max-w-full">{c.name}</span>
            <span className="font-display text-2xl sm:text-4xl font-black leading-none h-8 sm:h-11 flex items-center text-ink">
              {c.input || "？"}
            </span>
            <span className={`text-lg sm:text-2xl font-black leading-none ${open ? (c.correct ? "text-gold" : "text-crimson") : "text-transparent"}`}>
              {c.correct ? "○" : "×"}
            </span>
            <span className={`text-[10px] sm:text-xs ${open && !c.correct ? "text-crimson" : "text-muted"}`}>
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
  const [shown, setShown] = useState(0);
  const [sending, setSending] = useState(false);

  const count = judged?.chars.length ?? 0;
  useEffect(() => {
    setShown(0);
    setSending(false);
    const timers = Array.from({ length: count + 1 }, (_, i) => setTimeout(() => setShown(i + 1), 300 + i * CHAR_STEP_MS));
    return () => timers.forEach(clearTimeout);
  }, [qIndex, count]);

  if (!state || !judged) return null;

  const cancelled = judged.status === "cancelled";
  const done = cancelled || shown > count;
  const isLast = state.moji.doneCount >= state.moji.gameLength;

  const onNext = () => {
    if (sending) return;
    setSending(true);
    void send({ type: "next" }).then((ok) => {
      if (!ok) setSending(false);
    });
  };

  return (
    <div
      className="flex-1 w-full max-w-3xl mx-auto flex flex-col items-center gap-3 sm:gap-5 px-3 sm:px-6 py-3 sm:py-6 select-none"
      onClick={() => setShown(count + 1)}
    >
      {done && judged.status === "cleared" && <Confetti fireKey={`m${qIndex}`} />}
      <div className="w-full text-center">
        <OrnateTitle className="mb-2">結果</OrnateTitle>
        <p className="font-display text-sm sm:text-base text-ink/90 leading-relaxed">{judged.q}</p>
      </div>

      {cancelled ? (
        <p className="text-center text-sm text-muted">答えている人が抜けたので、この問題は中止です（得点には数えません）。</p>
      ) : (
        <MojiChars judged={judged} shown={shown} />
      )}

      <section className="min-h-16 sm:min-h-24 flex flex-col items-center justify-center gap-1 sm:gap-2">
        {done && !cancelled && (
          <div className={judged.status === "cleared" ? "rays" : ""}>
            <div
              className={`pop-in seal text-3xl sm:text-5xl whitespace-nowrap ${
                judged.status === "cleared" ? "gold-glow burst-ring seal-ok" : "seal-ng"
              }`}
            >
              <span className="seal-mark">{judged.status === "cleared" ? "○" : "×"}</span>
              {judged.status === "cleared" ? "正解" : "不正解"}
            </div>
          </div>
        )}
        {done && (
          <p className="pop-in font-display text-lg sm:text-2xl font-extrabold text-ink text-center">
            答え：<span className="text-gilt">{judged.answer}</span>
            {judged.answer !== judged.reading && <span className="text-base sm:text-lg text-gold-2">（{judged.reading}）</span>}
            <span className="block text-xs sm:text-sm text-muted font-sans font-normal mt-1">
              正答率 {judged.rate}%
              {!cancelled && `　／　これまで ${state.moji.score} / ${state.moji.total}点`}
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
  );
}
