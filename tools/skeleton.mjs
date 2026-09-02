// セット骨格ジェネレータ。
//
// 制約:
//  - 場のカードは席順(A→B→C)に並ぶため、合体語の部品は必ず role(p1) < role(p2) < ... となる
//    ＝ 各カードを A/B/C の3段階に割り当てる「順序付き3彩色」問題
//  - Q1〜Q5 は単独1枚、Q6〜Q20 は2枚以上の複合
//  - 各プレイヤー10枚
//  - 正答率(acc)で難易度のグラデーションをつける（セット内・セット間とも）
//
// 使い方: node tools/skeleton.mjs <setNumber 1-5> [候補数]
import fs from "fs";
import path from "path";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const pool = JSON.parse(fs.readFileSync(path.join(DIR, "mined", "pool.json"), "utf8"));
const wordByReading = new Map(pool.words.map((w) => [w.r, w]));

// --all: 5セット分をまとめて生成する（互いの答え・札を避けながら順に作る）。
// 単体指定時は既存の他セットを避ける。
const ALL = process.argv.includes("--all");
let currentSetNo = 1;
/** 役割ペア(A+B / A+C / B+C)それぞれの最低出現数。見つからなければ緩める */
let MIN_PAIR = 3;
const setNo = ALL ? 0 : Number(process.argv[2] || 1);
const WANT = Number(process.argv[3] || 3);

// ---------- 難易度 ----------
// セット間の難易度差はつけない。どのセットも「Q1が最も易しく、Q20に向けて難しくなる」。
// 単独5問(Q1〜Q5)は易しい側、複合14問(Q6〜Q19)は易→難へ滑らかに下降させる。
// 正答率0.3未満は「知らないと解けない」領域になりやすいので下限とする。
const band = { lo: 0.32, hi: 1.0, single: 0.68 };
/** 複合14問それぞれの目標正答率（易→難）。最難問でも0.36程度に留める */
const TARGET_ACC = Array.from({ length: 14 }, (_, i) => 0.8 - (i * (0.8 - 0.36)) / 13);

// ---------- 使用済みの答え・カード（セット間の重複を避ける） ----------
const used = new Set();
const usedCards = new Set();
const setsDir = path.join(DIR, "..", "data", "sets");
if (!ALL) {
  for (const f of fs.readdirSync(setsDir).filter((x) => x.endsWith(".json"))) {
    if (f === `set${setNo}.json`) continue;
    const s = JSON.parse(fs.readFileSync(path.join(setsDir, f), "utf8"));
    for (const q of s.questions) used.add(q.answerReading);
    for (const r of ["A", "B", "C"]) for (const c of s.hands[r]) usedCards.add(c);
  }
}

// ---------- 候補 ----------
const okCompound = (c) =>
  c.acc !== null &&
  c.acc >= band.lo &&
  c.acc <= band.hi &&
  !used.has(c.r) &&
  c.parts.every((p) => p.length >= 1 && p.length <= 6 && !usedCards.has(p)) &&
  new Set(c.parts).size === c.parts.length;

/**
 * 部品の「カードとしての自然さ」。
 * その部品自体を答えとするクイズが多いほど、語として確立している
 * （＝手札にあっても不自然でなく、単独問題にも罠にもできる）。
 */
const partScore = (p) => {
  const w = wordByReading.get(p);
  if (!w) return 0;
  if (w.qCount >= 3) return 3;
  if (w.qCount === 2) return 2;
  return 1;
};
const quality = (c) => c.parts.reduce((s, p) => s + partScore(p), 0) / c.parts.length;
// すべての部品が「2問以上作れる確立した語」であることを要求する。
// これを満たさない分割（例: サンガリア = さん+がりあ）はカードとして不自然。
const allPartsSolid = (c) => c.parts.every((p) => partScore(p) >= 2);
const NATURAL = 1.5;
/** 同じ部品を使い回せる上限（1枚の札が問題を占有しすぎないように） */
const MAX_PART_USE = 3;

// 候補が足りない場合はバンドを段階的に広げる（難易度の狙いは保ちつつ実現可能性を優先）
let cand2 = [];
let cand3 = [];
function computeCandidates(label) {
  let widen = 0;
  for (; widen <= 5; widen += 1) {
    const w = widen * 0.03;
    const lo = Math.max(0, band.lo - w);
    const hi = Math.min(1, band.hi + w);
    const ok = (c) =>
      c.acc !== null &&
      c.acc >= lo &&
      c.acc <= hi &&
      // 答えの重複は避ける。カードの語自体は別セットと共有してよい
      // （セットは独立したゲームなので、同じ語が別の問題に使われても問題ない）
      !used.has(c.r) &&
      c.parts.every((p) => p.length >= 1 && p.length <= 6) &&
      new Set(c.parts).size === c.parts.length &&
      quality(c) >= NATURAL &&
      allPartsSolid(c);
    cand2 = pool.compounds2.filter(ok);
    cand3 = pool.compounds3.filter(ok);
    if (cand2.length >= 45 && cand3.length >= 2) break;
  }
  console.error(`${label}: 候補 2枚=${cand2.length} 3枚=${cand3.length}`);
}

// ---------- 順序付き3彩色ソルバー ----------
/**
 * compounds: [{parts:[...]}]  部品は必ず role が昇順になる必要がある
 * 返り値: Map(card -> 1|2|3) または null
 */
function assignLevels(compounds, capacity = 10) {
  const nodes = [...new Set(compounds.flatMap((c) => c.parts))];
  const idx = new Map(nodes.map((n, i) => [n, i]));
  const succ = nodes.map(() => new Set());
  const pred = nodes.map(() => new Set());
  for (const c of compounds) {
    for (let i = 0; i + 1 < c.parts.length; i++) {
      for (let j = i + 1; j < c.parts.length; j++) {
        const u = idx.get(c.parts[i]);
        const v = idx.get(c.parts[j]);
        if (u === v) return null;
        succ[u].add(v);
        pred[v].add(u);
      }
    }
  }

  // 到達可能性から各ノードの取りうる段階の範囲を求める
  const memoDown = new Array(nodes.length).fill(-1);
  const depthDown = (v, seen = new Set()) => {
    if (memoDown[v] >= 0) return memoDown[v];
    if (seen.has(v)) return Infinity; // 循環 → 不成立
    seen.add(v);
    let d = 0;
    for (const u of succ[v]) d = Math.max(d, 1 + depthDown(u, seen));
    seen.delete(v);
    memoDown[v] = d;
    return d;
  };
  const memoUp = new Array(nodes.length).fill(-1);
  const depthUp = (v, seen = new Set()) => {
    if (memoUp[v] >= 0) return memoUp[v];
    if (seen.has(v)) return Infinity;
    seen.add(v);
    let d = 0;
    for (const u of pred[v]) d = Math.max(d, 1 + depthUp(u, seen));
    seen.delete(v);
    memoUp[v] = d;
    return d;
  };

  const lo = [];
  const hi = [];
  for (let v = 0; v < nodes.length; v++) {
    const up = depthUp(v);
    const down = depthDown(v);
    if (!isFinite(up) || !isFinite(down)) return null;
    lo[v] = 1 + up;
    hi[v] = 3 - down;
    if (lo[v] > hi[v]) return null;
  }

  const level = new Array(nodes.length).fill(0);
  const count = [0, 0, 0, 0];
  const order = [...nodes.keys()].sort((a, b) => hi[a] - lo[a] - (hi[b] - lo[b]));

  const ok = (v, L) => {
    for (const u of pred[v]) if (level[u] && level[u] >= L) return false;
    for (const u of succ[v]) if (level[u] && level[u] <= L) return false;
    return true;
  };
  const bt = (i) => {
    if (i === order.length) return true;
    const v = order[i];
    for (let L = lo[v]; L <= hi[v]; L++) {
      if (count[L] >= capacity) continue;
      if (!ok(v, L)) continue;
      level[v] = L;
      count[L]++;
      if (bt(i + 1)) return true;
      level[v] = 0;
      count[L]--;
    }
    return false;
  };
  if (!bt(0)) return null;

  const res = new Map();
  for (const [card, i] of idx) res.set(card, level[i]);
  return res;
}

// ---------- 骨格探索 ----------
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function build(seedNo) {
  const rng = mulberry32(seedNo * 7919 + setNo * 131);
  // 決め所: 3枚合体を1つ
  const triples = cand3.slice().sort((a, b) => (b.prefixPair ? 1 : 0) - (a.prefixPair ? 1 : 0) || b.n - a.n);
  const T = triples[Math.floor(rng() * Math.min(triples.length, 25))];
  if (!T) return null;

  const chosen = [T];
  const readings = new Set([T.r]);
  const cards = new Set(T.parts);
  const partUse = new Map(T.parts.map((p) => [p, 1]));

  // 2枚合体を14個。各スロットの目標正答率（易→難）に近いものを選び、
  // 再利用が起きる候補を優先する。毎回 A→B→C 彩色の可能性を確認する。
  const remaining = new Set(cand2);
  for (const target of TARGET_ACC) {
    if (chosen.length >= 15) break;
    const scored = [];
    for (const c of remaining) {
      if (readings.has(c.r) || cards.has(c.r)) continue;
      if (c.parts.some((p) => (partUse.get(p) ?? 0) >= MAX_PART_USE)) continue;
      if (c.parts.some((p) => !cards.has(p)) && cards.size >= 25) continue;
      const shared = c.parts.filter((p) => cards.has(p)).length;
      const dist = Math.abs((c.acc ?? 0) - target);
      // 目標正答率への近さを最重視し、再利用と部品の自然さで加点
      scored.push({ c, score: -dist * 10 + shared * 1.2 + quality(c) * 0.3 + rng() * 0.25 });
    }
    scored.sort((a, b) => b.score - a.score);
    for (const { c } of scored.slice(0, 12)) {
      if (assignLevels([...chosen, c]) === null) continue;
      chosen.push(c);
      readings.add(c.r);
      for (const p of c.parts) {
        cards.add(p);
        partUse.set(p, (partUse.get(p) ?? 0) + 1);
      }
      remaining.delete(c);
      break;
    }
  }
  if (chosen.length < 15) return null;

  const levels = assignLevels(chosen);
  if (!levels) return null;
  const roleName = ["", "A", "B", "C"];

  // 単独5問: 合体部品のうち単独問題も作れる語を優先（再利用）
  const perRole = { A: [], B: [], C: [] };
  for (const [card, L] of levels) perRole[roleName[L]].push(card);

  const singleCands = [...cards]
    .map((c) => wordByReading.get(c))
    .filter(Boolean)
    .filter((w) => w.qs.some((q) => q.acc !== null && q.acc >= band.single))
    .sort((a, b) => b.qCount - a.qCount);

  const singles = [];
  const usedSingleRoles = [];
  for (const w of singleCands) {
    if (singles.length >= 5) break;
    const role = roleName[levels.get(w.r)];
    // 5問が1人に偏らないよう、同じ人は最大2問まで
    if (usedSingleRoles.filter((r) => r === role).length >= 2) continue;
    singles.push({ reading: w.r, role, qCount: w.qCount, best: w.qs.filter((q) => q.acc !== null && q.acc >= band.single)[0] });
    usedSingleRoles.push(role);
  }
  if (singles.length < 5) return null;

  // 役割ペアの偏りを棄却（A+B ばかりになると C の出番が無くなる）
  {
    const pairCount = { "A+B": 0, "A+C": 0, "B+C": 0 };
    for (const c of chosen) {
      if (c.parts.length !== 2) continue;
      const key = c.parts.map((p) => roleName[levels.get(p)]).join("+");
      if (pairCount[key] !== undefined) pairCount[key]++;
    }
    if (Object.values(pairCount).some((v) => v < MIN_PAIR)) return null;
  }

  // 難易度順（易→難）に並べる
  const sortedCompounds = chosen
    .filter((c) => c !== T)
    .sort((a, b) => (b.acc ?? 0) - (a.acc ?? 0));
  singles.sort((a, b) => (b.best.acc ?? 0) - (a.best.acc ?? 0));

  const freeSlots = { A: 10 - perRole.A.length, B: 10 - perRole.B.length, C: 10 - perRole.C.length };
  const accs = [...singles.map((s) => s.best.acc), ...sortedCompounds.map((c) => c.acc), T.acc];
  // Q1〜Q19の正答率が単調に下がっているか（逆転の数。少ないほど良い）
  const seq = [...singles.map((s) => s.best.acc), ...sortedCompounds.map((c) => c.acc)];
  let inversions = 0;
  for (let i = 0; i + 1 < seq.length; i++) if (seq[i] < seq[i + 1] - 0.12) inversions++;
  const spread = +(Math.max(...seq) - Math.min(...seq)).toFixed(2);

  return {
    setNo: currentSetNo,
    finale: { reading: T.r, display: T.display, parts: T.parts, acc: T.acc, q: T.q, id: T.id, prefixPair: T.prefixPair },
    compounds: sortedCompounds.map((c) => ({
      reading: c.r,
      display: c.display,
      parts: c.parts,
      roles: c.parts.map((p) => roleName[levels.get(p)]),
      acc: c.acc,
      q: c.q,
      id: c.id,
    })),
    finaleRoles: T.parts.map((p) => roleName[levels.get(p)]),
    singles,
    hands: perRole,
    freeSlots,
    avgAcc: +(accs.reduce((s, a) => s + a, 0) / accs.length).toFixed(3),
    reuse: chosen.flatMap((c) => c.parts).length - cards.size,
    quality: +(chosen.reduce((s, c) => s + quality(c), 0) / chosen.length).toFixed(2),
    inversions,
    spread,
  };
}

// ---------- 実行 ----------
function runOne(n, want) {
  currentSetNo = n;
  computeCandidates(`set${n}`);
  let results = [];
  for (MIN_PAIR = 3; MIN_PAIR >= 1; MIN_PAIR--) {
    results = [];
    for (let seed = 1; seed <= 600 && results.length < want; seed++) {
      const r = build(seed);
      if (r) results.push(r);
    }
    if (results.length > 0) break;
  }
  if (results.length === 0) {
    console.error(`set${n}: 骨格が見つかりませんでした`);
    return null;
  }
  if (MIN_PAIR < 3) console.error(`set${n}: 役割ペアの最低数を ${MIN_PAIR} に緩めました`);
  // 難易度の幅が広く逆転が少ないものを優先し、次いで自然さ・再利用
  results.sort(
    (a, b) =>
      b.spread - a.spread - (b.inversions - a.inversions) * 0.05 ||
      b.quality - a.quality ||
      b.reuse - a.reuse
  );
  fs.writeFileSync(
    path.join(DIR, "mined", `skeleton-set${n}.json`),
    JSON.stringify(results, null, 1)
  );
  const r = results[0];
  console.log(
    `\n=== set${n} 骨格（難易度の幅${r.spread} / 逆転${r.inversions} / 自然さ${r.quality} / 再利用${r.reuse}） ===`
  );
  console.log(`空き枠 A:${r.freeSlots.A} B:${r.freeSlots.B} C:${r.freeSlots.C}`);
  console.log("単独5問(易→難):");
  for (const x of r.singles)
    console.log(`  ${x.role}:${x.reading} acc=${x.best.acc} 「${x.best.q.slice(0, 34)}」`);
  console.log("複合14問(易→難):");
  for (const c of r.compounds)
    console.log(
      `  ${c.display}(${c.reading}) = ${c.roles.map((ro, i) => ro + ":" + c.parts[i]).join(" + ")} acc=${c.acc}`
    );
  console.log(
    `決め所: ${r.finale.display}(${r.finale.reading}) = ${r.finaleRoles
      .map((ro, i) => ro + ":" + r.finale.parts[i])
      .join(" + ")} acc=${r.finale.acc}`
  );
  console.error(`→ tools/mined/skeleton-set${n}.json に ${results.length} 件`);
  return r;
}

if (ALL) {
  for (let n = 1; n <= 5; n++) {
    const r = runOne(n, WANT);
    if (!r) continue;
    // 次のセットが同じ答え・札を使わないように記録する
    for (const x of r.singles) used.add(x.reading);
    for (const c of r.compounds) used.add(c.reading);
    used.add(r.finale.reading);
    for (const role of ["A", "B", "C"]) for (const c of r.hands[role]) usedCards.add(c);
  }
} else {
  runOne(setNo, WANT);
}
