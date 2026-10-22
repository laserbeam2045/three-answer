"use client";

import { useState } from "react";
import Collapse from "@/components/Collapse";
import Confetti from "@/components/Confetti";
import MyStats from "@/components/MyStats";
import OrnateTitle from "@/components/OrnateTitle";
import { MojiChars } from "@/components/moji/MojiJudgingView";
import type { UseRoomResult } from "@/hooks/useRoom";

function scoreComment(ratio: number): string {
  if (ratio >= 1) return "パーフェクト！！";
  if (ratio >= 0.8) return "息ぴったり！";
  if (ratio >= 0.5) return "いいチームワーク！";
  if (ratio >= 0.3) return "まだまだ伸びしろあり";
  return "次はきっと揃う…！";
}

export default function MojiResultsView({ room }: { room: UseRoomResult }) {
  const { state, send } = room;
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  if (!state) return null;

  const { score, total, isPlayer } = state.moji;
  const history = state.moji.history ?? [];
  const ratio = total > 0 ? score / total : 0;
  const high = ratio >= 0.8;
  const canBack = isPlayer || state.you.isHost;
  const done = history.filter((h) => h.status !== "cancelled");
  const clearedCount = done.filter((h) => h.status === "cleared").length;
  // 自分の成績（ほかの人の分は出さない）。中止になった問題は数えない
  const myChars = done.flatMap((h) => h.chars.filter((c) => c.isYou));
  const myCorrect = myChars.filter((c) => c.correct).length;
  const myQuestions = done.filter((h) => h.chars.some((c) => c.isYou)).length;

  const onBack = async () => {
    if (busy || !canBack) return;
    setBusy(true);
    await send({ type: "backToLobby" });
    setBusy(false);
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 space-y-10">
      {high && <Confetti fireKey="moji-results" intensity={ratio >= 1 ? 2.2 : 1.4} />}

      <section className="text-center flex flex-col items-center py-4">
        <div className="rays">
          <div className={`medallion pop-in ${high ? "gold-glow" : ""}`}>
            <p className="font-display text-gold-3 text-[10px] sm:text-xs font-bold tracking-[0.35em] pl-[0.35em] mb-2">最終得点</p>
            <p className="font-display text-gilt text-5xl sm:text-6xl font-extrabold leading-none">{score}</p>
            <p className="font-display text-muted text-base sm:text-lg font-bold mt-2">/ {total}点</p>
          </div>
        </div>
        <p className="pop-in mt-8 font-display text-xl sm:text-2xl font-extrabold text-ink tracking-wider">{scoreComment(ratio)}</p>
        <p className="text-muted text-sm mt-2">
          正解 {clearedCount} / {done.length}問
        </p>
      </section>

      {myChars.length > 0 && (
        <MyStats
          stats={[
            { label: "正しく書けた", value: myCorrect, unit: `/ ${myChars.length}文字` },
            { label: "正確さ", value: Math.round((myCorrect / myChars.length) * 100), unit: "%" },
            { label: "答えた問題", value: myQuestions, unit: `/ ${done.length}問` },
          ]}
        />
      )}

      {history.length > 0 && (
        <section>
          <OrnateTitle className="mb-3">ふりかえり</OrnateTitle>
          <div className="ornate-2 overflow-hidden">
            {history.map((h, i) => {
              const open = openIdx === i;
              return (
                <div key={i} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setOpenIdx(open ? null : i)}
                    className="w-full flex items-center gap-2 sm:gap-3 px-3 py-2.5 text-left hover:bg-panel-2 transition-colors cursor-pointer"
                  >
                    <span
                      className={`w-6 shrink-0 text-center text-lg font-black ${
                        h.status === "cleared" ? "text-gold" : h.status === "failed" ? "text-crimson" : "text-muted"
                      }`}
                    >
                      {h.status === "cleared" ? "○" : h.status === "failed" ? "×" : "－"}
                    </span>
                    <span className="text-sm truncate min-w-0 flex-1">{h.q}</span>
                    <span className="shrink-0 font-bold text-gold-2 text-sm">{h.status === "cancelled" ? "中止" : h.reading}</span>
                    <span className={`text-muted text-xs shrink-0 transition-transform duration-300 ease-out ${open ? "rotate-180" : ""}`}>▼</span>
                  </button>
                  <Collapse open={open}>
                    <div className="px-3 pb-4 space-y-2">
                      <p className="text-sm text-center">
                        答え：<span className="font-bold text-gold-2">{h.answer}</span>
                        {h.answer !== h.reading && <span className="text-muted">（{h.reading}）</span>}
                        <span className="text-muted text-xs ml-2">正答率 {h.rate}%</span>
                      </p>
                      {h.status !== "cancelled" && <MojiChars judged={h} />}
                    </div>
                  </Collapse>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="flex flex-col items-center gap-2 pb-6">
        <button type="button" disabled={!canBack || busy} onClick={onBack} className="btn-gold text-lg px-8 py-3">
          ロビーに戻る
        </button>
        {!canBack && <p className="text-xs text-muted">観戦者はロビーに戻す操作はできません</p>}
      </section>
    </div>
  );
}
