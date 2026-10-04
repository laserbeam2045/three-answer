import { describe, expect, it } from "vitest";
import { EngineError, applyAction, createRoom, tick } from "@/lib/engine";
import { firstAnswerer } from "@/lib/bomber/engine";
import { matchAnswer, normalizeAnswer } from "@/lib/bomber/match";
import { redact } from "@/lib/redact";
import type { BomberQuestion, BomberSet, PresenceMap, QuestionSet, RoomState } from "@/lib/types";

// ---------- フィクスチャ ----------

const PREFS: BomberQuestion = {
  q: "東北地方の県は？",
  suffixes: ["県", "けん"],
  answers: [
    { display: "青森", accept: ["あおもり"] },
    { display: "岩手", accept: ["いわて"] },
    { display: "宮城", accept: ["みやぎ"] },
    { display: "秋田", accept: ["あきた"] },
    { display: "山形", accept: ["やまがた"] },
    { display: "福島", accept: ["ふくしま"] },
  ],
};

const bset: BomberSet = {
  id: "btest",
  title: "テスト",
  description: "テスト用",
  questions: [PREFS, { ...PREFS, q: "2問目" }],
};
const getBomberSet = (id: string) => (id === "btest" ? bset : undefined);
const getSet = (_id: string): QuestionSet | undefined => undefined;
const allSets = () => [] as QuestionSet[];

const HOST = "tokHost";

function presenceFor(tokens: string[], now: number, inactive: string[] = []): PresenceMap {
  const p: PresenceMap = {};
  for (const t of tokens) p[t] = { lastSeen: now, visible: !inactive.includes(t) };
  return p;
}

function act(state: RoomState, token: string, action: Parameters<typeof applyAction>[2], now: number, presence?: PresenceMap) {
  applyAction(
    state,
    token,
    action,
    presence ?? presenceFor([HOST, ...state.bomberPlayers], now),
    now,
    getSet,
    allSets,
    getBomberSet
  );
}

/** players 人が参加し、第1問の回答受付（問題文表示後）まで進めたルーム */
function startedRoom(players: string[], t0 = 1_000_000) {
  const s = createRoom("room1", HOST, "ホスト", t0);
  act(s, HOST, { type: "setMode", mode: "bomber" }, t0);
  for (const p of players) {
    act(s, p, { type: "setName", name: p }, t0);
    act(s, p, { type: "bomberJoin" }, t0);
  }
  act(s, HOST, { type: "selectSet", setId: "btest" }, t0);
  act(s, HOST, { type: "start" }, t0);
  const answerAt = t0 + s.timer!.revealMs;
  return { s, answerAt };
}

// ---------- 照合 ----------

describe("normalizeAnswer / matchAnswer", () => {
  it("カタカナ・全角・空白・記号の違いを吸収する", () => {
    expect(normalizeAnswer("アオモリ")).toBe("あおもり");
    expect(normalizeAnswer(" ＡＢＣ　")).toBe("abc");
    expect(normalizeAnswer("生理学・医学")).toBe("生理学医学");
    expect(normalizeAnswer("ﾀﾞｲｺﾝ")).toBe("だいこん");
  });

  it("表記・読み・接尾語つき（漢字/かな）を受け付ける", () => {
    expect(matchAnswer(PREFS, "青森")).toBe(0);
    expect(matchAnswer(PREFS, "あおもり")).toBe(0);
    expect(matchAnswer(PREFS, "アオモリ")).toBe(0);
    expect(matchAnswer(PREFS, "青森県")).toBe(0);
    expect(matchAnswer(PREFS, "あおもりけん")).toBe(0);
    expect(matchAnswer(PREFS, "福島")).toBe(5);
  });

  it("一致しなければ -1。空文字も -1", () => {
    expect(matchAnswer(PREFS, "新潟")).toBe(-1);
    expect(matchAnswer(PREFS, "   ")).toBe(-1);
    expect(matchAnswer(PREFS, "県")).toBe(-1);
  });

  it("prefixes も受け付ける", () => {
    const q: BomberQuestion = { q: "将軍", prefixes: ["徳川"], answers: [{ display: "家康" }] };
    expect(matchAnswer(q, "徳川家康")).toBe(0);
    expect(matchAnswer(q, "家康")).toBe(0);
  });
});

// ---------- 回答順 ----------

describe("firstAnswerer", () => {
  it("5人なら毎問1番目の人から（番組と同じ）", () => {
    const p = ["a", "b", "c", "d", "e"];
    expect([0, 1, 2].map((q) => firstAnswerer(p, q))).toEqual(["a", "a", "a"]);
  });
  it("8人なら問題ごとに5人ずつずれて全員に回る", () => {
    const p = ["a", "b", "c", "d", "e", "f", "g", "h"];
    expect([0, 1, 2].map((q) => firstAnswerer(p, q))).toEqual(["a", "f", "c"]);
  });
  it("1人なら常にその人", () => {
    expect(firstAnswerer(["solo"], 3)).toBe("solo");
  });
});

// ---------- 進行 ----------

describe("ファイブボンバーの進行", () => {
  it("1人でも開始でき、全部の枠を自分で答える", () => {
    const { s, answerAt } = startedRoom(["p1"]);
    expect(s.phase).toBe("question");
    for (const a of ["青森", "いわて", "ミヤギ", "秋田県", "やまがたけん"]) {
      act(s, "p1", { type: "bomberAnswer", text: a }, answerAt);
    }
    expect(s.phase).toBe("judging");
    expect(s.bomberResults[0]).toMatchObject({ qIndex: 0, cleared: true });
    expect(s.bomberResults[0].slots).toHaveLength(5);
  });

  it("正解すると爆弾が次の人へ移り、最後の人の次は先頭に戻る", () => {
    const { s, answerAt } = startedRoom(["p1", "p2", "p3"]);
    expect(s.bomberRound!.turnToken).toBe("p1");
    act(s, "p1", { type: "bomberAnswer", text: "青森" }, answerAt);
    expect(s.bomberRound!.turnToken).toBe("p2");
    act(s, "p2", { type: "bomberAnswer", text: "岩手" }, answerAt);
    act(s, "p3", { type: "bomberAnswer", text: "宮城" }, answerAt);
    expect(s.bomberRound!.turnToken).toBe("p1");
  });

  it("不正解・既出では番が移らず、同じ人が答え直す", () => {
    const { s, answerAt } = startedRoom(["p1", "p2"]);
    act(s, "p1", { type: "bomberAnswer", text: "新潟" }, answerAt);
    expect(s.bomberRound!.turnToken).toBe("p1");
    expect(s.bomberRound!.lastMiss).toMatchObject({ reason: "wrong", seq: 1 });

    act(s, "p1", { type: "bomberAnswer", text: "青森" }, answerAt);
    act(s, "p2", { type: "bomberAnswer", text: "あおもり" }, answerAt);
    expect(s.bomberRound!.turnToken).toBe("p2");
    expect(s.bomberRound!.lastMiss).toMatchObject({ reason: "dup", seq: 2 });
    expect(s.bomberRound!.slots).toHaveLength(1);
  });

  it("サーバーの AI 判定結果（hint）は、同じ問題・同じ入力のときだけ使う", () => {
    const { s, answerAt } = startedRoom(["p1"]);
    const answer = (text: string, hint?: { qIndex: number; text: string; answerIndex: number }) =>
      applyAction(s, "p1", { type: "bomberAnswer", text }, presenceFor([HOST, "p1"], answerAt), answerAt, getSet, allSets, getBomberSet, hint);

    answer("Aomori", { qIndex: 1, text: "Aomori", answerIndex: 0 }); // 問題が違う
    answer("Aomori", { qIndex: 0, text: "Iwate", answerIndex: 0 }); // 入力が違う
    expect(s.bomberRound!.slots).toHaveLength(0);
    expect(s.bomberRound!.lastMiss).toMatchObject({ reason: "wrong", seq: 2 });

    answer("Aomori", { qIndex: 0, text: "Aomori", answerIndex: 0 });
    expect(s.bomberRound!.slots[0]).toMatchObject({ answerIndex: 0, text: "Aomori", ai: true });
    // AI で正解になった答えも既出として扱う
    answer("あおもり");
    expect(s.bomberRound!.lastMiss).toMatchObject({ reason: "dup" });
  });

  it("自分の番でなければ答えられない", () => {
    const { s, answerAt } = startedRoom(["p1", "p2"]);
    expect(() => act(s, "p2", { type: "bomberAnswer", text: "青森" }, answerAt)).toThrow(EngineError);
  });

  it("問題文の表示中は答えられない", () => {
    const { s, answerAt } = startedRoom(["p1"]);
    expect(() => act(s, "p1", { type: "bomberAnswer", text: "青森" }, answerAt - 1)).toThrow(
      EngineError
    );
  });

  it("時間切れで爆発し、それまでの正解数が得点になる", () => {
    const { s, answerAt } = startedRoom(["p1", "p2"]);
    act(s, "p1", { type: "bomberAnswer", text: "青森" }, answerAt);
    act(s, "p2", { type: "bomberAnswer", text: "岩手" }, answerAt);
    const end = 1_000_000 + s.timer!.totalMs;
    const changed = tick(s, presenceFor([HOST, "p1", "p2"], end), end, getSet);
    expect(changed).toBe(true);
    expect(s.phase).toBe("judging");
    expect(s.bomberResults[0]).toMatchObject({ cleared: false, heldBy: "p1" });
    expect(s.bomberResults[0].slots).toHaveLength(2);
  });

  it("回答者が離席すると止まり、他の人の離席では止まらない", () => {
    const { s, answerAt } = startedRoom(["p1", "p2"]);
    tick(s, presenceFor([HOST, "p1", "p2"], answerAt, ["p2"]), answerAt, getSet);
    expect(s.timer!.paused).toBe(false);
    tick(s, presenceFor([HOST, "p1", "p2"], answerAt, ["p1"]), answerAt, getSet);
    expect(s.timer!.paused).toBe(true);
    // 止まっている間は時間切れにならない
    const later = answerAt + 10 * 60 * 1000;
    tick(s, presenceFor([HOST, "p1", "p2"], later, ["p1"]), later, getSet);
    expect(s.phase).toBe("question");
    tick(s, presenceFor([HOST, "p1", "p2"], later), later, getSet);
    expect(s.timer!.paused).toBe(false);
  });

  it("回答中の人が抜けたら爆弾は次の人へ。全員抜けたらロビーへ", () => {
    const { s, answerAt } = startedRoom(["p1", "p2", "p3"]);
    act(s, HOST, { type: "bomberKick", token: "p1" }, answerAt);
    expect(s.bomberPlayers).toEqual(["p2", "p3"]);
    expect(s.bomberRound!.turnToken).toBe("p2");
    act(s, "p2", { type: "bomberLeave" }, answerAt);
    act(s, "p3", { type: "bomberLeave" }, answerAt);
    expect(s.phase).toBe("lobby");
  });

  it("最後の問題のあと結果へ進み、点数つきの記録が残る", () => {
    const { s, answerAt } = startedRoom(["p1"]);
    for (const a of ["青森", "岩手", "宮城", "秋田", "山形"]) {
      act(s, "p1", { type: "bomberAnswer", text: a }, answerAt);
    }
    act(s, HOST, { type: "next" }, answerAt);
    expect(s.phase).toBe("question");
    expect(s.qIndex).toBe(1);
    const end = answerAt + s.timer!.totalMs;
    tick(s, presenceFor([HOST, "p1"], end), end, getSet);
    act(s, HOST, { type: "next" }, end);
    expect(s.phase).toBe("results");
    expect(s.gameRecords.at(-1)).toMatchObject({ mode: "bomber", setId: "btest", score: 50, total: 100 });
    act(s, "p1", { type: "backToLobby" }, end);
    expect(s.phase).toBe("lobby");
    expect(s.setId).toBeNull();
  });

  it("参加は8人まで", () => {
    const s = createRoom("room1", HOST, "ホスト", 0);
    act(s, HOST, { type: "setMode", mode: "bomber" }, 0);
    for (let i = 0; i < 8; i++) act(s, `p${i}`, { type: "bomberJoin" }, 0);
    expect(() => act(s, "p8", { type: "bomberJoin" }, 0)).toThrow(EngineError);
  });

  it("モードを切り替えるとセット選択が外れ、スリーアンサー用の操作は使えない", () => {
    const { s, answerAt } = startedRoom(["p1"]);
    expect(() => act(s, "p1", { type: "lock" }, answerAt)).toThrow(EngineError);
    const lobby = createRoom("r2", HOST, "ホスト", 0);
    act(lobby, HOST, { type: "setMode", mode: "bomber" }, 0);
    act(lobby, HOST, { type: "selectSet", setId: "btest" }, 0);
    act(lobby, HOST, { type: "setMode", mode: "three" }, 0);
    expect(lobby.setId).toBeNull();
    expect(() => act(lobby, "p1", { type: "bomberJoin" }, 0)).toThrow(EngineError);
  });

  it("ホスト以外はモードを変えられない", () => {
    const s = createRoom("room1", HOST, "ホスト", 0);
    expect(() => act(s, "other", { type: "setMode", mode: "bomber" }, 0)).toThrow(EngineError);
  });

  it("古いルーム（mode などが無い）も読み込める", () => {
    const s = createRoom("room1", HOST, "ホスト", 0) as Partial<RoomState>;
    delete s.mode;
    delete s.bomberPlayers;
    delete s.bomberResults;
    const legacy = s as RoomState;
    tick(legacy, {}, 0, getSet);
    expect(legacy.mode).toBe("three");
    expect(legacy.bomberPlayers).toEqual([]);
  });
});

// ---------- redact ----------

describe("ファイブボンバーの redact", () => {
  it("回答中は正解一覧を返さず、判定時に全正解を返す", () => {
    const { s, answerAt } = startedRoom(["p1", "p2"]);
    act(s, "p1", { type: "bomberAnswer", text: "青森" }, answerAt);
    const presence = presenceFor([HOST, "p1", "p2"], answerAt);
    const during = redact(s, presence, "p2", answerAt, getSet, allSets, false, getBomberSet, () => [bset]);
    expect(during.bomber.round).toMatchObject({ isYourTurn: true, upcoming: ["p2", "p1", "p2", "p1"] });
    expect(during.bomber.judged).toBeNull();
    expect(JSON.stringify(during)).not.toContain("福島");

    const end = 1_000_000 + s.timer!.totalMs;
    tick(s, presenceFor([HOST, "p1", "p2"], end), end, getSet);
    const after = redact(s, presence, "p2", end, getSet, allSets, false, getBomberSet, () => [bset]);
    expect(after.bomber.judged!.answers).toHaveLength(6);
    expect(after.bomber.judged!.answers[0]).toEqual({ display: "青森", by: "p1" });
    expect(after.bomber.judged!.points).toBe(10);
  });
});
