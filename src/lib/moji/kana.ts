/**
 * ひと文字リーグの文字の照合。1人が書いた1文字と、正解の読みのその位置の文字を比べる。
 * カタカナ/ひらがな、全角/半角、小さい字/大きい字（「っ」と「つ」など）、長音記号の書き方の違いは同じとみなす。
 */
const SMALL: Record<string, string> = {
  ぁ: "あ", ぃ: "い", ぅ: "う", ぇ: "え", ぉ: "お", っ: "つ", ゃ: "や", ゅ: "ゆ", ょ: "よ", ゎ: "わ", ゕ: "か", ゖ: "け",
};

export function normalizeKanaChar(c: string): string {
  let t = c.normalize("NFKC").trim();
  // カタカナ → ひらがな
  t = t.replace(/[ァ-ヶ]/g, (x) => String.fromCharCode(x.charCodeAt(0) - 0x60));
  t = t.replace(/[ぁぃぅぇぉっゃゅょゎゕゖ]/g, (x) => SMALL[x] ?? x);
  // 長音記号のつもりで打たれたハイフン類
  t = t.replace(/[-‐‑‒–—―−～〜]/g, "ー");
  return t;
}

/** 読みを1文字ずつに分ける（照合用に正規化したもの） */
export function readingChars(reading: string): string[] {
  return [...reading.normalize("NFKC")].map(normalizeKanaChar);
}

/** 入力が「かな1文字」か */
export function isSingleKana(input: string): boolean {
  const t = normalizeKanaChar(input);
  return [...t].length === 1 && /^[ぁ-ゖー]$/.test(t);
}
