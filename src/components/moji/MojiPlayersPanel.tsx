"use client";

import OrnateTitle from "@/components/OrnateTitle";
import type { UseRoomResult } from "@/hooks/useRoom";

/**
 * ひと文字リーグの参加者一覧。ロビーでもゲーム中でも参加・離脱できる（ゲーム中に参加した人は次の問題から）。
 * compact: ゲーム中の画面の下に出す小さい版
 */
export default function MojiPlayersPanel({ room, compact = false }: { room: UseRoomResult; compact?: boolean }) {
  const { state, send } = room;
  if (!state) return null;
  const { players, isPlayer, minPlayers, maxPlayers } = state.moji;
  const full = players.length >= maxPlayers;
  const inGame = state.phase !== "lobby";

  const joinButton = isPlayer ? (
    <button type="button" onClick={() => void send({ type: "mojiLeave" })} className="btn-ghost px-5 py-1.5 text-sm">
      {inGame ? "ゲームから抜ける" : "参加をやめる"}
    </button>
  ) : (
    <button
      type="button"
      disabled={full}
      onClick={() => void send({ type: "mojiJoin" })}
      className={inGame ? "btn-gold px-5 py-1.5 text-sm" : "btn-gold px-8 py-2.5 text-base tracking-widest"}
    >
      {full ? "満員です" : inGame ? "途中参加する（次の問題から）" : "参加する"}
    </button>
  );

  if (compact) {
    return (
      <section className="w-full flex flex-col items-center gap-1.5">
        <p className="text-xs text-muted text-center">
          参加者 {players.length}人：{players.map((p) => p.name + (p.position === null && state.phase === "question" ? "（次の問題から）" : "")).join("・")}
        </p>
        {joinButton}
      </section>
    );
  }

  return (
    <section className="ornate-2 p-3 sm:p-5">
      <OrnateTitle className="mb-3">
        参加者（{players.length} / {maxPlayers}人）
      </OrnateTitle>
      {players.length === 0 ? (
        <p className="text-muted text-sm text-center mb-3">まだ誰も参加していません</p>
      ) : (
        <ol className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2 mb-3">
          {players.map((p, i) => (
            <li key={p.id} className={`slot ${p.isYou ? "slot-you" : ""} flex items-center gap-1.5 px-2 py-2 min-w-0`}>
              <span className="font-display text-gold text-xs font-extrabold shrink-0 tabular-nums">{i + 1}文字目</span>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${p.active ? "bg-player-c" : "bg-muted/50"}`}
                aria-label={p.active ? "接続中" : "離席中"}
              />
              <span className="text-sm font-bold truncate min-w-0">
                {p.name}
                {p.isYou && <span className="text-gold font-normal">（あなた）</span>}
              </span>
              {state.you.isHost && !p.isYou && !p.active && (
                <button
                  type="button"
                  onClick={() => void send({ type: "mojiKick", id: p.id })}
                  className="ml-auto shrink-0 text-xs text-muted hover:text-ink underline"
                >
                  外す
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="flex justify-center">{joinButton}</div>
      <p className="text-xs text-muted text-center mt-2">
        {minPlayers}〜{maxPlayers}人で遊べます。参加した順に1文字目・2文字目…を答えます。
        {players.length >= minPlayers && `いまの人数だと、読みが${players.length}文字の問題が出ます。`}
      </p>
    </section>
  );
}
