import { describe, expect, it } from "vitest";
import { judge } from "@/lib/judge";
import type { AnswerState, QuestionSet, Role, SetQuestion } from "@/lib/types";

const hands: Record<Role, string[]> = {
  A: ["むーん", "あお", "かわ", "やま", "うみ", "そら", "ほし", "つき", "はな", "とり"],
  B: ["らいと", "れたす", "はむ", "きた", "みなみ", "ひがし", "にし", "くも", "あめ", "ゆき"],
  C: ["でんせつ", "てつどう", "かぜ", "もり", "いし", "すな", "ひかり", "かげ", "おと", "いろ"],
};

function q(reading: string, required: { role: Role; card: string }[]): SetQuestion {
  return {
    q: "てすとのもんだいぶんです",
    answerDisplay: reading,
    answerReading: reading,
    required,
    explanation: "てすと",
    source: "original",
  };
}

const qSingle = q("らいと", [{ role: "B", card: "らいと" }]);
const qDouble = q("むーんらいと", [
  { role: "A", card: "むーん" },
  { role: "B", card: "らいと" },
]);
const qTriple = q("むーんらいとでんせつ", [
  { role: "A", card: "むーん" },
  { role: "B", card: "らいと" },
  { role: "C", card: "でんせつ" },
]);

const set: QuestionSet = {
  id: "test-set",
  title: "テストセット",
  difficulty: 1,
  description: "テスト用",
  hands,
  questions: [qSingle, qDouble, qTriple],
};

function answers(sel: Partial<Record<Role, number | null>>): Record<Role, AnswerState> {
  return {
    A: { cardIndex: sel.A ?? null, locked: true },
    B: { cardIndex: sel.B ?? null, locked: true },
    C: { cardIndex: sel.C ?? null, locked: true },
  };
}

describe("judge", () => {
  it("単独正解: 必要な1枚だけが出れば正解", () => {
    const r = judge(set, qSingle, answers({ B: 0 }), 0);
    expect(r.correct).toBe(true);
    expect(r.qIndex).toBe(0);
    expect(r.played).toEqual([{ role: "B", cardIndex: 0, card: "らいと" }]);
  });

  it("2枚合体正解: 必要な2人がちょうど1枚ずつ出せば正解", () => {
    const r = judge(set, qDouble, answers({ A: 0, B: 0 }), 1);
    expect(r.correct).toBe(true);
    expect(r.played).toEqual([
      { role: "A", cardIndex: 0, card: "むーん" },
      { role: "B", cardIndex: 0, card: "らいと" },
    ]);
  });

  it("3枚合体正解: 3人全員が必要カードを出せば正解", () => {
    const r = judge(set, qTriple, answers({ A: 0, B: 0, C: 0 }), 2);
    expect(r.correct).toBe(true);
    expect(r.played).toHaveLength(3);
    expect(r.played.map((p) => p.card).join("")).toBe("むーんらいとでんせつ");
  });

  it("不要カードを出して不正解: 不要なプレイヤーが出したら枚数超過で不正解", () => {
    // qSingle は B の「らいと」だけが必要。C が余計に出す。
    const r = judge(set, qSingle, answers({ B: 0, C: 0 }), 0);
    expect(r.correct).toBe(false);
    expect(r.played).toHaveLength(2);
  });

  it("必要カード不足で不正解: 必要な人が出さなかったら不正解", () => {
    // qDouble は A+B が必要。A だけが出す。
    const r = judge(set, qDouble, answers({ A: 0 }), 1);
    expect(r.correct).toBe(false);
    expect(r.played).toEqual([{ role: "A", cardIndex: 0, card: "むーん" }]);
  });

  it("違うカードで不正解: 枚数が合っていてもカードが違えば不正解", () => {
    // B が「らいと」ではなく「れたす」(index 1) を出す。
    const r = judge(set, qSingle, answers({ B: 1 }), 0);
    expect(r.correct).toBe(false);
    expect(r.played).toEqual([{ role: "B", cardIndex: 1, card: "れたす" }]);
  });

  it("全員パスで不正解 (required が空でない限り)", () => {
    const r = judge(set, qSingle, answers({}), 0);
    expect(r.correct).toBe(false);
    expect(r.played).toEqual([]);
  });

  it("正しい人が正しい枚数でも役割の割当が違えば不正解", () => {
    // qDouble (A+B) に対して A と C が出す。
    const r = judge(set, qDouble, answers({ A: 0, C: 0 }), 1);
    expect(r.correct).toBe(false);
  });
});
