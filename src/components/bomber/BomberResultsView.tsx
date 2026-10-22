"use client";

import { useState } from "react";
import BomberAnswerList from "@/components/bomber/BomberAnswerList";
import BomberMissList from "@/components/bomber/BomberMissList";
import BomberPanels from "@/components/bomber/BomberPanels";
import Collapse from "@/components/Collapse";
import Confetti from "@/components/Confetti";
import MyStats from "@/components/MyStats";
import OrnateTitle from "@/components/OrnateTitle";
import type { UseRoomResult } from "@/hooks/useRoom";

function scoreComment(ratio: number): string {
  if (ratio >= 1) return "パーフェクト！！";
  if (ratio >= 0.8) return "お見事！";
  if (ratio >= 0.6) return "いいリレー！";
  if (ratio >= 0.3) return "まだまだ伸びしろあり";
  return "次はきっとできる…！";
}

export default function BomberResultsView({ room }: { room: UseRoomResult }) {
  const { state, send } = room;
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  if (!state) return null;

  const { totalPoints, maxPoints, isPlayer } = state.bomber;
  const history = state.bomber.history ?? [];
  const ratio = maxPoints > 0 ? totalPoints / maxPoints : 0;
  const high = ratio >= 0.8;
  const canBack = isPlayer || state.you.isHost;
  const clearedCount = history.filter((h) => h.cleared).length;
  // 自分の成績（ほかの人の分は出さない）
  const teamSlots = history.reduce((n, h) => n + h.slots.length, 0);
  const mySlots = history.reduce((n, h) => n + h.slots.filter((s) => s.isYou).length, 0);
  const myMisses = history.reduce((n, h) => n + h.misses.filter((m) => m.isYou).length, 0);
  const myBooms = history.filter((h) => h.heldByYou).length;
  const showMine = history.length > 0 && (isPlayer || mySlots + myMisses + myBooms > 0);
  const titleOf = (setId: string) =>
    setId === "moji" ? "ひと文字リーグ" : [...state.setMeta, ...state.bomber.setMeta].find((m) => m.id === setId)?.title ?? setId;

  const onBack = async () => {
    if (busy || !canBack) return;
    setBusy(true);
    await send({ type: "backToLobby" });
    setBusy(false);
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 space-y-10">
      {high && <Confetti fireKey="bomber-results" intensity={ratio >= 1 ? 2.2 : 1.4} />}

      <section className="text-center flex flex-col items-center py-4">
        <div className="rays">
          <div className={`medallion pop-in ${high ? "gold-glow" : ""}`}>
            <p className="font-display text-gold-3 text-[10px] sm:text-xs font-bold tracking-[0.35em] pl-[0.35em] mb-2">
              最終得点
            </p>
            <p className="font-display text-gilt text-5xl sm:text-6xl font-extrabold leading-none">
              {totalPoints}
            </p>
            <p className="font-display text-muted text-base sm:text-lg font-bold mt-2">/ {maxPoints}点</p>
          </div>
        </div>
        <p className="pop-in mt-8 font-display text-xl sm:text-2xl font-extrabold text-ink tracking-wider">
          {scoreComment(ratio)}
        </p>
        <p className="text-muted text-sm mt-2">
          クリア {clearedCount} / {history.length}問
        </p>
      </section>

      {showMine && (
        <MyStats
          stats={[
            { label: "正解", value: mySlots, unit: "個" },
            { label: "お手つき", value: myMisses, unit: "回", bad: myMisses > 0 },
            { label: "爆発", value: myBooms, unit: "回", bad: myBooms > 0 },
          ]}
          note={teamSlots > 0 ? `チームの正解 ${teamSlots}個のうち ${Math.round((mySlots / teamSlots) * 100)}% を答えました` : undefined}
        />
      )}

      {history.length > 0 && (
        <section>
          <OrnateTitle className="mb-3">全{history.length}問のふりかえり</OrnateTitle>
          <div className="ornate-2 overflow-hidden">
            {history.map((h, i) => {
              const open = openIdx === i;
              const isPanel = h.answers.length > 0 && h.answers.every((a) => !!a.prompt);
              return (
                <div key={i} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setOpenIdx(open ? null : i)}
                    className="w-full flex items-center gap-2 sm:gap-3 px-3 py-2.5 text-left hover:bg-panel-2 transition-colors cursor-pointer"
                  >
                    <span className="text-muted text-xs w-9 shrink-0">Q{i + 1}</span>
                    <span
                      className={`w-6 shrink-0 text-center text-lg font-black ${
                        h.cleared ? "text-gold" : "text-crimson"
                      }`}
                    >
                      {h.cleared ? "○" : "💥"}
                    </span>
                    <span className="text-sm truncate min-w-0 flex-1">{h.q}</span>
                    <span className="shrink-0 font-bold text-gold-2 text-sm">{h.points}点</span>
                    <span
                      className={`text-muted text-xs shrink-0 transition-transform duration-300 ease-out ${open ? "rotate-180" : ""}`}
                    >
                      ▼
                    </span>
                  </button>
                  <Collapse open={open}>
                    {isPanel ? (
                      // パネル問題は出題時と同じ並びのパネルで振り返る
                      <div className="px-3 pb-4 space-y-3">
                        <BomberPanels
                          panels={h.answers.map((a) => ({ prompt: a.prompt!, display: a.display, by: a.by, isYou: false, image: a.image, reading: a.reading }))}
                        />
                        {h.misses.length > 0 && <BomberMissList misses={h.misses} />}
                      </div>
                    ) : (
                      <div className="px-3 pb-4 space-y-3">
                        <ol className="flex flex-wrap gap-1.5 text-sm">
                          {h.slots.map((s, k) => (
                            <li key={k} className="slot px-2 py-1">
                              <span className="text-gold-3 text-xs mr-1">{k + 1}</span>
                              <span className="font-bold text-gold-2">{s.display}</span>
                              <span className="text-muted text-xs ml-1">{s.name}</span>
                              {s.aiInput && (
                                <span
                                  className="text-muted text-[10px] ml-1"
                                  title="表記ゆれをAIが判定して正解にしました"
                                >
                                  （入力「{s.aiInput}」）
                                </span>
                              )}
                            </li>
                          ))}
                          {h.slots.length === 0 && <li className="text-muted text-sm">正解なし</li>}
                          {h.heldBy && (
                            <li className="px-2 py-1 text-crimson text-xs self-center">
                              💥 {h.heldBy}さんで爆発
                            </li>
                          )}
                        </ol>
                        <BomberAnswerList answers={h.answers} total={h.totalAnswers} />
                        {h.misses.length > 0 && <BomberMissList misses={h.misses} />}
                      </div>
                    )}
                  </Collapse>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {state.gameRecords.length > 0 && (
        <section>
          <OrnateTitle className="mb-3">これまでの記録</OrnateTitle>
          <div className="ornate-2 overflow-hidden">
            {state.gameRecords.map((r, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-line last:border-b-0"
              >
                <span className="text-muted text-xs w-12 shrink-0">{i + 1}戦目</span>
                <span className="font-bold truncate min-w-0">{titleOf(r.setId)}</span>
                <span className="ml-auto shrink-0 font-black text-gold">
                  {r.score}
                  {r.mode !== "three" && "点"}
                  <span className="text-muted font-normal text-xs"> / {r.total}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col items-center gap-2 pb-6">
        <button
          type="button"
          disabled={!canBack || busy}
          onClick={onBack}
          className="btn-gold text-lg px-8 py-3"
        >
          ロビーに戻る（別のセットで遊ぶ）
        </button>
        {!canBack && <p className="text-xs text-muted">観戦者はロビーに戻す操作はできません</p>}
      </section>
    </div>
  );
}
