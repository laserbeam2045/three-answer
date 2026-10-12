import { describe, expect, it } from "vitest";
import { EngineError, applyAction, createRoom, tick } from "@/lib/engine";
import { firstAnswerer } from "@/lib/bomber/engine";
import { BOMBER_MAX_PLAYERS, matchAnswer, normalizeAnswer, slotsFor } from "@/lib/bomber/match";
import { BOMBER_REVEAL_LIMIT, redact } from "@/lib/redact";
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
/** 答えが15個ある（10個答える）問題 */
const MANY: BomberQuestion = {
  q: "1〜15の数字は？",
  answers: Array.from({ length: 15 }, (_, i) => ({ display: `n${i + 1}` })),
};
const bturn: BomberSet = { id: "bturn", title: "10個", description: "テスト用", questions: [MANY] };
/** 答えが8個で、全部答えさせる（slots: 8）簡単な問題 */
const EASY: BomberQuestion = {
  q: "惑星は？",
  slots: 8,
  answers: Array.from({ length: 8 }, (_, i) => ({ display: `p${i + 1}` })),
};
const beasy: BomberSet = { id: "beasy", title: "全部", description: "テスト用", questions: [EASY] };
const getBomberSet = (id: string) =>
  id === "btest" ? bset : id === "bturn" ? bturn : id === "beasy" ? beasy : undefined;
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
function startedRoom(players: string[], t0 = 1_000_000, setId = "btest") {
  const s = createRoom("room1", HOST, "ホスト", t0);
  act(s, HOST, { type: "setMode", mode: "bomber" }, t0);
  for (const p of players) {
    act(s, p, { type: "setName", name: p }, t0);
    act(s, p, { type: "bomberJoin" }, t0);
  }
  act(s, HOST, { type: "selectSet", setId }, t0);
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

  it("長音記号を直前の母音とみなす（ピカチュー／ピカチュウ）", () => {
    expect(normalizeAnswer("ピカチュー")).toBe(normalizeAnswer("ピカチュウ"));
    expect(normalizeAnswer("ルーク")).toBe("るうく");
    expect(normalizeAnswer("ﾙｰｸ")).toBe("るうく");
    // オ段・エ段の長音は「う」「い」と書く形にそろえる
    expect(normalizeAnswer("ギョーザ")).toBe(normalizeAnswer("ぎょうざ"));
    expect(normalizeAnswer("ローソク")).toBe(normalizeAnswer("ろうそく"));
    expect(normalizeAnswer("センベー")).toBe(normalizeAnswer("せんべい"));
    expect(normalizeAnswer("マーボードーフ")).toBe(normalizeAnswer("マーボードウフ"));
  });

  it("小書きの母音の違いを吸収する（ウィンディ／ウインディ）", () => {
    expect(normalizeAnswer("ウィンディ")).toBe(normalizeAnswer("ウインディ"));
    expect(normalizeAnswer("シャーペン")).not.toBe(normalizeAnswer("シヤーペン"));
  });

  it("ヴ行とバ行、づ・ぢとず・じ、×とxの違いを吸収する", () => {
    expect(normalizeAnswer("ヴァチカン")).toBe(normalizeAnswer("バチカン"));
    expect(normalizeAnswer("ソーヴィニヨン")).toBe(normalizeAnswer("ソービニヨン"));
    expect(normalizeAnswer("コソヴォ")).toBe(normalizeAnswer("コソボ"));
    expect(normalizeAnswer("ヴェルディ")).toBe(normalizeAnswer("ベルディ"));
    expect(normalizeAnswer("ヴ")).toBe(normalizeAnswer("ブ"));
    expect(normalizeAnswer("うづき")).toBe(normalizeAnswer("うずき"));
    expect(normalizeAnswer("ちぢみ")).toBe(normalizeAnswer("ちじみ"));
    expect(normalizeAnswer("3×3")).toBe(normalizeAnswer("3x3"));
  });

  it("旧字体と新字体の違いを吸収する（慶應／慶応）", () => {
    const q: BomberQuestion = {
      q: "大学",
      suffixes: ["大学"],
      answers: [{ display: "慶應義塾大学", accept: ["慶應義塾"] }, { display: "早稲田大学", accept: ["早稲田"] }],
    };
    expect(normalizeAnswer("慶應")).toBe(normalizeAnswer("慶応"));
    expect(matchAnswer(q, "慶応義塾大学")).toBe(0);
    expect(matchAnswer(q, "慶應義塾大學")).toBe(0);
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

  it("正解すると爆弾が次の人へ移り、最後の人の次は最初の人に戻る（折り返しなし）", () => {
    const { s, answerAt } = startedRoom(["p1", "p2", "p3"]);
    expect(s.bomberRound!.turnToken).toBe("p1");
    act(s, "p1", { type: "bomberAnswer", text: "青森" }, answerAt);
    expect(s.bomberRound!.turnToken).toBe("p2");
    act(s, "p2", { type: "bomberAnswer", text: "岩手" }, answerAt);
    act(s, "p3", { type: "bomberAnswer", text: "宮城" }, answerAt);
    expect(s.bomberRound!.turnToken).toBe("p1");
    act(s, "p1", { type: "bomberAnswer", text: "秋田" }, answerAt);
    expect(s.bomberRound!.turnToken).toBe("p2");
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
    // 2人は交互なので p1 → p2 → p1 の番で爆発
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

  it("ゲーム中に通信が途絶えた参加者は自動で外れ、爆弾は次の人へ（裏に回しただけなら外さない）", () => {
    const { s, answerAt } = startedRoom(["p1", "p2", "p3"]);
    const later = answerAt + 20_000;
    // p1（回答者）はタブを裏に回しただけ、p3 はタブを閉じた（最終通信が20秒前）
    const presence: PresenceMap = {
      [HOST]: { lastSeen: later, visible: true },
      p1: { lastSeen: later, visible: false },
      p2: { lastSeen: later, visible: true },
      p3: { lastSeen: answerAt, visible: true },
    };
    tick(s, presence, later, getSet);
    expect(s.bomberPlayers).toEqual(["p1", "p2"]);
    expect(s.bomberRound!.turnToken).toBe("p1");
    expect(s.timer!.paused).toBe(true);
    // p1 も閉じたら外れて p2 の番になり、再開する
    const later2 = later + 20_000;
    tick(s, { ...presence, [HOST]: { lastSeen: later2, visible: true }, p2: { lastSeen: later2, visible: true } }, later2, getSet);
    expect(s.bomberPlayers).toEqual(["p2"]);
    expect(s.bomberRound!.turnToken).toBe("p2");
    expect(s.timer!.paused).toBe(false);
  });

  it("途中参加した人は順番の最後に入り、順番が回ってきたら答える", () => {
    const { s, answerAt } = startedRoom(["p1", "p2", "p3"]);
    act(s, "p9", { type: "bomberJoin" }, answerAt);
    expect(s.bomberPlayers).toEqual(["p1", "p2", "p3", "p9"]);
    const presence = presenceFor([HOST, "p1", "p2", "p3", "p9"], answerAt);
    for (const [who, text] of [["p1", "青森"], ["p2", "岩手"], ["p3", "宮城"], ["p9", "秋田"], ["p1", "山形"]] as const) {
      expect(s.bomberRound!.turnToken).toBe(who);
      act(s, who, { type: "bomberAnswer", text }, answerAt, presence);
    }
    act(s, HOST, { type: "next" }, answerAt, presence);
    // 1問目で5個進んだので、2問目は 5 % 4 = 1 番目（p2）から
    expect(s.bomberRound!.turnToken).toBe("p2");
  });

  it("お休み（パス）した人はその問題の順番を飛ばされ、次の問題から自動で戻る", () => {
    const { s, answerAt } = startedRoom(["p1", "p2", "p3"]);
    act(s, "p2", { type: "bomberRest", rest: true }, answerAt);
    expect(s.bomberRound!.resting).toEqual(["p2"]);
    for (const [who, text] of [["p1", "青森"], ["p3", "岩手"], ["p1", "宮城"], ["p3", "秋田"], ["p1", "山形"]] as const) {
      expect(s.bomberRound!.turnToken).toBe(who);
      act(s, who, { type: "bomberAnswer", text }, answerAt);
    }
    act(s, HOST, { type: "next" }, answerAt);
    // 次の問題ではお休みが解除され、全員の順番に戻る（5個進んだので 5 % 3 = 2 番目の p3 から）
    expect(s.bomberRound!.resting).toEqual([]);
    expect(s.bomberRound!.turnToken).toBe("p3");
    act(s, "p3", { type: "bomberAnswer", text: "青森" }, answerAt + s.timer!.revealMs);
    expect(s.bomberRound!.turnToken).toBe("p1");
  });

  it("回答中の人がお休みにしたら爆弾は次の人へ。お休みはやめられ、全員がお休みにはできない", () => {
    const { s, answerAt } = startedRoom(["p1", "p2"]);
    act(s, "p1", { type: "bomberRest", rest: true }, answerAt);
    expect(s.bomberRound!.turnToken).toBe("p2");
    // お休みでないのが p2 だけなので、p2 はお休みにできない
    expect(() => act(s, "p2", { type: "bomberRest", rest: true }, answerAt)).toThrow(EngineError);
    act(s, "p2", { type: "bomberAnswer", text: "青森" }, answerAt);
    // p1 がお休み中なので、また p2 の番
    expect(s.bomberRound!.turnToken).toBe("p2");
    act(s, "p1", { type: "bomberRest", rest: false }, answerAt);
    act(s, "p2", { type: "bomberAnswer", text: "岩手" }, answerAt);
    expect(s.bomberRound!.turnToken).toBe("p1");
    // 画面にはお休み中かどうかが出る
    act(s, "p2", { type: "bomberRest", rest: true }, answerAt);
    const view = redact(s, presenceFor([HOST, "p1", "p2"], answerAt), "p1", answerAt, getSet, allSets, false, getBomberSet, () => [bset]);
    expect(view.bomber.players.find((p) => p.token === "p2")?.resting).toBe(true);
    expect(view.bomber.round!.upcoming.every((n) => n === "p1")).toBe(true);
  });

  it("2人のときは交互に答える", () => {
    const { s, answerAt } = startedRoom(["p1", "p2"]);
    const presence = presenceFor([HOST, "p1", "p2"], answerAt);
    for (const [who, text] of [["p1", "青森"], ["p2", "岩手"], ["p1", "宮城"], ["p2", "秋田"], ["p1", "山形"]] as const) {
      expect(s.bomberRound!.turnToken).toBe(who);
      act(s, who, { type: "bomberAnswer", text }, answerAt, presence);
    }
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

  it(`参加は${BOMBER_MAX_PLAYERS}人まで（9人以上も可）`, () => {
    expect(BOMBER_MAX_PLAYERS).toBeGreaterThan(8);
    const s = createRoom("room1", HOST, "ホスト", 0);
    act(s, HOST, { type: "setMode", mode: "bomber" }, 0);
    for (let i = 0; i < BOMBER_MAX_PLAYERS; i++) act(s, `p${i}`, { type: "bomberJoin" }, 0);
    expect(s.bomberPlayers).toHaveLength(BOMBER_MAX_PLAYERS);
    expect(() => act(s, "extra", { type: "bomberJoin" }, 0)).toThrow(EngineError);
  });

  it("12人でも1問5人ずつ順に回り、4問目で先頭に戻る（全員に均等に回る）", () => {
    const p = Array.from({ length: 12 }, (_, i) => `p${i}`);
    expect([0, 1, 2, 3].map((q) => firstAnswerer(p, q))).toEqual(["p0", "p5", "p10", "p3"]);
    const starts = new Set(Array.from({ length: 12 }, (_, q) => firstAnswerer(p, q)));
    expect(starts.size).toBe(12);
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
    expect(after.bomber.judged!.totalAnswers).toBe(6);
    expect(after.bomber.judged!.points).toBe(10);
  });

  it("答えが多い問題は、誰かが答えた正解と先頭の主なものだけを返す", () => {
    const MANY_Q: BomberQuestion = {
      q: "道具は？",
      answers: Array.from({ length: BOMBER_REVEAL_LIMIT + 50 }, (_, i) => ({ display: `g${i}` })),
    };
    const big: BomberSet = { id: "bbig", title: "多い", description: "テスト用", questions: [MANY_Q] };
    const get = (id: string) => (id === "bbig" ? big : getBomberSet(id));
    const s = createRoom("rbig", HOST, "ホスト", 0);
    const presence = presenceFor([HOST, "p1"], 0);
    const run = (token: string, action: Parameters<typeof applyAction>[2], now: number) =>
      applyAction(s, token, action, presence, now, getSet, allSets, get);
    run(HOST, { type: "setMode", mode: "bomber" }, 0);
    run("p1", { type: "bomberJoin" }, 0);
    run(HOST, { type: "selectSet", setId: "bbig" }, 0);
    run(HOST, { type: "start" }, 0);
    const at = s.timer!.revealMs;
    // 先頭の上限より後ろの正解を答える
    run("p1", { type: "bomberAnswer", text: `g${BOMBER_REVEAL_LIMIT + 10}` }, at);
    // 時間切れで判定へ（最終通信が古いと参加者が外れるので、時間切れの時刻で通信があったことにする）
    const end = s.timer!.totalMs + 1;
    const endPresence = presenceFor([HOST, "p1"], end);
    tick(s, endPresence, end, getSet);
    const view = redact(s, endPresence, "p1", end, getSet, allSets, false, get, () => [big]);
    const judged = view.bomber.judged!;
    expect(judged.totalAnswers).toBe(BOMBER_REVEAL_LIMIT + 50);
    expect(judged.answers).toHaveLength(BOMBER_REVEAL_LIMIT + 1);
    expect(judged.answers.find((a) => a.by)?.display).toBe(`g${BOMBER_REVEAL_LIMIT + 10}`);
  });
});

// ---------- 答える数と順番 ----------

describe("答える数と順番", () => {
  it("制限時間は「答え1つあたりの秒数 × 答える数」。秒数はホストが選べる", () => {
    const { s } = startedRoom(["p1"]);
    expect(s.timer!.totalMs - s.timer!.revealMs).toBe(8 * 5 * 1000);
    const lobby = createRoom("r3", HOST, "ホスト", 0);
    act(lobby, HOST, { type: "setMode", mode: "bomber" }, 0);
    act(lobby, HOST, { type: "setBomberSeconds", seconds: 20 }, 0);
    expect(lobby.settings.bomberSecondsPerAnswer).toBe(20);
    expect(() => act(lobby, HOST, { type: "setBomberSeconds", seconds: 30 }, 0)).toThrow(EngineError);
  });

  it("答えが15個以上なら10枠になり、5人なら 1→5 のあとまた 1→5 と順番どおりに答える。制限時間は2倍", () => {
    const { s, answerAt } = startedRoom(["p1", "p2", "p3", "p4", "p5"], 1_000_000, "bturn");
    expect(s.bomberRound!.target).toBe(10);
    const plain = startedRoom(["p1"]).s; // 5枠の問題
    expect(s.timer!.totalMs - s.timer!.revealMs).toBe(2 * (plain.timer!.totalMs - plain.timer!.revealMs));

    const order: string[] = [];
    for (let k = 0; k < 10; k++) {
      const who = s.bomberRound!.turnToken;
      order.push(who);
      act(s, who, { type: "bomberAnswer", text: `n${k + 1}` }, answerAt);
    }
    expect(order).toEqual(["p1", "p2", "p3", "p4", "p5", "p1", "p2", "p3", "p4", "p5"]);
    expect(s.phase).toBe("judging");
    expect(s.bomberResults[0]).toMatchObject({ cleared: true, target: 10 });
    expect(s.bomberResults[0].slots).toHaveLength(10);
  });

  it("3人なら A B C A B C … と回る", () => {
    const { s, answerAt } = startedRoom(["A", "B", "C"], 1_000_000, "bturn");
    const order: string[] = [];
    for (let k = 0; k < 10; k++) {
      const who = s.bomberRound!.turnToken;
      order.push(who);
      act(s, who, { type: "bomberAnswer", text: `n${k + 1}` }, answerAt);
    }
    expect(order).toEqual(["A", "B", "C", "A", "B", "C", "A", "B", "C", "A"]);
  });

  it("回答予定（upcoming）も順番どおりに返し、満点は枠の数で数える", () => {
    const { s, answerAt } = startedRoom(["p1", "p2", "p3"], 1_000_000, "bturn");
    const view = redact(s, presenceFor([HOST, "p1", "p2", "p3"], answerAt), "p1", answerAt, getSet, allSets, false, getBomberSet, () => [bturn]);
    expect(view.bomber.round!.upcoming).toEqual(["p1", "p2", "p3", "p1", "p2", "p3", "p1", "p2", "p3", "p1"]);
    expect(view.bomber.maxPoints).toBe(100);
  });

  it("slots: 8 なら8枠、制限時間も8つぶん", () => {
    const { s, answerAt } = startedRoom(["p1", "p2", "p3", "p4", "p5"], 1_000_000, "beasy");
    expect(s.bomberRound!.target).toBe(8);
    expect(s.timer!.totalMs - s.timer!.revealMs).toBe(8 * 8 * 1000);
    const order: string[] = [];
    for (let k = 0; k < 8; k++) {
      const who = s.bomberRound!.turnToken;
      order.push(who);
      act(s, who, { type: "bomberAnswer", text: `p${k + 1}` }, answerAt);
    }
    expect(order).toEqual(["p1", "p2", "p3", "p4", "p5", "p1", "p2", "p3"]);
    expect(s.bomberResults[0]).toMatchObject({ cleared: true, target: 8 });
  });

  it("8人・12個なら 1→8 番のあと 1→4 番。次の問題は5番から始まる", () => {
    const TWELVE = (q: string): BomberQuestion => ({
      q,
      slots: 12,
      answers: Array.from({ length: 12 }, (_, i) => ({ display: `a${i + 1}` })),
    });
    const set8: BomberSet = { id: "b8", title: "8", description: "テスト用", questions: [TWELVE("1問目"), TWELVE("2問目")] };
    const get = (id: string) => (id === "b8" ? set8 : getBomberSet(id));
    const players = Array.from({ length: 8 }, (_, i) => `p${i + 1}`);
    const s = createRoom("r8", HOST, "ホスト", 0);
    const presence = presenceFor([HOST, ...players], 0);
    const run = (token: string, action: Parameters<typeof applyAction>[2], now: number) =>
      applyAction(s, token, action, presence, now, getSet, allSets, get);
    run(HOST, { type: "setMode", mode: "bomber" }, 0);
    for (const p of players) run(p, { type: "bomberJoin" }, 0);
    run(HOST, { type: "selectSet", setId: "b8" }, 0);
    run(HOST, { type: "start" }, 0);
    const at = s.timer!.revealMs;
    const order: string[] = [];
    for (let k = 0; k < 12; k++) {
      const who = s.bomberRound!.turnToken;
      order.push(who);
      run(who, { type: "bomberAnswer", text: `a${k + 1}` }, at);
    }
    expect(order).toEqual(["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p1", "p2", "p3", "p4"]);
    run(HOST, { type: "next" }, at);
    expect(s.bomberRound!.turnToken).toBe("p5");
  });

  it("回答中の人が抜けたら、次の人へ渡す", () => {
    const { s, answerAt } = startedRoom(["p1", "p2", "p3", "p4", "p5"], 1_000_000, "bturn");
    for (let k = 0; k < 6; k++) act(s, s.bomberRound!.turnToken, { type: "bomberAnswer", text: `n${k + 1}` }, answerAt);
    expect(s.bomberRound!.turnToken).toBe("p2");
    act(s, HOST, { type: "bomberKick", token: "p2" }, answerAt);
    expect(s.bomberRound!.turnToken).toBe("p3");
  });
});

describe("誤答の一覧", () => {
  it("不正解・既出をすべて記録し、回答中も判定後も全員に見せる", () => {
    const { s, answerAt } = startedRoom(["p1", "p2"]);
    act(s, "p1", { type: "bomberAnswer", text: "新潟" }, answerAt);
    act(s, "p1", { type: "bomberAnswer", text: "青森" }, answerAt);
    act(s, "p2", { type: "bomberAnswer", text: "あおもり" }, answerAt);
    const presence = presenceFor([HOST, "p1", "p2"], answerAt);
    const other = redact(s, presence, HOST, answerAt, getSet, allSets, false, getBomberSet, () => [bset]);
    expect(other.bomber.round!.misses).toEqual([
      { name: "p1", isYou: false, text: "新潟", reason: "wrong", seq: 1 },
      { name: "p2", isYou: false, text: "あおもり", reason: "dup", seq: 2 },
    ]);
    const end = 1_000_000 + s.timer!.totalMs;
    tick(s, presenceFor([HOST, "p1", "p2"], end), end, getSet);
    const judged = redact(s, presence, "p1", end, getSet, allSets, false, getBomberSet, () => [bset]);
    expect(judged.bomber.judged!.misses.map((m) => m.text)).toEqual(["新潟", "あおもり"]);
    expect(judged.bomber.judged!.misses[0].isYou).toBe(true);
  });
});

describe("パネル問題（難読漢字など）", () => {
  const PANEL_Q: BomberQuestion = {
    q: "難読漢字の読みは？",
    panels: true,
    answers: [
      { display: "いるか", prompt: "海豚" },
      { display: "ふぐ", prompt: "河豚" },
      { display: "くらげ", prompt: "海月" },
      { display: "りす", prompt: "栗鼠" },
      { display: "もぐら", prompt: "土竜" },
      { display: "とかげ", prompt: "蜥蜴" },
    ],
  };
  const bpanel: BomberSet = { id: "bpanel", title: "パネル", description: "テスト用", questions: [PANEL_Q] };

  it("パネルの枚数が答える数になり、見えている漢字をそのまま打っても正解にならない", () => {
    expect(slotsFor(PANEL_Q)).toBe(6);
    expect(matchAnswer(PANEL_Q, "イルカ")).toBe(0);
    expect(matchAnswer(PANEL_Q, "海豚")).toBe(-1);
  });

  it("正解したパネルだけが埋まって全員に見える", () => {
    const get = (id: string) => (id === "bpanel" ? bpanel : getBomberSet(id));
    const s = createRoom("rp", HOST, "ホスト", 0);
    const presence = presenceFor([HOST, "p1"], 0);
    const run = (token: string, action: Parameters<typeof applyAction>[2], now: number) =>
      applyAction(s, token, action, presence, now, getSet, allSets, get);
    run(HOST, { type: "setMode", mode: "bomber" }, 0);
    run("p1", { type: "setName", name: "p1" }, 0);
    run("p1", { type: "bomberJoin" }, 0);
    run(HOST, { type: "selectSet", setId: "bpanel" }, 0);
    run(HOST, { type: "start" }, 0);
    const at = s.timer!.revealMs;
    expect(s.bomberRound!.target).toBe(6);
    run("p1", { type: "bomberAnswer", text: "くらげ" }, at);
    const view = redact(s, presence, HOST, at, getSet, allSets, false, get, () => [bpanel]);
    expect(view.bomber.round!.panels).toEqual([
      { prompt: "海豚", display: null, by: null, isYou: false },
      { prompt: "河豚", display: null, by: null, isYou: false },
      { prompt: "海月", display: "くらげ", by: "p1", isYou: false },
      { prompt: "栗鼠", display: null, by: null, isYou: false },
      { prompt: "土竜", display: null, by: null, isYou: false },
      { prompt: "蜥蜴", display: null, by: null, isYou: false },
    ]);
  });
});
