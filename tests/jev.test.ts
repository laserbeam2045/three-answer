import { describe, expect, it, vi } from "vitest";
import { JEV_MAX_CANDIDATES, judgeWithJev, pickCandidates } from "@/lib/bomber/jev";
import type { BomberQuestion } from "@/lib/types";

const Q: BomberQuestion = {
  q: "原子番号1番から10番までの元素は？",
  answers: [{ display: "水素" }, { display: "ヘリウム" }, { display: "炭素" }],
};

/** Jev の応答を返す偽の fetch。nouls[i] が a{i} の確率になる */
function fakeFetch(nouls: number[], status = 200) {
  return vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    expect(Object.keys(body.questions)).toEqual(Q.answers.map((_, i) => `a${i}`));
    const answers: Record<string, unknown> = {};
    nouls.forEach((p, i) => (answers[`a${i}`] = { type: "noul", noul: p }));
    return new Response(JSON.stringify({ answers }), { status });
  }) as unknown as typeof fetch;
}

// 入力ごとにキャッシュされるので、テストごとに別の入力を使う
describe("judgeWithJev", () => {
  it("しきい値以上で最も確率の高い正解を返す", async () => {
    const f = fakeFetch([0.98, 0.1, 0.8]);
    expect(await judgeWithJev(Q, "Hydrogen", { apiKey: "k", fetchImpl: f })).toBe(0);
  });

  it("どれもしきい値未満なら -1", async () => {
    const f = fakeFetch([0.6, 0.1, 0.62]);
    expect(await judgeWithJev(Q, "炭", { apiKey: "k", fetchImpl: f })).toBe(-1);
  });

  it("APIキーが無ければ問い合わせずに -1", async () => {
    const f = fakeFetch([0.99, 0, 0]);
    expect(await judgeWithJev(Q, "すいそ1", { apiKey: "", fetchImpl: f })).toBe(-1);
    expect(f).not.toHaveBeenCalled();
  });

  it("HTTPエラー・通信失敗は -1", async () => {
    expect(await judgeWithJev(Q, "えらー", { apiKey: "k", fetchImpl: fakeFetch([0.99, 0, 0], 500) })).toBe(-1);
    const broken = vi.fn(async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect(await judgeWithJev(Q, "つうしん", { apiKey: "k", fetchImpl: broken })).toBe(-1);
  });

  it("同じ問題・同じ入力（正規化後）は2回目から問い合わせない", async () => {
    const f = fakeFetch([0, 0.95, 0]);
    expect(await judgeWithJev(Q, "Helium", { apiKey: "k", fetchImpl: f })).toBe(1);
    expect(await judgeWithJev(Q, "ＨＥＬＩＵＭ", { apiKey: "k", fetchImpl: f })).toBe(1);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("答えが多い問題は、表記が近い候補だけを問い合わせる", () => {
    const many: BomberQuestion = {
      q: "ポケモン",
      answers: Array.from({ length: 60 }, (_, i) => ({ display: `ダミー${i}` })).concat([
        { display: "ピカチュウ" },
        { display: "ライチュウ" },
      ]),
    };
    const picked = pickCandidates(many, "ピカチュー");
    expect(picked).toHaveLength(JEV_MAX_CANDIDATES);
    expect(picked[0]).toBe(60); // ピカチュウ が最も近い
    expect(picked).toContain(61);
    // 少ない問題は全部
    expect(pickCandidates(Q, "x")).toEqual([0, 1, 2]);
  });
});
