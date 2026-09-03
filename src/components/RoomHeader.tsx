"use client";

import { useEffect, useRef, useState } from "react";
import type { UseRoomResult } from "@/hooks/useRoom";
import { getLocalName, setLocalName } from "@/hooks/useRoom";

export default function RoomHeader({ room }: { room: UseRoomResult }) {
  const { state, send, spectatorReveal, setSpectatorReveal } = room;
  const [copied, setCopied] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const syncedRef = useRef(false);

  // 名前の自動同期（マウント後、最初に state が届いたとき一度だけ）
  useEffect(() => {
    if (!state || syncedRef.current) return;
    syncedRef.current = true;
    if (!state.you.name.startsWith("観戦者")) return;
    const local = getLocalName();
    if (local) {
      void send({ type: "setName", name: local });
    } else {
      setShowNameModal(true);
    }
  }, [state, send]);

  if (!state) return null;

  const inGame = state.phase === "question" || state.phase === "judging";
  const isSpectator = state.you.role === null;

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard 不許可時は何もしない
    }
  };

  const submitName = () => {
    const name = nameInput.trim();
    if (!name) return;
    setLocalName(name);
    void send({ type: "setName", name });
    setShowNameModal(false);
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-bg/85 backdrop-blur">
        <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
          {/* 左: ロゴ（トップへ戻る） + URLコピー */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <a
              href="/"
              title="トップページへ"
              className="flex items-center gap-2 min-w-0 shrink-0 rounded px-1 -mx-1 py-0.5 hover:bg-panel-2 transition-colors"
            >
              <span className="card-tile shrink-0 w-7 h-7 rounded-md text-[11px] flex items-center justify-center !shadow-[0_1px_0_rgba(0,0,0,0.5)]">
                3A
              </span>
              <span className="hidden sm:inline font-display text-gilt font-extrabold tracking-widest text-sm whitespace-nowrap">
                Three Answer
              </span>
            </a>
            {/* URLコピー: スマホではアイコンのみ（問題番号と重ならないように） */}
            <button
              type="button"
              onClick={copyUrl}
              title="ルームURLをコピー"
              aria-label="ルームURLをコピー"
              className={`btn-ghost shrink-0 text-xs px-2 py-1 rounded-md ${copied ? "on" : ""}`}
            >
              <span className="sm:hidden" aria-hidden>
                {copied ? "✓" : "🔗"}
              </span>
              <span className="hidden sm:inline">
                {copied ? "コピーしました" : "ルームURLをコピー"}
              </span>
            </button>
          </div>

          {/* 中央: 問題番号（ゲーム中のみ） */}
          <div className="shrink-0 text-center px-1">
            {inGame && (
              <span className="font-display font-extrabold text-gold text-sm sm:text-lg tracking-widest whitespace-nowrap">
                第{state.qIndex + 1}問
                <span className="text-muted text-xs sm:text-sm font-normal font-sans"> / 20</span>
              </span>
            )}
          </div>

          {/* 右: 観戦者数 + 観戦者用トグル */}
          <div className="flex items-center gap-2 justify-end min-w-0 flex-1">
            <span
              className="text-xs text-muted whitespace-nowrap"
              title={`観戦者 ${state.spectators.length}人`}
            >
              <span className="sm:hidden" aria-hidden>
                👀 {state.spectators.length}
              </span>
              <span className="hidden sm:inline">観戦者 {state.spectators.length}人</span>
            </span>
            {isSpectator && state.phase !== "lobby" && (
              <button
                type="button"
                onClick={() => setSpectatorReveal(!spectatorReveal)}
                title="全員の手札を表示"
                className={`btn-ghost shrink-0 text-xs px-2 py-1 rounded-md ${
                  spectatorReveal ? "on" : ""
                }`}
              >
                <span className="sm:hidden" aria-hidden>
                  🃏
                </span>
                <span className="hidden sm:inline">全手札を見る</span>
              </button>
            )}
          </div>
        </div>
        {/* 金の飾り罫 */}
        <div
          aria-hidden
          className="h-px bg-gradient-to-r from-transparent via-gold-3 to-transparent"
        />
      </header>

      {/* 名前入力モーダル */}
      {showNameModal && (
        <div className="fixed inset-0 z-50 bg-bg/85 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="rise-in ornate ornate-lit w-full max-w-sm p-5 sm:p-6">
            <p className="font-display text-lg font-extrabold text-gold mb-1">
              名前を入力してください
            </p>
            <p className="text-sm text-muted mb-4">他のプレイヤーに表示されます。</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitName();
              }}
              className="flex flex-col gap-3"
            >
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                maxLength={20}
                placeholder="れい: みや"
                autoFocus
                className="field w-full px-3 py-2 placeholder:text-muted/60"
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowNameModal(false)}
                  className="btn-ghost text-sm px-3 py-2"
                >
                  観戦のまま
                </button>
                <button
                  type="submit"
                  disabled={!nameInput.trim()}
                  className="btn-gold text-sm px-5 py-2"
                >
                  決定
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
