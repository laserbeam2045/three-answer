// 頻出ワード起点の手札設計ツール。
//
// 方針（ユーザー提案）:
//   1. クイズの正解として「頻出」＝複数の問題を作れるワードを抽出する
//   2. それらを手札の核にする（1枚のカードに複数の問題候補があるので、
//      「他人の札と同カテゴリになる問題文」を選べる＝良い罠が作れる）
//   3. それらの組み合わせで作れる合体語（2〜3枚）を探す
//
// 良い罠の条件（ユーザー指摘）:
//   - 同カテゴリの兄弟概念であること（山を問う問題に県の札は罠にならない）
//   - 問題文の限定句で明確に切れること（蜂を問う問題にミツバチ札は出題不備）
//   兄弟語は分類語彙表(corpus.bunruidb)の class_number 一致で機械的に検出する。
//
// 出力: mined/pool.json { words:[...], siblings:{...}, compounds2:[...], compounds3:[...] }
import fs from "fs";
import path from "path";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const MINED = path.join(DIR, "mined");

const kataToHira = (s) =>
  String(s).replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const KANA_RE = /^[ぁ-ゔー]+$/;

function loadJsonl(file) {
  return fs
    .readFileSync(path.join(MINED, file), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// ---------- 1. クイズの答え読み → 問題リスト ----------
console.error("loading quizzes3...");
const byReading = new Map();
for (const row of loadJsonl("quizzes3.jsonl")) {
  const reading = kataToHira(String(row.read ?? "").trim());
  if (!KANA_RE.test(reading)) continue;
  if (!row.q || row.q.length < 12) continue;
  const n = row.n ?? 0;
  const item = {
    id: row.id,
    q: row.q,
    ans: String(row.ans ?? ""),
    n,
    acc: n >= 20 ? +((row.c ?? 0) / n).toFixed(2) : null,
  };
  if (!byReading.has(reading)) byReading.set(reading, []);
  byReading.get(reading).push(item);
}

/**
 * 読みが表示答えの「完全な読み」かの推定。
 * 表示答えがかな/カナのみなら読みと一致するはず。漢字を含む場合は
 * 「漢字1文字あたり1〜3かな」の範囲に収まるかで粗く判定する。
 */
function looksFullReading(ans, reading) {
  const a = String(ans).replace(/[『』「」（）()・\s]/g, "");
  if (!a) return false;
  const kanaOnly = kataToHira(a);
  if (KANA_RE.test(kanaOnly)) return kanaOnly === reading;
  const kanji = [...a].filter((c) => /[一-鿿]/.test(c)).length;
  const kanaInAns = [...a].filter((c) => /[ぁ-ゔァ-ヶー]/.test(c)).length;
  const other = [...a].length - kanji - kanaInAns; // 数字・記号など
  const min = kanji * 1 + kanaInAns + other * 1;
  const max = kanji * 4 + kanaInAns + other * 4;
  return reading.length >= min && reading.length <= max;
}

// ---------- 2. 頻出ワードプール ----------
// core = 2問以上作れる語（手札の核。問題文を選べるので罠設計の自由度が高い）
// usable = 1問でも作れる語（合体語の部品として使える）
const MIN_Q = Number(process.env.MIN_Q ?? 1);
const words = [];
for (const [reading, list] of byReading) {
  if (reading.length < 2 || reading.length > 7) continue;
  const full = list.filter((x) => looksFullReading(x.ans, reading));
  if (full.length < MIN_Q) continue;
  full.sort((a, b) => b.n - a.n);
  // 表示答えの代表（最頻）
  const dispCount = new Map();
  for (const x of full) dispCount.set(x.ans, (dispCount.get(x.ans) ?? 0) + 1);
  const display = [...dispCount.entries()].sort((a, b) => b[1] - a[1])[0][0];
  words.push({
    r: reading,
    display,
    qCount: full.length,
    maxN: full[0].n,
    qs: full.slice(0, 8),
  });
}
words.sort((a, b) => b.qCount - a.qCount || b.maxN - a.maxN);
console.error(`word pool (2問以上作れる読み): ${words.length}`);

const poolReadings = new Set(words.map((w) => w.r));
const wordByReading = new Map(words.map((w) => [w.r, w]));

// ---------- 3. 兄弟語（同カテゴリ）検出 ----------
console.error("loading bunruidb for sibling detection...");
// 意味分類の索引。**読みだけで引くと同音異義語のノイズが入る**ため
// （例: 「かんぞう」は 肝臓 と 甘草 の両方に一致し、肝臓の罠に ほうれんそう が出る）、
// 可能な限り表記（headword）で引く。
const coreReadings = new Set(words.filter((w) => w.qCount >= 2).map((w) => w.r));
const norm = (x) => String(x ?? "").replace(/[−▽△〔〕・（）()『』「」\s]/g, "");

const classByWord = new Map(); // 表記 -> Set(class)
const classByReading = new Map(); // 読み -> Set(class)（表記で引けないときの保険）
const membersOf = new Map(); // class -> Set(読み)。プール語のみ
for (const row of loadJsonl("bunruidb.jsonl")) {
  const reading = kataToHira(String(row.read ?? "").trim());
  if (!KANA_RE.test(reading)) continue;
  const cls = String(row.cls ?? "");
  if (!cls) continue;
  const hw = norm(row.hw);
  if (hw) {
    if (!classByWord.has(hw)) classByWord.set(hw, new Set());
    classByWord.get(hw).add(cls);
  }
  if (!classByReading.has(reading)) classByReading.set(reading, new Set());
  classByReading.get(reading).add(cls);
  if (coreReadings.has(reading)) {
    if (!membersOf.has(cls)) membersOf.set(cls, new Set());
    membersOf.get(cls).add(reading);
  }
}

/**
 * 同じ意味分類に属する「core語」を返す（＝同カテゴリの罠候補）。
 * display（漢字表記）が分かる場合はそれで引くことで同音異義語のノイズを避ける。
 */
function siblingsOf(reading, display) {
  const d = norm(display);
  const classes =
    (d && classByWord.get(d)) ||
    (d && classByWord.get(d.replace(/(の部|作用|実験|地方|時代|運動)$/, ""))) ||
    classByReading.get(reading) ||
    new Set();
  const sib = new Set();
  for (const cls of classes) {
    for (const other of membersOf.get(cls) ?? []) if (other !== reading) sib.add(other);
  }
  return [...sib];
}

const siblings = {};
for (const w of words) {
  const s = siblingsOf(w.r, w.display);
  if (s.length) siblings[w.r] = s.slice(0, 40);
}
console.error(`readings with sibling traps: ${Object.keys(siblings).length}`);

// ---------- 4. プール語の組み合わせで作れる合体語 ----------
const compounds2 = [];
const compounds3 = [];
for (const [reading, list] of byReading) {
  const L = reading.length;
  if (L < 4 || L > 14) continue;
  const full = list.filter((x) => looksFullReading(x.ans, reading));
  if (full.length === 0) continue;
  full.sort((a, b) => b.n - a.n);
  const best = full[0];
  if (best.n < 100) continue;

  for (let i = 1; i < L; i++) {
    const p1 = reading.slice(0, i);
    const p2 = reading.slice(i);
    if (poolReadings.has(p1) && poolReadings.has(p2)) {
      compounds2.push({
        r: reading,
        parts: [p1, p2],
        display: best.ans,
        q: best.q,
        id: best.id,
        n: best.n,
        acc: best.acc,
        partQ: [wordByReading.get(p1).qCount, wordByReading.get(p2).qCount],
        sib: siblingsOf(reading, best.ans).slice(0, 12), // 合体語そのものの兄弟＝罠候補
      });
    }
    for (let j = i + 1; j < L; j++) {
      const a = reading.slice(0, i);
      const b = reading.slice(i, j);
      const c = reading.slice(j);
      if (poolReadings.has(a) && poolReadings.has(b) && poolReadings.has(c)) {
        compounds3.push({
          r: reading,
          parts: [a, b, c],
          display: best.ans,
          q: best.q,
          id: best.id,
          n: best.n,
          acc: best.acc,
          partQ: [
            wordByReading.get(a).qCount,
            wordByReading.get(b).qCount,
            wordByReading.get(c).qCount,
          ],
          prefixPair: byReading.has(reading.slice(0, j)) ? reading.slice(0, j) : null,
          sib: siblingsOf(reading, best.ans).slice(0, 12),
        });
      }
    }
  }
}
const score = (x) => x.partQ.reduce((s, v) => s + Math.min(v, 12), 0) + Math.min(x.n / 1000, 10);
compounds2.sort((a, b) => score(b) - score(a));
compounds3.sort(
  (a, b) => (b.prefixPair ? 8 : 0) + score(b) - ((a.prefixPair ? 8 : 0) + score(a))
);
console.error(`compounds2: ${compounds2.length}, compounds3: ${compounds3.length}`);

fs.writeFileSync(
  path.join(MINED, "pool.json"),
  JSON.stringify({ words, siblings, compounds2, compounds3 })
);

// ---------- レポート ----------
const core = words.filter((w) => w.qCount >= 2);
console.error(`core(2問以上): ${core.length}`);
console.error("\n--- 合体語(2枚): 両部品がcoreのもの 上位40 ---");
const c2core = compounds2.filter((c) => c.partQ.every((v) => v >= 2));
console.error(`該当 ${c2core.length}件`);
for (const c of c2core.slice(0, 40)) {
  console.error(`${c.display}(${c.r}) = ${c.parts.join("+")} [${c.partQ.join(",")}] n=${c.n}`);
}
console.error("\n--- 合体語(3枚) 上位20 ---");
for (const c of compounds3.slice(0, 20)) {
  console.error(
    `${c.display}(${c.r}) = ${c.parts.join("+")} [${c.partQ.join(",")}] n=${c.n}${c.prefixPair ? " 発展:" + c.prefixPair : ""}`
  );
}
