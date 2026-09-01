"use client";

import { useEffect, useRef, useState } from "react";
import { getLocalName, setLocalName, type UseRoomResult } from "@/hooks/useRoom";
import SeatBadge from "@/components/SeatBadge";
import RulesContent from "@/components/RulesContent";
import type { Role } from "@/lib/types";

const SEAT_STYLES: Record<
  Role,
  { border: string; text: string; tint: string; ring: string; btn: string }
> = {
  A: {
    border: "border-player-a/60",
    text: "text-player-a",
    tint: "bg-player-a/10",
    ring: "ring-2 ring-player-a",
    btn: "bg-player-a hover:brightness-110",
  },
  B: {
    border: "border-player-b/60",
    text: "text-player-b",
    tint: "bg-player-b/10",
    ring: "ring-2 ring-player-b",
    btn: "bg-player-b hover:brightness-110",
  },
  C: {
    border: "border-player-c/60",
    text: "text-player-c",
    tint: "bg-player-c/10",
    ring: "ring-2 ring-player-c",
    btn: "bg-player-c hover:brightness-110",
  },
};

const SECONDS_OPTIONS = [30, 45, 60, 90];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-bold tracking-widest text-muted mb-3">{children}</h2>
  );
}

export default function LobbyView({ room }: { room: UseRoomResult }) {
  const { state, send } = room;

  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  // 前回入力した名前(localStorage)を最優先。自動割当の「観戦者N」は空欄として扱う
  const [nameInput, setNameInput] = useState(() => {
    const local = getLocalName();
    if (local) return local;
    const server = room.state?.you.name ?? "";
    return server.startsWith("観戦者") ? "" : server;
  });
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  if (!state) return null;

  const roomUrl = origin ? `${origin}/room/${state.roomId}` : "";

  const copyUrl = async () => {
    if (!roomUrl) return;
    try {
      await navigator.clipboard.writeText(roomUrl);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボード非対応環境では何もしない（URLは選択コピー可能）
    }
  };

  const submitName = () => {
    const n = nameInput.trim();
    if (!n || n === state.you.name) return;
    setLocalName(n);
    void send({ type: "setName", name: n });
  };

  // ---- 開始条件 ----
  const startReasons: string[] = [];
  if (state.seats.some((s) => !s.token)) {
    startReasons.push("3つの席がすべて埋まっていません");
  }
  const inactiveSeats = state.seats.filter((s) => s.token && !s.active);
  if (inactiveSeats.length > 0) {
    startReasons.push(
      `${inactiveSeats.map((s) => s.name ?? `${s.role}席`).join("・")}さんが席を離れています`
    );
  }
  if (!state.setId) {
    startReasons.push("問題セットを選択してください");
  }
  const canStart = startReasons.length === 0;

  const titleOf = (setId: string) =>
    state.setMeta.find((m) => m.id === setId)?.title ?? setId;

  let youChipMarked = false;

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-3 sm:gap-6 p-3 sm:p-6 pb-16">
      {/* 1. 招待パネル */}
      <section className="bg-panel border border-line rounded-xl p-3 sm:p-5">
        <SectionTitle>友達を招待</SectionTitle>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            readOnly
            value={roomUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 min-w-0 bg-panel-2 border border-line rounded-lg px-3 py-2 text-sm text-ink font-mono"
            aria-label="ルームURL"
          />
          <button
            type="button"
            onClick={() => void copyUrl()}
            className={`shrink-0 px-4 py-2 rounded-lg font-bold text-sm transition-colors ${
              copied ? "bg-player-c text-white" : "bg-gold text-card-ink hover:brightness-110"
            }`}
          >
            {copied ? "コピーしました！" : "URLをコピー"}
          </button>
        </div>
        <p className="text-muted text-sm mt-2">
          URLを共有すれば開くだけで参加できます
        </p>
      </section>

      {/* 2. 名前編集 */}
      <section className="bg-panel border border-line rounded-xl p-3 sm:p-5">
        <SectionTitle>あなたの名前</SectionTitle>
        <div className="flex gap-2">
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitName();
            }}
            maxLength={16}
            placeholder="名前を入力"
            className="flex-1 min-w-0 bg-panel-2 border border-line rounded-lg px-3 py-2 text-ink focus:outline-none focus:border-gold"
            aria-label="あなたの名前"
          />
          <button
            type="button"
            onClick={submitName}
            disabled={!nameInput.trim() || nameInput.trim() === state.you.name}
            className="shrink-0 px-4 py-2 rounded-lg font-bold text-sm bg-panel-2 border border-line text-ink hover:border-gold disabled:opacity-40 disabled:hover:border-line transition-colors"
          >
            変更
          </button>
        </div>
      </section>

      {/* 3. 席パネル */}
      <section className="bg-panel border border-line rounded-xl p-3 sm:p-5">
        <SectionTitle>プレイヤー席</SectionTitle>
        <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
          {state.seats.map((seat) => {
            const style = SEAT_STYLES[seat.role];
            const isYou = seat.role === state.you.role;
            const isEmpty = !seat.token;
            const isOtherInactive = !isEmpty && !isYou && !seat.active;
            return (
              <div
                key={seat.role}
                className={`rounded-xl border-2 p-1.5 sm:p-4 min-h-28 sm:min-h-36 flex flex-col items-center justify-between gap-1.5 sm:gap-3 min-w-0 ${
                  isEmpty ? "border-dashed" : ""
                } ${style.border} ${isYou ? `${style.tint} ${style.ring}` : "bg-panel-2"}`}
              >
                <div className={`text-lg sm:text-2xl font-black ${style.text}`}>{seat.role}</div>
                {isEmpty ? (
                  <>
                    <p className="text-muted text-xs sm:text-sm">空席</p>
                    <button
                      type="button"
                      onClick={() => void send({ type: "sit", role: seat.role })}
                      className={`w-full py-1.5 sm:py-2 rounded-lg font-bold text-white text-xs sm:text-sm ${style.btn} transition`}
                    >
                      <span className="sm:hidden">座る</span>
                      <span className="hidden sm:inline">この席に座る</span>
                    </button>
                  </>
                ) : (
                  <>
                    <div className="min-w-0 max-w-full">
                      <SeatBadge seat={seat} isYou={isYou} />
                    </div>
                    {isYou ? (
                      <button
                        type="button"
                        onClick={() => void send({ type: "standUp" })}
                        className="w-full py-1.5 sm:py-2 rounded-lg font-bold text-xs sm:text-sm bg-panel border border-line text-ink hover:border-gold transition-colors"
                      >
                        席を立つ
                      </button>
                    ) : isOtherInactive ? (
                      <button
                        type="button"
                        onClick={() => void send({ type: "sit", role: seat.role })}
                        className={`w-full py-1.5 sm:py-2 rounded-lg font-bold text-white text-xs sm:text-sm ${style.btn} transition`}
                      >
                        <span className="sm:hidden">交代する</span>
                        <span className="hidden sm:inline">代わりに座る</span>
                      </button>
                    ) : (
                      <div className="h-7 sm:h-9" aria-hidden />
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. 観戦者 */}
      <section className="bg-panel border border-line rounded-xl p-3 sm:p-5">
        <SectionTitle>観戦者</SectionTitle>
        {state.spectators.length === 0 ? (
          <p className="text-muted text-sm">観戦者はいません</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {state.spectators.map((sp, i) => {
              const markYou =
                state.you.role === null && !youChipMarked && sp.name === state.you.name;
              if (markYou) youChipMarked = true;
              return (
                <span
                  key={`${sp.name}-${i}`}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border ${
                    markYou
                      ? "border-gold text-gold bg-gold/10"
                      : "border-line bg-panel-2 text-ink"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      sp.active ? "bg-player-c" : "bg-muted"
                    }`}
                    aria-hidden
                  />
                  {sp.name}
                  {markYou && "（あなた）"}
                </span>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. 問題セット選択 */}
      <section className="bg-panel border border-line rounded-xl p-3 sm:p-5">
        <SectionTitle>問題セットを選ぶ</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {state.setMeta.map((m) => {
            const selected = state.setId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => void send({ type: "selectSet", setId: m.id })}
                className={`text-left rounded-xl p-4 border-2 transition-colors ${
                  selected
                    ? "border-gold bg-gold/5 gold-glow"
                    : "border-line bg-panel-2 hover:border-muted"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold text-ink">{m.title}</span>
                  {m.played && (
                    <span className="shrink-0 text-xs px-2 py-0.5 rounded-full border border-line text-muted bg-panel">
                      プレイ済み
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm tracking-wider" aria-label={`難易度 ${m.difficulty} / 5`}>
                  <span className="text-gold">{"★".repeat(m.difficulty)}</span>
                  <span className="text-muted">{"☆".repeat(Math.max(0, 5 - m.difficulty))}</span>
                </div>
                <p className="mt-2 text-sm text-muted leading-relaxed line-clamp-2 sm:line-clamp-none">
                  {m.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* 6. 制限時間設定 */}
      <section className="bg-panel border border-line rounded-xl p-3 sm:p-5">
        <SectionTitle>解答時間（1問あたり）</SectionTitle>
        <div className="inline-flex rounded-lg border border-line overflow-hidden">
          {SECONDS_OPTIONS.map((sec) => {
            const active = state.settings.answerSeconds === sec;
            return (
              <button
                key={sec}
                type="button"
                onClick={() => void send({ type: "setAnswerSeconds", seconds: sec })}
                className={`px-4 sm:px-6 py-2 text-sm font-bold transition-colors ${
                  active
                    ? "bg-gold text-card-ink"
                    : "bg-panel-2 text-muted hover:text-ink"
                }`}
              >
                {sec}秒
              </button>
            );
          })}
        </div>
      </section>

      {/* 7. 開始ボタン（ルーム作成者のみ） */}
      <section>
        {state.you.isHost ? (
          <button
            type="button"
            disabled={!canStart}
            onClick={() => void send({ type: "start" })}
            className={`w-full py-3.5 sm:py-4 rounded-xl text-lg sm:text-xl font-black tracking-widest transition ${
              canStart
                ? "bg-gold text-card-ink hover:brightness-110 gold-glow"
                : "bg-panel-2 text-muted cursor-not-allowed border border-line"
            }`}
          >
            ゲーム開始
          </button>
        ) : (
          <div className="w-full py-3.5 sm:py-4 rounded-xl text-center bg-panel-2 border border-line text-muted text-sm">
            ゲーム開始はルーム作成者
            {state.hostName ? `（${state.hostName}さん）` : ""}が行います
          </div>
        )}
        {!canStart && (
          <ul className="mt-2 flex flex-col gap-1">
            {startReasons.map((r) => (
              <li key={r} className="text-xs sm:text-sm text-muted text-center">
                ・{r}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 8. これまでの記録 */}
      {state.gameRecords.length > 0 && (
        <section className="bg-panel border border-line rounded-xl p-3 sm:p-5">
          <SectionTitle>これまでの記録</SectionTitle>
          <ul className="flex flex-col gap-1.5">
            {state.gameRecords.map((rec, i) => (
              <li
                key={`${rec.setId}-${rec.finishedAt}-${i}`}
                className="flex items-center justify-between gap-2 text-sm bg-panel-2 border border-line rounded-lg px-3 py-2"
              >
                <span className="text-ink truncate">{titleOf(rec.setId)}</span>
                <span className="shrink-0 font-bold text-gold">
                  {rec.score} <span className="text-muted font-normal">/ {rec.total}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 9. ルール説明 */}
      <section className="bg-panel border border-line rounded-xl overflow-hidden">
        <details>
          <summary className="cursor-pointer select-none p-4 sm:p-5 text-sm font-bold tracking-widest text-muted hover:text-ink transition-colors">
            はじめての方へ — ルールを見る
          </summary>
          <div className="px-4 sm:px-5 pb-5">
            <RulesContent />
          </div>
        </details>
      </section>
    </div>
  );
}
