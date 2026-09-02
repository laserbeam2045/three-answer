// セット骨格ジェネレータ（罠ファースト版）。
//
// 設計上の必須制約:
//  1. 出す順序: 場のカードは席順に並ぶため role(p1) < role(p2) < ... （順序付き3彩色）
//  2. 構成: Q1〜Q5 は単独1枚、Q6〜Q20 は2枚以上の複合
//  3. 難易度: セット内で正答率が単調に下降。下限 0.30
//  4. 公平性: どのプレイヤーも「自分の手札と問題文だけ」で出すか決められること。
//     自分の札が正解の読みの中に、自分の席順と矛盾しない位置で現れてはいけない。
//     例: 正解「しんぞう」でCが「ぞう」を持つ → Cは「誰かが しん を持つのでは」と
//     考えるのが合理的になり、出しても出さなくても筋が通る＝理不尽な判定になる。
//  5. 罠: 各問題に「答えと同カテゴリで、答えの候補になり得る札」を
//     正解に不要なプレイヤーの手札に用意する。
//     後付けだと質が落ちる（「将棋」の罠に「角」を置くような失敗をする）ため、
//     **答えの選定時点で同カテゴリの罠札が確保できるものだけを候補にする**。
//
// 使い方: node tools/skeleton.mjs <setNo 1-5> [候補数]  /  node tools/skeleton.mjs --all [候補数]
import fs from "fs";
import path from "path";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const pool = JSON.parse(fs.readFileSync(path.join(DIR, "mined", "pool.json"), "utf8"));
const wordByReading = new Map(pool.words.map((w) => [w.r, w]));
const coreReadings = new Set(pool.words.filter((w) => w.qCount >= 2).map((w) => w.r));

const ALL = process.argv.includes("--all");
const args = process.argv.slice(2).filter((a) => a !== "--all");
const WANT = Number(ALL ? args[0] : args[1]) || 2;
let currentSetNo = 1;

// ---------- 難易度 ----------
// セット間の難易度差はつけない。どのセットも Q1 が最も易しく Q20 に向けて難しくなる。
const MIN_ACC = 0.3;
const TARGET_ACC = Array.from({ length: 14 }, (_, i) => 0.8 - (i * (0.8 - 0.36)) / 13);
const SINGLE_MIN_ACC = 0.62;

// ---------- 使用済みの答え（セット間の重複回避） ----------
const used = new Set();
const setsDir = path.join(DIR, "..", "data", "sets");
if (!ALL) {
  for (const f of fs.readdirSync(setsDir).filter((x) => x.endsWith(".json"))) {
    if (f === `set${args[0]}.json`) continue;
    const s = JSON.parse(fs.readFileSync(path.join(setsDir, f), "utf8"));
    for (const q of s.questions) used.add(q.answerReading);
  }
}

// ---------- 部品の自然さ・具体性 ----------
// 「しん(信)」「そう(宗)」のような拘束形態素は、答えとしての回答者数(maxN)が
// 桁違いに少ない（信=493 に対し 桜=6851 / 虎=11820）。これを具体性の指標に使い、
// 本家の「ぱん・さんご・ぼっちゃ」のような手に取って楽しい札に寄せる。
// 見つからない場合は段階的に緩める（先に作るセットほど具体的な札になる）
let CONCRETE_MIN = 1000;
let CONCRETE_MIN_3 = 600;
const partScore = (p) => {
  const w = wordByReading.get(p);
  if (!w) return 0;
  const byCount = w.qCount >= 3 ? 3 : w.qCount === 2 ? 2 : 1;
  const byFame = w.maxN >= 4000 ? 3 : w.maxN >= 1500 ? 2 : w.maxN >= 700 ? 1 : 0;
  return (byCount + byFame) / 2;
};
const quality = (c) => c.parts.reduce((s, p) => s + partScore(p), 0) / c.parts.length;
const concrete = (c, floor) =>
  c.parts.every((p) => (wordByReading.get(p)?.maxN ?? 0) >= floor);
const NATURAL_2 = 1.5;
const NATURAL_3 = 1.0;
const MAX_PART_USE = 3;

/** その読みと同カテゴリで、かつカードとして成立する語（＝罠候補） */
function trapCandidates(reading) {
  return (pool.siblings[reading] ?? []).filter(
    (s) => coreReadings.has(s) && s !== reading && s.length >= 2 && s.length <= 7
  );
}

// ---------- 公平性 ----------
const ROLES = ["A", "B", "C"];
const beforeCount = { A: 0, B: 1, C: 2 };
const afterCount = { A: 2, B: 1, C: 0 };

/**
 * role が card を持っているとき、答え reading に対して判断不能にならないか。
 * requiredCard はその role がこの問題で出すべき札（無ければ null）。
 */
function isFair(reading, role, card, requiredCard) {
  if (card === requiredCard) return true;
  for (let at = reading.indexOf(card); at !== -1; at = reading.indexOf(card, at + 1)) {
    const preOk = at === 0 || beforeCount[role] >= 1;
    const sufOk = at + card.length === reading.length || afterCount[role] >= 1;
    if (preOk && sufOk) return false;
  }
  return true;
}

// ---------- 候補 ----------
let cand2 = [];
let cand3 = [];
function computeCandidates(label) {
  const ok = (c) =>
    c.acc !== null &&
    c.acc >= MIN_ACC &&
    !used.has(c.r) &&
    c.parts.every((p) => p.length >= 1 && p.length <= 6) &&
    new Set(c.parts).size === c.parts.length &&
    // 罠ファースト: 答えと同カテゴリの札が確保できる合体語だけを使う
    trapCandidates(c.r).length > 0;
  cand2 = pool.compounds2.filter(
    (c) => ok(c) && quality(c) >= NATURAL_2 && concrete(c, CONCRETE_MIN)
  );
  cand3 = pool.compounds3.filter(
    (c) => ok(c) && quality(c) >= NATURAL_3 && concrete(c, CONCRETE_MIN_3)
  );
  console.error(`${label}: 候補 2枚=${cand2.length} 3枚=${cand3.length}（罠が確保できるもののみ）`);
}

// ---------- 順序付き3彩色ソルバー ----------
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
  const memoDown = new Array(nodes.length).fill(-1);
  const depthDown = (v, seen = new Set()) => {
    if (memoDown[v] >= 0) return memoDown[v];
    if (seen.has(v)) return Infinity;
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

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let MIN_PAIR = 3;

// ---------- 骨格探索 ----------
function build(seedNo) {
  const rng = mulberry32(seedNo * 7919 + currentSetNo * 131);
  const triples = cand3
    .slice()
    .sort((a, b) => (b.prefixPair ? 1 : 0) - (a.prefixPair ? 1 : 0) || b.n - a.n);
  if (triples.length === 0) return null;
  const T = triples[Math.floor(rng() * Math.min(triples.length, 20))];

  const chosen = [T];
  const readings = new Set([T.r]);
  const cards = new Set(T.parts);
  const partUse = new Map(T.parts.map((p) => [p, 1]));

  const remaining = new Set(cand2);
  for (const target of TARGET_ACC) {
    if (chosen.length >= 15) break;
    const scored = [];
    for (const c of remaining) {
      if (readings.has(c.r) || cards.has(c.r)) continue;
      if (c.parts.some((p) => (partUse.get(p) ?? 0) >= MAX_PART_USE)) continue;
      if (c.parts.some((p) => !cards.has(p)) && cards.size >= 22) continue;
      const shared = c.parts.filter((p) => cards.has(p)).length;
      const dist = Math.abs((c.acc ?? 0) - target);
      scored.push({ c, score: -dist * 10 + shared * 1.2 + quality(c) * 0.7 + rng() * 0.25 });
    }
    scored.sort((a, b) => b.score - a.score);
    for (const { c } of scored.slice(0, 14)) {
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

  // 役割ペアの偏りを棄却（A+Bばかりだと C の出番が消える）
  {
    const pairCount = { "A+B": 0, "A+C": 0, "B+C": 0 };
    for (const c of chosen) {
      if (c.parts.length !== 2) continue;
      const key = c.parts.map((p) => roleName[levels.get(p)]).join("+");
      if (pairCount[key] !== undefined) pairCount[key]++;
    }
    if (Object.values(pairCount).some((v) => v < MIN_PAIR)) return null;
  }

  const hands = { A: [], B: [], C: [] };
  for (const [card, L] of levels) hands[roleName[L]].push(card);

  // ---- 単独5問（易しい側）。合体部品の再利用を優先 ----
  const singleCands = [...cards]
    .map((c) => wordByReading.get(c))
    .filter(Boolean)
    .filter((w) => w.qs.some((q) => q.acc !== null && q.acc >= SINGLE_MIN_ACC))
    .filter((w) => trapCandidates(w.r).length > 0)
    .sort((a, b) => b.qCount - a.qCount);
  const singles = [];
  for (const w of singleCands) {
    if (singles.length >= 5) break;
    const role = roleName[levels.get(w.r)];
    if (singles.filter((s) => s.role === role).length >= 2) continue;
    singles.push({
      reading: w.r,
      role,
      best: w.qs.filter((q) => q.acc !== null && q.acc >= SINGLE_MIN_ACC)[0],
    });
  }
  if (singles.length < 5) return null;
  singles.sort((a, b) => b.best.acc - a.best.acc);

  const questions = [
    ...singles.map((s) => ({
      kind: "single",
      reading: s.reading,
      roles: [s.role],
      acc: s.best.acc,
      q: s.best.q,
      id: s.best.id,
      display: wordByReading.get(s.reading)?.display ?? s.reading,
    })),
    ...chosen
      .filter((c) => c !== T)
      .sort((a, b) => (b.acc ?? 0) - (a.acc ?? 0))
      .map((c) => ({
        kind: "double",
        reading: c.r,
        parts: c.parts,
        roles: c.parts.map((p) => roleName[levels.get(p)]),
        acc: c.acc,
        q: c.q,
        id: c.id,
        display: c.display,
      })),
    {
      kind: "triple",
      reading: T.r,
      parts: T.parts,
      roles: T.parts.map((p) => roleName[levels.get(p)]),
      acc: T.acc,
      q: T.q,
      id: T.id,
      display: T.display,
    },
  ];

  const allAnswers = questions.map((x) => x.reading);
  /** その札を role に配って、全問の公平性を壊さないか */
  const cardIsFairEverywhere = (role, card) => {
    for (const qq of questions) {
      const idxOf = qq.roles.indexOf(role);
      const req = idxOf === -1 ? null : qq.parts ? qq.parts[idxOf] : qq.reading;
      if (!isFair(qq.reading, role, card, req)) return false;
    }
    return true;
  };

  // 既存の札（合体部品・単独の答え）自体が公平性を壊していないか
  for (const role of ROLES) {
    for (const card of hands[role]) if (!cardIsFairEverywhere(role, card)) return null;
  }

  // ---- 罠札の割り当て ----
  const traps = [];
  for (const qq of questions) {
    if (qq.roles.length === 3) {
      traps.push([]); // 3枚合体は全員必要なので罠不要
      continue;
    }
    const freeRoles = ROLES.filter((r) => !qq.roles.includes(r));
    const cands = trapCandidates(qq.reading).filter((s) => !allAnswers.includes(s));
    let placed = null;
    // 既に配ってある札で条件を満たすものを優先（1枚で複数問をカバー）
    for (const r of freeRoles) {
      const hit = hands[r].find((c) => cands.includes(c) && cardIsFairEverywhere(r, c));
      if (hit) {
        placed = { role: r, card: hit };
        break;
      }
    }
    if (!placed) {
      for (const r of freeRoles) {
        if (hands[r].length >= 10) continue;
        const c = cands.find(
          (x) => !ROLES.some((rr) => hands[rr].includes(x)) && cardIsFairEverywhere(r, x)
        );
        if (c) {
          hands[r].push(c);
          placed = { role: r, card: c };
          break;
        }
      }
    }
    if (!placed) return null; // 罠が置けない骨格は棄却
    traps.push([placed]);
  }

  // ---- 手札を10枚に整える（余りは追加の罠札で埋める） ----
  const filler = pool.words
    .filter((w) => w.qCount >= 2 && w.r.length >= 2 && w.r.length <= 6)
    .map((w) => w.r);
  for (const role of ROLES) {
    for (const f of filler) {
      if (hands[role].length >= 10) break;
      if (allAnswers.includes(f)) continue;
      if (ROLES.some((rr) => hands[rr].includes(f))) continue;
      if (!cardIsFairEverywhere(role, f)) continue;
      hands[role].push(f);
    }
    if (hands[role].length !== 10) return null;
  }

  const seq = questions.slice(0, 19).map((x) => x.acc);
  let inversions = 0;
  for (let i = 0; i + 1 < seq.length; i++) if (seq[i] < seq[i + 1] - 0.12) inversions++;
  const spread = +(Math.max(...seq) - Math.min(...seq)).toFixed(2);
  const reqCount = { A: 0, B: 0, C: 0 };
  for (const qq of questions) for (const r of qq.roles) reqCount[r]++;

  return {
    setNo: currentSetNo,
    questions: questions.map((qq, i) => ({ ...qq, traps: traps[i] })),
    hands,
    inversions,
    spread,
    reqCount,
    quality: +(chosen.reduce((s, c) => s + quality(c), 0) / chosen.length).toFixed(2),
    reuse: chosen.flatMap((c) => c.parts).length - cards.size,
  };
}

// ---------- 実行 ----------
function runOne(n, want) {
  currentSetNo = n;
  let results = [];
  outer: for (const [cm, cm3] of [
    [1000, 600],
    [800, 500],
    [600, 400],
    [400, 300],
  ]) {
    CONCRETE_MIN = cm;
    CONCRETE_MIN_3 = cm3;
    computeCandidates(`set${n}(具体性${cm})`);
    for (MIN_PAIR = 3; MIN_PAIR >= 1; MIN_PAIR--) {
      results = [];
      for (let seed = 1; seed <= 1500 && results.length < want; seed++) {
        const r = build(seed);
        if (r) results.push(r);
      }
      if (results.length > 0) break outer;
    }
  }
  if (results.length === 0) {
    console.error(`set${n}: 骨格が見つかりませんでした`);
    return null;
  }
  const balance = (r) =>
    Math.max(...Object.values(r.reqCount)) - Math.min(...Object.values(r.reqCount));
  results.sort(
    (a, b) =>
      a.inversions - b.inversions ||
      balance(a) - balance(b) ||
      b.spread - a.spread ||
      b.reuse - a.reuse
  );
  fs.writeFileSync(
    path.join(DIR, "mined", `skeleton-set${n}.json`),
    JSON.stringify(results, null, 1)
  );
  const r = results[0];
  console.log(
    `\n=== set${n} 骨格（幅${r.spread} / 逆転${r.inversions} / 自然さ${r.quality} / 再利用${r.reuse} / 出番 A${r.reqCount.A} B${r.reqCount.B} C${r.reqCount.C}） ===`
  );
  for (const [i, qq] of r.questions.entries()) {
    const req = qq.parts
      ? qq.roles.map((ro, k) => `${ro}:${qq.parts[k]}`).join("+")
      : `${qq.roles[0]}:${qq.reading}`;
    const tr = qq.traps.map((t) => `${t.role}:${t.card}`).join(",") || "—";
    console.log(`  Q${i + 1} ${qq.display}(${qq.reading}) = ${req} acc=${qq.acc} 罠=${tr}`);
  }
  console.log(`  手札 A:${r.hands.A.join(",")}`);
  console.log(`       B:${r.hands.B.join(",")}`);
  console.log(`       C:${r.hands.C.join(",")}`);
  console.error(`→ tools/mined/skeleton-set${n}.json に ${results.length} 件`);
  return r;
}

if (ALL) {
  for (let n = 1; n <= 5; n++) {
    const r = runOne(n, WANT);
    if (!r) continue;
    for (const qq of r.questions) used.add(qq.reading);
  }
} else {
  runOne(Number(args[0] || 1), WANT);
}
