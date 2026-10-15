import type { BomberSet, QuestionSet } from "../types";
import set1 from "../../../data/sets/set1.json";
import set2 from "../../../data/sets/set2.json";
import set3 from "../../../data/sets/set3.json";
import set4 from "../../../data/sets/set4.json";
import set5 from "../../../data/sets/set5.json";
import bomber1 from "../../../data/bomber/bomber1.json";
import bomber2 from "../../../data/bomber/bomber2.json";
import bomber3 from "../../../data/bomber/bomber3.json";
import bomber4 from "../../../data/bomber/bomber4.json";
import bomber5 from "../../../data/bomber/bomber5.json";
import bomber6 from "../../../data/bomber/bomber6.json";
import bomber7 from "../../../data/bomber/bomber7.json";
import bomber8 from "../../../data/bomber/bomber8.json";
import bomber9 from "../../../data/bomber/bomber9.json";
import bomber10 from "../../../data/bomber/bomber10.json";
import bomber11 from "../../../data/bomber/bomber11.json";
import bomber12 from "../../../data/bomber/bomber12.json";
import bomber13 from "../../../data/bomber/bomber13.json";
import bomber14 from "../../../data/bomber/bomber14.json";
import bomber15 from "../../../data/bomber/bomber15.json";
import bomber16 from "../../../data/bomber/bomber16.json";
import bomber17 from "../../../data/bomber/bomber17.json";
import bomber18 from "../../../data/bomber/bomber18.json";
import bomber19 from "../../../data/bomber/bomber19.json";
import bomber20 from "../../../data/bomber/bomber20.json";
import bomber21 from "../../../data/bomber/bomber21.json";

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

const BOMBER_SETS: BomberSet[] = [
  bomber1, bomber2, bomber3, bomber4, bomber5, bomber6, bomber7, bomber8, bomber9, bomber10,
  bomber11, bomber12, bomber13, bomber14, bomber15, bomber16, bomber17, bomber18, bomber19, bomber20,
  bomber21,
].map(
  (s) => s as unknown as BomberSet
);

export function allBomberSets(): BomberSet[] {
  return BOMBER_SETS;
}

export function getBomberSet(id: string): BomberSet | undefined {
  return BOMBER_SETS.find((s) => s.id === id);
}
