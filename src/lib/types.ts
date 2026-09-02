export type Role = "A" | "B" | "C";
export const ROLES: Role[] = ["A", "B", "C"];

// ---------- 問題セット ----------

export interface SetQuestion {
  q: string;
  answerDisplay: string;
  answerReading: string;
  required: { role: Role; card: string }[];
  explanation: string;
  source: string;
  /**
   * 設計メタデータ（クライアントには送らない）。
   * この問題で「正解に不要なのに出すか悩む」札を記録する。
   * 罠は必ず required 以外のプレイヤーが持ち、答えと同カテゴリの兄弟概念で、
   * かつ問題文の限定句で明確に切れるものであること。
   */
  traps?: { role: Role; card: string; why: string }[];
}

export interface QuestionSet {
  id: string;
  title: string;
  description: string;
  hands: Record<Role, string[]>;
  questions: SetQuestion[];
}

// ---------- ルーム状態 ----------

export type Phase = "lobby" | "question" | "judging" | "results";

export interface ClientInfo {
  name: string;
}

export interface TimerState {
  totalMs: number;
  revealMs: number;
  elapsedBeforeResumeMs: number;
  resumedAt: number;
  paused: boolean;
}

export interface AnswerState {
  cardIndex: number | null;
  locked: boolean;
}

export interface QuestionResult {
  qIndex: number;
  correct: boolean;
  played: { role: Role; cardIndex: number; card: string }[];
}

export interface GameRecord {
  setId: string;
  score: number;
  total: number;
  finishedAt: number;
}

export interface RoomState {
  v: number;
  roomId: string;
  createdAt: number;
  hostToken: string;
  clients: Record<string, ClientInfo>;
  seats: Partial<Record<Role, string>>;
  phase: Phase;
  setId: string | null;
  playedSetIds: string[];
  gameRecords: GameRecord[];
  qIndex: number;
  timer: TimerState | null;
  pausedRoles: Role[];
  answers: Record<Role, AnswerState>;
  results: QuestionResult[];
  settings: { answerSeconds: number };
}

// ---------- アクション ----------

export type Action =
  | { type: "setName"; name: string }
  | { type: "sit"; role: Role }
  | { type: "standUp" }
  | { type: "selectSet"; setId: string }
  | { type: "setAnswerSeconds"; seconds: number }
  | { type: "start" }
  | { type: "select"; cardIndex: number | null }
  | { type: "lock" }
  | { type: "unlock" }
  | { type: "next" }
  | { type: "backToLobby" };

// ---------- クライアントに返す状態（redact済み） ----------

export interface RedactedQuestion {
  q: string;
  qLength: number;
}

export interface RevealedQuestion extends RedactedQuestion {
  answerDisplay: string;
  answerReading: string;
  required: { role: Role; card: string }[];
  explanation: string;
}

export interface SeatView {
  role: Role;
  token: string | null;
  name: string | null;
  active: boolean;
  locked: boolean;
}

export interface RedactedState {
  v: number;
  roomId: string;
  phase: Phase;
  you: {
    token: string;
    name: string;
    role: Role | null; // null = 観戦者
    isHost: boolean;
  };
  hostName: string | null;
  seats: SeatView[];
  spectators: { name: string; active: boolean }[];
  setId: string | null;
  setMeta: { id: string; title: string; description: string; played: boolean }[];
  playedSetIds: string[];
  gameRecords: GameRecord[];
  qIndex: number;
  timer: TimerState | null;
  pausedRoles: Role[];
  question: RedactedQuestion | null; // questionフェーズ中
  judged: {
    result: QuestionResult;
    question: RevealedQuestion;
  } | null; // judgingフェーズ中（および results で全問分は history に）
  myHand: string[] | null; // 着席者のみ
  mySelection: AnswerState | null;
  allHands: Record<Role, string[]> | null; // resultsフェーズ or 観戦reveal時
  history: { result: QuestionResult; question: RevealedQuestion }[] | null; // resultsフェーズ
  score: number | null; // resultsフェーズ
  settings: { answerSeconds: number };
}

// ---------- プレゼンス ----------

export interface PresenceMap {
  [token: string]: { lastSeen: number; visible: boolean };
}

export const ACTIVE_WINDOW_MS = 6000;

export function isActive(p: { lastSeen: number; visible: boolean } | undefined, now: number): boolean {
  return !!p && p.visible && now - p.lastSeen <= ACTIVE_WINDOW_MS;
}
