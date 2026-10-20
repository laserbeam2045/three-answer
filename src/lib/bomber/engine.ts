import type { BomberAnswerHint, BomberSet, PresenceMap, RoomState } from "../types";
import { isActive } from "../types";
import { EngineError } from "../errors";
import { effectiveElapsed, isExpired, newTimer, pauseTimer, resumeTimer } from "../time";
import {
  BOMBER_MAX_PLAYERS,
  BOMBER_POINTS,
  BOMBER_SECONDS_PER_ANSWER_OPTIONS,
  BOMBER_SLOTS,
  matchAnswer,
  matchAnswers,
  slotsFor,
} from "./match";

export type GetBomberSet = (id: string) => BomberSet | undefined;

/** 1問で記録する誤答の上限 */
const MAX_MISSES = 40;

/** 1問ぶんの得点 */
export function roundPoints(slotCount: number): number {
  return slotCount * BOMBER_POINTS;
}

export function totalBomberPoints(state: RoomState): number {
  return state.bomberResults.reduce((sum, r) => sum + roundPoints(r.slots.length), 0);
}

export function maxBomberPoints(set: BomberSet): number {
  return set.questions.reduce((sum, q) => sum + roundPoints(slotsFor(q)), 0);
}

/**
 * players の中で token の次の人（末尾の次は先頭に戻る）。
 * 回答は折り返しなしで、参加者の順番どおりに1人ずつ回る（ユーザー要望）。
 * skip（この問題をお休みしている人）は飛ばす。全員が skip なら単純に次の人。
 */
export function nextPlayer(players: string[], token: string, skip: readonly string[] = []): string {
  const i = players.indexOf(token);
  for (let k = 1; k <= players.length; k++) {
    const p = players[(i + k) % players.length];
    if (!skip.includes(p)) return p;
  }
  return players[(i + 1) % players.length];
}

/**
 * 第 qIndex 問の1枠目を答える人。
 * それまでの問題で答える予定だった数のぶん順番を進め、前の問題の続きの人から始める
 * （5人で5個ずつなら毎問同じ人から＝番組と同じ。人数が多くても全員に均等に回る）。
 * set が無いときは1問5個とみなす。
 */
export function firstAnswerer(players: string[], qIndex: number, set?: BomberSet): string {
  const offset = set
    ? set.questions.slice(0, qIndex).reduce((sum, q) => sum + slotsFor(q), 0)
    : qIndex * BOMBER_SLOTS;
  return players[offset % players.length];
}

function startRound(state: RoomState, set: BomberSet, now: number): void {
  if (state.bomberPlayers.length === 0) throw new EngineError("参加者がいません");
  const q = set.questions[state.qIndex];
  const target = slotsFor(q);
  state.phase = "question";
  // 制限時間は「答え1つあたりの秒数 × 答える数」
  state.timer = newTimer(q.q, state.settings.bomberSecondsPerAnswer * target, now);
  state.pausedRoles = [];
  state.bomberRound = {
    target,
    turnToken: firstAnswerer(state.bomberPlayers, state.qIndex, set),
    slots: [],
    lastMiss: null,
    missCount: 0,
    misses: [],
    // お休みは問題ごと。新しい問題では全員が順番に戻る
    resting: [],
  };
}

function finishRound(state: RoomState, cleared: boolean): void {
  const round = state.bomberRound;
  state.bomberResults = [
    ...state.bomberResults.filter((r) => r.qIndex !== state.qIndex),
    {
      qIndex: state.qIndex,
      target: round?.target ?? BOMBER_SLOTS,
      cleared,
      slots: round?.slots ?? [],
      misses: round?.misses ?? [],
      ...(cleared || !round ? {} : { heldBy: round.turnToken }),
    },
  ];
  state.phase = "judging";
  state.timer = null;
  state.bomberRound = null;
  state.pausedRoles = [];
}

function resetToLobby(state: RoomState): void {
  state.phase = "lobby";
  state.qIndex = 0;
  state.timer = null;
  state.pausedRoles = [];
  state.bomberRound = null;
  state.bomberResults = [];
}

/** 参加者を外す。回答中の人なら爆弾は次の人へ。誰もいなくなったらロビーへ戻す */
function removePlayer(state: RoomState, target: string): void {
  const players = state.bomberPlayers;
  if (!players.includes(target)) return;
  const round = state.bomberRound;
  const wasTurn = round?.turnToken === target;
  // 回答中の人が抜けたら、次の人（お休み中の人は飛ばす）が続ける
  const next = wasTurn && players.length > 1 ? nextPlayer(players, target, round?.resting ?? []) : null;
  state.bomberPlayers = players.filter((t) => t !== target);
  if (round) round.resting = round.resting.filter((t) => t !== target);

  if (state.bomberPlayers.length === 0) {
    if (state.phase === "question" || state.phase === "judging") resetToLobby(state);
    return;
  }
  if (round && wasTurn && next) {
    round.turnToken = next;
    round.lastMiss = null;
  }
}

/**
 * この時間ポーリングが途絶えた参加者は、タブを閉じた・通信が切れたとみなしてゲーム中に自動で外す。
 * タブを裏に回しただけ（ポーリングは続く）なら外さず、回答者なら一時停止で待つ。
 */
export const BOMBER_GONE_MS = 15_000;

function isGone(presence: PresenceMap, token: string, now: number): boolean {
  const p = presence[token];
  return !p || now - p.lastSeen > BOMBER_GONE_MS;
}

/**
 * 遅延遷移: いなくなった参加者の自動離脱、回答者の離席で一時停止/再開、時間切れで爆発
 */
export function bomberTick(state: RoomState, presence: PresenceMap, now: number): boolean {
  let changed = false;
  if (state.phase === "question" || state.phase === "judging") {
    for (const t of state.bomberPlayers.filter((t) => isGone(presence, t, now))) {
      removePlayer(state, t);
      changed = true;
    }
  }

  const round = state.bomberRound;
  if (state.phase !== "question" || !state.timer || !round) return changed;

  const answererActive = isActive(presence[round.turnToken], now);
  if (!answererActive && !state.timer.paused) {
    state.timer = pauseTimer(state.timer, now);
    changed = true;
  } else if (answererActive && state.timer.paused) {
    state.timer = resumeTimer(state.timer, now);
    changed = true;
  }

  if (isExpired(state.timer, now)) {
    finishRound(state, false);
    changed = true;
  }
  return changed;
}

function requireHost(state: RoomState, token: string, message: string): void {
  if (token !== state.hostToken) throw new EngineError(message);
}

export function bomberStart(
  state: RoomState,
  token: string,
  presence: PresenceMap,
  now: number,
  getBomberSet: GetBomberSet
): void {
  if (state.phase !== "lobby") throw new EngineError("すでに開始しています");
  requireHost(state, token, "ルーム作成者のみゲームを開始できます");
  const set = state.setId ? getBomberSet(state.setId) : undefined;
  if (!set) throw new EngineError("問題セットを選択してください");
  if (state.bomberPlayers.length === 0) throw new EngineError("参加者がいません");
  for (const t of state.bomberPlayers) {
    if (!isActive(presence[t], now))
      throw new EngineError(`${state.clients[t]?.name ?? "参加者"}さんが非アクティブです`);
  }
  state.qIndex = 0;
  state.bomberResults = [];
  startRound(state, set, now);
}

export function bomberAnswer(
  state: RoomState,
  token: string,
  text: string,
  now: number,
  getBomberSet: GetBomberSet,
  hint?: BomberAnswerHint
): void {
  const round = state.bomberRound;
  if (state.phase !== "question" || !round || !state.timer)
    throw new EngineError("回答フェーズではありません");
  if (round.turnToken !== token) throw new EngineError("あなたの番ではありません");
  if (state.timer.paused) throw new EngineError("一時停止中です");
  if (effectiveElapsed(state.timer, now) < state.timer.revealMs)
    throw new EngineError("問題文が出るまでお待ちください");
  const input = cleanAnswerInput(text);
  if (!input) throw new EngineError("答えを入力してください");

  const set = state.setId ? getBomberSet(state.setId) : undefined;
  if (!set) throw new EngineError("set not found");
  const question = set.questions[state.qIndex];

  // 同じ読みの答えが複数ある（石と席の「せき」など）ときは、まだ答えていない方を正解にする。
  // 一致したものがすべて答え済みなら「既出」。
  const hits = matchAnswers(question, input);
  const given = (i: number) => round.slots.some((s) => s.answerIndex === i);
  let index = hits.find((i) => !given(i)) ?? hits[0] ?? -1;
  let ai = false;
  if (
    index < 0 &&
    hint &&
    hint.qIndex === state.qIndex &&
    hint.text === input &&
    Number.isInteger(hint.answerIndex) &&
    hint.answerIndex >= 0 &&
    hint.answerIndex < question.answers.length
  ) {
    index = hint.answerIndex;
    ai = true;
  }
  const alreadyGiven = index >= 0 && round.slots.some((s) => s.answerIndex === index);
  if (index < 0 || alreadyGiven) {
    round.missCount += 1;
    round.lastMiss = {
      token,
      text: input,
      reason: alreadyGiven ? "dup" : "wrong",
      seq: round.missCount,
    };
    // 誤答の一覧（全員に見せる）。連打で状態が膨らまないよう上限を設ける
    round.misses = [...round.misses, round.lastMiss].slice(-MAX_MISSES);
    return;
  }

  round.slots.push({ token, answerIndex: index, text: input, ...(ai ? { ai: true } : {}) });
  round.lastMiss = null;
  if (round.slots.length >= round.target) {
    finishRound(state, true);
  } else {
    round.turnToken = nextPlayer(state.bomberPlayers, token, round.resting);
  }
}

/** 回答の入力を照合用にそろえる（エンジンと AI 判定の前処理で同じものを使う） */
export function cleanAnswerInput(text: unknown): string {
  return String(text ?? "").trim().slice(0, 40);
}

/**
 * AI 判定に回すべき回答なら、その問題を返す。
 * token が回答中の人で、ローカルの照合では一致しないときだけ対象にする。
 */
export function questionNeedingAi(
  state: RoomState,
  token: string,
  input: string,
  getBomberSet: GetBomberSet
): BomberSet["questions"][number] | null {
  const round = state.bomberRound;
  if (state.mode !== "bomber" || state.phase !== "question" || !round || round.turnToken !== token)
    return null;
  if (!input) return null;
  const set = state.setId ? getBomberSet(state.setId) : undefined;
  const question = set?.questions[state.qIndex];
  if (!question || question.strict || matchAnswer(question, input) >= 0) return null;
  return question;
}

export function bomberNext(
  state: RoomState,
  token: string,
  now: number,
  getBomberSet: GetBomberSet
): void {
  if (state.phase !== "judging") throw new EngineError("判定フェーズではありません");
  requireHost(state, token, "次へ進めるのはルーム作成者のみです");
  const set = state.setId ? getBomberSet(state.setId) : undefined;
  if (!set) throw new EngineError("set not found");
  if (state.qIndex >= set.questions.length - 1) {
    state.phase = "results";
    if (!state.playedSetIds.includes(set.id)) state.playedSetIds.push(set.id);
    state.gameRecords.push({
      mode: "bomber",
      setId: set.id,
      score: totalBomberPoints(state),
      total: maxBomberPoints(set),
      finishedAt: now,
    });
  } else {
    state.qIndex += 1;
    startRound(state, set, now);
  }
}

export function bomberBackToLobby(state: RoomState, token: string): void {
  if (state.phase !== "results") throw new EngineError("結果フェーズではありません");
  if (!state.bomberPlayers.includes(token) && token !== state.hostToken)
    throw new EngineError("参加者またはホストのみ操作できます");
  resetToLobby(state);
  state.setId = null;
}

export function bomberJoin(state: RoomState, token: string): void {
  if (state.bomberPlayers.includes(token)) return;
  if (state.bomberPlayers.length >= BOMBER_MAX_PLAYERS)
    throw new EngineError(`参加できるのは${BOMBER_MAX_PLAYERS}人までです`);
  state.bomberPlayers.push(token);
}

/**
 * この問題だけお休みする（パス）／お休みをやめる。お休み中は順番を飛ばし、次の問題では自動で戻る。
 * 回答中の人がお休みにしたら、爆弾は次の人へ。お休みでない人が自分だけなら、お休みにはできない。
 */
export function bomberRest(state: RoomState, token: string, rest: boolean): void {
  const round = state.bomberRound;
  if (state.phase !== "question" || !round) throw new EngineError("問題の回答中のみ操作できます");
  if (!state.bomberPlayers.includes(token)) throw new EngineError("参加者のみ操作できます");
  if (!rest) {
    round.resting = round.resting.filter((t) => t !== token);
    return;
  }
  if (round.resting.includes(token)) return;
  const playing = state.bomberPlayers.filter((t) => !round.resting.includes(t));
  if (playing.length <= 1) throw new EngineError("全員がお休みにはできません");
  round.resting = [...round.resting, token];
  if (round.turnToken === token) {
    round.turnToken = nextPlayer(state.bomberPlayers, token, round.resting);
    round.lastMiss = null;
  }
}

export function bomberLeave(state: RoomState, token: string): void {
  removePlayer(state, token);
}

export function bomberKick(state: RoomState, token: string, target: string | null): void {
  requireHost(state, token, "参加者を外せるのはルーム作成者のみです");
  if (target) removePlayer(state, target);
}

export function setBomberSeconds(state: RoomState, token: string, seconds: number): void {
  if (state.phase !== "lobby") throw new EngineError("ロビーでのみ変更できます");
  requireHost(state, token, "制限時間はルーム作成者のみ変更できます");
  const s = Math.round(seconds);
  if (!BOMBER_SECONDS_PER_ANSWER_OPTIONS.includes(s)) throw new EngineError("不正な秒数です");
  state.settings.bomberSecondsPerAnswer = s;
}
