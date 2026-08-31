// セット骨格探索: LLM評価済みのpicksから、再利用を最大化した
// 「3枚合体1 + 2枚合体8 + 単独11」の骨格を探索し、A/B/Cへのカード彩色まで行う。
// 出力: tools/mined/skeletons.json （設計エージェントへの入力）
import fs from "fs";
import path from "path";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const MINED = path.join(DIR, "mined");
const PICKS = path.join(MINED, "picks");

// ---------- 読み込み ----------
function loadPicks(prefix) {
  const files = fs.readdirSync(PICKS).filter((f) => f.startsWith(prefix) && f.endsWith(".picks.json"));
  const all = [];
  for (const f of files) {
    try {
      const arr = JSON.parse(fs.readFileSync(path.join(PICKS, f), "utf8"));
      if (Array.isArray(arr)) all.push(...arr);
    } catch (e) {
      console.error(`skip ${f}: ${e.message}`);
    }
  }
  return all;
}

const num = (x, d = 3) => (typeof x === "number" && !isNaN(x) ? x : d);

function dedupeByReading(arr, better) {
  const map = new Map();
  for (const x of arr) {
    if (!x || !x.reading || !x.split) continue;
    const prev = map.get(x.reading);
    if (!prev || better(x) > better(prev)) map.set(x.reading, x);
  }
  return [...map.values()];
}

const qual = (x) => num(x.fame) + num(x.guessable) + num(x.splitNatural);

const doubles = dedupeByReading(loadPicks("doubles"), qual).filter(
  (d) => d.split.split("+").length === 2 && d.split.replace("+", "") === d.reading
);
const triples = dedupeByReading(loadPicks("triples"), qual).filter(
  (t) => t.split.split("+").length === 3 && t.split.replaceAll("+", "") === t.reading
);
const singlesRaw = loadPicks("singles").filter((s) => s && s.reading);
const singlesMap = new Map();
for (const s of singlesRaw) if (!singlesMap.has(s.reading)) singlesMap.set(s.reading, s);

console.error(`doubles=${doubles.length} triples=${triples.length} singles=${singlesMap.size}`);

const doubleByReading = new Map(doubles.map((d) => [d.reading, d]));
const parts = (x) => x.split.split("+");

// ---------- 彩色（combo部品を A/B/C に配る） ----------
// 制約: 同一comboの部品は相異なるプレイヤー。同名カードは同一プレイヤー(共有ノード)。
// 容量: 1人あたりcombo部品 <= 7 (単独+引っかけの枠を残す)
function colorBundle(combos, rng) {
  const nodes = new Map(); // card -> node index
  for (const c of combos) for (const p of parts(c)) if (!nodes.has(p)) nodes.set(p, nodes.size);
  const n = nodes.size;
  const adj = Array.from({ length: n }, () => new Set());
  for (const c of combos) {
    const ps = parts(c).map((p) => nodes.get(p));
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) {
        if (ps[i] === ps[j]) return null; // 同一combo内に同名部品 → 不成立
        adj[ps[i]].add(ps[j]);
        adj[ps[j]].add(ps[i]);
      }
  }
  const order = [...nodes.values()].sort((a, b) => adj[b].size - adj[a].size);
  const color = new Array(n).fill(-1);
  const cap = [7, 7, 7];
  function bt(i) {
    if (i === n) return true;
    const v = order[i];
    const start = Math.floor(rng() * 3);
    for (let k = 0; k < 3; k++) {
      const c = (start + k) % 3;
      if (cap[c] === 0) continue;
      let ok = true;
      for (const u of adj[v]) if (color[u] === c) ok = false;
      if (!ok) continue;
      color[v] = c;
      cap[c]--;
      if (bt(i + 1)) return true;
      color[v] = -1;
      cap[c]++;
    }
    return false;
  }
  if (!bt(0)) return null;
  const roleOf = {};
  const names = ["A", "B", "C"];
  for (const [card, idx] of nodes) roleOf[card] = names[color[idx]];
  return roleOf;
}

// 乱数（シード付き、再現可能）
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 骨格探索 ----------
const skeletons = [];
const topTriples = triples
  .slice()
  .sort((a, b) => (b.prefixPair ? 3 : 0) + qual(b) - ((a.prefixPair ? 3 : 0) + qual(a)))
  .slice(0, 80);

for (const T of topTriples) {
  const rng = mulberry32(T.reading.length * 7919 + T.reading.charCodeAt(0));
  const usedReadings = new Set([T.reading]);
  const combos = [T];
  const cardSet = new Set(parts(T));

  // 発展演出: T の先頭2部品連結が doubles にあれば必ず入れる
  const prefixPair = T.prefixPair && doubleByReading.get(T.prefixPair);
  if (prefixPair && !usedReadings.has(prefixPair.reading)) {
    combos.push(prefixPair);
    usedReadings.add(prefixPair.reading);
    for (const p of parts(prefixPair)) cardSet.add(p);
  }

  // 貪欲に doubles を追加（再利用ボーナス + 品質）
  while (combos.length < 9) {
    let best = null;
    let bestScore = -1;
    for (const d of doubles) {
      if (usedReadings.has(d.reading)) continue;
      // 合体語自体が既存カードと同名になるのは禁止
      if (cardSet.has(d.reading)) continue;
      const ps = parts(d);
      if (ps[0] === ps[1]) continue;
      const shared = ps.filter((p) => cardSet.has(p)).length;
      const fresh = ps.length - shared;
      // カード枠の見積り: combo部品の総数が21を超えない
      if (cardSet.size + fresh > 21) continue;
      const reuseBonus = shared * 4 + (num(d.reuse1, 0) || num(d.reuse2, 0) ? 1.5 : 0);
      const score = reuseBonus + qual(d) + rng() * 0.5;
      if (score > bestScore) {
        const trial = [...combos, d];
        if (colorBundle(trial, mulberry32(42)) !== null) {
          best = d;
          bestScore = score;
        }
      }
    }
    if (!best) break;
    combos.push(best);
    usedReadings.add(best.reading);
    for (const p of parts(best)) cardSet.add(p);
  }
  if (combos.length < 9) continue;

  // 彩色（複数トライしてペアバランス最良を採用）
  let bestColoring = null;
  let bestBalance = Infinity;
  for (let t = 0; t < 40; t++) {
    const coloring = colorBundle(combos, mulberry32(t * 1013 + 7));
    if (!coloring) continue;
    const pairCount = { "A+B": 0, "A+C": 0, "B+C": 0 };
    for (const c of combos.slice(1)) {
      if (parts(c).length !== 2) continue;
      const rs = parts(c).map((p) => coloring[p]).sort().join("+");
      if (pairCount[rs] !== undefined) pairCount[rs]++;
    }
    const vals = Object.values(pairCount);
    const balance = Math.max(...vals) - Math.min(...vals);
    if (balance < bestBalance) {
      bestBalance = balance;
      bestColoring = { coloring, pairCount };
    }
  }
  if (!bestColoring) continue;

  // 単独候補: combo部品のうち単独問題にもなるもの（再利用ゴールド）
  const reusableSingles = [...cardSet].filter((p) => singlesMap.has(p));

  // スコア: 再利用数 + 品質
  const partUses = combos.flatMap(parts);
  const reuseCount = partUses.length - cardSet.size + reusableSingles.length;
  const avgQual = combos.reduce((s, c) => s + qual(c), 0) / combos.length;
  const score = reuseCount * 3 + avgQual * 2 + (prefixPair ? 6 : 0) - bestBalance;

  skeletons.push({
    score: +score.toFixed(1),
    triple: T,
    doubles: combos.slice(1),
    coloring: bestColoring.coloring,
    pairCount: bestColoring.pairCount,
    comboCards: [...cardSet],
    reusableSingles: reusableSingles.map((p) => singlesMap.get(p)),
    escalation: prefixPair ? prefixPair.reading : null,
  });
}

skeletons.sort((a, b) => b.score - a.score);

// 上位から、合体語が重複しない骨格を選抜（5セット分 + 予備）
const chosen = [];
const globalReadings = new Set();
for (const sk of skeletons) {
  const rs = [sk.triple.reading, ...sk.doubles.map((d) => d.reading)];
  if (rs.some((r) => globalReadings.has(r))) continue;
  chosen.push(sk);
  for (const r of rs) globalReadings.add(r);
  if (chosen.length >= 10) break;
}

// 汎用の単独プール（骨格外からの補充用）も添付
const singlesPool = [...singlesMap.values()]
  .sort((a, b) => num(a.difficulty) - num(b.difficulty))
  .slice(0, 400);

fs.writeFileSync(
  path.join(MINED, "skeletons.json"),
  JSON.stringify({ skeletons: chosen, singlesPool }, null, 1)
);
console.error(`skeletons: ${skeletons.length} generated, ${chosen.length} chosen`);
for (const sk of chosen) {
  console.error(
    `  [${sk.score}] ${sk.triple.reading} (${sk.triple.split})${sk.escalation ? " ←発展:" + sk.escalation : ""} | doubles: ${sk.doubles.map((d) => d.split).join(", ")} | pairs: ${JSON.stringify(sk.pairCount)} | 再利用単独候補: ${sk.reusableSingles.map((s) => s.reading).join(",")}`
  );
}
