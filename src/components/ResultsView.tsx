"use client";

import { useMemo, useState } from "react";
import type { UseRoomResult } from "@/hooks/useRoom";
import type { Role } from "@/lib/types";
import { ROLES } from "@/lib/types";
import CardTile from "@/components/CardTile";
import SeatBadge from "@/components/SeatBadge";

const ROLE_BG: Record<Role, string> = {
  A: "bg-player-a",
  B: "bg-player-b",
  C: "bg-player-c",
};

function scoreComment(score: number): string {
  if (score >= 20) return "パーフェクト！！";
  if (score >= 16) return "お見事！";
  if (score >= 11) return "いいチームワーク！";
  if (score >= 6) return "まだまだ伸びしろあり";
  return "次はきっとできる…！";
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CardChip({
  role,
  word,
  faded,
  note,
}: {
  role: Role;
  word: string;
  faded?: boolean;
  note?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold text-white ${ROLE_BG[role]} ${
        faded ? "opacity-40" : ""
      }`}
    >
      {word}
      {note && <span className="text-[10px] font-normal opacity-90">（{note}）</span>}
    </span>
  );
}

export default function ResultsView({ room }: { room: UseRoomResult }) {
  const { state, send } = room;
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // この20問で正解に必要だったカード（= 使われたカード）の集合
  const usedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const h of state?.history ?? []) {
      for (const r of h.question.required) s.add(`${r.role}:${r.card}`);
    }
    return s;
  }, [state?.history]);

  if (!state) return null;

  const history = state.history ?? [];
  const score = state.score ?? 0;
  const total = history.length > 0 ? history.length : 20;
  const highScore = score >= 16;
  const isSeated = state.you.role !== null;

  const metaOf = (setId: string) => state.setMeta.find((m) => m.id === setId);

  const onBackToLobby = async () => {
    if (busy || !isSeated) return;
    setBusy(true);
    await send({ type: "backToLobby" });
    setBusy(false);
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 space-y-10">
      {/* 1. スコア発表 */}
      <section
        className={`bg-panel border border-line rounded-2xl px-6 py-10 text-center ${
          highScore ? "gold-glow" : ""
        }`}
      >
        <p className="text-muted text-sm font-bold tracking-[0.3em] mb-3">最終スコア</p>
        <p className="pop-in text-7xl sm:text-8xl font-black text-gold leading-none">
          {score}
          <span className="text-3xl sm:text-4xl text-muted font-bold"> / {total}</span>
        </p>
        <p
          className="pop-in mt-6 text-xl sm:text-2xl font-bold"
          style={{ animationDelay: "0.4s" }}
        >
          {scoreComment(score)}
        </p>
      </section>

      {/* 2. 全問履歴 */}
      {history.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-muted tracking-[0.25em] mb-3">
            全{total}問のふりかえり
          </h2>
          <div className="bg-panel border border-line rounded-xl overflow-hidden">
            {history.map((h, i) => {
              const open = openIdx === i;
              const requiredKeys = new Set(
                h.question.required.map((r) => `${r.role}:${r.card}`)
              );
              const playedKeys = new Set(
                h.result.played.map((p) => `${p.role}:${p.card}`)
              );
              return (
                <div key={i} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setOpenIdx(open ? null : i)}
                    className="w-full flex items-center gap-2 sm:gap-3 px-3 py-2.5 text-left hover:bg-panel-2 transition-colors cursor-pointer"
                  >
                    <span className="text-muted text-xs w-9 shrink-0">
                      Q{h.result.qIndex + 1}
                    </span>
                    <span
                      className={`w-6 shrink-0 text-center text-xl font-black ${
                        h.result.correct ? "text-gold" : "text-player-a"
                      }`}
                    >
                      {h.result.correct ? "○" : "×"}
                    </span>
                    <span className="font-bold truncate min-w-0">
                      {h.question.answerDisplay}
                    </span>
                    <span className="ml-auto flex flex-wrap justify-end gap-1 shrink-0 max-w-[40%]">
                      {h.result.played.length === 0 ? (
                        <span className="text-xs text-muted">出札なし</span>
                      ) : (
                        h.result.played.map((p) => (
                          <CardChip key={p.role} role={p.role} word={p.card} />
                        ))
                      )}
                    </span>
                    <span
                      className={`text-muted text-[10px] shrink-0 transition-transform ${
                        open ? "rotate-180" : ""
                      }`}
                    >
                      ▼
                    </span>
                  </button>

                  {open && (
                    <div className="px-4 pb-5 pt-2 space-y-4 bg-panel-2/50">
                      <p className="text-sm leading-relaxed">{h.question.q}</p>

                      <div>
                        <p className="text-xs text-muted mb-1">正解</p>
                        <p className="font-bold text-gold">
                          {h.question.answerDisplay}
                          <span className="text-muted font-normal">
                            （{h.question.answerReading}）
                          </span>
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-muted mb-1.5">必要だったカード</p>
                        <div className="flex flex-wrap items-center gap-1">
                          {h.question.required.map((r, j) => {
                            const played = playedKeys.has(`${r.role}:${r.card}`);
                            return (
                              <span key={j} className="inline-flex items-center gap-1">
                                {j > 0 && (
                                  <span className="text-muted text-xs">＋</span>
                                )}
                                <CardChip
                                  role={r.role}
                                  word={r.card}
                                  faded={!played}
                                  note={played ? undefined : "出ず"}
                                />
                              </span>
                            );
                          })}
                          <span className="text-muted text-xs ml-1">
                            ＝ {h.question.answerReading}
                          </span>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs text-muted mb-1.5">実際に出たカード</p>
                        {h.result.played.length === 0 ? (
                          <p className="text-sm text-muted">誰も出しませんでした</p>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {h.result.played.map((p) => (
                              <CardChip
                                key={p.role}
                                role={p.role}
                                word={p.card}
                                note={
                                  requiredKeys.has(`${p.role}:${p.card}`)
                                    ? undefined
                                    : "不要"
                                }
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <p className="text-xs text-muted mb-1">解説</p>
                        <p className="text-sm text-muted leading-relaxed">
                          {h.question.explanation}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. 全員の手札公開 */}
      {state.allHands && (
        <section>
          <h2 className="text-sm font-bold text-muted tracking-[0.25em] mb-3">
            全員の手札公開
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {ROLES.map((role) => {
              const seat = state.seats.find((s) => s.role === role);
              const hand = state.allHands?.[role] ?? [];
              return (
                <div key={role} className="bg-panel border border-line rounded-xl p-4">
                  <div className="mb-3">
                    {seat ? (
                      <SeatBadge seat={seat} isYou={state.you.role === role} />
                    ) : (
                      <span className="font-bold">{role}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    {hand.map((w, i) => {
                      const used = usedKeys.has(`${role}:${w}`);
                      return (
                        <div key={i} className="flex flex-col items-center gap-0.5">
                          <CardTile
                            word={w}
                            size="sm"
                            role={role}
                            className={
                              used
                                ? "outline outline-2 outline-gold"
                                : "opacity-35"
                            }
                          />
                          {!used && (
                            <span className="text-[10px] text-muted">未使用</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. これまでの記録 */}
      {state.gameRecords.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-muted tracking-[0.25em] mb-3">
            これまでの記録
          </h2>
          <div className="bg-panel border border-line rounded-xl overflow-hidden">
            {state.gameRecords.map((r, i) => {
              const meta = metaOf(r.setId);
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-line last:border-b-0"
                >
                  <span className="text-muted text-xs w-12 shrink-0">{i + 1}戦目</span>
                  <span className="font-bold truncate min-w-0">
                    {meta?.title ?? r.setId}
                  </span>
                  {meta && (
                    <span className="text-gold text-xs shrink-0">
                      {"★".repeat(meta.difficulty)}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 font-black text-gold">
                    {r.score}
                    <span className="text-muted font-normal text-xs"> / {r.total}</span>
                  </span>
                  <span className="text-muted text-xs shrink-0 hidden sm:inline">
                    {formatDate(r.finishedAt)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 5. ロビーへ戻る */}
      <section className="flex flex-col items-center gap-2 pb-6">
        <button
          type="button"
          disabled={!isSeated || busy}
          onClick={onBackToLobby}
          className="bg-gold text-card-ink font-bold text-lg px-8 py-3 rounded-xl shadow-lg transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 cursor-pointer"
        >
          ロビーに戻る（別のセットで遊ぶ）
        </button>
        {!isSeated && (
          <p className="text-xs text-muted">観戦者はロビーに戻す操作はできません</p>
        )}
      </section>
    </div>
  );
}
