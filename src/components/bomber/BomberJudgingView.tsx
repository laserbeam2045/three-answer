"use client";

import { useEffect, useState, type MouseEvent } from "react";
import BomberSlots from "@/components/bomber/BomberSlots";
import BomberPlayersBar from "@/components/bomber/BomberPlayersBar";
import BomberMissList from "@/components/bomber/BomberMissList";
import BomberAnswerList from "@/components/bomber/BomberAnswerList";
import BomberPanels from "@/components/bomber/BomberPanels";
import BombExplosion from "@/components/bomber/BombExplosion";
import ClearFireworks from "@/components/bomber/ClearFireworks";
import Confetti from "@/components/Confetti";
import OrnateTitle from "@/components/OrnateTitle";
import type { UseRoomResult } from "@/hooks/useRoom";

/** 演出段階の切替時刻（マウント起点、ms） */
const STAGE_TIMES = [700, 1500, 2100] as const;
const MAX_STAGE = STAGE_TIMES.length;

export default function BomberJudgingView({ room }: { room: UseRoomResult }) {
  const { state, send } = room;
  const judged = state?.bomber.judged ?? null;
  const qIndex = state?.qIndex ?? 0;

  const [stage, setStage] = useState(0);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setStage(0);
    setSending(false);
    const timers = STAGE_TIMES.map((ms, i) =>
      setTimeout(() => setStage((s) => Math.max(s, i + 1)), ms)
    );
    return () => timers.forEach(clearTimeout);
  }, [qIndex]);

  if (!state || !judged) return null;

  const isLast = state.qIndex >= state.questionCount - 1;
  // パネル問題は回答枠ではなく、出題時と同じ並びのパネルで結果を見せる
  const isPanel = judged.answers.length > 0 && judged.answers.every((a) => !!a.prompt);

  const onNext = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (sending) return;
    setSending(true);
    void send({ type: "next" }).then((ok) => {
      if (!ok) setSending(false);
    });
  };

  return (
    <div className="flex-1 w-full flex overflow-x-clip">
      {/* 揺れる中身とは別に置く（固定配置の演出まで揺れないように） */}
      {!judged.cleared && <BombExplosion fireKey={`boom${qIndex}`} />}
      {stage >= 1 && judged.cleared && (
        <>
          <Confetti fireKey={`b${qIndex}`} />
          <ClearFireworks fireKey={`fw${qIndex}`} />
          <div aria-hidden className="pointer-events-none fixed inset-0 z-30 flash-gold" />
        </>
      )}
      <div
        className="shake-target flex-1 w-full max-w-3xl mx-auto flex flex-col items-center gap-5 px-3 sm:px-6 py-6 select-none"
        onClick={() => setStage(MAX_STAGE)}
      >
        <div className="w-full text-center">
          <OrnateTitle className="mb-2">第{state.qIndex + 1}問　結果</OrnateTitle>
          <p className="font-display text-sm sm:text-base text-ink/90 leading-relaxed">{judged.q}</p>
        </div>

        {isPanel ? (
          <BomberPanels
            panels={judged.answers.map((a) => ({ prompt: a.prompt!, display: a.display, by: a.by, isYou: false }))}
          />
        ) : (
          <BomberSlots
            filled={judged.slots}
            upcoming={[]}
            target={judged.target}
            exploded={!judged.cleared}
            heldBy={judged.heldBy}
          />
        )}

        {/* クリア or 爆発 */}
        <section className="min-h-20 sm:min-h-24 flex flex-col items-center justify-center gap-2">
          {judged.cleared ? (
            stage >= 1 && (
              <div className="rays">
                <div className="pop-in gold-glow burst-ring seal seal-ok text-3xl sm:text-5xl whitespace-nowrap">
                  <span className="seal-mark">○</span>
                  クリア
                </div>
              </div>
            )
          ) : (
            <div
              className="explode-pop seal seal-ng seal-boom text-4xl sm:text-6xl whitespace-nowrap"
              style={{ animationDelay: "1.3s" }}
            >
              爆発!!
            </div>
          )}
          {stage >= 1 && (
            <p className="pop-in font-display text-xl sm:text-2xl font-extrabold text-gold-2">
              +{judged.points}点
              <span className="text-sm text-muted font-sans font-normal ml-2">
                （合計 {state.bomber.totalPoints}点）
              </span>
            </p>
          )}
        </section>

        {stage >= 2 && (!isPanel || judged.misses.length > 0) && (
          <section className="rise-in ornate-2 w-full p-3 sm:p-5">
            {!isPanel && (
              <>
                <OrnateTitle as="h3" className="mb-3">
                  正解はこれだけありました（全{judged.answers.length}個）
                </OrnateTitle>
                <BomberAnswerList answers={judged.answers} />
              </>
            )}
            {judged.misses.length > 0 && (
              <>
                <p className={`text-center text-xs text-muted mb-1.5 ${isPanel ? "" : "mt-4"}`}>出た誤答（{judged.misses.length}）</p>
                <BomberMissList misses={judged.misses} />
              </>
            )}
          </section>
        )}

        {stage >= MAX_STAGE && <BomberPlayersBar room={room} />}

        {stage >= MAX_STAGE ? (
          <div className="pop-in mt-auto pt-2 flex flex-col items-center gap-2">
            {state.you.isHost ? (
              <button onClick={onNext} disabled={sending} className="btn-gold text-lg px-10 py-3">
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
    </div>
  );
}
