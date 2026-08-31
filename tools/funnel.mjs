// キュレーション用ファネル: 採掘結果を品質フィルタし、エージェントが評価する
// チャンクファイル (mined/chunks/*.json) に分割する。
import fs from "fs";
import path from "path";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const MINED = path.join(DIR, "mined");
const CHUNKS = path.join(MINED, "chunks");
fs.mkdirSync(CHUNKS, { recursive: true });

const read = (f) => JSON.parse(fs.readFileSync(path.join(MINED, f), "utf8"));

function okPart(p, isSuffix) {
  if (p.s.length >= 2) return p.cls !== "free" || p.s.length <= 3;
  // 1文字部品: 「ん」等のサフィックス、または他問題の答えになっている場合のみ
  return (isSuffix && p.s === "ん") || p.cls === "qa";
}

// ---------- 2分割 ----------
const combos2 = read("combos2.json");
const d = combos2.filter((c) => {
  if (c.score < 4) return false;
  const q = c.qs[0];
  if (q.n < 300) return false;
  if (q.acc !== null && q.acc < 0.2) return false;
  const L = c.reading.length;
  if (L < 4 || L > 11) return false;
  if (!okPart(c.parts[0], false) || !okPart(c.parts[1], true)) return false;
  return true;
});
// 同一readingの分割違いをまとめてスコア順
d.sort((a, b) => b.score - a.score || b.qs[0].n - a.qs[0].n);
const seen = new Map();
for (const c of d) {
  if (!seen.has(c.reading)) seen.set(c.reading, []);
  if (seen.get(c.reading).length < 2) seen.get(c.reading).push(c);
}
const doubles = [...seen.values()].flat();
console.error(`doubles after funnel: ${doubles.length}`);

// ---------- 3分割 ----------
const combos3 = read("combos3.json");
const t = combos3.filter((c) => {
  const q = c.qs[0];
  if (q.n < 300) return false;
  if (q.acc !== null && q.acc < 0.2) return false;
  if (c.reading.length < 6 || c.reading.length > 14) return false;
  const [p1, p2, p3] = c.parts;
  if (!okPart(p1, false) || !okPart(p2, false) || !okPart(p3, true)) return false;
  if (c.parts.filter((p) => p.cls === "free").length > 0 && c.score < 5) return false;
  return true;
});
t.sort(
  (a, b) =>
    (b.prefixPairIsAnswer ? 1 : 0) - (a.prefixPairIsAnswer ? 1 : 0) ||
    b.score - a.score ||
    b.qs[0].n - a.qs[0].n
);
const seen3 = new Map();
for (const c of t) {
  if (!seen3.has(c.reading)) seen3.set(c.reading, []);
  if (seen3.get(c.reading).length < 2) seen3.get(c.reading).push(c);
}
const triples = [...seen3.values()].flat().slice(0, 400);
console.error(`triples after funnel: ${triples.length}`);

// ---------- 単独 ----------
const singles = read("singles.json");
const s = singles.filter((x) => {
  const q = x.qs[0];
  if (q.n < 2000) return false;
  if (q.acc !== null && q.acc < 0.35) return false;
  return x.len >= 2 && x.len <= 8;
});
console.error(`singles after funnel: ${s.length}`);

// ---------- チャンク書き出し ----------
function writeChunks(name, arr, size) {
  let i = 0,
    n = 0;
  while (i < arr.length) {
    fs.writeFileSync(
      path.join(CHUNKS, `${name}-${String(n).padStart(2, "0")}.json`),
      JSON.stringify(arr.slice(i, i + size), null, 1)
    );
    i += size;
    n++;
  }
  return n;
}

const nd = writeChunks("doubles", doubles, 260);
const nt = writeChunks("triples", triples, 200);
const ns = writeChunks("singles", s.slice(0, 2000), 500);
console.error(`chunks: doubles=${nd} triples=${nt} singles=${ns}`);
