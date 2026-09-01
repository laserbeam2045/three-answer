// 罠カード探索ツール。ある読みと「同じ意味カテゴリ」に属し、かつ
// それ自体もクイズの答えになる語（＝カードとして成立する語）を返す。
//
// 使い方:
//   node tools/sib.mjs あきたいぬ しずおか あか      … 各語の兄弟語（罠候補）
//   node tools/sib.mjs --word ふらんす                … その語が作れる問題一覧
//   node tools/sib.mjs --pair あきた いぬ             … 2語を連結した合体語が存在するか
import fs from "fs";
import path from "path";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const pool = JSON.parse(fs.readFileSync(path.join(DIR, "mined", "pool.json"), "utf8"));
const byReading = new Map(pool.words.map((w) => [w.r, w]));

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log("usage: node tools/sib.mjs [--word|--pair] <reading...>");
  process.exit(1);
}

if (args[0] === "--word") {
  for (const r of args.slice(1)) {
    const w = byReading.get(r);
    if (!w) {
      console.log(`\n=== ${r}: プールに無し（クイズの答えになる問題が見つからない語） ===`);
      continue;
    }
    console.log(`\n=== ${r} (${w.display}) 作れる問題 ${w.qCount}件 ===`);
    for (const q of w.qs) {
      console.log(`[id=${q.id}] ans=${q.ans} n=${q.n} acc=${q.acc ?? "-"}`);
      console.log(`   ${q.q}`);
    }
  }
} else if (args[0] === "--pair") {
  const joined = args.slice(1).join("");
  const all = [...pool.compounds2, ...pool.compounds3];
  const hit = all.filter((c) => c.r === joined || c.parts.join("") === joined);
  if (hit.length === 0) console.log(`${joined}: 合体語として見つからず`);
  for (const c of hit) {
    console.log(`${c.display}(${c.r}) = ${c.parts.join("+")} n=${c.n} acc=${c.acc ?? "-"}`);
    console.log(`   ${c.q}`);
    console.log(`   罠候補: ${(c.sib ?? []).join(", ") || "なし"}`);
  }
} else {
  for (const r of args) {
    const sib = pool.siblings[r] ?? [];
    const w = byReading.get(r);
    console.log(`\n=== ${r}${w ? `(${w.display}, ${w.qCount}問)` : ""} の同カテゴリ語 ===`);
    if (sib.length === 0) {
      console.log("  （分類語彙表に該当なし）");
      continue;
    }
    const rows = sib
      .map((s) => ({ s, w: byReading.get(s) }))
      .filter((x) => x.w)
      .sort((a, b) => b.w.qCount - a.w.qCount);
    for (const x of rows) {
      console.log(`  ${x.s} (${x.w.display}) ${x.w.qCount}問`);
    }
  }
}
