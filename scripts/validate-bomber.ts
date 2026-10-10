// ファイブボンバーの問題セットを機械検証する。
//  - 各問の正解が5つ以上あるか
//  - 同じ問題の中で、2つの正解が同じ書き方を受け付けていないか（どちらの正解か決められない）
//  - 表記の重複や、正規化すると空になる書き方がないか
import { allBomberSets } from "../src/lib/sets";
import { BOMBER_MAX_SLOTS, BOMBER_SLOTS, acceptedForms, normalizeAnswer } from "../src/lib/bomber/match";

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
    if (q.slots !== undefined && (q.slots < BOMBER_SLOTS || q.slots > BOMBER_MAX_SLOTS || q.slots > q.answers.length))
      errors.push(`${where}: slots=${q.slots} は ${BOMBER_SLOTS}〜${BOMBER_MAX_SLOTS} かつ正解の数（${q.answers.length}）以下にしてください`);

    const owner = new Map<string, number>();
    const displays = new Set<string>();
    q.answers.forEach((a, ai) => {
      if (displays.has(a.display)) errors.push(`${where}: 表記「${a.display}」が重複しています`);
      displays.add(a.display);
      for (const raw of [a.display, ...(a.accept ?? [])]) {
        if (!normalizeAnswer(raw)) errors.push(`${where}: 「${raw}」は正規化すると空になります`);
      }
      for (const form of acceptedForms(q, ai)) {
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
