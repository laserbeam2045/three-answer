"use client";

import { use } from "react";
import { useRoom } from "@/hooks/useRoom";
import LobbyView from "@/components/LobbyView";
import QuestionView from "@/components/QuestionView";
import JudgingView from "@/components/JudgingView";
import ResultsView from "@/components/ResultsView";
import PauseOverlay from "@/components/PauseOverlay";
import RoomHeader from "@/components/RoomHeader";

export default function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = use(params);
  const room = useRoom(roomId);
  const { state, fatalError, actionError } = room;

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
      <main className="min-h-dvh flex items-center justify-center">
        <p className="text-muted animate-pulse text-lg">ルームに接続中…</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex flex-col">
      <RoomHeader room={room} />
      <div className="flex-1 flex flex-col">
        {state.phase === "lobby" && <LobbyView room={room} />}
        {state.phase === "question" && <QuestionView room={room} />}
        {state.phase === "judging" && <JudgingView room={room} />}
        {state.phase === "results" && <ResultsView room={room} />}
      </div>
      {state.phase === "question" && state.pausedRoles.length > 0 && <PauseOverlay room={room} />}
      {actionError && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-player-a/90 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          {actionError}
        </div>
      )}
    </main>
  );
}
