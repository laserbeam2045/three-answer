/**
 * ひと文字リーグ: 参加者が1人1文字ずつ答えを書き、全員の文字が正解の読みと合えば正解。
 * - 問題は、そのときの参加人数と読みの文字数が同じものから1問ずつランダムに選ぶ（同じゲームで同じ問題は出さない）
 *   このルームでまだ出していない問題を優先し、出し切ったら前に出したのが古い問題から出す
 * - 途中参加: 次の問題から加わる。途中離脱: 答えている人が抜けたら、その問題は中止（得点に数えない）
 * - 1ゲームは、中止を除いて MOJI_GAME_LENGTH 問
 */
import type { MojiQuestion, MojiResult, PresenceMap, RoomState } from "../types";
import { isActive } from "../types";
import { EngineError } from "../errors";
import { effectiveElapsed, isExpired, newTimer, pauseTimer, resumeTimer } from "../time";
import { isSingleKana, normalizeKanaChar, readingChars } from "./kana";

export const MOJI_MIN_PLAYERS = 2;
export const MOJI_MAX_PLAYERS = 8;
export const MOJI_GAME_LENGTH = 10;
export const MOJI_POINTS = 10;
export const MOJI_SECONDS_OPTIONS = [15, 20, 30, 45, 60];
export const MOJI_DEFAULT_SECONDS = 30;
/** 出題する問題の正答率の範囲（%）。10%きざみで、下限以上・上限未満（上限100のときは100%も含む） */
export const MOJI_RATE_STEP = 10;
export const MOJI_DEFAULT_RATE_MIN = 60;
export const MOJI_DEFAULT_RATE_MAX = 70;
/** 正答率（%、切り捨て）の10%きざみの区切り。100% は 90〜100% に入れる */
export function mojiRateBucket(rate: number): number {
  return Math.min(9, Math.max(0, Math.floor(rate / MOJI_RATE_STEP)));
}
/** 範囲に入る区切りの一覧 */
export function mojiRateBuckets(min: number, max: number): number[] {
  const out: number[] = [];
  for (let b = min / MOJI_RATE_STEP; b < max / MOJI_RATE_STEP; b++) out.push(b);
  return out;
}
/** ルームで覚えておく、出した問題の数の上限（古いものから忘れる） */
export const MOJI_ASKED_LIMIT = 1000;
/** この時間ポーリングが途絶えた参加者は、タブを閉じた・通信が切れたとみなして外す */
export const MOJI_GONE_MS = 15_000;

/** 問題の候補（サーバーが読み込んで渡す） */
export type MojiPool = readonly MojiQuestion[];

export function normalizeMoji(state: RoomState): void {
  state.mojiPlayers ??= [];
  state.mojiCurrent ??= null;
  state.mojiRound ??= null;
  state.mojiResults ??= [];
  state.mojiUsedIds ??= [];
  state.mojiAskedIds ??= [...state.mojiUsedIds];
  state.settings.mojiSeconds ??= MOJI_DEFAULT_SECONDS;
  state.settings.mojiRateMin ??= MOJI_DEFAULT_RATE_MIN;
  state.settings.mojiRateMax ??= MOJI_DEFAULT_RATE_MAX;
}

/** 中止を除いた、終わった問題の数 */
export function mojiDoneCount(state: RoomState): number {
  return (state.mojiResults ?? []).filter((r) => r.status !== "cancelled").length;
}

export function mojiScore(state: RoomState): { score: number; total: number } {
  const done = (state.mojiResults ?? []).filter((r) => r.status !== "cancelled");
  return { score: done.filter((r) => r.status === "cleared").length * MOJI_POINTS, total: done.length * MOJI_POINTS };
}

function requireHost(state: RoomState, token: string, message: string): void {
  if (token !== state.hostToken) throw new EngineError(message);
}

/**
 * 人数と読みの文字数が同じで、正答率が選んだ範囲に入り、このゲームでまだ出していない問題を1つ選ぶ。
 * このルームで一度も出していない問題を優先し、出し切っていたら、前に出したのがいちばん古い問題にする
 */
function pickQuestion(state: RoomState, pool: MojiPool, n: number, random: () => number): MojiQuestion {
  const used = new Set(state.mojiUsedIds);
  const buckets = new Set(mojiRateBuckets(state.settings.mojiRateMin ?? MOJI_DEFAULT_RATE_MIN, state.settings.mojiRateMax ?? MOJI_DEFAULT_RATE_MAX));
  const cands = pool.filter(
    (q) => readingChars(q.reading).length === n && buckets.has(mojiRateBucket(q.rate)) && !used.has(q.id)
  );
  if (cands.length === 0) throw new EngineError(`この正答率の範囲で${n}人で遊べる問題がもうありません`);
  // 出した順の位置（新しいほど大きい）。出していない問題は -1
  const askedAt = new Map(state.mojiAskedIds!.map((id, i) => [id, i]));
  const fresh = cands.filter((q) => !askedAt.has(q.id));
  if (fresh.length > 0) return fresh[Math.floor(random() * fresh.length)];
  return cands.reduce((a, b) => (askedAt.get(b.id)! < askedAt.get(a.id)! ? b : a));
}

function startRound(state: RoomState, pool: MojiPool, now: number, random: () => number): void {
  const players = state.mojiPlayers!;
  if (players.length < MOJI_MIN_PLAYERS) throw new EngineError(`${MOJI_MIN_PLAYERS}人以上で遊べます`);
  if (players.length > MOJI_MAX_PLAYERS) throw new EngineError(`${MOJI_MAX_PLAYERS}人までで遊べます`);
  const q = pickQuestion(state, pool, players.length, random);
  state.mojiUsedIds = [...state.mojiUsedIds!, q.id];
  state.mojiAskedIds = [...state.mojiAskedIds!.filter((id) => id !== q.id), q.id].slice(-MOJI_ASKED_LIMIT);
  state.mojiCurrent = q;
  state.mojiRound = {
    participants: [...players],
    inputs: Object.fromEntries(players.map((t) => [t, { char: null, locked: false }])),
  };
  state.phase = "question";
  state.timer = newTimer(q.q, state.settings.mojiSeconds ?? MOJI_DEFAULT_SECONDS, now);
  state.pausedRoles = [];
}

function finishRound(state: RoomState, status?: "cancelled"): void {
  const q = state.mojiCurrent;
  const round = state.mojiRound;
  if (!q || !round) return;
  const expected = readingChars(q.reading);
  const inputs = round.participants.map((t) => round.inputs[t]?.char ?? null);
  const correct = inputs.map((c, i) => c !== null && normalizeKanaChar(c) === expected[i]);
  const result: MojiResult = {
    qIndex: state.qIndex,
    question: q,
    participants: round.participants,
    inputs,
    correct,
    status: status ?? (correct.every(Boolean) ? "cleared" : "failed"),
  };
  state.mojiResults = [...state.mojiResults!, result];
  state.mojiRound = null;
  state.phase = "judging";
  state.timer = null;
  state.pausedRoles = [];
}

function resetToLobby(state: RoomState): void {
  state.phase = "lobby";
  state.qIndex = 0;
  state.timer = null;
  state.pausedRoles = [];
  state.mojiCurrent = null;
  state.mojiRound = null;
  state.mojiResults = [];
  state.mojiUsedIds = [];
}

/** 参加者を外す。答えている最中の人なら、その問題は中止 */
function removePlayer(state: RoomState, target: string): void {
  if (!state.mojiPlayers!.includes(target)) return;
  state.mojiPlayers = state.mojiPlayers!.filter((t) => t !== target);
  if (state.phase === "question" && state.mojiRound?.participants.includes(target)) finishRound(state, "cancelled");
  if (state.mojiPlayers.length === 0 && state.phase !== "lobby") resetToLobby(state);
}

/** 遅延遷移: いなくなった参加者を外す、答える人の離席で一時停止/再開、全員決定か時間切れで判定 */
export function mojiTick(state: RoomState, presence: PresenceMap, now: number): boolean {
  normalizeMoji(state);
  let changed = false;
  if (state.phase === "question" || state.phase === "judging") {
    for (const t of state.mojiPlayers!.filter((t) => {
      const p = presence[t];
      return !p || now - p.lastSeen > MOJI_GONE_MS;
    })) {
      removePlayer(state, t);
      changed = true;
    }
  }
  const round = state.mojiRound;
  if (state.phase !== "question" || !state.timer || !round) return changed;

  const allActive = round.participants.every((t) => isActive(presence[t], now));
  if (!allActive && !state.timer.paused) {
    state.timer = pauseTimer(state.timer, now);
    changed = true;
  } else if (allActive && state.timer.paused) {
    state.timer = resumeTimer(state.timer, now);
    changed = true;
  }
  const allLocked = round.participants.every((t) => round.inputs[t]?.locked);
  if (allLocked || isExpired(state.timer, now)) {
    finishRound(state);
    changed = true;
  }
  return changed;
}

export function mojiStart(
  state: RoomState,
  token: string,
  presence: PresenceMap,
  now: number,
  pool: MojiPool | undefined,
  random: () => number = Math.random
): void {
  if (state.phase !== "lobby") throw new EngineError("すでに開始しています");
  requireHost(state, token, "ルーム作成者のみゲームを開始できます");
  if (!pool) throw new EngineError("問題を読み込めませんでした。もう一度お試しください");
  for (const t of state.mojiPlayers!) {
    if (!isActive(presence[t], now)) throw new EngineError(`${state.clients[t]?.name ?? "参加者"}さんが席を離れています`);
  }
  state.qIndex = 0;
  state.mojiResults = [];
  state.mojiUsedIds = [];
  startRound(state, pool, now, random);
}

export function mojiNext(
  state: RoomState,
  token: string,
  now: number,
  pool: MojiPool | undefined,
  random: () => number = Math.random
): void {
  if (state.phase !== "judging") throw new EngineError("判定フェーズではありません");
  requireHost(state, token, "次へ進めるのはルーム作成者のみです");
  if (mojiDoneCount(state) >= MOJI_GAME_LENGTH) {
    const { score, total } = mojiScore(state);
    state.phase = "results";
    state.mojiCurrent = null;
    state.gameRecords.push({ mode: "moji", setId: "moji", score, total, finishedAt: now });
    return;
  }
  if (!pool) throw new EngineError("問題を読み込めませんでした。もう一度お試しください");
  state.qIndex += 1;
  startRound(state, pool, now, random);
}

export function mojiBackToLobby(state: RoomState, token: string): void {
  // 結果画面から戻る。ゲームの途中でもルーム作成者は終わりにできる
  if (state.phase !== "results" && token !== state.hostToken)
    throw new EngineError("ゲームの途中で終われるのはルーム作成者のみです");
  if (state.phase === "results" && !state.mojiPlayers!.includes(token) && token !== state.hostToken)
    throw new EngineError("参加者またはホストのみ操作できます");
  resetToLobby(state);
}

export function mojiJoin(state: RoomState, token: string): void {
  if (state.mojiPlayers!.includes(token)) return;
  if (state.mojiPlayers!.length >= MOJI_MAX_PLAYERS) throw new EngineError(`参加できるのは${MOJI_MAX_PLAYERS}人までです`);
  // ゲームの途中でも参加できる（次の問題から）
  state.mojiPlayers = [...state.mojiPlayers!, token];
}

export function mojiLeave(state: RoomState, token: string): void {
  removePlayer(state, token);
}

export function mojiKick(state: RoomState, token: string, target: string | null): void {
  requireHost(state, token, "参加者を外せるのはルーム作成者のみです");
  if (target) removePlayer(state, target);
}

function myInput(state: RoomState, token: string, now: number) {
  const round = state.mojiRound;
  if (state.phase !== "question" || !round || !state.timer) throw new EngineError("回答フェーズではありません");
  const input = round.inputs[token];
  if (!input) throw new EngineError("この問題は次の問題から参加です");
  if (state.timer.paused) throw new EngineError("一時停止中です");
  if (effectiveElapsed(state.timer, now) < state.timer.revealMs) throw new EngineError("問題文が出るまでお待ちください");
  return input;
}

export function mojiInput(state: RoomState, token: string, char: string, now: number): void {
  const input = myInput(state, token, now);
  if (input.locked) throw new EngineError("決定済みです。取り消してから変えてください");
  const c = String(char ?? "").trim();
  if (!isSingleKana(c)) throw new EngineError("かな1文字で答えてください");
  input.char = c.normalize("NFKC");
}

export function mojiLock(state: RoomState, token: string, locked: boolean, now: number): void {
  const input = myInput(state, token, now);
  if (locked && !input.char) throw new EngineError("文字を入れてから決定してください");
  input.locked = locked;
}

export function setMojiRate(state: RoomState, token: string, min: number, max: number): void {
  if (state.phase !== "lobby") throw new EngineError("ロビーでのみ変更できます");
  requireHost(state, token, "正答率の範囲はルーム作成者のみ変更できます");
  const ok = (v: number) => Number.isInteger(v) && v >= 0 && v <= 100 && v % MOJI_RATE_STEP === 0;
  if (!ok(min) || !ok(max) || min >= max) throw new EngineError("正答率の範囲が正しくありません");
  state.settings.mojiRateMin = min;
  state.settings.mojiRateMax = max;
}

export function setMojiSeconds(state: RoomState, token: string, seconds: number): void {
  if (state.phase !== "lobby") throw new EngineError("ロビーでのみ変更できます");
  requireHost(state, token, "制限時間はルーム作成者のみ変更できます");
  const s = Math.round(seconds);
  if (!MOJI_SECONDS_OPTIONS.includes(s)) throw new EngineError("不正な秒数です");
  state.settings.mojiSeconds = s;
}
