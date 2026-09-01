// 5セットの設計エージェントへの入力ファイルを生成する。
// 各セットに: 主骨格 + 予備骨格 + 専用extra doubles(セット間で素材が被らないよう分割) + 専用singlesスライス
import fs from "fs";
import path from "path";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const MINED = path.join(DIR, "mined");
const { skeletons, singlesPool } = JSON.parse(
  fs.readFileSync(path.join(MINED, "skeletons.json"), "utf8")
);

// セット割当（難易度 1..5）: 主骨格indexと予備骨格index
const ASSIGN = [
  { set: 1, primary: "しょくぱんまん", backup: "めいじだいがく" },
  { set: 2, primary: "まつしまななこ", backup: "ふるさとのうぜい" },
  { set: 3, primary: "かぶきちょう", backup: "さとうたける" },
  { set: 4, primary: "あんこーるわっと", backup: "はざーどまっぷ" },
  { set: 5, primary: "こうめいとう", backup: "うぐいすじょう" },
];

const byReading = new Map(skeletons.map((s) => [s.triple.reading, s]));

// 使用済みcombo readingを集める（primary+backupに含まれるものはextrasから除外）
const usedReadings = new Set();
for (const a of ASSIGN) {
  for (const key of [a.primary, a.backup]) {
    const sk = byReading.get(key);
    if (!sk) throw new Error(`skeleton not found: ${key}`);
    usedReadings.add(sk.triple.reading);
    for (const d of sk.doubles) usedReadings.add(d.reading);
  }
}

// extra doubles: picksから再ロードして品質順に、5分割
function loadPicks(prefix) {
  const files = fs
    .readdirSync(path.join(MINED, "picks"))
    .filter((f) => f.startsWith(prefix) && f.endsWith(".picks.json"));
  const all = [];
  for (const f of files) {
    try {
      const arr = JSON.parse(fs.readFileSync(path.join(MINED, "picks", f), "utf8"));
      if (Array.isArray(arr)) all.push(...arr);
    } catch {}
  }
  return all;
}
const num = (x, d = 3) => (typeof x === "number" && !isNaN(x) ? x : d);
const qual = (x) => num(x.fame) + num(x.guessable) + num(x.splitNatural);
const seen = new Set();
const extraDoubles = loadPicks("doubles")
  .filter((d) => d && d.reading && d.split && !usedReadings.has(d.reading))
  .filter((d) => (seen.has(d.reading) ? false : (seen.add(d.reading), true)))
  .sort((a, b) => qual(b) - qual(a));

for (let i = 0; i < ASSIGN.length; i++) {
  const a = ASSIGN[i];
  const input = {
    setNumber: a.set,
    difficulty: a.set,
    primarySkeleton: byReading.get(a.primary),
    backupSkeleton: byReading.get(a.backup),
    extraDoubles: extraDoubles.filter((_, j) => j % 5 === i).slice(0, 60),
    singlesPool: singlesPool.filter((_, j) => j % 5 === i),
  };
  fs.writeFileSync(
    path.join(MINED, `design-input-set${a.set}.json`),
    JSON.stringify(input, null, 1)
  );
  console.error(
    `set${a.set}: primary=${a.primary} backup=${a.backup} extras=${input.extraDoubles.length} singles=${input.singlesPool.length}`
  );
}
