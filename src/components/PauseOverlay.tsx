"use client";

import type { UseRoomResult } from "@/hooks/useRoom";
import type { Role } from "@/lib/types";

const ROLE_TEXT: Record<Role, string> = {
  A: "text-player-a",
  B: "text-player-b",
  C: "text-player-c",
};

export default function PauseOverlay({ room }: { room: UseRoomResult }) {
  const state = room.state;
  if (!state || state.pausedRoles.length === 0) return null;

  return (
    <div className="fixed inset-0 z-40 bg-bg/85 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="rise-in ornate ornate-lit w-full max-w-md p-6 sm:p-8 text-center">
        <p className="font-display text-gilt text-3xl font-extrabold tracking-widest mb-6">
          一時停止中
        </p>
        <ul className="space-y-2 mb-6">
          {state.pausedRoles.map((role) => {
            const seat = state.seats.find((s) => s.role === role);
            const name = seat?.name ?? `プレイヤー${role}`;
            return (
              <li key={role} className="text-lg">
                <span className={`font-bold ${ROLE_TEXT[role]}`}>{name}</span>
                <span className="text-ink">さんの復帰を待っています</span>
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-muted">
          タイマーは全員の画面で停止しています。復帰すると自動的に再開します。
        </p>
      </div>
    </div>
  );
}
