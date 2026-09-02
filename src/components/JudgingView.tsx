"use client";

import { useEffect, useState, type MouseEvent } from "react";
import CardTile from "@/components/CardTile";
import Confetti from "@/components/Confetti";
import PlaySlots from "@/components/PlaySlots";
import type { UseRoomResult } from "@/hooks/useRoom";
import { ROLES, type Role } from "@/lib/types";

/** 演出段階の切替時刻（マウント起点、ms）。stateは全員同一なので自然に同期する */
const STAGE_TIMES = [900, 1600, 2200, 2600] as const;
const MAX_STAGE = STAGE_TIMES.length;

export default function JudgingView({ room }: { room: UseRoomResult }) {
  const { state, send } = room;
  const judged = state?.judged ?? null;
  const qIndex = judged?.result.qIndex ?? 0;

  const [stage, setStage] = useState(0);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setStage(0);
    const timers = STAGE_TIMES.map((ms, i) =>
      setTimeout(() => setStage((s) => Math.max(s, i + 1)), ms)
    );
    return () => timers.forEach(clearTimeout);
  }, [qIndex]);

  if (!state || !judged) return null;

  const { result, question } = judged;
  const isHost = state.you.isHost;
  const isLast = state.qIndex === 19;

  const seatName = (role: Role): string =>
    state.seats.find((s) => s.role === role)?.name ?? `プレイヤー${role}`;

  /** ボタン以外の領域クリックで演出を即時完了（誤送信なし） */
  const skip = () => setStage(MAX_STAGE);

  const onNext = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (sending) return;
    setSending(true);
    void send({ type: "next" }).then((ok) => {
      if (!ok) setSending(false);
    });
  };

  return (
    <div
      className="flex-1 w-full max-w-3xl mx-auto flex flex-col items-center gap-5 px-4 py-6 sm:gap-6 select-none"
      onClick={skip}
    >
      {/* 段階1 (0ms): 問題文 + みんなの出したカード */}
      <div className="w-full text-center">
        <p className="text-muted text-xs font-bold tracking-widest mb-1">
          第{state.qIndex + 1}問 / 20 ── 判定
        </p>
        <p className="text-sm sm:text-base text-ink/90 leading-relaxed">{question.q}</p>
      </div>

      <PlaySlots
        title="みんなの出したカード"
        reveal
        slots={ROLES.map((role) => {
          const played = result.played.find((p) => p.role === role) ?? null;
          const seat = state.seats.find((s) => s.role === role);
          return {
            role,
            name: seatName(role),
            active: seat?.active ?? true,
            isYou: state.you.role === role,
            content: played
              ? ({ kind: "card", word: played.card } as const)
              : ({ kind: "pass" } as const),
          };
        })}
      />

      {/* 段階2 (900ms): 判定ドーン */}
      {stage >= 1 && result.correct && (
        <>
          <Confetti fireKey={`q${qIndex}`} />
          <div aria-hidden className="pointer-events-none fixed inset-0 z-30 flash-gold" />
        </>
      )}
      <section className="min-h-20 sm:min-h-24 flex items-center justify-center">
        {stage >= 1 &&
          (result.correct ? (
            <div className="pop-in gold-glow burst-ring relative bg-panel border border-gold/60 rounded-2xl px-8 py-3 sm:px-12 sm:py-4">
              <span className="text-3xl sm:text-5xl font-black text-gold whitespace-nowrap">
                ⭕ 正解！
              </span>
            </div>
          ) : (
            <div className="pop-in bg-panel border border-red-500/60 rounded-2xl px-8 py-3 sm:px-12 sm:py-4">
              <span className="text-3xl sm:text-5xl font-black text-red-400 whitespace-nowrap">
                ❌ 不正解…
              </span>
            </div>
          ))}
      </section>

      {/* 段階3 (1600ms): 正解パネル */}
      {stage >= 2 && (
        <section className="pop-in w-full bg-panel border border-line rounded-xl p-4 sm:p-5 text-center">
          <p className="text-muted text-xs font-bold tracking-widest mb-2">
            {result.correct
              ? question.required.length >= 2
                ? "カードが合体して正解が完成！"
                : "みごと正解！"
              : "本来の正解はこれ"}
          </p>
          <p className="text-muted text-xs sm:text-sm">{question.answerReading}</p>
          <p className="text-2xl sm:text-4xl font-black text-gold mb-3">{question.answerDisplay}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {question.required.map((r, i) => (
              <div key={`${r.role}-${r.card}`} className="flex items-center gap-2">
                {i > 0 && <span className="text-gold text-xl sm:text-2xl font-black">＋</span>}
                <div className="flip-in" style={{ animationDelay: `${i * 250}ms` }}>
                  <CardTile word={r.card} role={r.role} size="md" state="revealed" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 段階4 (2200ms): 解説パネル */}
      {stage >= 3 && (
        <section className="pop-in w-full bg-panel-2 border border-line rounded-xl p-4 sm:p-5">
          <h3 className="text-gold text-xs font-bold tracking-widest mb-1.5">解説</h3>
          <p className="text-sm sm:text-base leading-relaxed text-ink/90">
            {question.explanation}
          </p>
        </section>
      )}

      {/* 最終段階: 次へボタン（着席者のみ活性） */}
      {stage >= MAX_STAGE ? (
        <div className="pop-in mt-auto pt-2 flex flex-col items-center gap-2">
          {isHost ? (
            <button
              onClick={onNext}
              disabled={sending}
              className="bg-gold text-card-ink font-bold text-lg px-8 py-3 rounded-xl shadow-lg hover:brightness-110 active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition"
            >
              {sending ? "読み込み中…" : isLast ? "結果発表へ" : "次の問題へ"}
            </button>
          ) : (
            <p className="text-muted text-sm">ルーム作成者の操作待ち…</p>
          )}
        </div>
      ) : (
        <p className="text-muted/70 text-xs mt-auto">タップで演出をスキップ</p>
      )}
    </div>
  );
}
