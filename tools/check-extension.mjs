// 「答えの表記が読みより長い問題」の理不尽さを検出する。
//
// 例: 答え「染色体」で読みが「せんしょく」（問いが「何体？」のため）、
//     Cが「たい」を持っている → Cは「染色体なら たい も要るのでは」と考えうるが、
//     出すと「せんしょくたい」で不正解になる。自分の手札と問題文だけでは判断できない。
//
// 判定: 表記の完全な読み（分類語彙表 / 出題DBの語彙）が answerReading を
//       前方または後方に含み、その差分（省かれた部分）を、席順の矛盾しない
//       プレイヤーが札として持っていたら ERROR。
import fs from "fs";
import path from "path";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(DIR, "..");
const kataToHira = (s) =>
  String(s).replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const norm = (x) => String(x ?? "").replace(/[−▽△〔〕・（）()『』「」\s]/g, "");
const KANA_RE = /^[ぁ-ゔー]+$/;

// 表記 → 完全な読み。
// 辞書（分類語彙表）を正とする。出題DB由来の読みは「何体？」形式の問題では
// 省略後の短い読み（染色体→せんしょく）になっているため、完全な読みの根拠にはしない。
// 辞書に無い語（固有名詞など）に限り、出題DBの読みのうち answerReading より長いものを使う。
const dictReadings = new Map();
const poolReadings = new Map();
const add = (map, hw, r) => {
  hw = norm(hw);
  r = kataToHira(String(r ?? "").trim());
  if (!hw || !KANA_RE.test(r)) return;
  if (!map.has(hw)) map.set(hw, new Set());
  map.get(hw).add(r);
};
for (const line of fs.readFileSync(path.join(DIR, "mined", "bunruidb.jsonl"), "utf8").split("\n")) {
  if (!line.trim()) continue;
  try {
    const row = JSON.parse(line);
    add(dictReadings, row.hw, row.read);
  } catch {}
}
const pool = JSON.parse(fs.readFileSync(path.join(DIR, "mined", "pool.json"), "utf8"));
for (const w of pool.words) add(poolReadings, w.display, w.r);
for (const c of [...pool.compounds2, ...pool.compounds3]) add(poolReadings, c.display, c.r);

const ROLES = ["A", "B", "C"];
let errors = 0;
let unknown = 0;
for (const file of fs.readdirSync(path.join(ROOT, "data", "sets")).filter((f) => f.endsWith(".json")).sort()) {
  const set = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "sets", file), "utf8"));
  const msgs = [];
  set.questions.forEach((q, i) => {
    const R = q.answerReading;
    // 表記の候補: そのまま / 括弧を外したもの / 括弧の中を落としたもの
    const disp = String(q.answerDisplay);
    const variants = new Set([norm(disp), norm(disp.replace(/[（(][^）)]*[）)]/g, ""))]);
    const fulls = new Set();
    for (const v of variants) for (const r of dictReadings.get(v) ?? []) fulls.add(r);
    if (fulls.size === 0) {
      // 辞書に無い語: 出題DBの読みのうち、答えの読みより長いものだけを完全な読みとみなす
      for (const v of variants)
        for (const r of poolReadings.get(v) ?? []) if (r.length > R.length) fulls.add(r);
      // 出題DBに同じ短い読みしか無い場合は省略の有無が分からない → 判定不可として目視に回す
    }
    if (fulls.size === 0) {
      unknown++;
      msgs.push(`  ?    Q${i + 1}: 「${disp}」(${R}) の完全な読みが辞書に無く自動判定不可`);
      return;
    }
    if (fulls.has(R)) return; // 表記の読み = 答えの読み → 省略なし
    const reqRoles = q.required.map((r) => r.role);
    const lastReq = reqRoles[reqRoles.length - 1];
    const firstReq = reqRoles[0];
    for (const full of fulls) {
      if (full.length <= R.length) continue;
      const parts = [];
      if (full.startsWith(R)) parts.push({ kind: "suffix", text: full.slice(R.length) });
      if (full.endsWith(R)) parts.push({ kind: "prefix", text: full.slice(0, full.length - R.length) });
      for (const p of parts) {
        for (const role of ROLES) {
          // 後ろに足すなら最後の必要席より後、前に足すなら最初の必要席より前の席が該当
          const consistent =
            p.kind === "suffix" ? role > lastReq : role < firstReq;
          if (!consistent) continue;
          if (!set.hands[role].includes(p.text)) continue;
          errors++;
          msgs.push(
            `  ERROR Q${i + 1}: 答え「${disp}」の完全な読みは「${full}」だが正解は「${R}」まで。` +
              `${role}が省かれた「${p.text}」を持っており、出すべきか判断できない（理不尽な判定）`
          );
        }
      }
    }
  });
  console.log(`=== ${file} ===`);
  for (const m of msgs) console.log(m);
}
console.log(`\n合計: ERROR ${errors} / 判定不可 ${unknown}`);
process.exit(errors > 0 ? 1 : 0);
