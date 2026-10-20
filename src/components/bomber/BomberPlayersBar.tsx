"use client";

import BombIcon from "@/components/bomber/BombIcon";
import type { UseRoomResult } from "@/hooks/useRoom";
import { BOMBER_MAX_PLAYERS } from "@/lib/bomber/match";

/**
 * ゲーム中の参加者一覧（参加順＝回答の順）。観戦者は途中参加、参加者は途中で抜けられる。
 * 問題の回答中は「この問題はお休み」（パス）ができ、お休み中の人は順番を飛ばされる（次の問題で自動で戻る）。
 */
export default function BomberPlayersBar({ room }: { room: UseRoomResult }) {
  const { state, send } = room;
  if (!state) return null;

  const { players, isPlayer, round } = state.bomber;
  const full = players.length >= BOMBER_MAX_PLAYERS;
  const me = players.find((p) => p.isYou);
  const resting = !!me?.resting;
  // お休みでないのが自分だけなら、お休みにはできない
  const canRest = !!round && !resting && players.filter((p) => !p.resting).length > 1;

  return (
    <section className="w-full flex flex-col sm:flex-row sm:items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <ol className="flex-1 min-w-0 flex flex-wrap gap-1.5">
        {players.map((p, i) => {
          const holding = round?.turnId === p.id;
          return (
            <li
              key={p.id}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                holding ? "border-gold text-gold-2 bg-gold/10" : p.isYou ? "border-gold-3 text-ink" : "border-line text-ink/80"
              } ${p.resting ? "opacity-50" : ""}`}
            >
              <span className="text-gold-3 font-bold">{i + 1}</span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${p.active ? "bg-player-c" : "bg-muted/50"}`}
                aria-label={p.active ? "接続中" : "離席中"}
              />
              <span className="truncate max-w-[7em]">{p.name}</span>
              {p.isYou && <span className="text-gold">（あなた）</span>}
              {p.resting && <span className="text-muted">お休み</span>}
              {holding && <BombIcon className="w-3.5 h-3.5" />}
            </li>
          );
        })}
      </ol>
      <div className="shrink-0 flex justify-end gap-2">
        {isPlayer && round && (
          <button
            type="button"
            disabled={!resting && !canRest}
            onClick={() => void send({ type: "bomberRest", rest: !resting })}
            className={`text-xs px-3 py-1 ${resting ? "btn-gold" : "btn-ghost"}`}
            title={resting ? "この問題の順番に戻ります" : "この問題だけ順番を飛ばします（次の問題から自動で戻ります）"}
          >
            {resting ? "お休みをやめる" : "この問題はお休み"}
          </button>
        )}
        {isPlayer ? (
          <button type="button" onClick={() => void send({ type: "bomberLeave" })} className="btn-ghost text-xs px-3 py-1">
            ゲームから抜ける
          </button>
        ) : (
          <button
            type="button"
            disabled={full}
            onClick={() => void send({ type: "bomberJoin" })}
            className="btn-gold text-xs px-4 py-1.5"
          >
            {full ? "満員です" : "途中参加する"}
          </button>
        )}
      </div>
    </section>
  );
}
