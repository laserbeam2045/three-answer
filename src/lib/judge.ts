import type { AnswerState, QuestionResult, Role, SetQuestion, QuestionSet } from "./types";
import { ROLES } from "./types";

/**
 * 判定: 出されたカード集合（cardIndex !== null のもの）が required 集合と
 * 完全一致（過不足なし）なら正解。各プレイヤーは高々1枚なので
 * role -> card の対応で比較すればよい。
 */
export function judge(
  set: QuestionSet,
  question: SetQuestion,
  answers: Record<Role, AnswerState>,
  qIndex: number
): QuestionResult {
  const played: { role: Role; cardIndex: number; card: string }[] = [];
  for (const role of ROLES) {
    const a = answers[role];
    if (a && a.cardIndex !== null && a.cardIndex >= 0 && a.cardIndex < set.hands[role].length) {
      played.push({ role, cardIndex: a.cardIndex, card: set.hands[role][a.cardIndex] });
    }
  }

  const requiredByRole = new Map<Role, string>();
  for (const r of question.required) requiredByRole.set(r.role, r.card);

  let correct = played.length === requiredByRole.size;
  if (correct) {
    for (const p of played) {
      if (requiredByRole.get(p.role) !== p.card) {
        correct = false;
        break;
      }
    }
  }

  return { qIndex, correct, played };
}
