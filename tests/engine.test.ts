import { describe, expect, it } from "vitest";
import { EngineError, applyAction, createRoom, tick } from "@/lib/engine";
import { effectiveElapsed, revealMsFor, LEAD_IN_MS } from "@/lib/time";
import type {
  PresenceMap,
  QuestionSet,
  Role,
  RoomState,
  SetQuestion,
} from "@/lib/types";

// ---------- テスト用フィクスチャ ----------

const hands: Record<Role, string[]> = {
  A: ["むーん", "あお", "かわ", "やま", "うみ", "そら", "ほし", "つき", "はな", "とり"],
  B: ["らいと", "れたす", "はむ", "きた", "みなみ", "ひがし", "にし", "くも", "あめ", "ゆき"],
  C: ["でんせつ", "てつどう", "かぜ", "もり", "いし", "すな", "ひかり", "かげ", "おと", "いろ"],
};

const Q_TEXT = "ひかりをえいごでなんという？";

function makeQuestion(): SetQuestion {
  return {
    q: Q_TEXT,
    answerDisplay: "ライト",
    answerReading: "らいと",
    required: [{ role: "B", card: "らいと" }],
    explanation: "Bの「らいと」1枚で正解。",
    source: "original",
  };
}

function makeSet(id: string, questionCount: number): QuestionSet {
  return {
    id,
    title: `テストセット${id}`,
    description: "テスト用",
    hands,
    questions: Array.from({ length: questionCount }, () => makeQuestion()),
  };
}

const set20 = makeSet("set20", 20);
const set2 = makeSet("set2", 2);
const sets: Record<string, QuestionSet> = { set20, set2 };
const getSet = (id: string) => sets[id];
const allSets = () => Object.values(sets);

const TOKENS = { A: "tokA", B: "tokB", C: "tokC" } as const;

function activePresence(now: number, extra?: PresenceMap): PresenceMap {
  return {
    tokA: { lastSeen: now, visible: true },
    tokB: { lastSeen: now, visible: true },
    tokC: { lastSeen: now, visible: true },
    ...extra,
  };
}

/** lobby から question フェーズまで進めたルームを作る */
function setupQuestionPhase(setId: string, now: number): RoomState {
  const p = activePresence(now);
  const state = createRoom("r1", "tokA", "ホスト", now);
  applyAction(state, "tokA", { type: "sit", role: "A" }, p, now, getSet, allSets);
  applyAction(state, "tokB", { type: "sit", role: "B" }, p, now, getSet, allSets);
  applyAction(state, "tokC", { type: "sit", role: "C" }, p, now, getSet, allSets);
  applyAction(state, "tokA", { type: "selectSet", setId }, p, now, getSet, allSets);
  applyAction(state, "tokA", { type: "start" }, p, now, getSet, allSets);
  return state;
}

// ---------- テスト ----------

describe("engine: 20問フルフロー", () => {
  it("createRoom → sit×3 → selectSet → setAnswerSeconds → start → 20問 → results → backToLobby", () => {
    let now = 1_000_000;
    const p = () => activePresence(now);

    const state = createRoom("r1", "tokA", "ホスト", now);
    expect(state.phase).toBe("lobby");
    expect(state.hostToken).toBe("tokA");
    expect(state.settings.answerSeconds).toBe(45);

    applyAction(state, "tokA", { type: "sit", role: "A" }, p(), now, getSet, allSets);
    applyAction(state, "tokB", { type: "sit", role: "B" }, p(), now, getSet, allSets);
    applyAction(state, "tokC", { type: "sit", role: "C" }, p(), now, getSet, allSets);
    expect(state.seats).toEqual({ A: "tokA", B: "tokB", C: "tokC" });

    applyAction(state, "tokA", { type: "selectSet", setId: "set20" }, p(), now, getSet, allSets);
    expect(state.setId).toBe("set20");

    applyAction(state, "tokA", { type: "setAnswerSeconds", seconds: 60 }, p(), now, getSet, allSets);
    expect(state.settings.answerSeconds).toBe(60);

    applyAction(state, "tokA", { type: "start" }, p(), now, getSet, allSets);
    expect(state.phase).toBe("question");
    expect(state.qIndex).toBe(0);
    expect(state.timer).not.toBeNull();
    expect(state.timer!.totalMs).toBe(LEAD_IN_MS + revealMsFor(Q_TEXT) + 60_000);
    expect(state.timer!.resumedAt).toBe(now);

    for (let i = 0; i < 20; i++) {
      expect(state.phase).toBe("question");
      expect(state.qIndex).toBe(i);
      expect(state.answers.B.cardIndex).toBeNull(); // 毎問リセットされる

      now += 3000;
      // B が正解カード「らいと」(index 0) を出し、A/C はパス。全員ロック。
      applyAction(state, "tokB", { type: "select", cardIndex: 0 }, p(), now, getSet, allSets);
      applyAction(state, "tokA", { type: "lock" }, p(), now, getSet, allSets);
      applyAction(state, "tokB", { type: "lock" }, p(), now, getSet, allSets);
      applyAction(state, "tokC", { type: "lock" }, p(), now, getSet, allSets);
      expect(state.phase).toBe("question"); // lock だけでは遷移しない

      // 全員 locked → tick で即判定
      expect(tick(state, p(), now, getSet)).toBe(true);
      expect(state.phase).toBe("judging");
      expect(state.timer).toBeNull();
      expect(state.results).toHaveLength(i + 1);
      expect(state.results[i]).toMatchObject({ qIndex: i, correct: true });
      expect(state.results[i].played).toEqual([{ role: "B", cardIndex: 0, card: "らいと" }]);

      now += 2000;
      applyAction(state, "tokA", { type: "next" }, p(), now, getSet, allSets);
    }

    // 20問目の next で results へ
    expect(state.phase).toBe("results");
    expect(state.results.filter((r) => r.correct)).toHaveLength(20);
    expect(state.playedSetIds).toEqual(["set20"]);
    expect(state.gameRecords).toHaveLength(1);
    expect(state.gameRecords[0]).toEqual({
      setId: "set20",
      score: 20,
      total: 20,
      finishedAt: now,
    });

    applyAction(state, "tokA", { type: "backToLobby" }, p(), now, getSet, allSets);
    expect(state.phase).toBe("lobby");
    expect(state.setId).toBeNull();
    expect(state.qIndex).toBe(0);
    expect(state.results).toEqual([]);
    expect(state.timer).toBeNull();
    // スコア履歴はルームに保持される
    expect(state.gameRecords).toHaveLength(1);
    expect(state.playedSetIds).toEqual(["set20"]);
  });
});

describe("engine: pause / resume", () => {
  it("非アクティブで pause、復帰で resume し経過時間が保存される", () => {
    let now = 1_000_000;
    const state = setupQuestionPhase("set2", now);
    const start = now;

    // 5秒後に B が非表示（非アクティブ）になる
    now = start + 5000;
    const pInactiveB: PresenceMap = activePresence(now, {
      tokB: { lastSeen: now, visible: false },
    });
    expect(tick(state, pInactiveB, now, getSet)).toBe(true);
    expect(state.timer!.paused).toBe(true);
    expect(state.timer!.elapsedBeforeResumeMs).toBe(5000);
    expect(state.pausedRoles).toEqual(["B"]);

    // 同じ状況の再 tick は変化なし
    expect(tick(state, pInactiveB, now, getSet)).toBe(false);

    // paused 中は totalMs を大きく超えても期限切れ判定されない
    now = start + 5000 + state.timer!.totalMs + 60_000;
    const pStillInactive: PresenceMap = activePresence(now, {
      tokB: { lastSeen: now, visible: false },
    });
    tick(state, pStillInactive, now, getSet);
    expect(state.phase).toBe("question");
    expect(state.timer!.paused).toBe(true);
    expect(effectiveElapsed(state.timer!, now)).toBe(5000);

    // B が復帰 → resume。経過 5000ms が保存されたまま再開
    const resumeAt = now;
    expect(tick(state, activePresence(now), now, getSet)).toBe(true);
    expect(state.phase).toBe("question");
    expect(state.timer!.paused).toBe(false);
    expect(state.timer!.resumedAt).toBe(resumeAt);
    expect(state.timer!.elapsedBeforeResumeMs).toBe(5000);
    expect(state.pausedRoles).toEqual([]);
    expect(effectiveElapsed(state.timer!, resumeAt + 1000)).toBe(6000);
  });
});

describe("engine: 時間切れの自動判定", () => {
  it("タイマー経過で未ロックのままでも判定され judging へ（未ロック選択も採用）", () => {
    let now = 1_000_000;
    const state = setupQuestionPhase("set2", now);
    const totalMs = state.timer!.totalMs;

    // B は正解カードを仮選択するがロックしない
    applyAction(state, "tokB", { type: "select", cardIndex: 0 }, activePresence(now), now, getSet, allSets);

    // 期限直前は何も起きない
    now += totalMs - 1;
    expect(tick(state, activePresence(now), now, getSet)).toBe(false);
    expect(state.phase).toBe("question");

    // 期限到達で自動判定
    now += 1;
    expect(tick(state, activePresence(now), now, getSet)).toBe(true);
    expect(state.phase).toBe("judging");
    expect(state.results[0].correct).toBe(true);
    expect(state.results[0].played).toEqual([{ role: "B", cardIndex: 0, card: "らいと" }]);
  });

  it("全員パスのまま時間切れなら不正解", () => {
    let now = 1_000_000;
    const state = setupQuestionPhase("set2", now);
    now += state.timer!.totalMs;
    expect(tick(state, activePresence(now), now, getSet)).toBe(true);
    expect(state.phase).toBe("judging");
    expect(state.results[0].correct).toBe(false);
    expect(state.results[0].played).toEqual([]);
  });
});

describe("engine: バリデーション", () => {
  it("観戦者は select できない", () => {
    const now = 1_000_000;
    const state = setupQuestionPhase("set2", now);
    expect(() =>
      applyAction(state, "tokSpec", { type: "select", cardIndex: 0 }, activePresence(now), now, getSet, allSets)
    ).toThrow(EngineError);
  });

  it("全員 locked 後の unlock は拒否される", () => {
    const now = 1_000_000;
    const state = setupQuestionPhase("set2", now);
    const p = activePresence(now);
    applyAction(state, "tokA", { type: "lock" }, p, now, getSet, allSets);
    applyAction(state, "tokB", { type: "lock" }, p, now, getSet, allSets);
    // 2人までなら unlock できる
    applyAction(state, "tokB", { type: "unlock" }, p, now, getSet, allSets);
    expect(state.answers.B.locked).toBe(false);
    applyAction(state, "tokB", { type: "lock" }, p, now, getSet, allSets);
    applyAction(state, "tokC", { type: "lock" }, p, now, getSet, allSets);
    // 全員 locked → unlock 拒否
    expect(() =>
      applyAction(state, "tokA", { type: "unlock" }, p, now, getSet, allSets)
    ).toThrow(EngineError);
  });

  it("ゲーム中のアクティブ席への sit は拒否、非アクティブ席は引き継げる", () => {
    const now = 1_000_000;
    const state = setupQuestionPhase("set2", now);

    // 全席アクティブ → 観戦者 tokD は座れない
    const pAllActive = activePresence(now, { tokD: { lastSeen: now, visible: true } });
    expect(() =>
      applyAction(state, "tokD", { type: "sit", role: "A" }, pAllActive, now, getSet, allSets)
    ).toThrow(EngineError);
    expect(state.seats.A).toBe("tokA");

    // 着席者はゲーム中に席を移動できない（相手が非アクティブでも）
    const pAInactive = activePresence(now, {
      tokA: { lastSeen: now - 60_000, visible: true },
      tokD: { lastSeen: now, visible: true },
    });
    expect(() =>
      applyAction(state, "tokB", { type: "sit", role: "A" }, pAInactive, now, getSet, allSets)
    ).toThrow(EngineError);

    // A が非アクティブ → 観戦者 tokD が引き継ぎ成功
    applyAction(state, "tokD", { type: "sit", role: "A" }, pAInactive, now, getSet, allSets);
    expect(state.seats.A).toBe("tokD");
  });

  it("start は 3人揃って全員アクティブでないと拒否される", () => {
    const now = 1_000_000;
    const p = activePresence(now);
    const state = createRoom("r1", "tokA", "ホスト", now);
    applyAction(state, "tokA", { type: "sit", role: "A" }, p, now, getSet, allSets);
    applyAction(state, "tokB", { type: "sit", role: "B" }, p, now, getSet, allSets);
    applyAction(state, "tokA", { type: "selectSet", setId: "set2" }, p, now, getSet, allSets);

    // 2人しかいない
    expect(() =>
      applyAction(state, "tokA", { type: "start" }, p, now, getSet, allSets)
    ).toThrow(EngineError);

    // 3人目が着席したが非アクティブ
    applyAction(state, "tokC", { type: "sit", role: "C" }, p, now, getSet, allSets);
    const pCInactive = activePresence(now, { tokC: { lastSeen: now - 60_000, visible: true } });
    expect(() =>
      applyAction(state, "tokA", { type: "start" }, pCInactive, now, getSet, allSets)
    ).toThrow(EngineError);
    expect(state.phase).toBe("lobby");
  });

  it("start はルーム作成者(host)以外は拒否される", () => {
    const now = 1_000_000;
    const p = activePresence(now);
    const state = createRoom("r1", "tokA", "ホスト", now);
    applyAction(state, "tokA", { type: "sit", role: "A" }, p, now, getSet, allSets);
    applyAction(state, "tokB", { type: "sit", role: "B" }, p, now, getSet, allSets);
    applyAction(state, "tokC", { type: "sit", role: "C" }, p, now, getSet, allSets);
    applyAction(state, "tokA", { type: "selectSet", setId: "set2" }, p, now, getSet, allSets);

    // 着席者でもホストでなければ開始できない
    expect(() =>
      applyAction(state, "tokB", { type: "start" }, p, now, getSet, allSets)
    ).toThrow(EngineError);
    expect(state.phase).toBe("lobby");

    // セット選択・解答時間の変更もホスト限定
    expect(() =>
      applyAction(state, "tokB", { type: "selectSet", setId: "set2" }, p, now, getSet, allSets)
    ).toThrow(EngineError);
    expect(() =>
      applyAction(state, "tokC", { type: "setAnswerSeconds", seconds: 60 }, p, now, getSet, allSets)
    ).toThrow(EngineError);

    // ホストなら開始できる
    applyAction(state, "tokA", { type: "start" }, p, now, getSet, allSets);
    expect(state.phase).toBe("question");
  });

  it("2問セットでは 2問目の next で results になる", () => {
    let now = 1_000_000;
    const state = setupQuestionPhase("set2", now);
    for (let i = 0; i < 2; i++) {
      now += state.timer!.totalMs;
      tick(state, activePresence(now), now, getSet);
      expect(state.phase).toBe("judging");
      applyAction(state, "tokA", { type: "next" }, activePresence(now), now, getSet, allSets);
    }
    expect(state.phase).toBe("results");
    expect(state.gameRecords[0]).toMatchObject({ setId: "set2", score: 0, total: 2 });
  });
});
