"use client";

import CardTile from "@/components/CardTile";
import SeatBadge from "@/components/SeatBadge";
import PlaySlots from "@/components/PlaySlots";
import TimerBar from "@/components/TimerBar";
import { useTimer } from "@/hooks/useTimer";
import type { UseRoomResult } from "@/hooks/useRoom";
import { ROLES, type Role } from "@/lib/types";

const ROLE_TEXT: Record<Role, string> = {
  A: "text-player-a",
  B: "text-player-b",
  C: "text-player-c",
};

const ROLE_LABEL: Record<Role, string> = { A: "A", B: "B", C: "C" };

export default function QuestionView({ room }: { room: UseRoomResult }) {
  const { state, send, nowServer, spectatorReveal, setSpectatorReveal } = room;
  const timer = useTimer(state?.timer ?? null, nowServer);

  if (!state || !state.question) return null;

  const { question, seats, you, myHand, mySelection, qIndex } = state;
  const isSeated = you.role !== null;
  const locked = mySelection?.locked ?? false;
  const passSelected = mySelection !== null && mySelection.cardIndex === null;

  // タイプライター表示（paused中は useTimer が凍結値を返すため自動的に停止する）
  const inReveal = state.timer !== null && timer.inReveal;
  const shownText = inReveal
    ? question.q.slice(0, Math.floor(timer.revealProgress * question.qLength))
    : question.q;

  const decideLabel = passSelected ? "出さないで決定" : "この選択で決定";

  return (
    <div className="flex-1 w-full max-w-4xl mx-auto flex flex-col gap-2.5 sm:gap-4 p-3 sm:p-6">
      {/* 上部: 問題番号バッジ + タイマー */}
      <div className="flex items-center gap-3">
        <span className="shrink-0 inline-flex items-baseline gap-1 rounded-full bg-gold text-card-ink font-bold px-4 py-1.5 text-sm sm:text-base shadow">
          第{qIndex + 1}問
          <span className="text-xs opacity-70">/ 20</span>
        </span>
        <div className="flex-1 min-w-0">
          <TimerBar room={room} />
        </div>
      </div>

      {/* 問題文パネル。出題前は「問題」の演出だけを見せる */}
      <section className="relative bg-panel border border-line rounded-2xl px-4 py-4 sm:px-10 sm:py-12 shadow-lg min-h-28 sm:min-h-44 flex items-center justify-center overflow-hidden">
        {timer.inLeadIn ? (
          <div className="q-ripple relative flex flex-col items-center justify-center">
            <span className="q-badge text-3xl sm:text-5xl font-black text-gold tracking-[0.25em] pl-[0.25em] select-none">
              問題
            </span>
            <span className="mt-2 text-xs sm:text-sm text-muted font-bold tracking-widest">
              第{qIndex + 1}問
            </span>
          </div>
        ) : (
          <p className="text-base sm:text-2xl font-bold leading-relaxed text-center text-ink">
            {inReveal ? <span className="typewriter-caret">{shownText}</span> : shownText}
          </p>
        )}
      </section>

      {/* 場のスロット（判定画面と同じUI。他プレイヤーの内容は伏せられる） */}
      <PlaySlots
        title="みんなの出すカード"
        slots={seats.map((seat) => {
          const isYou = seat.role === you.role;
          const myCard =
            isYou && mySelection && mySelection.cardIndex !== null && myHand
              ? myHand[mySelection.cardIndex]
              : null;
          return {
            role: seat.role,
            name: seat.name ?? `${seat.role}席`,
            active: seat.active,
            isYou,
            content: isYou
              ? myCard !== null
                ? ({ kind: "card", word: myCard } as const)
                : ({ kind: "pass" } as const)
              : ({ kind: "hidden", decided: seat.locked } as const),
          };
        })}
      />

      {isSeated && myHand && mySelection ? (
        <>
          {/* 手札 */}
          <section className="bg-panel-2/60 border border-line rounded-2xl p-2.5 sm:p-5">
            <h2 className="text-xs sm:text-sm text-muted font-bold mb-2 sm:mb-3">あなたの手札</h2>
            <div className="flex flex-wrap justify-center gap-1.5 sm:gap-3">
              {myHand.map((word, index) => (
                <CardTile
                  key={`${qIndex}-${index}`}
                  word={word}
                  role={you.role}
                  size="hand"
                  flip
                  state={
                    locked
                      ? mySelection.cardIndex === index
                        ? "selected"
                        : "disabled"
                      : mySelection.cardIndex === index
                        ? "selected"
                        : "normal"
                  }
                  onClick={
                    locked ? undefined : () => void send({ type: "select", cardIndex: index })
                  }
                />
              ))}
            </div>
          </section>

          {/* 操作列 */}
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            <button
              type="button"
              disabled={locked}
              onClick={() => void send({ type: "select", cardIndex: null })}
              className={`rounded-xl px-4 py-2 sm:px-5 sm:py-2.5 text-sm sm:text-base font-bold border transition-colors ${
                passSelected
                  ? "border-gold text-gold bg-gold/10 shadow-[0_0_12px_rgba(251,191,36,0.25)]"
                  : "border-line text-muted hover:text-ink hover:border-ink/40"
              } ${locked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              出さない
            </button>

            {!locked ? (
              <button
                type="button"
                onClick={() => void send({ type: "lock" })}
                className="rounded-xl px-5 py-2 sm:px-6 sm:py-2.5 text-sm sm:text-base font-bold bg-gold text-card-ink shadow hover:brightness-110 cursor-pointer transition-[filter]"
              >
                {decideLabel}
              </button>
            ) : (
              <>
                <span className="rounded-xl px-5 py-2 sm:px-6 sm:py-2.5 text-sm sm:text-base font-bold border border-gold text-gold bg-panel">
                  決定済み ✓
                </span>
                <button
                  type="button"
                  onClick={() => void send({ type: "unlock" })}
                  className="rounded-xl px-4 py-2 sm:px-5 sm:py-2.5 text-sm sm:text-base font-bold border border-line text-muted hover:text-ink hover:border-ink/40 cursor-pointer transition-colors"
                >
                  選び直す
                </button>
              </>
            )}
          </div>

          <p className="text-xs text-muted text-center">
            全員が決定すると即判定。時間切れ時はその時点の選択で判定されます
          </p>
        </>
      ) : (
        /* 観戦者ビュー */
        <section className="bg-panel-2/60 border border-line rounded-2xl p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm text-muted font-bold">プレイヤーの決定状況</h2>
            <button
              type="button"
              onClick={() => setSpectatorReveal(!spectatorReveal)}
              className={`text-xs rounded-lg px-3 py-1.5 font-bold border cursor-pointer transition-colors ${
                spectatorReveal
                  ? "border-gold text-gold bg-gold/10"
                  : "border-line text-muted hover:text-ink"
              }`}
            >
              {spectatorReveal ? "手札を隠す" : "全員の手札を見る"}
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {seats.map((seat) => (
              <div
                key={seat.role}
                className="flex items-center justify-between gap-3 bg-panel border border-line rounded-xl px-4 py-2.5"
              >
                <SeatBadge seat={seat} isYou={false} />
                <span
                  className={`text-sm font-bold shrink-0 ${seat.locked ? "text-gold" : "text-muted"}`}
                >
                  {seat.locked ? "決定済み" : "考え中…"}
                </span>
              </div>
            ))}
          </div>

          {spectatorReveal && state.allHands && (
            <div className="flex flex-col gap-4">
              {ROLES.map((role) => {
                const hand = state.allHands?.[role];
                if (!hand) return null;
                const seat = seats.find((s) => s.role === role);
                return (
                  <div key={role}>
                    <h3 className={`text-sm font-bold mb-2 ${ROLE_TEXT[role]}`}>
                      {ROLE_LABEL[role]}
                      {seat?.name ? `（${seat.name}）` : ""}の手札
                      <span className="text-muted font-normal ml-2 text-xs">
                        ※選択内容は見えません
                      </span>
                    </h3>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      {hand.map((word, i) => (
                        <CardTile key={i} word={word} role={role} size="sm" />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
