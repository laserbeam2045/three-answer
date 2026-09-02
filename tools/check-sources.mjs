// 問題データの source: "quizzes3:<id>" が実在し、読みが一致するかを検証する。
// （data/sets/*.json は配布物だが、参照元DBはローカルのみのため別ツールにしている）
import fs from "fs";
import path from "path";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(DIR, "..");

const kataToHira = (s) =>
  String(s).replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

const db = new Map();
for (const line of fs
  .readFileSync(path.join(DIR, "mined", "quizzes3.jsonl"), "utf8")
  .split("\n")) {
  if (!line.trim()) continue;
  try {
    const r = JSON.parse(line);
    db.set(String(r.id), r);
  } catch {}
}

let errors = 0;
const setsDir = path.join(ROOT, "data", "sets");
const setAvg = [];
for (const file of fs.readdirSync(setsDir).filter((f) => f.endsWith(".json")).sort()) {
  const set = JSON.parse(fs.readFileSync(path.join(setsDir, file), "utf8"));
  const msgs = [];
  const accs = [];
  set.questions.forEach((q, i) => {
    const qn = `Q${i + 1}`;
    const m = /^quizzes3:(\d+)$/.exec(q.source ?? "");
    if (!m) {
      if (q.source !== "original") msgs.push(`${qn}: source の形式が不正 (${q.source})`);
      accs.push(null);
      return;
    }
    const row = db.get(m[1]);
    if (!row) {
      msgs.push(`${qn}: quizzes3 に id=${m[1]} が存在しない`);
      errors++;
      accs.push(null);
      return;
    }
    const dbReading = kataToHira(String(row.read ?? "").trim());
    if (dbReading !== q.answerReading) {
      msgs.push(
        `${qn}: 読み不一致 id=${m[1]} DB「${dbReading}」≠ セット「${q.answerReading}」(DB答え: ${row.ans})`
      );
      errors++;
    }
    accs.push(row.n >= 20 ? +((row.c ?? 0) / row.n).toFixed(2) : null);
  });

  // 難易度のグラデーション（正答率が高い＝易しい。Q1→Q19で下がるのが理想。
  // Q20は3枚合体の決め所なので知識難易度の順序からは除く）
  const known = accs.slice(0, 19).map((a, i) => ({ a, i })).filter((x) => x.a !== null);
  let inversions = 0;
  for (let x = 0; x < known.length - 1; x++)
    if (known[x].a < known[x + 1].a - 0.12) inversions++;
  const avg = known.length ? known.reduce((s, x) => s + x.a, 0) / known.length : null;
  setAvg.push({ file, avg, id: set.id });

  console.log(`\n=== ${file} ===`);
  if (msgs.length === 0) console.log("  出典OK");
  else for (const m of msgs) console.log(`  ${m}`);
  console.log(`  正答率: ${accs.map((a) => (a === null ? "--" : String(Math.round(a * 100)).padStart(2))).join(" ")}`);
  console.log(
    `  平均正答率 ${avg === null ? "-" : avg.toFixed(2)} / 難易度の逆転(0.12超) ${inversions}箇所`
  );
  if (inversions > 3) console.log("  warn : セット内の難易度が単調に上がっていない");
}

// セット間は難易度差をつけない（各セットが単体で易→難に推移する）。参考表示のみ。
console.log("\n=== セット別の平均正答率（参考。セット間の差は問わない） ===");
const ordered = setAvg.filter((s) => s.avg !== null).sort((a, b) => a.id.localeCompare(b.id));
for (const s of ordered) console.log(`  ${s.id}: ${s.avg.toFixed(2)}`);

if (errors > 0) {
  console.log(`\n合計 ${errors} 件の出典エラー`);
  process.exit(1);
}
console.log("\n全セットの出典検証OK");
