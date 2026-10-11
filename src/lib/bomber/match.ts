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
 * 答えがこの数以上ある問題は「折り返し」で10個答える（番組の「ハイパーボンバー」）。
 * 1→2→3→4→5 と答えたあと、5枠目の人がもう一度答えて 5→4→3→2→1 と戻る。
 * 番組は10個以上だが、10個ちょうどの問題で全部を求めると難しすぎるため、余裕のある15個以上にする。
 */
export const BOMBER_TURNAROUND_MIN_ANSWERS = 15;

/**
 * 1問で答える数の上限（画面は5枠ずつの段で3段まで）。
 * 12個ある和風月名を全部答えさせる、などに使う。
 */
export const BOMBER_MAX_SLOTS = BOMBER_SLOTS * 3;

/**
 * その問題で埋める枠の数（5〜15。6以上なら折り返しあり）。
 * 問題データの slots があればそれ（簡単な問題は全部答えさせる）、
 * なければ答えが15個以上なら10、それ以外は5。
 */
export function slotsFor(question: BomberQuestion): number {
  if (question.slots) return question.slots;
  return question.answers.length >= BOMBER_TURNAROUND_MIN_ANSWERS ? BOMBER_SLOTS * 2 : BOMBER_SLOTS;
}

/**
 * 折り返す間隔（＝参加人数）。全員に1回ずつ回ったら、最後の人がもう一度答えて逆向きに戻る。
 * 5人なら番組と同じ 1→5、5→1。10人で10個なら折り返さず全員が1回ずつ答え、
 * 8人で12個なら 1→8 のあと 8→5 と、端数のぶんだけ折り返す（みんなに回答権が行きわたるように）。
 */
export function turnWidth(playerCount: number): number {
  return Math.max(1, playerCount);
}

/** 枠 k（0 始まり）を答える向き。width 枠ごとの段で、偶数段は次の人へ、奇数段は前の人へ進む */
export function directionAt(k: number, width: number = BOMBER_SLOTS): "next" | "prev" {
  return Math.floor(k / width) % 2 === 0 ? "next" : "prev";
}

/**
 * 枠 k（0 始まり）の回答者が、1つ前の枠の回答者から見て誰か。
 * 段の頭（k = width, 2×width…）は同じ人がもう一度（折り返し）、それ以外は段の向きに1人ずつ進む。
 * 例: 5人なら 1 2 3 4 5 | 5 4 3 2 1 | 1 2 3 4 5、3人なら 1 2 3 | 3 2 1 | 1 2 3
 */
export function stepInto(k: number, width: number = BOMBER_SLOTS): "next" | "same" | "prev" {
  if (k > 0 && k % width === 0) return "same";
  return directionAt(k, width);
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
};
const ITAIJI_RE = new RegExp(`[${Object.keys(ITAIJI).join("")}]`, "gu");

/** ひらがな1文字の母音（長音記号「ー」を母音に置き換えるため） */
const VOWEL_ROWS: [string, string][] = [
  ["あかがさざただなはばぱまやゃらわぁゎ", "あ"],
  ["いきぎしじちぢにひびぴみりぃ", "い"],
  ["うくぐすずつづぬふぶぷむゆゅるぅゔ", "う"],
  ["えけげせぜてでねへべぺめれぇ", "え"],
  ["おこごそぞとどのほぼぽもよょろをぉ", "お"],
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
