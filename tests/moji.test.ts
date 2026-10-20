import { describe, expect, it } from "vitest";
import { applyAction, createRoom, tick } from "@/lib/engine";
import { redact } from "@/lib/redact";
import { publicIdOf } from "@/lib/publicId";
import { MOJI_GAME_LENGTH } from "@/lib/moji/engine";
import { isSingleKana, normalizeKanaChar, readingChars } from "@/lib/moji/kana";
import { allSets, getSet } from "@/lib/sets";
import type { MojiQuestion, PresenceMap } from "@/lib/types";

const HOST = "host-token-1";
const pool: MojiQuestion[] = [
  { id: 1, q: "日本の首都は？", answer: "東京", reading: "とうきょう", rate: 65 },
  { id: 2, q: "冬の夜空で輝く三角形は？", answer: "大三角", reading: "さんかく", rate: 66 },
  { id: 3, q: "犬の鳴き声は？", answer: "わん", reading: "わん", rate: 62 },
  { id: 4, q: "ネコの鳴き声は？", answer: "にゃー", reading: "にゃー", rate: 61 },
  { id: 5, q: "3文字の答え", answer: "ラッパ", reading: "ラッパ", rate: 64 },
];
const presenceFor = (tokens: string[], now: number): PresenceMap =>
  Object.fromEntries(tokens.map((t) => [t, { lastSeen: now, visible: true }]));

function room(players: string[]) {
  const s = createRoom("rm", HOST, "ホスト", 0);
  const all = [HOST, ...players];
  const run = (token: string, action: Parameters<typeof applyAction>[2], now: number) =>
    applyAction(s, token, action, presenceFor(all, now), now, getSet, allSets, undefined, undefined, pool);
  run(HOST, { type: "setMode", mode: "moji" }, 0);
  for (const p of players) run(p, { type: "mojiJoin" }, 0);
  return { s, run, all };
}

describe("かなの照合", () => {
  it("カタカナ・ひらがな、小さい字、長音の書き方の違いを吸収する", () => {
    expect(normalizeKanaChar("ア")).toBe("あ");
    expect(normalizeKanaChar("ッ")).toBe("つ");
    expect(normalizeKanaChar("-")).toBe("ー");
    expect(readingChars("ラッパ")).toEqual(["ら", "つ", "ぱ"]);
    expect(isSingleKana("あ")).toBe(true);
    expect(isSingleKana("ア")).toBe(true);
    expect(isSingleKana("あい")).toBe(false);
    expect(isSingleKana("東")).toBe(false);
  });
});

describe("ひと文字リーグ", () => {
  it("参加人数と同じ文字数の問題が出て、全員が正しい文字を書けば正解", () => {
    const { s, run } = room(["p1", "p2", "p3"]);
    run(HOST, { type: "start" }, 0);
    expect(s.phase).toBe("question");
    expect([...s.mojiCurrent!.reading].length).toBe(3);
    const chars = [...s.mojiCurrent!.reading];
    const at = s.timer!.revealMs;
    ["p1", "p2", "p3"].forEach((p, i) => {
      run(p, { type: "mojiInput", char: chars[i] }, at);
      run(p, { type: "mojiLock", locked: true }, at);
    });
    tick(s, presenceFor([HOST, "p1", "p2", "p3"], at), at, getSet);
    expect(s.phase).toBe("judging");
    expect(s.mojiResults!.at(-1)!.status).toBe("cleared");
  });

  it("出題中は、ほかの人が書いた文字も答えも返さない", () => {
    const { s, run, all } = room(["p1", "p2"]);
    run(HOST, { type: "start" }, 0);
    const at = s.timer!.revealMs;
    run("p1", { type: "mojiInput", char: "わ" }, at);
    const view = redact(s, presenceFor(all, at), "p2", at, getSet, allSets, false);
    expect(view.moji.players.find((p) => p.id === publicIdOf("p1"))!.typed).toBe(true);
    const json = JSON.stringify(view);
    expect(json).not.toContain(s.mojiCurrent!.answer);
    expect(view.moji.round!.myChar).toBeNull();
  });

  it("途中参加は次の問題から。答えている人が抜けたらその問題は中止で、次は残った人数の問題になる", () => {
    const { s, run } = room(["p1", "p2", "p3"]);
    run(HOST, { type: "start" }, 0);
    const at = s.timer!.revealMs;
    run("p4", { type: "mojiJoin" }, at);
    expect(s.mojiRound!.participants).toEqual(["p1", "p2", "p3"]);
    expect(() => run("p4", { type: "mojiInput", char: "あ" }, at)).toThrow("次の問題から");
    run("p2", { type: "mojiLeave" }, at);
    expect(s.phase).toBe("judging");
    expect(s.mojiResults!.at(-1)!.status).toBe("cancelled");
    run(HOST, { type: "next" }, at + 1);
    expect(s.mojiRound!.participants).toEqual(["p1", "p3", "p4"]);
    expect([...s.mojiCurrent!.reading].length).toBe(3);
  });

  it("中止を除いて決まった問題数で終わり、得点が記録される", () => {
    const big: MojiQuestion[] = Array.from({ length: 20 }, (_, i) => ({ id: 100 + i, q: `問${i}`, answer: "あい", reading: "あい", rate: 65 }));
    const s = createRoom("rm2", HOST, "ホスト", 0);
    const all = [HOST, "p1"];
    const run = (token: string, action: Parameters<typeof applyAction>[2], now: number) =>
      applyAction(s, token, action, presenceFor(all, now), now, getSet, allSets, undefined, undefined, big);
    run(HOST, { type: "setMode", mode: "moji" }, 0);
    run(HOST, { type: "mojiJoin" }, 0);
    run("p1", { type: "mojiJoin" }, 0);
    run(HOST, { type: "start" }, 0);
    let now = 0;
    for (let k = 0; k < MOJI_GAME_LENGTH; k++) {
      now += s.timer!.totalMs + 1;
      tick(s, presenceFor(all, now), now, getSet);
      expect(s.phase).toBe("judging");
      run(HOST, { type: "next" }, now);
    }
    expect(s.phase).toBe("results");
    expect(s.gameRecords.at(-1)).toMatchObject({ mode: "moji", score: 0, total: MOJI_GAME_LENGTH * 10 });
  });

  it("ロビーで選んだ正答率の範囲の問題だけが出る", () => {
    const mixed: MojiQuestion[] = [
      { id: 201, q: "やさしい", answer: "あい", reading: "あい", rate: 95 },
      { id: 202, q: "ふつう", answer: "うえ", reading: "うえ", rate: 65 },
      { id: 203, q: "むずかしい", answer: "おか", reading: "おか", rate: 12 },
    ];
    const s = createRoom("rm3", HOST, "ホスト", 0);
    const all = [HOST, "p1"];
    const run = (token: string, action: Parameters<typeof applyAction>[2], now: number) =>
      applyAction(s, token, action, presenceFor(all, now), now, getSet, allSets, undefined, undefined, mixed);
    run(HOST, { type: "setMode", mode: "moji" }, 0);
    run(HOST, { type: "mojiJoin" }, 0);
    run("p1", { type: "mojiJoin" }, 0);
    expect(() => run("p1", { type: "setMojiRate", min: 70, max: 100 }, 0)).toThrow("ルーム作成者");
    expect(() => run(HOST, { type: "setMojiRate", min: 70, max: 70 }, 0)).toThrow("正しくありません");
    expect(() => run(HOST, { type: "setMojiRate", min: 15, max: 70 }, 0)).toThrow("正しくありません");
    run(HOST, { type: "setMojiRate", min: 90, max: 100 }, 0);
    run(HOST, { type: "start" }, 0);
    expect(s.mojiCurrent!.id).toBe(201);
    run(HOST, { type: "backToLobby" }, 1);
    run(HOST, { type: "setMojiRate", min: 0, max: 30 }, 1);
    run(HOST, { type: "start" }, 1);
    expect(s.mojiCurrent!.id).toBe(203);
  });

  it("2人未満では始められない", () => {
    const { run } = room(["p1"]);
    expect(() => run(HOST, { type: "start" }, 0)).toThrow("2人以上");
  });

  it("ほかの人のトークンは返さず、外すときは公開 ID で指定する", () => {
    const { s, run, all } = room(["p1-secret-token", "p2-secret-token"]);
    run(HOST, { type: "start" }, 0);
    const at = s.timer!.revealMs;
    const view = redact(s, presenceFor(all, at), "p2-secret-token", at, getSet, allSets, false);
    const json = JSON.stringify(view);
    expect(json).not.toContain("p1-secret-token");
    expect(json).not.toContain(HOST);
    expect(view.moji.players.map((p) => p.id)).toEqual([publicIdOf("p1-secret-token"), publicIdOf("p2-secret-token")]);
    // トークンそのものを送っても外れない
    run(HOST, { type: "mojiKick", id: "p1-secret-token" }, at);
    expect(s.mojiPlayers).toEqual(["p1-secret-token", "p2-secret-token"]);
    // ルーム作成者以外は外せない
    expect(() => run("p2-secret-token", { type: "mojiKick", id: publicIdOf("p1-secret-token") }, at)).toThrow("ルーム作成者");
    run(HOST, { type: "mojiKick", id: publicIdOf("p1-secret-token") }, at);
    expect(s.mojiPlayers).toEqual(["p2-secret-token"]);
  });
});
