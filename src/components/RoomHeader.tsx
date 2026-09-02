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
      <header className="sticky top-0 z-30 bg-panel/90 backdrop-blur border-b border-line">
        <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
          {/* 左: ロゴ（トップへ戻る） + URLコピー */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <a
              href="/"
              title="トップページへ"
              className="flex items-center gap-2 min-w-0 shrink-0 rounded px-1 -mx-1 py-0.5 hover:bg-panel-2 transition-colors"
            >
              <span className="shrink-0 w-6 h-6 rounded bg-card-face text-card-ink text-[10px] font-extrabold flex items-center justify-center shadow">
                3A
              </span>
              <span className="hidden sm:inline font-extrabold tracking-wide text-sm whitespace-nowrap">
                Three Answer
              </span>
            </a>
            {/* URLコピー: スマホではアイコンのみ（問題番号と重ならないように） */}
            <button
              type="button"
              onClick={copyUrl}
              title="ルームURLをコピー"
              aria-label="ルームURLをコピー"
              className={`shrink-0 text-xs rounded-md border transition-colors px-2 py-1 ${
                copied
                  ? "border-gold text-gold"
                  : "border-line text-muted hover:text-ink hover:border-muted"
              }`}
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
              <span className="font-extrabold text-sm sm:text-lg tracking-wider whitespace-nowrap">
                第{state.qIndex + 1}問
                <span className="text-muted text-xs sm:text-sm font-normal"> / 20</span>
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
                className={`shrink-0 text-xs px-2 py-1 rounded-md border font-bold transition-colors ${
                  spectatorReveal
                    ? "bg-gold text-card-ink border-gold"
                    : "border-line text-muted hover:text-ink hover:border-muted"
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
      </header>

      {/* 名前入力モーダル */}
      {showNameModal && (
        <div className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="rise-in w-full max-w-sm bg-panel border border-line rounded-2xl shadow-2xl p-6">
            <p className="text-lg font-extrabold mb-1">名前を入力してください</p>
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
                className="w-full bg-panel-2 border border-line rounded-lg px-3 py-2 text-ink placeholder:text-muted/60 focus:outline-none focus:border-gold"
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowNameModal(false)}
                  className="text-sm px-3 py-2 rounded-lg border border-line text-muted hover:text-ink"
                >
                  観戦のまま
                </button>
                <button
                  type="submit"
                  disabled={!nameInput.trim()}
                  className="text-sm font-bold px-4 py-2 rounded-lg bg-gold text-card-ink disabled:opacity-40"
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
