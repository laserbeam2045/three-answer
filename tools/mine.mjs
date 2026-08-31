// 結合語採掘プログラム
// quizzes3 の答えの読みを2分割/3分割し、部品が「他問題の答え(qa)」「辞書語(word)」
// 「自由文字列(free)」のどれかを判定して候補を出力する。
import fs from "fs";
import path from "path";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const MINED = path.join(DIR, "mined");

function kataToHira(s) {
  return s.replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}
const KANA_RE = /^[ぁ-ゔー]+$/;

function normalizeReading(r) {
  if (!r) return null;
  const h = kataToHira(String(r).trim());
  return KANA_RE.test(h) ? h : null;
}

// ---------- 読み込み ----------
function loadJsonl(file) {
  return fs
    .readFileSync(file, "utf8")
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

console.error("loading quizzes3...");
const quizzes = [];
for (const row of loadJsonl(path.join(MINED, "quizzes3.jsonl"))) {
  const reading = normalizeReading(row.read);
  if (!reading) continue;
  if (!row.q || row.q.length < 10) continue;
  const n = row.n ?? 0;
  quizzes.push({
    id: row.id,
    q: row.q,
    ans: row.ans,
    reading,
    n,
    acc: n >= 5 ? (row.c ?? 0) / n : null, // 正答率（難易度指標）
    like: row.l ?? 0,
  });
}
console.error(`  ${quizzes.length} usable questions`);

// reading -> 代表問題（回答数順に最大5問）
const byReading = new Map();
for (const qz of quizzes) {
  if (!byReading.has(qz.reading)) byReading.set(qz.reading, []);
  byReading.get(qz.reading).push(qz);
}
for (const list of byReading.values()) list.sort((a, b) => b.n - a.n);

console.error("loading bunruidb...");
const wordSet = new Map(); // reading -> headwords(max3)
for (const row of loadJsonl(path.join(MINED, "bunruidb.jsonl"))) {
  const reading = normalizeReading(row.read);
  if (!reading || !row.hw) continue;
  const hw = String(row.hw).replace(/[−▽△〔〕]/g, "");
  if (!wordSet.has(reading)) wordSet.set(reading, []);
  const arr = wordSet.get(reading);
  if (arr.length < 3 && !arr.includes(hw)) arr.push(hw);
}
console.error(`  ${wordSet.size} distinct word readings`);

function classify(part) {
  if (byReading.has(part)) return "qa";
  if (wordSet.has(part)) return "word";
  return "free";
}

function partInfo(part) {
  const cls = classify(part);
  const info = { s: part, cls };
  if (cls === "qa") {
    info.qs = byReading.get(part).slice(0, 3).map(pickQ);
  } else if (cls === "word") {
    info.words = wordSet.get(part);
  }
  return info;
}

function pickQ(qz) {
  return { id: qz.id, q: qz.q, ans: qz.ans, n: qz.n, acc: qz.acc === null ? null : +qz.acc.toFixed(2) };
}

// ---------- 単独問題プール ----------
const singles = [];
for (const [reading, list] of byReading) {
  if (reading.length < 2 || reading.length > 10) continue;
  singles.push({ reading, len: reading.length, qs: list.slice(0, 5).map(pickQ) });
}
singles.sort((a, b) => b.qs[0].n - a.qs[0].n);
fs.writeFileSync(path.join(MINED, "singles.json"), JSON.stringify(singles));
console.error(`singles: ${singles.length}`);

// ---------- 2分割 ----------
const CLS_SCORE = { qa: 3, word: 1, free: 0 };
const combos2 = [];
for (const [reading, list] of byReading) {
  const L = reading.length;
  if (L < 3 || L > 12) continue;
  for (let i = 1; i < L; i++) {
    const p1 = reading.slice(0, i);
    const p2 = reading.slice(i);
    const c1 = classify(p1);
    const c2 = classify(p2);
    const score = CLS_SCORE[c1] + CLS_SCORE[c2];
    // 両方freeは没。片方1文字freeも、もう片方がqaなら許容（例: ぼっちゃ+ん）
    if (score === 0) continue;
    if (c1 === "free" && p1.length >= 4) continue;
    if (c2 === "free" && p2.length >= 4) continue;
    combos2.push({
      reading,
      parts: [partInfo(p1), partInfo(p2)],
      score,
      qs: list.slice(0, 3).map(pickQ),
    });
  }
}
combos2.sort((a, b) => b.score - a.score || b.qs[0].n - a.qs[0].n);
fs.writeFileSync(path.join(MINED, "combos2.json"), JSON.stringify(combos2));
console.error(`combos2: ${combos2.length}`);

// ---------- 3分割 ----------
const combos3 = [];
for (const [reading, list] of byReading) {
  const L = reading.length;
  if (L < 5 || L > 15) continue;
  for (let i = 1; i < L - 1; i++) {
    for (let j = i + 1; j < L; j++) {
      const p1 = reading.slice(0, i);
      const p2 = reading.slice(i, j);
      const p3 = reading.slice(j);
      const cs = [classify(p1), classify(p2), classify(p3)];
      const score = cs.reduce((s, c) => s + CLS_SCORE[c], 0);
      if (score < 4) continue; // 少なくとも qa+qa or qa+word相当
      if (cs.filter((c) => c === "free").length > 1) continue;
      const prefixPair = reading.slice(0, j);
      combos3.push({
        reading,
        parts: [partInfo(p1), partInfo(p2), partInfo(p3)],
        score,
        prefixPairIsAnswer: byReading.has(prefixPair) ? prefixPair : null,
        suffixPair: byReading.has(reading.slice(i)) ? reading.slice(i) : null,
        qs: list.slice(0, 3).map(pickQ),
      });
    }
  }
}
combos3.sort(
  (a, b) =>
    (b.prefixPairIsAnswer ? 1 : 0) - (a.prefixPairIsAnswer ? 1 : 0) ||
    b.score - a.score ||
    b.qs[0].n - a.qs[0].n
);
fs.writeFileSync(path.join(MINED, "combos3.json"), JSON.stringify(combos3));
console.error(`combos3: ${combos3.length}`);

// ---------- 再利用ファミリー（同じ部品が複数の合体語に登場） ----------
const partToCombos = new Map();
for (const c of combos2) {
  for (const p of c.parts) {
    if (p.cls === "free") continue;
    if (!partToCombos.has(p.s)) partToCombos.set(p.s, new Set());
    partToCombos.get(p.s).add(c.reading);
  }
}
const families = [];
for (const [part, set] of partToCombos) {
  if (set.size < 2) continue;
  families.push({
    part,
    cls: classify(part),
    partQs: byReading.has(part) ? byReading.get(part).slice(0, 2).map(pickQ) : [],
    combos: [...set].slice(0, 20),
    count: set.size,
  });
}
families.sort((a, b) => b.count - a.count);
fs.writeFileSync(path.join(MINED, "families.json"), JSON.stringify(families));
console.error(`families: ${families.length}`);

console.error("done.");
