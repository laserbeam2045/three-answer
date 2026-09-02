// 問題セットの機械的検証。npm run validate-sets で実行。
// エラー(致命的)と警告(要判断)を報告し、エラーがあれば exit 1。
import fs from "fs";
import path from "path";
import type { QuestionSet, Role } from "../src/lib/types";

const ROLES: Role[] = ["A", "B", "C"];
const KANA_RE = /^[ぁ-ゔー]+$/;

const setsDir = path.join(__dirname, "..", "data", "sets");
const files = fs
  .readdirSync(setsDir)
  .filter((f) => f.endsWith(".json"))
  .sort();

let totalErrors = 0;
const globalAnswers = new Map<string, string[]>(); // answerReading -> [setId]

/** 手札から高々1枚ずつ選んで answerReading を綴る全ての方法を列挙 */
function waysToSpell(hands: Record<Role, string[]>, target: string): { role: Role; card: string }[][] {
  const ways: { role: Role; card: string }[][] = [];
  // 使用カード列（順序あり・プレイヤー重複なし）の深さ優先探索
  function dfs(remaining: string, used: { role: Role; card: string }[], usedRoles: Set<Role>) {
    if (remaining === "") {
      ways.push([...used]);
      return;
    }
    if (used.length >= 3) return;
    for (const role of ROLES) {
      if (usedRoles.has(role)) continue;
      for (const card of hands[role]) {
        if (remaining.startsWith(card)) {
          usedRoles.add(role);
          used.push({ role, card });
          dfs(remaining.slice(card.length), used, usedRoles);
          used.pop();
          usedRoles.delete(role);
        }
      }
    }
  }
  dfs(target, [], new Set());
  return ways;
}

for (const file of files) {
  const raw = JSON.parse(fs.readFileSync(path.join(setsDir, file), "utf8")) as QuestionSet;
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  // --- 基本構造 ---
  if (!raw.id || !raw.title || !raw.description) errors.push("id/title/description が必要");
  if (![1, 2, 3, 4, 5].includes(raw.difficulty)) errors.push("difficulty は 1..5");
  for (const role of ROLES) {
    if (!raw.hands?.[role] || raw.hands[role].length !== 10)
      errors.push(`hands.${role} は10枚必要 (現在 ${raw.hands?.[role]?.length ?? 0})`);
    for (const card of raw.hands?.[role] ?? []) {
      if (!KANA_RE.test(card)) errors.push(`カード「${card}」(${role}) がかな以外を含む`);
      if (card.length > 10) warnings.push(`カード「${card}」が長すぎる(${card.length}文字)`);
    }
  }
  const allCards = ROLES.flatMap((r) => (raw.hands?.[r] ?? []).map((c) => ({ role: r, card: c })));
  const cardCount = new Map<string, number>();
  for (const { card } of allCards) cardCount.set(card, (cardCount.get(card) ?? 0) + 1);
  for (const [card, n] of cardCount) if (n > 1) errors.push(`カード「${card}」が${n}枚重複`);

  const questions = raw.questions ?? [];
  if (questions.length !== 20 && !raw.title.includes("スタブ"))
    errors.push(`問題数は20必要 (現在 ${questions.length})`);

  // --- 各問題 ---
  const usedCards = new Set<string>();
  const patternSeq: string[] = [];
  const answerReadings = new Map<string, number>();
  questions.forEach((q, i) => {
    const qn = `Q${i + 1}`;
    if (!q.q || q.q.length < 8) errors.push(`${qn}: 問題文が短すぎる`);
    if (!q.answerDisplay) errors.push(`${qn}: answerDisplay が必要`);
    if (!q.explanation) warnings.push(`${qn}: explanation が空`);
    if (!KANA_RE.test(q.answerReading)) errors.push(`${qn}: answerReading がかな以外を含む`);
    if (!q.required || q.required.length < 1 || q.required.length > 3)
      errors.push(`${qn}: required は1〜3要素`);

    const n = answerReadings.get(q.answerReading);
    if (n !== undefined) errors.push(`${qn}: answerReading「${q.answerReading}」がQ${n + 1}と重複`);
    answerReadings.set(q.answerReading, i);
    if (!globalAnswers.has(q.answerReading)) globalAnswers.set(q.answerReading, []);
    globalAnswers.get(q.answerReading)!.push(raw.id);

    // 出す順序は必ず A→B→C（場に並べたときの読みの順序）
    const reqRoles = (q.required ?? []).map((r) => r.role);
    const sortedRoles = [...reqRoles].sort();
    if (reqRoles.join("") !== sortedRoles.join("")) {
      errors.push(
        `${qn}: requiredの順序がA→B→Cでない（${reqRoles.join("→")}）。` +
          `場では席順に並ぶため「${(q.required ?? [])
            .slice()
            .sort((a, b) => a.role.localeCompare(b.role))
            .map((r) => r.card)
            .join("")}」と読まれてしまう`
      );
    }

    // 構成: Q1〜Q5 は単独、Q6〜Q20 は複合
    if (questions.length === 20) {
      const n = q.required?.length ?? 0;
      if (i < 5 && n !== 1) errors.push(`${qn}: Q1〜Q5は単独1枚である必要がある（現在${n}枚）`);
      if (i >= 5 && n < 2) errors.push(`${qn}: Q6〜Q20は2枚以上の複合である必要がある（現在${n}枚）`);
    }

    // required整合
    const roles = new Set<Role>();
    let concat = "";
    for (const r of q.required ?? []) {
      if (roles.has(r.role)) errors.push(`${qn}: 同一プレイヤー${r.role}から2枚要求`);
      roles.add(r.role);
      if (!raw.hands?.[r.role]?.includes(r.card))
        errors.push(`${qn}: ${r.role}の手札に「${r.card}」が無い`);
      concat += r.card;
      usedCards.add(`${r.role}:${r.card}`);
    }
    if (concat !== q.answerReading)
      errors.push(`${qn}: requiredの連結「${concat}」≠ answerReading「${q.answerReading}」`);

    patternSeq.push((q.required ?? []).map((r) => r.role).sort().join("+") || "-");

    // 曖昧性: answerReading を綴る別の出し方が存在しないか
    if (raw.hands && concat === q.answerReading) {
      const ways = waysToSpell(raw.hands, q.answerReading);
      const canonical = JSON.stringify(
        [...(q.required ?? [])].sort((a, b) => a.role.localeCompare(b.role))
      );
      const others = ways.filter(
        (w) => JSON.stringify([...w].sort((a, b) => a.role.localeCompare(b.role))) !== canonical
      );
      if (others.length > 0)
        errors.push(
          `${qn}: 正解「${q.answerReading}」を別の出し方で綴れてしまう: ${others
            .map((w) => w.map((x) => `${x.role}:${x.card}`).join("+"))
            .join(" / ")}`
        );
      if (ways.length === 0) errors.push(`${qn}: requiredで正解を綴れない(バグ)`);
    }
  });

  // --- 判定の公平性検査 ---
  // プレイヤーは自分の手札と問題文だけで「出すべきか」を決められなければならない。
  // 自分の札が正解の読みの中に、自分の席順と矛盾しない位置で現れる場合、
  // 「前後の人が残りを持っているかもしれない」と考えるのが合理的になり、
  // 出しても出さなくても筋が通る＝理不尽な判定になる。
  // 例: 正解「しんぞう」でCが「ぞう」を持つ → Cは「誰かが しん を持つのでは」と考えうる。
  // 例: 正解「しょうかき」でAが「しょうか」と「しょう」を両方持つ → どちらを出すか決められない。
  {
    const rolesBefore: Record<Role, number> = { A: 0, B: 1, C: 2 };
    const rolesAfter: Record<Role, number> = { A: 2, B: 1, C: 0 };
    questions.forEach((q, i) => {
      const qn = `Q${i + 1}`;
      const R = q.answerReading ?? "";
      const requiredOf = new Map<Role, string>();
      for (const r of q.required ?? []) requiredOf.set(r.role, r.card);

      for (const role of ROLES) {
        for (const card of raw.hands?.[role] ?? []) {
          if (requiredOf.get(role) === card) continue; // 正しい札は当然一致する
          for (let at = R.indexOf(card); at !== -1; at = R.indexOf(card, at + 1)) {
            const preLen = at;
            const sufLen = R.length - at - card.length;
            const preOk = preLen === 0 || rolesBefore[role] >= 1;
            const sufOk = sufLen === 0 || rolesAfter[role] >= 1;
            if (preOk && sufOk) {
              errors.push(
                `${qn}: 正解「${R}」に対し${role}の「${card}」が` +
                  `${preLen === 0 ? "先頭" : sufLen === 0 ? "末尾" : "途中"}に一致する。` +
                  `${role}は出すべきか論理的に判断できない（理不尽な判定）`
              );
              break;
            }
          }
        }
      }
    });
  }

  // --- 解説のネタバレ検査 ---
  // 判定画面(Q i)の時点で公開済みのカード = Q1..Qi の required（正誤に関わらず判定画面で公開される）。
  // それ以外のカード名を解説が「」付きで名指ししていたら、手札情報のネタバレとしてエラー。
  {
    const allCardNames = new Set(allCards.map((c) => c.card));
    const publicByNow = new Set<string>();
    questions.forEach((q, i) => {
      for (const r of q.required ?? []) publicByNow.add(r.card);
      const quoted = [...(q.explanation ?? "").matchAll(/「([^」]+)」/g)].map((m) => m[1]);
      for (const t of quoted) {
        if (allCardNames.has(t) && !publicByNow.has(t)) {
          errors.push(
            `Q${i + 1}: 解説が未公開カード「${t}」に言及している（手札のネタバレ）`
          );
        }
      }
    });
  }

  // --- 罠（緊張）の検査 ---
  // 全問について「正解に不要なプレイヤーの誰かが出すか悩む札」が必要。
  // traps は設計メタデータ（アプリは使わない）。
  {
    const tensionGrid: Record<Role, string[]> = { A: [], B: [], C: [] };
    questions.forEach((q, i) => {
      const qn = `Q${i + 1}`;
      const requiredRoles = new Set((q.required ?? []).map((r) => r.role));
      const traps = q.traps ?? [];
      for (const t of traps) {
        if (!ROLES.includes(t.role)) {
          errors.push(`${qn}: trap の role が不正 (${t.role})`);
          continue;
        }
        if (!raw.hands?.[t.role]?.includes(t.card))
          errors.push(`${qn}: trap「${t.card}」が${t.role}の手札に無い`);
        if (requiredRoles.has(t.role))
          errors.push(`${qn}: trap「${t.card}」の持ち主${t.role}はこの問題の必要プレイヤー`);
        if (!t.why || t.why.length < 4) warnings.push(`${qn}: trap「${t.card}」に理由(why)が無い`);
      }
      const trapRoles = new Set(traps.map((t) => t.role));
      if (requiredRoles.size < 3 && trapRoles.size === 0)
        errors.push(`${qn}: 誰も悩まない問題（罠が1つも無い）`);

      for (const role of ROLES) {
        tensionGrid[role].push(
          requiredRoles.has(role) ? "R" : trapRoles.has(role) ? "T" : "-"
        );
      }
    });

    // 連続無関心区間（3問以上）の検出
    for (const role of ROLES) {
      const seq = tensionGrid[role];
      let run = 0;
      let worst = 0;
      let at = 0;
      seq.forEach((v, i) => {
        if (v === "-") {
          run++;
          if (run > worst) {
            worst = run;
            at = i - run + 2;
          }
        } else run = 0;
      });
      if (worst >= 3) warnings.push(`${role}: Q${at}から${worst}問連続で出番も悩みも無い`);
      info.push(`緊張 ${role}: ${seq.join("")}`);
    }
  }

  // --- 構成レポート ---
  const singles = patternSeq.filter((p) => p.length === 1).length;
  const doubles = patternSeq.filter((p) => p.length === 3).length; // "A+B"
  const triples = patternSeq.filter((p) => p.length === 5).length;
  info.push(`構成: 単独${singles} / 2枚${doubles} / 3枚${triples}`);
  info.push(`パターン列: ${patternSeq.join(" ")}`);

  const unused = allCards.filter(({ role, card }) => !usedCards.has(`${role}:${card}`));
  info.push(
    `未使用カード(${unused.length}): ${unused.map((u) => `${u.role}:${u.card}`).join(", ") || "なし"}`
  );
  // Q6〜Q20を全て複合にした構成では、再利用が効くほど必要札は少なくなる。
  // 残りは罠専用の札として機能する（本家の例も30枚中11枚が未使用）。
  if (unused.length > 15) warnings.push(`未使用カードが多すぎる (${unused.length}枚)`);

  const perRoleCount = ROLES.map(
    (r) => questions.flatMap((q) => q.required ?? []).filter((x) => x.role === r).length
  );
  info.push(`必要カード回数: ${ROLES.map((r, i) => `${r}=${perRoleCount[i]}`).join(" ")}`);
  const minReq = Math.min(...perRoleCount);
  const maxReq = Math.max(...perRoleCount);
  if (maxReq - minReq >= 6)
    warnings.push(
      `出番の偏りが大きい（${ROLES.map((r, i) => `${r}=${perRoleCount[i]}`).join(" ")}）`
    );

  // 単独→2枚→3枚の流れ（前半に3枚合体が来ていないか）
  questions.forEach((q, i) => {
    // 構成は「Q1〜Q5=単独 / Q6〜Q20=複合」に変更済み（上でERROR検査している）
    if (i === questions.length - 1 && q.required.length !== 3 && questions.length === 20)
      warnings.push(`最終問題が3枚合体でない`);
  });

  // --- 出力 ---
  console.log(`\n=== ${file} (${raw.id}: ${raw.title}) ===`);
  for (const e of errors) console.log(`  ERROR: ${e}`);
  for (const w of warnings) console.log(`  warn : ${w}`);
  for (const s of info) console.log(`  info : ${s}`);
  if (errors.length === 0) console.log("  OK");
  totalErrors += errors.length;
}

// --- セット間の答え重複（警告のみ） ---
const dups = [...globalAnswers.entries()].filter(([, sets]) => sets.length > 1);
if (dups.length > 0) {
  console.log("\n--- セット間で重複する答え ---");
  for (const [reading, sets] of dups) console.log(`  warn : 「${reading}」 が ${sets.join(", ")} で重複`);
}

if (totalErrors > 0) {
  console.log(`\n合計 ${totalErrors} エラー`);
  process.exit(1);
}
console.log("\n全セット検証OK");
