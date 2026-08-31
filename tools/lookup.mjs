// 読み(ひらがな)から quizzes3 の問題を検索する開発ツール。
// 使い方: node tools/lookup.mjs らいと むーんらいと        (完全一致)
//         node tools/lookup.mjs --prefix ごーる            (前方一致)
import fs from "fs";
import path from "path";

const DIR = path.dirname(new URL(import.meta.url).pathname);

function kataToHira(s) {
  return s.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

const lines = fs
  .readFileSync(path.join(DIR, "mined", "quizzes3.jsonl"), "utf8")
  .split("\n")
  .filter((l) => l.trim());

const args = process.argv.slice(2);
const prefixMode = args[0] === "--prefix";
const targets = (prefixMode ? args.slice(1) : args).map(kataToHira);
if (targets.length === 0) {
  console.log("usage: node tools/lookup.mjs [--prefix] <reading...>");
  process.exit(1);
}

const hits = new Map(targets.map((t) => [t, []]));
for (const line of lines) {
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    continue;
  }
  const reading = kataToHira(String(row.read ?? "").trim());
  for (const t of targets) {
    const match = prefixMode ? reading.startsWith(t) : reading === t;
    if (match) hits.get(t).push(row);
  }
}

for (const [t, rows] of hits) {
  rows.sort((a, b) => (b.n ?? 0) - (a.n ?? 0));
  console.log(`\n=== ${t} (${rows.length}件) ===`);
  for (const r of rows.slice(0, 8)) {
    const acc = r.n >= 5 ? ((r.c / r.n) * 100).toFixed(0) + "%" : "-";
    console.log(`[id=${r.id}] ans=${r.ans} read=${r.read} n=${r.n} acc=${acc}`);
    console.log(`   ${r.q}`);
  }
}
