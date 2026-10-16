import type { BomberQuestion } from "../types";
import { acceptedForms, fillPrompt, normalizeAnswer } from "./match";

/**
 * 表記ゆれの判定を Jev（typesafe.ai の判断特化モデル）に任せる。
 * ローカルの照合（matchAnswer）で一致しなかった入力だけをここに回す。
 * 環境変数 TYPESAFE_API_KEY が無い・通信に失敗した場合は -1（不正解扱い）を返す。
 * https://note.com/npaka/n/n5ac6abd04d67
 */

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
/** これ未満の確率なら採用しない（迷っている判定で正解にしない） */
export const JEV_MIN_PROBABILITY = 0.75;
const TIMEOUT_MS = 4000;

/**
 * 1回の問い合わせで聞く候補の上限。候補ごとに質問を作るため、答えが多い問題（ポケモン151匹など）を
 * 全部送るとトークンを大量に使う。多いときは表記が近い順に絞る（英語などで表記が全く違う入力は拾えなくなる）。
 */
export const JEV_MAX_CANDIDATES = 24;

const cache = new Map<string, number>();
const CACHE_LIMIT = 2000;

/**
 * 正解の候補ごとに「入力はこの正解の別の書き方か？」を Yes/No（noul）で問う。
 * 「どれを指している？」の選択式（choice）で聞くと「炭→炭素」「お正月→元日」のような
 * 近いだけの語も選ばれてしまうため、候補ごとに同一かどうかを判断させる。
 */
const CRITERIA = {
  true:
    "同じものの別の書き方。例: すいそ／Hydrogen→水素、安部晋三→安倍晋三（読みが同じ変換違い）、" +
    "慶応義塾大学→慶應義塾大学、渋沢栄一→澁澤榮一（新字体と旧字体の違い）、" +
    "コイズミ首相→小泉純一郎、ラピュタ→天空の城ラピュタ（よく使われる略称）、チェコ共和国→チェコ（正式名称）",
  false:
    "同じものとは言えない。例: 炭→炭素（一部分だけ）、さんそう→酸素（読みが違う打ち間違い）、" +
    "お正月→元日（意味が広い別の言葉）、体育の日→スポーツの日（旧名称）、小泉進次郎→小泉純一郎（別の人物）",
};

function bigrams(s: string): string[] {
  const chars = [...s];
  if (chars.length < 2) return chars;
  return chars.slice(1).map((c, i) => chars[i] + c);
}

/** 文字の2-gram の重なり（Dice 係数、0〜1） */
function similarity(a: string, b: string): number {
  const x = bigrams(a);
  const y = bigrams(b);
  if (x.length === 0 || y.length === 0) return 0;
  const rest = [...y];
  let hit = 0;
  for (const g of x) {
    const j = rest.indexOf(g);
    if (j >= 0) {
      hit++;
      rest.splice(j, 1);
    }
  }
  return (2 * hit) / (x.length + y.length);
}

/** 問い合わせる候補の index。多すぎるときは入力と表記が近い順に上限まで */
export function pickCandidates(question: BomberQuestion, input: string): number[] {
  const all = question.answers.map((_, i) => i);
  if (all.length <= JEV_MAX_CANDIDATES) return all;
  const n = normalizeAnswer(input);
  const score = (i: number) => Math.max(...[...acceptedForms(question, i)].map((f) => similarity(n, f)));
  return all
    .map((i) => ({ i, s: score(i) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, JEV_MAX_CANDIDATES)
    .map((x) => x.i);
}

function buildQuestions(question: BomberQuestion, input: string, candidates: number[]): Record<string, unknown> {
  const questions: Record<string, unknown> = {};
  candidates.forEach((i) => {
    const a = question.answers[i];
    // 虫食い（□）のお題は、□ の部分を答えたのか（前後も含めて書いたのか）を、言葉全体と照らして判断させる
    const whole = fillPrompt(a.prompt, a.display);
    questions[`a${i}`] = {
      type: "noul",
      instructions: whole
        ? `お題「${a.prompt}」の□に入る答えは「${a.display}」で、全体は「${whole}」。` +
          `入力「${input}」は、この□の答えを（読みがな・別の表記・□の前後も含めた形などで）正しく書いたものか？`
        : `入力「${input}」は「${a.display}」と同じものを指す、別の書き方か？`,
      criteria: CRITERIA,
    };
  });
  return questions;
}

interface JevResponse {
  answers?: Record<string, { noul?: number }>;
}

/** 入力が指している正解の index。どれでもない・判定できないときは -1 */
export async function judgeWithJev(
  question: BomberQuestion,
  input: string,
  opts: { apiKey?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): Promise<number> {
  const apiKey = opts.apiKey ?? process.env.TYPESAFE_API_KEY;
  const normalized = normalizeAnswer(input);
  if (!apiKey || !normalized) return -1;

  const cacheKey = `${question.q}\u0000${normalized}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const candidates = pickCandidates(question, input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_MS);
  try {
    const res = await (opts.fetchImpl ?? fetch)(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "jev-latest",
        state: [`クイズの問題: ${question.q}`, `プレイヤーの入力: 「${input}」`].join("\n"),
        questions: buildQuestions(question, input, candidates),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[jev] HTTP ${res.status}`);
      return -1;
    }
    const data = (await res.json()) as JevResponse;
    let index = -1;
    let best = JEV_MIN_PROBABILITY;
    candidates.forEach((i) => {
      const p = data.answers?.[`a${i}`]?.noul;
      if (typeof p === "number" && p >= best) {
        best = p;
        index = i;
      }
    });
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(cacheKey, index);
    return index;
  } catch (e) {
    console.warn("[jev] request failed:", e instanceof Error ? e.message : e);
    return -1;
  } finally {
    clearTimeout(timer);
  }
}
