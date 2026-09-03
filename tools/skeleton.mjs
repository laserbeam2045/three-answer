// セット骨格ジェネレータ（罠ファースト版）。
//
// 設計上の必須制約:
//  1. 出す順序: 場のカードは席順に並ぶため role(p1) < role(p2) < ... （順序付き3彩色）
//  2. 構成: Q1〜Q5 は単独1枚、Q6〜Q20 は2枚以上の複合。
//     3枚合体は Q20 だけでなく Q10 以降に複数置く（目標5問・最低3問）
//  3. 難易度: セット内で正答率が単調に下降。Q1≈0.70 → Q19≈0.50、下限 0.46
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

// 表記 → 完全な読み（分類語彙表）。「何体？」形式の問題では答えの読みが
// 表記より短くなる（染色体→せんしょく）。省かれた部分（たい）を席順の矛盾しない
// プレイヤーが持っていると、出すべきか判断できず理不尽な判定になるため検出に使う。
const kataToHira = (x) =>
  String(x).replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const normHw = (x) => String(x ?? "").replace(/[−▽△〔〕・（）()『』「」\s]/g, "");
const dictReadings = new Map();
for (const line of fs.readFileSync(path.join(DIR, "mined", "bunruidb.jsonl"), "utf8").split("\n")) {
  if (!line.trim()) continue;
  try {
    const row = JSON.parse(line);
    const hw = normHw(row.hw);
    const r = kataToHira(String(row.read ?? "").trim());
    if (!hw || !/^[ぁ-ゔー]+$/.test(r)) continue;
    if (!dictReadings.has(hw)) dictReadings.set(hw, new Set());
    dictReadings.get(hw).add(r);
  } catch {}
}
/** 表記の完全な読みが答えの読みより長い場合、省かれた前後の部分を返す */
function omittedParts(display, reading) {
  const d = String(display ?? "");
  const variants = [normHw(d), normHw(d.replace(/[（(][^）)]*[）)]/g, ""))];
  const out = [];
  for (const v of variants) {
    for (const full of dictReadings.get(v) ?? []) {
      if (full.length <= reading.length) continue;
      if (full.startsWith(reading)) out.push({ kind: "suffix", text: full.slice(reading.length) });
      if (full.endsWith(reading)) out.push({ kind: "prefix", text: full.slice(0, full.length - reading.length) });
    }
  }
  return out;
}
const coreReadings = new Set(pool.words.filter((w) => w.qCount >= 2).map((w) => w.r));

const ALL = process.argv.includes("--all");
const fromIdx = process.argv.indexOf("--from");
const FROM = fromIdx !== -1 ? Number(process.argv[fromIdx + 1]) : ALL ? 1 : 0;
const onlyIdx = process.argv.indexOf("--only");
const ONLY = onlyIdx !== -1 ? Number(process.argv[onlyIdx + 1]) : 0;
const args = process.argv
  .slice(2)
  .filter(
    (a, i, arr) =>
      !["--all", "--from", "--only"].includes(a) && !["--from", "--only"].includes(arr[i - 1])
  );
const WANT = Number(ALL || FROM || ONLY ? args[0] : args[1]) || 2;
let currentSetNo = 1;

// ---------- 難易度 ----------
// セット間の難易度差はつけない。どのセットも Q1 が最も易しく Q20 に向けて難しくなる。
// 難易度のレンジは中央寄りに絞る（Q1で正答率0.70前後、Q19で0.50前後）。
// 0.9台は簡単すぎ、0.45以下は3人の連携と合わさると「終盤が難しすぎる」ため両端を切る。
let MIN_ACC = 0.46;
let MAX_ACC = 0.76;
const TARGET_ACC = Array.from({ length: 14 }, (_, i) => 0.68 - (i * (0.68 - 0.5)) / 13);
let SINGLE_MIN_ACC = 0.6;
let SINGLE_MAX_ACC = 0.76;

// ---------- 3枚合体の数 ----------
// 本家の例は Q20 だけが3枚だが、3人全員で合わせる問題を増やす。
// 2枚合体を見る前に3枚が来ると面食らうので、Q6〜Q19 のうち Q10 以降にのみ置く。
let TRIPLE_TARGET = Number(process.env.TT ?? 5); // Q20 を含む目標数
let TRIPLE_MIN = 3; // Q20 を含む最低数（見つからなければ 2 に緩める）
const TRIPLE_EARLIEST = 4; // Q6 を 0 とした添字。4 = Q10
const TRIPLE_BONUS = 0.8; // 目標数に達するまで3枚候補に与える加点（正答率0.08分に相当）

// ---------- 使用済みの答え（セット間の重複回避） ----------
const used = new Set();
const setsDir = path.join(DIR, "..", "data", "sets");
if (ONLY) {
  // --only N: 他の骨格を全て固定し、N だけ作り直す
  for (let k = 1; k <= 5; k++) {
    if (k === ONLY) continue;
    const f = path.join(DIR, "mined", `skeleton-set${k}.json`);
    if (!fs.existsSync(f)) continue;
    for (const q of JSON.parse(fs.readFileSync(f, "utf8"))[0].questions) used.add(q.reading);
  }
} else if (FROM > 1) {
  // --from N: 生成済みの骨格 1..N-1 の答えを使用済みにする（それらは作り直さない）
  for (let k = 1; k < FROM; k++) {
    const f = path.join(DIR, "mined", `skeleton-set${k}.json`);
    if (!fs.existsSync(f)) continue;
    for (const q of JSON.parse(fs.readFileSync(f, "utf8"))[0].questions) used.add(q.reading);
  }
} else if (!ALL) {
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
let MAX_PART_USE = Number(process.env.MPU ?? 3);
/** 合体部品の総数の上限（残りは単独の答えや罠札に使う） */
let PART_CAP = Number(process.env.CAP ?? 22);
/** 各スロットで彩色可能性を試す候補数 */
let TOPK = Number(process.env.TOPK ?? 14);

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
  const ok = (c, needTrap) =>
    c.acc !== null &&
    c.acc >= MIN_ACC &&
    c.acc <= MAX_ACC &&
    (ALLOW_DUP || !used.has(c.r)) &&
    c.parts.every((p) => p.length >= 1 && p.length <= 6) &&
    new Set(c.parts).size === c.parts.length &&
    // 罠ファースト: 答えと同カテゴリの札が確保できる合体語だけを使う
    // （3枚合体は全員が必要で罠を置く席が無いので、罠の有無では絞らない）
    (!needTrap || trapCandidates(c.r).length > 0);
  cand2 = pool.compounds2.filter(
    (c) => ok(c, true) && quality(c) >= NATURAL_2 && concrete(c, CONCRETE_MIN)
  );
  cand3 = pool.compounds3.filter(
    (c) => ok(c, false) && quality(c) >= NATURAL_3 && concrete(c, CONCRETE_MIN_3)
  );
  console.error(`${label}: 候補 2枚=${cand2.length}（罠が確保できるもののみ） 3枚=${cand3.length}`);
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
/** 出番（必要カード回数）の最大差。見つからなければ緩める */
let MAX_IMBALANCE = 4;
/** 最終手段: セット間の答えの重複を許す（材料が尽きた場合のみ） */
let ALLOW_DUP = false;

// ---------- 骨格探索 ----------
const FAIL = new Map();
function fail(label) {
  FAIL.set(label, (FAIL.get(label) ?? 0) + 1);
  return null;
}
function build(seedNo) {
  const rng = mulberry32(seedNo * 7919 + currentSetNo * 131);
  const JITTER = 0.25 + 0.5 * (seedNo % 3); // 0.25 / 0.75 / 1.25 を巡回
  // 重複許容モードでも、未使用の語を優先する（セットが同一になるのを防ぐ）
  const triples = cand3
    .filter((c) => !used.has(c.r)) // 3枚合体は重複許容モードでも既出を使わない
    .slice()
    .sort(
      (a, b) =>
        (used.has(a.r) ? 1 : 0) - (used.has(b.r) ? 1 : 0) ||
        (b.prefixPair ? 1 : 0) - (a.prefixPair ? 1 : 0) ||
        b.n - a.n
    );
  if (triples.length === 0) return fail(`3枚合体の候補なし`);
  const T = triples[Math.floor(rng() * Math.min(triples.length, 20))];

  const chosen = [T];
  const readings = new Set([T.r]);
  const cards = new Set(T.parts);
  const partUse = new Map(T.parts.map((p) => [p, 1]));
  let tripleCount = 1;

  const remaining2 = new Set(cand2);
  const remaining3 = new Set(cand3.filter((c) => c !== T));
  // 3枚合体は Q10〜Q19 に等間隔で「予約スロット」を設けて取る。
  // 採点競争に任せると（部品を3つ使うため）2枚合体の再利用に負けて取れず、
  // 逆に連続で取ると部品が上限に達して残りの2枚合体が置けなくなる。
  const tripleSlots = new Set();
  const span = TARGET_ACC.length - TRIPLE_EARLIEST;
  for (let k = 1; k < TRIPLE_TARGET; k++)
    tripleSlots.add(TRIPLE_EARLIEST + Math.min(span - 1, Math.round(((k - 0.5) * span) / (TRIPLE_TARGET - 1))));
  let owedTriples = 0;
  for (const [slot, target] of TARGET_ACC.entries()) {
    if (chosen.length >= 15) break;
    if (tripleSlots.has(slot)) owedTriples++;
    const allowTriple = slot >= TRIPLE_EARLIEST && owedTriples > 0 && tripleCount < TRIPLE_TARGET;
    // 正答率順に並べ替えた後も Q10 以降に収まるよう、Q6〜Q9 に入る2枚合体
    // （最初に選んだ TRIPLE_EARLIEST 問）の最小正答率以下の3枚合体だけを使う
    const firstDoubles = chosen.slice(1, 1 + TRIPLE_EARLIEST).map((c) => c.acc ?? 0);
    const tripleAccMax = firstDoubles.length ? Math.min(...firstDoubles) : 0;
    const scored = [];
    const consider = (c, isTriple) => {
      if (readings.has(c.r) || cards.has(c.r)) return;
      if (c.parts.some((p) => (partUse.get(p) ?? 0) >= MAX_PART_USE)) return;
      const newParts = c.parts.filter((p) => !cards.has(p)).length;
      // 単独の答えや罠札を入れる余地（約8枚）を残す
      if (newParts > 0 && cards.size + newParts > PART_CAP) return;
      const shared = c.parts.length - newParts;
      const dist = Math.abs((c.acc ?? 0) - target);
      // 部品の残り枠が減るほど、既存の札を再利用する合体語を強く優先する
      const fill = cards.size / PART_CAP;
      scored.push({
        c,
        score:
          -dist * 10 +
          shared * (1.2 + 2.5 * fill) -
          newParts * 2 * fill * fill +
          quality(c) * 0.7 +
          rng() * JITTER -
          (used.has(c.r) ? 2.5 : 0) + // 既出の答えは減点（重複許容時のみ効く）
          (isTriple ? TRIPLE_BONUS : 0),
      });
    };
    // 予約スロットではまず3枚合体だけを試し、置けなければ2枚合体で埋める（貸しは次に持ち越す）
    if (allowTriple)
      for (const c of remaining3)
        if ((c.acc ?? 0) <= tripleAccMax && !used.has(c.r)) consider(c, true);
    if (scored.length === 0) for (const c of remaining2) consider(c, false);
    scored.sort((a, b) => b.score - a.score);
    let placedTriple = false;
    for (const { c } of scored.slice(0, TOPK)) {
      if (assignLevels([...chosen, c]) === null) continue;
      if (c.parts.length === 3) placedTriple = true;
      chosen.push(c);
      readings.add(c.r);
      for (const p of c.parts) {
        cards.add(p);
        partUse.set(p, (partUse.get(p) ?? 0) + 1);
      }
      if (c.parts.length === 3) {
        tripleCount++;
        remaining3.delete(c);
      } else remaining2.delete(c);
      break;
    }
    if (placedTriple) owedTriples--;
    else if (allowTriple && chosen.length < 15 && scored.every((x) => x.c.parts.length === 3)) {
      // 3枚が1つも置けなかったスロット: 2枚合体で埋め直す
      const scored2 = [];
      for (const c of remaining2) {
        if (readings.has(c.r) || cards.has(c.r)) continue;
        if (c.parts.some((p) => (partUse.get(p) ?? 0) >= MAX_PART_USE)) continue;
        const newParts = c.parts.filter((p) => !cards.has(p)).length;
        if (newParts > 0 && cards.size + newParts > PART_CAP) continue;
        const dist = Math.abs((c.acc ?? 0) - target);
        scored2.push({ c, score: -dist * 10 + (c.parts.length - newParts) * 1.2 + rng() * JITTER });
      }
      scored2.sort((a, b) => b.score - a.score);
      for (const { c } of scored2.slice(0, TOPK)) {
        if (assignLevels([...chosen, c]) === null) continue;
        chosen.push(c);
        readings.add(c.r);
        for (const p of c.parts) {
          cards.add(p);
          partUse.set(p, (partUse.get(p) ?? 0) + 1);
        }
        remaining2.delete(c);
        break;
      }
    }
  }
  if (chosen.length < 15) return fail(`詰まり: 選定${chosen.length}/15 部品${cards.size} 3枚${tripleCount}`);
  if (tripleCount < TRIPLE_MIN) return fail(`3枚合体が最低数に届かない`);

  const levels = assignLevels(chosen);
  if (!levels) return fail(`順序付き彩色が不能`);
  const roleName = ["", "A", "B", "C"];

  // 役割ペアの偏りを棄却（A+Bばかりだと C の出番が消える）
  {
    const pairCount = { "A+B": 0, "A+C": 0, "B+C": 0 };
    for (const c of chosen) {
      if (c.parts.length !== 2) continue;
      const key = c.parts.map((p) => roleName[levels.get(p)]).join("+");
      if (pairCount[key] !== undefined) pairCount[key]++;
    }
    if (Object.values(pairCount).some((v) => v < MIN_PAIR)) return fail(`役割ペアの偏り`);
  }

  const hands = { A: [], B: [], C: [] };
  for (const [card, L] of levels) hands[roleName[L]].push(card);

  // ---- 単独5問（易しい側）。合体部品の再利用を優先 ----
  const singleCands = [...cards]
    .map((c) => wordByReading.get(c))
    .filter(Boolean)
    // 単独問題の答えも他セットと重複させない（合体語と同じ扱い）
    .filter((w) => ALLOW_DUP || !used.has(w.r))
    .filter((w) =>
      w.qs.some((q) => q.acc !== null && q.acc >= SINGLE_MIN_ACC && q.acc <= SINGLE_MAX_ACC)
    )
    .filter((w) => trapCandidates(w.r).length > 0);
  /** その語で作れる問題のうち、レンジ内で最も易しいもの */
  const bestSingle = (w) =>
    w.qs
      .filter((q) => q.acc !== null && q.acc >= SINGLE_MIN_ACC && q.acc <= SINGLE_MAX_ACC)
      .sort((x, y) => y.acc - x.acc)[0];
  // 単独5問は「最も易しい5問」でなければならない（Q1〜Q5に置くため）
  singleCands.sort(
    (a, b) =>
      (used.has(a.r) ? 1 : 0) - (used.has(b.r) ? 1 : 0) ||
      (bestSingle(b)?.acc ?? 0) - (bestSingle(a)?.acc ?? 0)
  );
  const singles = [];
  for (const w of singleCands) {
    if (singles.length >= 5) break;
    const role = roleName[levels.get(w.r)];
    if (singles.filter((s) => s.role === role).length >= 2) continue;
    singles.push({ reading: w.r, role, best: bestSingle(w) });
  }
  // 合体部品だけでは5問に満たない場合、プールから単独問題用の札を補う
  if (singles.length < 5) {
    for (const w of pool.words) {
      if (singles.length >= 5) break;
      if (w.qCount < 2 || (!ALLOW_DUP && used.has(w.r)) || cards.has(w.r)) continue;
      if (trapCandidates(w.r).length === 0) continue;
      const b = bestSingle(w);
      if (!b) continue;
      const role = ROLES.filter(
        (r) => hands[r].length < 9 && singles.filter((x) => x.role === r).length < 2
      ).sort((x, y) => hands[x].length - hands[y].length)[0];
      if (!role) continue;
      hands[role].push(w.r);
      cards.add(w.r);
      singles.push({ reading: w.r, role, best: b });
    }
  }
  if (singles.length < 5) return fail(`単独問題が5問確保できない`);
  singles.sort((a, b) => b.best.acc - a.best.acc);
  // 単独問題が合体問題より難しいと Q5→Q6 で逆転する。最も難しい単独が
  // 最も易しい合体以上であることを求める（多少の重なりは許容）。
  const easiestCompoundAcc = Math.max(
    ...chosen.filter((c) => c !== T).map((c) => c.acc ?? 0)
  );
  if (singles[4].best.acc < easiestCompoundAcc - 0.12) return fail(`単独が合体より難しい(Q5→Q6逆転)`);

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
        kind: c.parts.length === 3 ? "triple" : "double",
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

  // 2枚合体を見る前に3枚が来ると面食らうので、Q6〜Q9（添字5〜8）は2枚のみ
  for (let i = 5; i < 5 + TRIPLE_EARLIEST; i++) if (questions[i].roles.length === 3) return fail(`Q6〜Q9に3枚合体`);

  const allAnswers = questions.map((x) => x.reading);
  /** その札を role に配って、全問の公平性を壊さないか */
  const cardIsFairEverywhere = (role, card) => {
    for (const qq of questions) {
      const idxOf = qq.roles.indexOf(role);
      const req = idxOf === -1 ? null : qq.parts ? qq.parts[idxOf] : qq.reading;
      if (!isFair(qq.reading, role, card, req)) return false;
      // 表記より読みが短い問題: 省かれた部分の札を、席順の矛盾しない席に置かない
      if (req === null) {
        const first = qq.roles[0];
        const last = qq.roles[qq.roles.length - 1];
        for (const p of omittedParts(qq.display, qq.reading)) {
          if (p.text !== card) continue;
          if ((p.kind === "suffix" && role > last) || (p.kind === "prefix" && role < first)) return false;
        }
      }
    }
    return true;
  };

  // 既存の札（合体部品・単独の答え）自体が公平性を壊していないか
  for (const role of ROLES) {
    for (const card of hands[role]) if (!cardIsFairEverywhere(role, card)) return fail(`既存の札が公平性を壊す`);
  }

  // ---- 罠札の割り当て ----
  const traps = [];
  let missingTraps = 0;
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
    if (!placed) {
      // 自動では置けない罠は2問まで許容し、エージェントが手作業で設計する
      missingTraps++;
      if (missingTraps > 2) return fail(`罠が置けない問題が3問以上`);
      traps.push([]);
      continue;
    }
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
    if (hands[role].length !== 10) return fail(`手札を10枚に整えられない`);
  }

  const seq = questions.slice(0, 19).map((x) => x.acc);
  let inversions = 0;
  for (let i = 0; i + 1 < seq.length; i++) if (seq[i] < seq[i + 1] - 0.12) inversions++;
  const spread = +(Math.max(...seq) - Math.min(...seq)).toFixed(2);
  const reqCount = { A: 0, B: 0, C: 0 };
  for (const qq of questions) for (const r of qq.roles) reqCount[r]++;
  // 出番の偏りが大きい骨格は棄却（バリデータは差6以上を警告する）
  if (
    Math.max(...Object.values(reqCount)) - Math.min(...Object.values(reqCount)) >
    MAX_IMBALANCE
  )
    return fail(`出番の偏り`);

  return {
    setNo: currentSetNo,
    questions: questions.map((qq, i) => ({
      ...qq,
      traps: traps[i],
      ...(qq.roles.length < 3 && traps[i].length === 0 ? { needsTrap: true } : {}),
    })),
    missingTraps,
    hands,
    inversions,
    spread,
    reqCount,
    triples: tripleCount,
    quality: +(chosen.reduce((s, c) => s + quality(c), 0) / chosen.length).toFixed(2),
    reuse: chosen.flatMap((c) => c.parts).length - cards.size,
  };
}

// ---------- 実行 ----------
function runOne(n, want) {
  currentSetNo = n;
  let results = [];
  // 材料が尽きたら、具体性 → 正答率レンジ の順に段階的に緩める
  // 難易度レンジ(acc)は最優先で守る。材料が足りないときは
  // 具体性 → 重複許容 の順に譲り、accレンジは最後まで動かさない。
  const LADDER = [
    [1000, 600, 0.48, 0.76, 0.6],
    [700, 420, 0.48, 0.76, 0.6],
    [400, 250, 0.48, 0.76, 0.58],
    [200, 150, 0.48, 0.76, 0.56],
    [700, 420, 0.46, 0.76, 0.6, true], // ここから重複許容（下限をわずかに緩める）
    [400, 250, 0.46, 0.76, 0.58, true],
    [200, 150, 0.46, 0.76, 0.56, true],
    [400, 250, 0.44, 0.8, 0.56, true], // 最終手段
    [200, 150, 0.44, 0.85, 0.5, true],
  ];
  const STRICT = process.argv.includes("--strict"); // 重複許容の段階を使わない
  // 3枚合体の最低数も最後に緩める（3 → 2）
  outer: for (TRIPLE_MIN of [3, 2])
  for (const [cm, cm3, lo, hi, slo, dup] of LADDER) {
    if (STRICT && dup) continue;
    CONCRETE_MIN = cm;
    CONCRETE_MIN_3 = cm3;
    ALLOW_DUP = !!dup;
    MIN_ACC = lo;
    MAX_ACC = hi;
    SINGLE_MIN_ACC = slo;
    SINGLE_MAX_ACC = hi - 0.02;
    computeCandidates(`set${n}(具体性${cm} acc${lo}-${hi}${dup ? " 重複許容" : ""})`);
    for (MAX_IMBALANCE = 4; MAX_IMBALANCE <= 5; MAX_IMBALANCE++) {
      for (MIN_PAIR = 3; MIN_PAIR >= 1; MIN_PAIR--) {
        results = [];
        const SEEDS = Number(process.env.SEEDS ?? 1500);
        for (let seed = 1; seed <= SEEDS && results.length < want; seed++) {
          const r = build(seed);
          if (r) results.push(r);
        }
        if (results.length > 0) break outer;
      }
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
      b.triples - a.triples ||
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
    `\n=== set${n} 骨格（3枚${r.triples}問 / 幅${r.spread} / 逆転${r.inversions} / 自然さ${r.quality} / 再利用${r.reuse} / 出番 A${r.reqCount.A} B${r.reqCount.B} C${r.reqCount.C}） ===`
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

if (process.argv.includes("--debug")) {
  currentSetNo = ONLY || 4;
  const E = process.env;
  CONCRETE_MIN = Number(E.CM ?? 1000); CONCRETE_MIN_3 = Number(E.CM3 ?? 600);
  ALLOW_DUP = E.DUP === "1"; MIN_ACC = Number(E.LO ?? 0.48); MAX_ACC = Number(E.HI ?? 0.76);
  SINGLE_MIN_ACC = 0.6; SINGLE_MAX_ACC = 0.74; MAX_IMBALANCE = 5; MIN_PAIR = 1; TRIPLE_MIN = 2;
  computeCandidates("debug");
  let okc = 0;
  for (let seed = 1; seed <= 300; seed++) if (build(seed)) okc++;
  console.log("成功", okc, "/ 300");
  for (const [k, v] of [...FAIL.entries()].sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(5), k);
} else if (ONLY) {
  runOne(ONLY, WANT);
} else if (ALL || FROM) {
  for (let n = FROM || 1; n <= 5; n++) {
    const r = runOne(n, WANT);
    if (!r) continue;
    for (const qq of r.questions) used.add(qq.reading);
  }
} else {
  runOne(Number(args[0] || 1), WANT);
}
