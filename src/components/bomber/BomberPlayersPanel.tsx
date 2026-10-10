"use client";

import OrnateTitle from "@/components/OrnateTitle";
import type { UseRoomResult } from "@/hooks/useRoom";
import { BOMBER_MAX_PLAYERS } from "@/lib/bomber/match";

/** ファイブボンバーの参加者一覧（ロビー用）。回答はこの並び順に回る */
export default function BomberPlayersPanel({ room }: { room: UseRoomResult }) {
  const { state, send } = room;
  if (!state) return null;
  const { players, isPlayer } = state.bomber;
  const full = players.length >= BOMBER_MAX_PLAYERS;

  return (
    <section className="ornate-2 p-3 sm:p-5">
      <OrnateTitle className="mb-3">
        参加者（{players.length} / {BOMBER_MAX_PLAYERS}人）
      </OrnateTitle>
      {players.length === 0 ? (
        <p className="text-muted text-sm text-center mb-3">まだ誰も参加していません</p>
      ) : (
        <ol className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 mb-3">
          {players.map((p, i) => (
            <li
              key={p.token}
              className={`slot ${p.isYou ? "slot-you" : ""} flex items-center gap-1.5 px-2 py-2 min-w-0`}
            >
              <span className="font-display text-gold text-sm font-extrabold min-w-4 shrink-0 text-center tabular-nums">
                {i + 1}
              </span>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${p.active ? "bg-player-c" : "bg-muted/50"}`}
                title={p.active ? "接続中" : "離席中"}
                aria-label={p.active ? "接続中" : "離席中"}
              />
              <span className="text-sm font-bold truncate min-w-0">
                {p.name}
                {p.isYou && <span className="text-gold font-normal">（あなた）</span>}
              </span>
              {state.you.isHost && !p.isYou && !p.active && (
                <button
                  type="button"
                  onClick={() => void send({ type: "bomberKick", token: p.token })}
                  className="ml-auto shrink-0 text-xs text-muted hover:text-ink underline"
                >
                  外す
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="flex justify-center">
        {isPlayer ? (
          <button
            type="button"
            onClick={() => void send({ type: "bomberLeave" })}
            className="btn-ghost px-6 py-2 text-sm"
          >
            参加をやめる
          </button>
        ) : (
          <button
            type="button"
            disabled={full}
            onClick={() => void send({ type: "bomberJoin" })}
            className="btn-gold px-8 py-2.5 text-base tracking-widest"
          >
            {full ? "満員です" : "参加する"}
          </button>
        )}
      </div>
      <p className="text-xs text-muted text-center mt-2">
        1〜{BOMBER_MAX_PLAYERS}人で遊べます。回答はこの番号順に回ります。
      </p>
    </section>
  );
}
