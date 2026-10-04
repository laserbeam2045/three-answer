import type { BomberQuestion } from "../types";

/** ファイブボンバーで正解1つあたりの得点 */
export const BOMBER_POINTS = 10;
/** 1問で埋める枠の数 */
export const BOMBER_SLOTS = 5;
export const BOMBER_MAX_PLAYERS = 8;
export const BOMBER_SECONDS_OPTIONS = [20, 30, 45, 60];

/**
 * 答えの照合用に文字列を正規化する。
 * 全角/半角・大文字/小文字・カタカナ/ひらがな・空白や記号の違いを吸収する。
 */
export function normalizeAnswer(input: string): string {
  let t = input.normalize("NFKC").toLowerCase();
  // カタカナ → ひらがな（ァ〜ヶ）
  t = t.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  // 長音記号のつもりで打たれたハイフン類
  t = t.replace(/[-‐‑‒–—―−]/g, "ー");
  // 空白・区切り記号・括弧類は無視する
  t = t.replace(/[\s・、。,.「」『』()［］\[\]!?〜~]/g, "");
  return t;
}

/** その正解として受け付ける書き方（正規化済み）の集合 */
export function acceptedForms(question: BomberQuestion, answerIndex: number): Set<string> {
  const a = question.answers[answerIndex];
  const bases = [a.display, ...(a.accept ?? [])].map(normalizeAnswer).filter(Boolean);
  const prefixes = ["", ...(question.prefixes ?? []).map(normalizeAnswer)];
  const suffixes = ["", ...(question.suffixes ?? []).map(normalizeAnswer)];
  const forms = new Set<string>();
  for (const b of bases) {
    for (const p of prefixes) {
      for (const s of suffixes) forms.add(p + b + s);
    }
  }
  return forms;
}

/** 入力に一致する正解の index。どれにも一致しなければ -1 */
export function matchAnswer(question: BomberQuestion, input: string): number {
  const n = normalizeAnswer(input);
  if (!n) return -1;
  for (let i = 0; i < question.answers.length; i++) {
    if (acceptedForms(question, i).has(n)) return i;
  }
  return -1;
}
