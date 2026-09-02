// 罠（引っかけ）の質を検査する。
//
// 良い罠の条件（DESIGN.md §8.2）:
//   罠札は「その問題の答えになり得る同カテゴリの兄弟概念」でなければならない。
//   例: 「何というボードゲーム？」→ 将棋 に対する罠は 囲碁・チェス（同じボードゲーム）。
//       「角」（将棋の駒）は話題が近いだけで、答えの候補ではないので罠にならない。
//
// 判定: 分類語彙表(bunruidb)の意味分類(class_number)を答えと罠で比較し、
//       共通の分類を持つかを見る。持たなければ「カテゴリ違いの疑い」として報告する。
import fs from "fs";
import path from "path";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(DIR, "..");

const kataToHira = (s) =>
  String(s).replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const KANA_RE = /^[ぁ-ゔー]+$/;

// 意味分類の索引。読みだけで引くと同音異義語のノイズが入る（かんぞう=肝臓/甘草）ため、
// 可能な限り表記（headword）で引く。
const norm = (x) => String(x ?? "").replace(/[−▽△〔〕・（）()『』「」\s]/g, "");
const classByWord = new Map();
const classOf = new Map();
for (const line of fs
  .readFileSync(path.join(DIR, "mined", "bunruidb.jsonl"), "utf8")
  .split("\n")) {
  if (!line.trim()) continue;
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    continue;
  }
  const reading = kataToHira(String(row.read ?? "").trim());
  if (!KANA_RE.test(reading)) continue;
  const cls = String(row.cls ?? "");
  if (!cls) continue;
  if (!classOf.has(reading)) classOf.set(reading, new Set());
  classOf.get(reading).add(cls);
  const hw = norm(row.hw);
  if (hw) {
    if (!classByWord.has(hw)) classByWord.set(hw, new Set());
    classByWord.get(hw).add(cls);
  }
}

/** 表記があればそれで、無ければ読みで意味分類を引く */
function classesOf(reading, display) {
  const d = norm(display);
  return (d && classByWord.get(d)) || classOf.get(reading) || null;
}

/** 答えと罠札が同じ意味カテゴリに属するか。判定不能なら null */
function sameCategory(answerReading, answerDisplay, trapCard) {
  const ca = classesOf(answerReading, answerDisplay);
  const cb = classOf.get(trapCard);
  if (!ca || !cb) return null; // どちらかが分類語彙表に無い（固有名詞など）
  for (const c of ca) if (cb.has(c)) return true;
  return false;
}

let weak = 0;
let unknown = 0;
let ok = 0;
const setsDir = path.join(ROOT, "data", "sets");
for (const file of fs.readdirSync(setsDir).filter((f) => f.endsWith(".json")).sort()) {
  const set = JSON.parse(fs.readFileSync(path.join(setsDir, file), "utf8"));
  const msgs = [];
  set.questions.forEach((q, i) => {
    for (const t of q.traps ?? []) {
      const verdict = sameCategory(q.answerReading, q.answerDisplay, t.card);
      if (verdict === true) ok++;
      else if (verdict === null) {
        unknown++;
        msgs.push(
          `  ?    Q${i + 1}: 答え「${q.answerDisplay}」の罠「${t.card}」— 分類語彙表に無く自動判定不可（要目視）`
        );
      } else {
        weak++;
        msgs.push(
          `  WEAK Q${i + 1}: 答え「${q.answerDisplay}(${q.answerReading})」の罠「${t.card}」が別カテゴリ。` +
            `答えの候補になり得ない札は罠にならない`
        );
      }
    }
  });
  console.log(`\n=== ${file} ===`);
  if (msgs.length === 0) console.log("  全ての罠が答えと同カテゴリ");
  else for (const m of msgs) console.log(m);
}

console.log(
  `\n合計: 同カテゴリ ${ok} / カテゴリ違いの疑い ${weak} / 判定不可 ${unknown}`
);
