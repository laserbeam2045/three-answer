"use client";

import { use } from "react";
import { useRoom } from "@/hooks/useRoom";
import { useScrollTopOnChange } from "@/hooks/useScrollTopOnChange";
import LobbyView from "@/components/LobbyView";
import QuestionView from "@/components/QuestionView";
import JudgingView from "@/components/JudgingView";
import ResultsView from "@/components/ResultsView";
import PauseOverlay from "@/components/PauseOverlay";
import RoomHeader from "@/components/RoomHeader";
import BomberQuestionView from "@/components/bomber/BomberQuestionView";
import BomberJudgingView from "@/components/bomber/BomberJudgingView";
import BomberResultsView from "@/components/bomber/BomberResultsView";

export default function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = use(params);
  const room = useRoom(roomId);
  const { state, fatalError, actionError, connectionError } = room;
  // 問題の表示時や問題終了時（判定・結果画面への切り替え）は、ページ最上部へ戻す
  useScrollTopOnChange(state ? `${state.phase}:${state.qIndex}` : null);

  if (fatalError) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-xl font-bold">{fatalError}</p>
        <a href="/" className="text-gold underline">
          トップへ戻る
        </a>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center gap-3 p-6 text-center">
        {connectionError ? (
          <p className="text-lg font-bold">{connectionError}</p>
        ) : (
          <p className="text-muted animate-pulse text-lg">ルームに接続中…</p>
        )}
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex flex-col">
      <RoomHeader room={room} />
      <div className="flex-1 flex flex-col">
        {state.phase === "lobby" && <LobbyView room={room} />}
        {state.mode === "bomber" ? (
          <>
            {state.phase === "question" && <BomberQuestionView room={room} />}
            {state.phase === "judging" && <BomberJudgingView room={room} />}
            {state.phase === "results" && <BomberResultsView room={room} />}
          </>
        ) : (
          <>
            {state.phase === "question" && <QuestionView room={room} />}
            {state.phase === "judging" && <JudgingView room={room} />}
            {state.phase === "results" && <ResultsView room={room} />}
          </>
        )}
      </div>
      {state.mode !== "bomber" && state.phase === "question" && state.pausedRoles.length > 0 && (
        <PauseOverlay room={room} />
      )}
      {connectionError && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 w-[min(92vw,32rem)] bg-player-a/90 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50 text-center">
          {connectionError}
        </div>
      )}
      {actionError && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-player-a/90 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          {actionError}
        </div>
      )}
    </main>
  );
}
