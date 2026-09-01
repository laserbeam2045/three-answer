import type {
  PresenceMap,
  QuestionSet,
  RedactedState,
  RevealedQuestion,
  Role,
  RoomState,
  SeatView,
} from "./types";
import { ROLES, isActive } from "./types";
import { roleOf } from "./engine";

function reveal(set: QuestionSet, qIndex: number): RevealedQuestion {
  const q = set.questions[qIndex];
  return {
    q: q.q,
    qLength: q.q.length,
    answerDisplay: q.answerDisplay,
    answerReading: q.answerReading,
    required: q.required,
    explanation: q.explanation,
  };
}

export function redact(
  state: RoomState,
  presence: PresenceMap,
  token: string,
  now: number,
  getSet: (id: string) => QuestionSet | undefined,
  allSets: () => QuestionSet[],
  spectatorReveal: boolean
): RedactedState {
  const myRole = roleOf(state, token);
  const set = state.setId ? getSet(state.setId) : undefined;
  const isSpectator = myRole === null;

  const seats: SeatView[] = ROLES.map((role) => {
    const t = state.seats[role] ?? null;
    return {
      role,
      token: t,
      name: t ? (state.clients[t]?.name ?? null) : null,
      active: t ? isActive(presence[t], now) : false,
      locked: state.phase === "question" ? state.answers[role].locked : false,
    };
  });

  const seatTokens = new Set(Object.values(state.seats));
  const spectators = Object.entries(state.clients)
    .filter(([t]) => !seatTokens.has(t))
    .map(([t, c]) => ({ name: c.name, active: isActive(presence[t], now) }))
    .filter((s) => s.active); // 表示は現在アクティブな観戦者のみ

  const judged =
    state.phase === "judging" && set
      ? {
          result: state.results.find((r) => r.qIndex === state.qIndex)!,
          question: reveal(set, state.qIndex),
        }
      : null;

  const isResults = state.phase === "results";
  const showAllHands = set && (isResults || (isSpectator && spectatorReveal));

  return {
    v: state.v,
    roomId: state.roomId,
    phase: state.phase,
    you: {
      token,
      name: state.clients[token]?.name ?? "",
      role: myRole,
      isHost: token === state.hostToken,
    },
    hostName: state.clients[state.hostToken]?.name ?? null,
    seats,
    spectators,
    setId: state.setId,
    setMeta: allSets().map((s) => ({
      id: s.id,
      title: s.title,
      difficulty: s.difficulty,
      description: s.description,
      played: state.playedSetIds.includes(s.id),
    })),
    playedSetIds: state.playedSetIds,
    gameRecords: state.gameRecords,
    qIndex: state.qIndex,
    timer: state.timer,
    pausedRoles: state.pausedRoles,
    question:
      state.phase === "question" && set
        ? { q: set.questions[state.qIndex].q, qLength: set.questions[state.qIndex].q.length }
        : null,
    judged,
    myHand: myRole && set ? set.hands[myRole] : null,
    mySelection: myRole && state.phase === "question" ? state.answers[myRole] : null,
    allHands: showAllHands ? set.hands : null,
    history:
      isResults && set
        ? state.results
            .slice()
            .sort((a, b) => a.qIndex - b.qIndex)
            .map((r) => ({ result: r, question: reveal(set, r.qIndex) }))
        : null,
    score: isResults ? state.results.filter((r) => r.correct).length : null,
    settings: state.settings,
  };
}

export type { Role };
