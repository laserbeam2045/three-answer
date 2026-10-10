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

// ---------- ファイブボンバーの問題セット ----------

/** 答えが5つ以上ある問題の、1つの正解 */
export interface BomberAnswer {
  /** 表示用の表記 */
  display: string;
  /** 表記以外に正解とする書き方（読み・別表記・略称など）。かなは自動でひらがな/カタカナ両対応 */
  accept?: string[];
}

export interface BomberQuestion {
  q: string;
  answers: BomberAnswer[];
  /** 各正解の後ろに付けても正解とする語（例: ["県", "けん"]） */
  suffixes?: string[];
  /** 各正解の前に付けても正解とする語（例: ["徳川", "とくがわ"]） */
  prefixes?: string[];
  /**
   * この問題で答える数（5〜10、正解の数以下）。6以上なら5枠目から折り返す。
   * 省略時は、答えが15個以上なら10、それ以外は5。簡単な問題は全部答えさせる（例: 惑星なら8）。
   */
  slots?: number;
}

export interface BomberSet {
  id: string;
  title: string;
  description: string;
  questions: BomberQuestion[];
}

// ---------- ルーム状態 ----------

export type GameMode = "three" | "bomber";

/** ファイブボンバーで1枠ぶん正解した記録 */
export interface BomberSlot {
  token: string;
  answerIndex: number;
  text: string;
  /** ローカルの照合では一致せず、AI（Jev）の表記ゆれ判定で正解になった */
  ai?: boolean;
}

/**
 * サーバーが事前に AI で判定した結果（クライアントからは受け取らない）。
 * qIndex と text が一致するときだけ使う。
 */
export interface BomberAnswerHint {
  qIndex: number;
  text: string;
  answerIndex: number;
}

export interface BomberMiss {
  token: string;
  text: string;
  /** wrong = 不正解, dup = すでに出た答え */
  reason: "wrong" | "dup";
  /** 同じ誤答が続いても演出を出し直せるよう、誤答ごとに増える番号 */
  seq: number;
}

export interface BomberRoundState {
  /** この問題で埋める枠の数（5、または折り返しありの 10） */
  target: number;
  /** 爆弾を持っている（回答中の）プレイヤー */
  turnToken: string;
  slots: BomberSlot[];
  lastMiss: BomberMiss | null;
  /** この問題での誤答の回数（BomberMiss.seq の採番用） */
  missCount: number;
  /** この問題で出た誤答（不正解・既出）すべて。全員に見せる */
  misses: BomberMiss[];
}

export interface BomberRoundResult {
  qIndex: number;
  /** 埋める枠の数（折り返し導入前の記録には無く、その場合は 5） */
  target?: number;
  cleared: boolean;
  slots: BomberSlot[];
  /** 爆発したときに爆弾を持っていた人 */
  heldBy?: string;
  /** この問題で出た誤答（記録の追加前の結果には無い） */
  misses?: BomberMiss[];
}

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
  /** 省略時は three（ファイブボンバー追加前の記録） */
  mode?: GameMode;
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
  /** bomberSecondsPerAnswer: ファイブボンバーの答え1つあたりの秒数（制限時間 = これ × 答える数） */
  settings: { answerSeconds: number; bomberSecondsPerAnswer: number };
  mode: GameMode;
  /** ファイブボンバーの参加者（参加順。回答はこの順に回る） */
  bomberPlayers: string[];
  bomberRound: BomberRoundState | null;
  bomberResults: BomberRoundResult[];
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
  | { type: "backToLobby" }
  | { type: "setMode"; mode: GameMode }
  /** seconds: 答え1つあたりの秒数 */
  | { type: "setBomberSeconds"; seconds: number }
  | { type: "bomberJoin" }
  | { type: "bomberLeave" }
  | { type: "bomberKick"; token: string }
  | { type: "bomberAnswer"; text: string };

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
  settings: { answerSeconds: number; bomberSecondsPerAnswer: number };
  mode: GameMode;
  /** 現在のモードのセットの問題数 */
  questionCount: number;
  bomber: BomberView;
}

// ---------- ファイブボンバーのクライアント向け状態 ----------

export interface BomberPlayerView {
  token: string;
  name: string;
  active: boolean;
  isYou: boolean;
}

export interface BomberSlotView {
  name: string;
  isYou: boolean;
  /** 正解の表記（入力した文字ではなく正式な表記） */
  display: string;
  /** AI の表記ゆれ判定で正解になったときの、実際の入力 */
  aiInput: string | null;
}

export interface BomberMissView {
  name: string;
  isYou: boolean;
  text: string;
  reason: "wrong" | "dup";
  seq: number;
}

export interface BomberRevealedAnswer {
  display: string;
  /** この問題で誰かが答えていれば、その人の名前 */
  by: string | null;
}

export interface BomberView {
  setMeta: { id: string; title: string; description: string; played: boolean }[];
  players: BomberPlayerView[];
  isPlayer: boolean;
  /** questionフェーズ中のみ */
  round: {
    /** 埋める枠の数（5、または折り返しありの 10） */
    target: number;
    slots: BomberSlotView[];
    /** 残りの枠を誰が答えるか（今の回答者から順に） */
    upcoming: string[];
    turnToken: string;
    turnName: string;
    isYourTurn: boolean;
    lastMiss: { name: string; text: string; reason: "wrong" | "dup"; seq: number } | null;
    /** この問題で出た誤答すべて（古い順） */
    misses: BomberMissView[];
    /** 回答者の離席で止まっている */
    waiting: boolean;
  } | null;
  /** judgingフェーズ中のみ */
  judged: {
    q: string;
    target: number;
    cleared: boolean;
    /** 爆発したときに爆弾を持っていた人の名前 */
    heldBy: string | null;
    slots: BomberSlotView[];
    answers: BomberRevealedAnswer[];
    misses: BomberMissView[];
    points: number;
  } | null;
  /** resultsフェーズのみ */
  history:
    | {
        q: string;
        target: number;
        cleared: boolean;
        heldBy: string | null;
        slots: BomberSlotView[];
        answers: BomberRevealedAnswer[];
        misses: BomberMissView[];
        points: number;
      }[]
    | null;
  /** これまでの合計点（results では最終得点） */
  totalPoints: number;
  maxPoints: number;
}

// ---------- プレゼンス ----------

export interface PresenceMap {
  [token: string]: { lastSeen: number; visible: boolean };
}

export const ACTIVE_WINDOW_MS = 6000;

export function isActive(p: { lastSeen: number; visible: boolean } | undefined, now: number): boolean {
  return !!p && p.visible && now - p.lastSeen <= ACTIVE_WINDOW_MS;
}
