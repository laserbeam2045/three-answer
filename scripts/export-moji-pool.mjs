// ひと文字リーグの問題の候補を、ローカルの MySQL（quiz データベースの quizzes3）から取り出す。
// - 正答率（corrected_num / answered_num）が 60〜70% で、回答数が30以上
// - 読み（reading）がかなだけで、文字数が 2〜8（参加人数と同じ文字数の問題を出すため）
// - 写真・画像・選択肢が前提の問題は除く
// 取り出したものは tools/mined/moji/pool.json（git 管理外）に書く。--upload を付けると、
// 本番の Upstash Redis（環境変数 KV_REST_API_URL / KV_REST_API_TOKEN）のキー moji:pool:v1 にも書き込む。
// 問題文は外部のクイズのデータなので、公開リポジトリには置かない。
//
// 使い方: MYSQL_PWD=<パスワード> node --env-file=<本番の環境変数ファイル> scripts/export-moji-pool.mjs --upload
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const MYSQL = process.env.MYSQL_BIN ?? "mysql";
const sql = `
SELECT JSON_OBJECT('id', id, 'q', question, 'answer', answer, 'reading', reading,
                   'rate', ROUND(100 * corrected_num / answered_num))
FROM quizzes3
WHERE answered_num >= 30
  AND corrected_num / answered_num BETWEEN 0.6 AND 0.7
  AND reading REGEXP '^[ぁ-ゖァ-ヺー]+$'`;
const out = execFileSync(MYSQL, ["-u", process.env.MYSQL_USER ?? "root", "-N", "-B", "-r", "quiz", "-e", sql], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const EXCLUDE = /写真|画像|イラスト|動画|音声|この人物|この方|次のうち|以下のうち|次の中|地図|グラフ|図の/;
const seen = new Set();
const pool = out
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .filter((x) => {
    const len = [...x.reading.normalize("NFKC")].length;
    if (len < 2 || len > 8 || EXCLUDE.test(x.q) || seen.has(x.q)) return false;
    seen.add(x.q);
    return true;
  })
  .map((x) => ({ id: x.id, q: x.q, answer: x.answer, reading: x.reading, rate: Number(x.rate) }));

const counts = {};
for (const x of pool) {
  const n = [...x.reading.normalize("NFKC")].length;
  counts[n] = (counts[n] ?? 0) + 1;
}
const file = path.join(process.cwd(), "tools", "mined", "moji", "pool.json");
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(pool));
console.log(`取り出した問題: ${pool.length}問（文字数ごと: ${JSON.stringify(counts)}）→ ${file}`);

if (process.argv.includes("--upload")) {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("KV_REST_API_URL / KV_REST_API_TOKEN がありません");
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(["SET", "moji:pool:v1", JSON.stringify(pool)]),
  });
  console.log("Redis への書き込み:", res.status, await res.text());
}
