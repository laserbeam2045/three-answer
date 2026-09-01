import type {
  Action,
  AnswerState,
  PresenceMap,
  QuestionSet,
  Role,
  RoomState,
} from "./types";
import { ROLES, isActive } from "./types";
import { judge } from "./judge";
import { isExpired, newTimer, pauseTimer, resumeTimer } from "./time";

export class EngineError extends Error {}

function freshAnswers(): Record<Role, AnswerState> {
  return {
    A: { cardIndex: null, locked: false },
    B: { cardIndex: null, locked: false },
    C: { cardIndex: null, locked: false },
  };
}

export function createRoom(
  roomId: string,
  hostToken: string,
  hostName: string,
  now: number
): RoomState {
  return {
    v: 1,
    roomId,
    createdAt: now,
    hostToken,
    clients: { [hostToken]: { name: hostName } },
    seats: {},
    phase: "lobby",
    setId: null,
    playedSetIds: [],
    gameRecords: [],
    qIndex: 0,
    timer: null,
    pausedRoles: [],
    answers: freshAnswers(),
    results: [],
    settings: { answerSeconds: 45 },
  };
}

export function roleOf(state: RoomState, token: string): Role | null {
  for (const role of ROLES) if (state.seats[role] === token) return role;
  return null;
}

/** 未知トークンを観戦者として登録する（GET時に呼ぶ）。変更があれば true */
export function ensureClient(state: RoomState, token: string, name?: string): boolean {
  if (state.clients[token]) return false;
  const n = name?.trim() || `観戦者${Object.keys(state.clients).length + 1}`;
  state.clients[token] = { name: n };
  return true;
}

/**
 * 遅延遷移: pause/resume/期限切れ判定/全員ロック判定。
 * state を直接変更し、変化があれば true を返す（呼び出し側でCAS書き込み）。
 */
export function tick(
  state: RoomState,
  presence: PresenceMap,
  now: number,
  getSet: (id: string) => QuestionSet | undefined
): boolean {
  let changed = false;

  if (state.phase !== "question" || !state.timer) return changed;

  const inactiveRoles = ROLES.filter((r) => {
    const token = state.seats[r];
    return !token || !isActive(presence[token], now);
  });

  if (inactiveRoles.length > 0 && !state.timer.paused) {
    state.timer = pauseTimer(state.timer, now);
    state.pausedRoles = inactiveRoles;
    changed = true;
  } else if (inactiveRoles.length === 0 && state.timer.paused) {
    state.timer = resumeTimer(state.timer, now);
    state.pausedRoles = [];
    changed = true;
  } else if (inactiveRoles.length > 0) {
    // pausedRoles の表示を最新化
    const same =
      inactiveRoles.length === state.pausedRoles.length &&
      inactiveRoles.every((r, i) => state.pausedRoles[i] === r);
    if (!same) {
      state.pausedRoles = inactiveRoles;
      changed = true;
    }
  }

  const allLocked = ROLES.every((r) => state.answers[r].locked);
  const expired = isExpired(state.timer, now);
  if (allLocked || expired) {
    doJudge(state, getSet);
    changed = true;
  }

  return changed;
}

function doJudge(state: RoomState, getSet: (id: string) => QuestionSet | undefined): void {
  const set = state.setId ? getSet(state.setId) : undefined;
  if (!set) throw new EngineError("set not found");
  const question = set.questions[state.qIndex];
  const result = judge(set, question, state.answers, state.qIndex);
  state.results = [...state.results.filter((r) => r.qIndex !== state.qIndex), result];
  state.phase = "judging";
  state.timer = null;
  state.pausedRoles = [];
}

function startQuestion(state: RoomState, set: QuestionSet, now: number): void {
  const q = set.questions[state.qIndex];
  state.phase = "question";
  state.timer = newTimer(q.q, state.settings.answerSeconds, now);
  state.answers = freshAnswers();
  state.pausedRoles = [];
}

export function applyAction(
  state: RoomState,
  token: string,
  action: Action,
  presence: PresenceMap,
  now: number,
  getSet: (id: string) => QuestionSet | undefined,
  allSets: () => QuestionSet[]
): void {
  ensureClient(state, token);
  const role = roleOf(state, token);

  switch (action.type) {
    case "setName": {
      const name = action.name.trim().slice(0, 20);
      if (!name) throw new EngineError("名前を入力してください");
      state.clients[token] = { name };
      return;
    }

    case "sit": {
      if (!ROLES.includes(action.role)) throw new EngineError("不正な席です");
      const current = state.seats[action.role];
      if (current === token) return;
      if (role !== null && state.phase !== "lobby") throw new EngineError("ゲーム中は席を移動できません");
      if (current) {
        // ゲーム中の非アクティブ席のみ引き継ぎ可能
        const occupied = isActive(presence[current], now);
        if (occupied) throw new EngineError("その席は使用中です");
        if (state.phase === "lobby") {
          // ロビーでは非アクティブなら自由に置き換え
        }
      }
      // 元の席を離れる
      if (role !== null) delete state.seats[role];
      state.seats[action.role] = token;
      return;
    }

    case "standUp": {
      if (state.phase !== "lobby") throw new EngineError("ロビーでのみ席を立てます");
      if (role === null) return;
      delete state.seats[role];
      return;
    }

    case "selectSet": {
      if (state.phase !== "lobby") throw new EngineError("ロビーでのみ選択できます");
      if (token !== state.hostToken)
        throw new EngineError("問題セットはルーム作成者のみ選べます");
      if (!getSet(action.setId)) throw new EngineError("セットが見つかりません");
      state.setId = action.setId;
      return;
    }

    case "setAnswerSeconds": {
      if (state.phase !== "lobby") throw new EngineError("ロビーでのみ変更できます");
      if (token !== state.hostToken)
        throw new EngineError("解答時間はルーム作成者のみ変更できます");
      const s = Math.round(action.seconds);
      if (![30, 45, 60, 90].includes(s)) throw new EngineError("不正な秒数です");
      state.settings.answerSeconds = s;
      return;
    }

    case "start": {
      if (state.phase !== "lobby") throw new EngineError("すでに開始しています");
      if (token !== state.hostToken)
        throw new EngineError("ルーム作成者のみゲームを開始できます");
      const set = state.setId ? getSet(state.setId) : undefined;
      if (!set) throw new EngineError("問題セットを選択してください");
      for (const r of ROLES) {
        const t = state.seats[r];
        if (!t) throw new EngineError("3人揃っていません");
        if (!isActive(presence[t], now)) throw new EngineError(`${state.clients[t]?.name ?? r}さんが非アクティブです`);
      }
      state.qIndex = 0;
      state.results = [];
      startQuestion(state, set, now);
      return;
    }

    case "select": {
      if (state.phase !== "question") throw new EngineError("回答フェーズではありません");
      if (role === null) throw new EngineError("観戦者は回答できません");
      const a = state.answers[role];
      if (a.locked) throw new EngineError("すでに決定済みです");
      const set = getSet(state.setId!);
      if (
        action.cardIndex !== null &&
        (!Number.isInteger(action.cardIndex) ||
          action.cardIndex < 0 ||
          action.cardIndex >= (set?.hands[role].length ?? 10))
      )
        throw new EngineError("不正なカードです");
      a.cardIndex = action.cardIndex;
      return;
    }

    case "lock": {
      if (state.phase !== "question") throw new EngineError("回答フェーズではありません");
      if (role === null) throw new EngineError("観戦者は回答できません");
      state.answers[role].locked = true;
      // 全員ロックなら tick が判定する（呼び出し側で必ず tick が走る）
      return;
    }

    case "unlock": {
      if (state.phase !== "question") throw new EngineError("回答フェーズではありません");
      if (role === null) throw new EngineError("観戦者は回答できません");
      const allLocked = ROLES.every((r) => state.answers[r].locked);
      if (allLocked) throw new EngineError("全員決定済みのため変更できません");
      state.answers[role].locked = false;
      return;
    }

    case "next": {
      if (state.phase !== "judging") throw new EngineError("判定フェーズではありません");
      if (token !== state.hostToken)
        throw new EngineError("次へ進めるのはルーム作成者のみです");
      const set = getSet(state.setId!);
      if (!set) throw new EngineError("set not found");
      if (state.qIndex >= set.questions.length - 1) {
        state.phase = "results";
        if (!state.playedSetIds.includes(set.id)) state.playedSetIds.push(set.id);
        state.gameRecords.push({
          setId: set.id,
          score: state.results.filter((r) => r.correct).length,
          total: set.questions.length,
          finishedAt: now,
        });
      } else {
        state.qIndex += 1;
        startQuestion(state, set, now);
      }
      return;
    }

    case "backToLobby": {
      if (state.phase !== "results") throw new EngineError("結果フェーズではありません");
      if (role === null && token !== state.hostToken)
        throw new EngineError("着席者またはホストのみ操作できます");
      state.phase = "lobby";
      state.setId = null;
      state.qIndex = 0;
      state.results = [];
      state.timer = null;
      state.answers = freshAnswers();
      state.pausedRoles = [];
      // allSets を使い、未プレイのセットがあれば選択肢として残す（何もしないでよい）
      void allSets;
      return;
    }

    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      throw new EngineError("未知のアクションです");
    }
  }
}
