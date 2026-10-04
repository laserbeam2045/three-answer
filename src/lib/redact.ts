import type {
  BomberSet,
  BomberSlot,
  BomberView,
  PresenceMap,
  QuestionSet,
  RedactedState,
  RevealedQuestion,
  Role,
  RoomState,
  SeatView,
} from "./types";
import { ROLES, isActive } from "./types";
import { normalizeRoom, roleOf } from "./engine";
import { allBomberSets as defaultAllBomberSets, getBomberSet as defaultGetBomberSet } from "./sets";
import { maxBomberPoints, roundPoints, totalBomberPoints } from "./bomber/engine";
import { BOMBER_SLOTS } from "./bomber/match";

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
  spectatorReveal: boolean,
  getBomberSet: (id: string) => BomberSet | undefined = defaultGetBomberSet,
  allBomberSets: () => BomberSet[] = defaultAllBomberSets
): RedactedState {
  normalizeRoom(state);
  const myRole = roleOf(state, token);
  const isBomber = state.mode === "bomber";
  // set はスリーアンサーのセット。ファイブボンバー中は undefined になり、手札などは返らない
  const set = state.setId && !isBomber ? getSet(state.setId) : undefined;
  const bomberSet = state.setId && isBomber ? getBomberSet(state.setId) : undefined;
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

  // ファイブボンバーでは参加者、スリーアンサーでは着席者以外が観戦者
  const seatTokens = new Set<string | undefined>(
    isBomber ? state.bomberPlayers : Object.values(state.seats)
  );
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
      description: s.description,
      played: state.playedSetIds.includes(s.id),
    })),
    playedSetIds: state.playedSetIds,
    gameRecords: state.gameRecords,
    qIndex: state.qIndex,
    timer: state.timer,
    pausedRoles: state.pausedRoles,
    question:
      state.phase === "question" && (set || bomberSet)
        ? {
            q: (set ?? bomberSet)!.questions[state.qIndex].q,
            qLength: (set ?? bomberSet)!.questions[state.qIndex].q.length,
          }
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
    score: isResults && !isBomber ? state.results.filter((r) => r.correct).length : null,
    settings: state.settings,
    mode: state.mode,
    questionCount: (isBomber ? bomberSet?.questions.length : set?.questions.length) ?? (isBomber ? 10 : 20),
    bomber: bomberView(state, presence, token, now, bomberSet, allBomberSets),
  };
}

function bomberView(
  state: RoomState,
  presence: PresenceMap,
  token: string,
  now: number,
  set: BomberSet | undefined,
  allBomberSets: () => BomberSet[]
): BomberView {
  const nameOf = (t: string) => state.clients[t]?.name ?? "（退出した人）";
  const slotView = (s: BomberSlot, qIndex: number) => ({
    name: nameOf(s.token),
    isYou: s.token === token,
    display: set?.questions[qIndex].answers[s.answerIndex]?.display ?? s.text,
  });
  const reviewOf = (qIndex: number) => {
    const r = state.bomberResults.find((x) => x.qIndex === qIndex);
    const q = set!.questions[qIndex];
    const slots = r?.slots ?? [];
    return {
      q: q.q,
      cleared: r?.cleared ?? false,
      heldBy: r?.heldBy ? nameOf(r.heldBy) : null,
      slots: slots.map((s) => slotView(s, qIndex)),
      answers: q.answers.map((a, i) => {
        const by = slots.find((s) => s.answerIndex === i);
        return { display: a.display, by: by ? nameOf(by.token) : null };
      }),
      points: roundPoints(slots.length),
    };
  };

  const players = state.bomberPlayers;
  const round = state.bomberRound;
  let roundView: BomberView["round"] = null;
  if (state.phase === "question" && round && set && players.length > 0) {
    // 残りの枠を誰が答えるか: 今の回答者から参加順に回す
    const upcoming: string[] = [];
    let i = Math.max(0, players.indexOf(round.turnToken));
    for (let k = round.slots.length; k < BOMBER_SLOTS; k++) {
      upcoming.push(nameOf(players[i % players.length]));
      i++;
    }
    roundView = {
      slots: round.slots.map((s) => slotView(s, state.qIndex)),
      upcoming,
      turnToken: round.turnToken,
      turnName: nameOf(round.turnToken),
      isYourTurn: round.turnToken === token,
      lastMiss: round.lastMiss
        ? {
            name: nameOf(round.lastMiss.token),
            text: round.lastMiss.text,
            reason: round.lastMiss.reason,
            seq: round.lastMiss.seq,
          }
        : null,
      waiting: state.timer?.paused ?? false,
    };
  }

  return {
    setMeta: allBomberSets().map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      played: state.playedSetIds.includes(s.id),
    })),
    players: players.map((t) => ({
      token: t,
      name: nameOf(t),
      active: isActive(presence[t], now),
      isYou: t === token,
    })),
    isPlayer: players.includes(token),
    round: roundView,
    judged: state.phase === "judging" && set ? reviewOf(state.qIndex) : null,
    history:
      state.phase === "results" && set
        ? state.bomberResults
            .slice()
            .sort((a, b) => a.qIndex - b.qIndex)
            .map((r) => reviewOf(r.qIndex))
        : null,
    totalPoints: totalBomberPoints(state),
    maxPoints: set ? maxBomberPoints(set) : 10 * roundPoints(BOMBER_SLOTS),
  };
}

export type { Role };
