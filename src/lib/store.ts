import { Redis } from "@upstash/redis";
import type { PresenceMap, RoomState } from "./types";

const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

export interface Store {
  getRoom(roomId: string): Promise<RoomState | null>;
  createRoom(state: RoomState): Promise<boolean>;
  /**
   * CASリトライ付き読み取り-変更-書き込み。fnはstateを直接変更する。fnがfalseを返したら書き込まない。
   * initial を渡すと、1回目はそれを使う（直前に touchAndLoad で読んだ状態を使い回し、読み込みを1回減らす）。
   */
  mutate(
    roomId: string,
    fn: (state: RoomState) => boolean | void | Promise<boolean | void>,
    initial?: RoomState
  ): Promise<RoomState>;
  /**
   * 自分の在席（最終通信時刻・表示中か）を記録し、ルームの状態と全員の在席をまとめて読む。
   * ポーリングのたびに呼ぶので、Redis では1回の命令（Lua スクリプト）で済ませる（月間リクエスト数の節約）。
   */
  touchAndLoad(
    roomId: string,
    token: string,
    visible: boolean,
    now: number
  ): Promise<{ state: RoomState | null; presence: PresenceMap }>;
}

export class RoomNotFoundError extends Error {
  constructor() {
    super("room not found");
  }
}

// ---------- Redis 実装 ----------

const CAS_SCRIPT = `
local cur = redis.call('GET', KEYS[1])
if cur then
  local obj = cjson.decode(cur)
  if tostring(obj.v) ~= ARGV[1] then return 0 end
else
  return 0
end
redis.call('SET', KEYS[1], ARGV[2], 'PX', tonumber(ARGV[3]))
return 1
`;

/**
 * 在席の記録・有効期限の延長・在席の読み込み・ルームの読み込みを1回で行う。
 * KEYS[1]=ルーム, KEYS[2]=在席。ARGV[1]=token, ARGV[2]="時刻|表示中", ARGV[3]=有効期限(ms)
 */
const TOUCH_LOAD_SCRIPT = `
redis.call('HSET', KEYS[2], ARGV[1], ARGV[2])
redis.call('PEXPIRE', KEYS[2], tonumber(ARGV[3]))
local presence = redis.call('HGETALL', KEYS[2])
local room = redis.call('GET', KEYS[1])
return {room or '', presence}
`;

/** 在席の値「時刻|表示中」を読む */
function parsePresence(entries: Iterable<[string, unknown]>): PresenceMap {
  const map: PresenceMap = {};
  for (const [token, v] of entries) {
    const [ts, vis] = String(v).split("|");
    map[token] = { lastSeen: Number(ts) || 0, visible: vis === "1" };
  }
  return map;
}

export class RedisStore implements Store {
  constructor(private redis: Redis) {}

  private key(roomId: string) {
    return `room:${roomId}`;
  }
  private presenceKey(roomId: string) {
    return `room:${roomId}:presence`;
  }

  async getRoom(roomId: string): Promise<RoomState | null> {
    const raw = await this.redis.get<RoomState>(this.key(roomId));
    return raw ?? null;
  }

  async createRoom(state: RoomState): Promise<boolean> {
    const ok = await this.redis.set(this.key(state.roomId), JSON.stringify(state), {
      nx: true,
      px: ROOM_TTL_MS,
    });
    return ok === "OK";
  }

  async mutate(
    roomId: string,
    fn: (state: RoomState) => boolean | void | Promise<boolean | void>,
    initial?: RoomState
  ): Promise<RoomState> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const state = attempt === 0 && initial ? initial : await this.getRoom(roomId);
      if (!state) throw new RoomNotFoundError();
      const prevV = state.v;
      const write = await fn(state);
      if (write === false) return state;
      state.v = prevV + 1;
      const ok = await this.redis.eval(
        CAS_SCRIPT,
        [this.key(roomId)],
        [String(prevV), JSON.stringify(state), String(ROOM_TTL_MS)]
      );
      if (ok === 1) return state;
    }
    throw new Error("CAS retry exceeded");
  }

  async touchAndLoad(
    roomId: string,
    token: string,
    visible: boolean,
    now: number
  ): Promise<{ state: RoomState | null; presence: PresenceMap }> {
    const [room, flat] = (await this.redis.eval(
      TOUCH_LOAD_SCRIPT,
      [this.key(roomId), this.presenceKey(roomId)],
      [token, `${now}|${visible ? 1 : 0}`, String(ROOM_TTL_MS)]
    )) as [unknown, unknown[]];
    // クライアントが JSON を自動で読み込む場合と、文字列のまま返す場合の両方に対応する
    const state = !room ? null : typeof room === "string" ? (JSON.parse(room) as RoomState) : (room as RoomState);
    const pairs: [string, unknown][] = [];
    for (let i = 0; i + 1 < (flat ?? []).length; i += 2) pairs.push([String(flat[i]), flat[i + 1]]);
    return { state, presence: parsePresence(pairs) };
  }
}

// ---------- メモリ実装（ローカル開発用フォールバック） ----------

interface MemoryDb {
  rooms: Map<string, string>; // JSON文字列で保存し、Redisと同じ直列化セマンティクスにする
  presence: Map<string, PresenceMap>;
  locks: Map<string, Promise<unknown>>;
}

function memoryDb(): MemoryDb {
  const g = globalThis as unknown as { __threeAnswerDb?: MemoryDb };
  if (!g.__threeAnswerDb) {
    g.__threeAnswerDb = { rooms: new Map(), presence: new Map(), locks: new Map() };
  }
  return g.__threeAnswerDb;
}

class MemoryStore implements Store {
  private db = memoryDb();

  private async withLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.db.locks.get(roomId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.db.locks.set(roomId, next.catch(() => {}));
    return next;
  }

  async getRoom(roomId: string): Promise<RoomState | null> {
    const raw = this.db.rooms.get(roomId);
    return raw ? (JSON.parse(raw) as RoomState) : null;
  }

  async createRoom(state: RoomState): Promise<boolean> {
    if (this.db.rooms.has(state.roomId)) return false;
    this.db.rooms.set(state.roomId, JSON.stringify(state));
    return true;
  }

  async mutate(
    roomId: string,
    fn: (state: RoomState) => boolean | void | Promise<boolean | void>
  ): Promise<RoomState> {
    // メモリ実装はロックの中で読み直すので、initial は使わない
    return this.withLock(roomId, async () => {
      const state = await this.getRoom(roomId);
      if (!state) throw new RoomNotFoundError();
      const write = await fn(state);
      if (write === false) return state;
      state.v += 1;
      this.db.rooms.set(roomId, JSON.stringify(state));
      return state;
    });
  }

  async touchAndLoad(
    roomId: string,
    token: string,
    visible: boolean,
    now: number
  ): Promise<{ state: RoomState | null; presence: PresenceMap }> {
    const map = this.db.presence.get(roomId) ?? {};
    map[token] = { lastSeen: now, visible };
    this.db.presence.set(roomId, map);
    return { state: await this.getRoom(roomId), presence: { ...map } };
  }
}

// ---------- ファクトリ ----------

let storeSingleton: Store | null = null;

export function getStore(): Store {
  if (storeSingleton) return storeSingleton;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url && token) {
    storeSingleton = new RedisStore(new Redis({ url, token }));
  } else {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[three-answer] UPSTASH_REDIS_REST_URL/TOKEN が未設定のためメモリストアで動作します。Vercelでは複数インスタンス間で状態が共有されないため、必ずRedisを設定してください。"
      );
    }
    storeSingleton = new MemoryStore();
  }
  return storeSingleton;
}
