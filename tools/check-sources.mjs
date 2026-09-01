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
for (const file of fs.readdirSync(setsDir).filter((f) => f.endsWith(".json")).sort()) {
  const set = JSON.parse(fs.readFileSync(path.join(setsDir, file), "utf8"));
  const msgs = [];
  set.questions.forEach((q, i) => {
    const qn = `Q${i + 1}`;
    const m = /^quizzes3:(\d+)$/.exec(q.source ?? "");
    if (!m) {
      if (q.source !== "original") msgs.push(`${qn}: source の形式が不正 (${q.source})`);
      return;
    }
    const row = db.get(m[1]);
    if (!row) {
      msgs.push(`${qn}: quizzes3 に id=${m[1]} が存在しない`);
      errors++;
      return;
    }
    const dbReading = kataToHira(String(row.read ?? "").trim());
    if (dbReading !== q.answerReading) {
      msgs.push(
        `${qn}: 読み不一致 id=${m[1]} DB「${dbReading}」≠ セット「${q.answerReading}」(DB答え: ${row.ans})`
      );
      errors++;
    }
  });
  console.log(`\n=== ${file} ===`);
  if (msgs.length === 0) console.log("  出典OK");
  else for (const m of msgs) console.log(`  ${m}`);
}

if (errors > 0) {
  console.log(`\n合計 ${errors} 件の出典エラー`);
  process.exit(1);
}
console.log("\n全セットの出典検証OK");
