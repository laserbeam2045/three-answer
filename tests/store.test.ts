import { describe, expect, it } from "vitest";
import type { Redis } from "@upstash/redis";
import { RedisStore } from "@/lib/store";

/** eval の結果だけを返す偽の Redis クライアント */
function fakeRedis(result: unknown, calls: unknown[][] = []): Redis {
  return {
    eval: async (...args: unknown[]) => {
      calls.push(args);
      return result;
    },
  } as unknown as Redis;
}

describe("RedisStore.touchAndLoad", () => {
  it("在席の記録とルーム・在席の読み込みを1回の命令で行い、結果を読み取る", async () => {
    const calls: unknown[][] = [];
    // クライアントが JSON を自動で読み込む場合（ルームがオブジェクトで返る）
    const store = new RedisStore(fakeRedis([{ v: 3, roomId: "r1" }, ["tokA", "1000|1", "tokB", "900|0"]], calls));
    const { state, presence } = await store.touchAndLoad("r1", "tokA", true, 1000);
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual(["room:r1", "room:r1:presence"]);
    expect(calls[0][2]).toEqual(["tokA", "1000|1", String(24 * 60 * 60 * 1000)]);
    expect(state).toMatchObject({ v: 3, roomId: "r1" });
    expect(presence).toEqual({ tokA: { lastSeen: 1000, visible: true }, tokB: { lastSeen: 900, visible: false } });
  });

  it("ルームが文字列で返る場合も読み取れ、ルームが無ければ null", async () => {
    const asString = new RedisStore(fakeRedis(['{"v":5,"roomId":"r2"}', []]));
    expect((await asString.touchAndLoad("r2", "t", false, 1)).state).toMatchObject({ v: 5 });
    const missing = new RedisStore(fakeRedis(["", ["t", "1|0"]]));
    const r = await missing.touchAndLoad("r3", "t", false, 1);
    expect(r.state).toBeNull();
    expect(r.presence.t).toEqual({ lastSeen: 1, visible: false });
  });
});
