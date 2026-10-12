import type { BomberQuestion } from "../types";

/** ファイブボンバーで正解1つあたりの得点 */
export const BOMBER_POINTS = 10;
/** 1問で埋める枠の数 */
export const BOMBER_SLOTS = 5;
/**
 * 参加できる人数の上限。回答の順番は人数によらず回る（1問で答えるのは最大5人）。
 * 全員が約0.5秒ごとにポーリングするため、Redis の通信量が人数に比例して増える点に注意。
 */
export const BOMBER_MAX_PLAYERS = 20;
/**
 * 制限時間は「答え1つあたりの秒数 × その問題で答える数」で決める。
 * 文字入力は口頭より遅く、1つあたり PC で4〜9秒、スマホで6〜12秒ほどかかる見積もり。
 */
export const BOMBER_SECONDS_PER_ANSWER_OPTIONS = [6, 8, 10, 12, 15, 20];
export const BOMBER_DEFAULT_SECONDS_PER_ANSWER = 8;

/**
 * 答えがこの数以上ある問題は、データで slots を指定していなくても10個答える（番組の「ハイパーボンバー」）。
 * 10個ちょうどの問題で全部を求めると難しすぎるため、余裕のある15個以上にする。
 */
export const BOMBER_MANY_ANSWERS_MIN = 15;

/**
 * 1問で答える数の上限（画面は5枠ずつの段で5段まで）。
 * 12個ある和風月名を全部答えさせる、ヨーロッパの国を25個答えさせる、などに使う。
 */
export const BOMBER_MAX_SLOTS = BOMBER_SLOTS * 5;

/**
 * その問題で埋める枠の数（5〜25）。
 * 問題データの slots があればそれ（簡単な問題は全部答えさせる）、
 * なければ答えが15個以上なら10、それ以外は5。
 */
export function slotsFor(question: BomberQuestion): number {
  if (question.panels) return Math.min(question.answers.length, BOMBER_MAX_SLOTS);
  if (question.slots) return question.slots;
  return question.answers.length >= BOMBER_MANY_ANSWERS_MIN ? BOMBER_SLOTS * 2 : BOMBER_SLOTS;
}

/**
 * 旧字体・異体字 → 常用の字体。IME の変換で出やすいものを中心に、
 * 入力と正解の両方に同じ置き換えをかけて「慶應／慶応」のような違いを吸収する。
 */
const ITAIJI: Record<string, string> = {
  應: "応", 澤: "沢", 濱: "浜", 邊: "辺", 邉: "辺", 齋: "斎", 齊: "斉", 國: "国", 學: "学",
  廣: "広", 髙: "高", 﨑: "崎", 嶋: "島", 嶌: "島", 櫻: "桜", 惠: "恵", 德: "徳", 眞: "真",
  藏: "蔵", 龍: "竜", 臺: "台", 驛: "駅", 縣: "県", 圓: "円", 澁: "渋", 榮: "栄", 繪: "絵",
  鐵: "鉄", 實: "実", 壽: "寿", 會: "会", 戰: "戦", 黑: "黒", 萬: "万", 與: "与", 佛: "仏",
  鹽: "塩", 豐: "豊", 禮: "礼", 莊: "荘", 冨: "富", 兒: "児", 舊: "旧", 體: "体", 聲: "声",
  煕: "熙",
};

/** 小書きの母音などを大きい字に（「ウィンディ」と「ウインディ」を同じにする）。ゃゅょっ は区別するので含めない */
const SMALL_KANA: Record<string, string> = { ぁ: "あ", ぃ: "い", ぅ: "う", ぇ: "え", ぉ: "お", ゎ: "わ", ゕ: "か", ゖ: "け" };
const SMALL_KANA_RE = /[ぁぃぅぇぉゎゕゖ]/g;
/** 「ゔ＋母音」をバ行の1字に（小書きの母音は先に大きい字にしてある） */
const VU_ROW: Record<string, string> = { あ: "ば", い: "び", え: "べ", お: "ぼ" };
const ITAIJI_RE = new RegExp(`[${Object.keys(ITAIJI).join("")}]`, "gu");

/**
 * ひらがな1文字のあとの長音記号「ー」を置き換える字。
 * オ段は「う」、エ段は「い」にする（日本語では「ぎょうざ」「ろうそく」「せんべい」と書くことが多いので、
 * 「ギョーザ」「ローソク」「センベー」を同じにする）。それ以外の段は母音そのもの。
 */
const VOWEL_ROWS: [string, string][] = [
  ["あかがさざただなはばぱまやゃらわぁゎ", "あ"],
  ["いきぎしじちぢにひびぴみりぃ", "い"],
  ["うくぐすずつづぬふぶぷむゆゅるぅゔ", "う"],
  ["えけげせぜてでねへべぺめれぇ", "い"],
  ["おこごそぞとどのほぼぽもよょろをぉ", "う"],
];
const VOWEL_OF = new Map<string, string>();
for (const [chars, v] of VOWEL_ROWS) for (const c of chars) VOWEL_OF.set(c, v);

/**
 * 答えの照合用に文字列を正規化する。
 * 全角/半角・大文字/小文字・カタカナ/ひらがな・旧字体/新字体・空白や記号の違いを吸収する。
 */
export function normalizeAnswer(input: string): string {
  let t = input.normalize("NFKC").toLowerCase();
  t = t.replace(ITAIJI_RE, (c) => ITAIJI[c] ?? c);
  // カタカナ → ひらがな（ァ〜ヶ）
  t = t.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  t = t.replace(SMALL_KANA_RE, (c) => SMALL_KANA[c] ?? c);
  // ヴ行はバ行に（「ヴァチカン」と「バチカン」、「ソーヴィニヨン」と「ソービニヨン」を同じにする）
  t = t.replace(/ゔ([あいえお])/g, (_, v: string) => VU_ROW[v] ?? v).replace(/ゔ/g, "ぶ");
  // 「づ・ぢ」は「ず・じ」に（「うづき」と「うずき」）。「×」は「x」に（「3×3」と「3x3」）
  t = t.replace(/づ/g, "ず").replace(/ぢ/g, "じ").replace(/×/g, "x");
  // 長音記号のつもりで打たれたハイフン類
  t = t.replace(/[-‐‑‒–—―−]/g, "ー");
  // 長音を直前の母音に（「ピカチュー」と「ピカチュウ」、「ルーク」と「ルウク」を同じにする）
  t = t.replace(/([ぁ-ゔ])ー+/g, (_, c: string) => c + (VOWEL_OF.get(c) ?? "ー"));
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
