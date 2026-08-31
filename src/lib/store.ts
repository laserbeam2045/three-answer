import { Redis } from "@upstash/redis";
import type { PresenceMap, RoomState } from "./types";

const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

export interface Store {
  getRoom(roomId: string): Promise<RoomState | null>;
  createRoom(state: RoomState): Promise<boolean>;
  /** CASリトライ付き読み取り-変更-書き込み。fnはstateを直接変更する。fnがfalseを返したら書き込まない。 */
  mutate(
    roomId: string,
    fn: (state: RoomState) => boolean | void | Promise<boolean | void>
  ): Promise<RoomState>;
  touchPresence(roomId: string, token: string, visible: boolean, now: number): Promise<void>;
  getPresence(roomId: string): Promise<PresenceMap>;
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

class RedisStore implements Store {
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
    fn: (state: RoomState) => boolean | void | Promise<boolean | void>
  ): Promise<RoomState> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const state = await this.getRoom(roomId);
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

  async touchPresence(roomId: string, token: string, visible: boolean, now: number): Promise<void> {
    const key = this.presenceKey(roomId);
    await this.redis.hset(key, { [token]: `${now}|${visible ? 1 : 0}` });
    await this.redis.pexpire(key, ROOM_TTL_MS);
  }

  async getPresence(roomId: string): Promise<PresenceMap> {
    const raw = await this.redis.hgetall<Record<string, string>>(this.presenceKey(roomId));
    const map: PresenceMap = {};
    if (raw) {
      for (const [token, v] of Object.entries(raw)) {
        const [ts, vis] = String(v).split("|");
        map[token] = { lastSeen: Number(ts) || 0, visible: vis === "1" };
      }
    }
    return map;
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

  async touchPresence(roomId: string, token: string, visible: boolean, now: number): Promise<void> {
    const map = this.db.presence.get(roomId) ?? {};
    map[token] = { lastSeen: now, visible };
    this.db.presence.set(roomId, map);
  }

  async getPresence(roomId: string): Promise<PresenceMap> {
    return this.db.presence.get(roomId) ?? {};
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
