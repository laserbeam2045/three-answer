// ひと文字リーグの問題の候補を、ローカルの MySQL（quiz データベースの quizzes3）から取り出す。
// - 回答数が30以上（正答率があてになるもの）。正答率はすべて取り出し、遊ぶときにロビーで範囲を選ぶ
// - 読み（reading）がかなだけで、文字数が 2〜8（参加人数と同じ文字数の問題を出すため）
// - 写真・画像・選択肢が前提の問題は除く
// 取り出したものは tools/mined/moji/pool.json（git 管理外）に書く。
// 文字数と正答率の区切りごとの問題数だけは src/lib/moji/stats.json に書く（ロビーで「この範囲だと何問あるか」を出すため。数だけなので公開してよい）。
// --upload を付けると、本番の Upstash Redis（環境変数 KV_REST_API_URL / KV_REST_API_TOKEN）に
// 文字数と正答率の10%きざみの区切りごとに分けて書き込む（キー moji:pool:v2:<文字数>:<区切り>）。
// 問題文は外部のクイズのデータなので、公開リポジトリには置かない。
//
// 使い方: MYSQL_PWD=<パスワード> node --env-file=<本番の環境変数ファイル> scripts/export-moji-pool.mjs --upload
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const MYSQL = process.env.MYSQL_BIN ?? "mysql";
const sql = `
SELECT JSON_OBJECT('id', id, 'q', question, 'answer', answer, 'reading', reading,
                   'rate', FLOOR(100 * corrected_num / answered_num))
FROM quizzes3
WHERE answered_num >= 30
  AND reading REGEXP '^[ぁ-ゖァ-ヺー]+$'`;
const out = execFileSync(MYSQL, ["-u", process.env.MYSQL_USER ?? "root", "-N", "-B", "-r", "quiz", "-e", sql], {
  encoding: "utf8",
  maxBuffer: 256 * 1024 * 1024,
});
const EXCLUDE = /写真|画像|イラスト|動画|音声|この人物|この方|次のうち|以下のうち|次の中|地図|グラフ|図の/;
const lengthOf = (reading) => [...reading.normalize("NFKC")].length;
const bucketOf = (rate) => Math.min(9, Math.max(0, Math.floor(rate / 10)));
const seen = new Set();
const pool = out
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .filter((x) => {
    const len = lengthOf(x.reading);
    if (len < 2 || len > 8 || EXCLUDE.test(x.q) || seen.has(x.q)) return false;
    seen.add(x.q);
    return true;
  })
  .map((x) => ({ id: x.id, q: x.q, answer: x.answer, reading: x.reading, rate: Number(x.rate) }));

// 文字数 → 区切り → 問題
const groups = new Map();
for (const x of pool) {
  const key = `${lengthOf(x.reading)}:${bucketOf(x.rate)}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(x);
}
const stats = {};
for (let len = 2; len <= 8; len++) stats[len] = Array.from({ length: 10 }, (_, b) => groups.get(`${len}:${b}`)?.length ?? 0);

const file = path.join(process.cwd(), "tools", "mined", "moji", "pool.json");
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(pool));
fs.writeFileSync(path.join(process.cwd(), "src", "lib", "moji", "stats.json"), JSON.stringify(stats, null, 2) + "\n");
console.log(`取り出した問題: ${pool.length}問 → ${file}`);
for (const [len, counts] of Object.entries(stats)) console.log(`  ${len}文字: ${counts.join(" / ")}（正答率 0〜10%, 10〜20%, …, 90〜100%）`);

if (process.argv.includes("--upload")) {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("KV_REST_API_URL / KV_REST_API_TOKEN がありません");
  const redis = async (command) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });
    if (!res.ok) throw new Error(`Redis への書き込みに失敗しました: ${res.status} ${await res.text()}`);
  };
  let n = 0;
  for (let len = 2; len <= 8; len++) {
    for (let b = 0; b < 10; b++) {
      await redis(["SET", `moji:pool:v2:${len}:${b}`, JSON.stringify(groups.get(`${len}:${b}`) ?? [])]);
      n++;
    }
  }
  // 以前の、全部をひとつにまとめていたキーは使わなくなったので消す
  await redis(["DEL", "moji:pool:v1"]);
  console.log(`Redis に ${n} 個のキーを書き込みました`);
}
