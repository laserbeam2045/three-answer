// ファイブボンバーの問題セットを機械検証する。
//  - 各問の正解が5つ以上あるか
//  - 同じ問題の中で、2つの正解が同じ書き方を受け付けていないか（どちらの正解か決められない）
//  - 表記の重複や、正規化すると空になる書き方がないか
import { existsSync } from "node:fs";
import { join } from "node:path";
import { allBomberSets } from "../src/lib/sets";
import { BOMBER_MAX_SLOTS, BOMBER_SLOTS, acceptedForms, baseForms, normalizeAnswer } from "../src/lib/bomber/match";

const errors: string[] = [];
const warnings: string[] = [];
const ids = new Set<string>();

for (const set of allBomberSets()) {
  if (ids.has(set.id)) errors.push(`${set.id}: セットIDが重複しています`);
  ids.add(set.id);
  if (!set.title || !set.description) errors.push(`${set.id}: title / description がありません`);
  if (set.questions.length !== 10) warnings.push(`${set.id}: 問題数が ${set.questions.length} です（標準は10問）`);

  set.questions.forEach((q, qi) => {
    const where = `${set.id} Q${qi + 1}`;
    if (q.answers.length < BOMBER_SLOTS)
      errors.push(`${where}: 正解が ${q.answers.length} 個しかありません（${BOMBER_SLOTS}個以上必要）`);
    if (q.panels) {
      if (q.answers.length > BOMBER_MAX_SLOTS)
        errors.push(`${where}: パネルは${BOMBER_MAX_SLOTS}枚までです（${q.answers.length}枚）`);
      const prompts = q.answers.map((a) => a.prompt);
      if (prompts.some((x) => !x)) errors.push(`${where}: パネル問題の答えに prompt がありません`);
      if (new Set(prompts).size !== prompts.length) errors.push(`${where}: パネルの出題が重複しています`);
      for (const a of q.answers) {
        // □ の数は答えの文字数とそろえる（「青写真」なら□□□）
        const runs = a.prompt?.match(/□+/g) ?? [];
        if (runs.some((r) => r.length !== [...a.display].length))
          errors.push(`${where}: 「${a.prompt}」の□の数が答え「${a.display}」の文字数と合いません`);
        // パネルに見えている出題そのものを打っただけで正解にならないように
        if (a.prompt && acceptedForms(q, q.answers.indexOf(a)).has(normalizeAnswer(a.prompt)))
          errors.push(`${where}: パネル「${a.prompt}」をそのまま打つと正解になってしまいます`);
      }
    }
    if (q.slots !== undefined && (q.slots < BOMBER_SLOTS || q.slots > BOMBER_MAX_SLOTS || q.slots > q.answers.length))
      errors.push(`${where}: slots=${q.slots} は ${BOMBER_SLOTS}〜${BOMBER_MAX_SLOTS} かつ正解の数（${q.answers.length}）以下にしてください`);

    // 写真パネル: 画像があること、ファイル名から答えが分からないこと、出典（作者・ライセンス・元ページ）があること
    const withImage = q.answers.filter((a) => a.image).length;
    if (withImage > 0) {
      if (!q.panels) errors.push(`${where}: 写真はパネル問題でしか使えません`);
      if (withImage !== q.answers.length) errors.push(`${where}: 写真パネルの問題は、すべてのパネルに写真が必要です`);
      for (const a of q.answers) {
        const img = a.image;
        if (!img) continue;
        if (!/^\/bomber-img\/[0-9a-f]{12}\.(jpg|png|webp)$/.test(img.src))
          errors.push(`${where}: 「${a.display}」の画像のパスは /bomber-img/<12桁の16進>.jpg の形にしてください（${img.src}）`);
        else if (!existsSync(join(process.cwd(), "public", img.src)))
          errors.push(`${where}: 「${a.display}」の画像ファイルがありません（public${img.src}）`);
        if (!img.author || !img.license) errors.push(`${where}: 「${a.display}」の画像に作者・ライセンスがありません`);
        if (!/^(cc0|public domain|pd\b|pd-|cc by(-sa)? \d)/i.test(img.license))
          errors.push(`${where}: 「${a.display}」の画像のライセンス「${img.license}」は使えません`);
        if (!img.sourceUrl?.startsWith("https://commons.wikimedia.org/"))
          errors.push(`${where}: 「${a.display}」の画像の元ページ（Commons）がありません`);
      }
    }

    const owner = new Map<string, number>();
    const displays = new Set<string>();
    q.answers.forEach((a, ai) => {
      if (displays.has(a.display)) errors.push(`${where}: 表記「${a.display}」が重複しています`);
      displays.add(a.display);
      for (const raw of [a.display, ...(a.accept ?? [])]) {
        if (!normalizeAnswer(raw)) errors.push(`${where}: 「${raw}」は正規化すると空になります`);
      }
      // データに書いた表記・別解どうしの重なりを調べる。readings（漢字の読み）による重なり（石と席の「せき」）は
      // 回答の処理で「まだ答えていない方」を選ぶので、エラーにしない
      for (const form of baseForms(q, ai)) {
        const prev = owner.get(form);
        if (prev !== undefined && prev !== ai) {
          errors.push(
            `${where}: 「${form}」が「${q.answers[prev].display}」と「${a.display}」の両方に一致します`
          );
        }
        owner.set(form, ai);
      }
    });
  });
}

console.log(`ファイブボンバー: ${ids.size}セットを検証しました`);
for (const w of warnings) console.log(`  WARN: ${w}`);
for (const e of errors) console.log(`  ERROR: ${e}`);
if (errors.length > 0) process.exit(1);
console.log("  OK");
