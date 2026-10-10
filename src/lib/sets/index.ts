import type { BomberSet, QuestionSet } from "../types";
import set1 from "../../../data/sets/set1.json";
import set2 from "../../../data/sets/set2.json";
import set3 from "../../../data/sets/set3.json";
import set4 from "../../../data/sets/set4.json";
import set5 from "../../../data/sets/set5.json";
import bomber1 from "../../../data/bomber/bomber1.json";
import bomber2 from "../../../data/bomber/bomber2.json";
import bomber3 from "../../../data/bomber/bomber3.json";

const SETS: QuestionSet[] = [set1, set2, set3, set4, set5].map(
  (s) => s as unknown as QuestionSet
);

export function allSets(): QuestionSet[] {
  return SETS;
}

export function getSet(id: string): QuestionSet | undefined {
  return SETS.find((s) => s.id === id);
}

// ---------- ファイブボンバー ----------

const BOMBER_SETS: BomberSet[] = [bomber1, bomber2, bomber3].map(
  (s) => s as unknown as BomberSet
);

export function allBomberSets(): BomberSet[] {
  return BOMBER_SETS;
}

export function getBomberSet(id: string): BomberSet | undefined {
  return BOMBER_SETS.find((s) => s.id === id);
}
