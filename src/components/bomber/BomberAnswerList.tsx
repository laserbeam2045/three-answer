import type { BomberRevealedAnswer } from "@/lib/types";

/**
 * その問題の正解一覧。誰かが答えたものは金色で、答えた人の名前を添える。
 * 答えが多い問題は主なものだけが届くので、残りの数を最後に添える。
 */
export default function BomberAnswerList({ answers, total = answers.length }: { answers: BomberRevealedAnswer[]; total?: number }) {
  const rest = total - answers.length;
  return (
    <ul className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
      {answers.map((a, i) => (
        <li
          key={i}
          className={`inline-flex items-baseline gap-1 rounded-md px-2 py-1 text-sm border ${
            a.by
              ? "border-gold bg-gold/10 text-gold-2 font-bold"
              : "border-line bg-panel-2 text-ink/80"
          }`}
        >
          {a.prompt ? (
            <>
              <span className="font-display">{a.prompt}</span>
              <span className="text-xs font-normal">（{a.display}）</span>
            </>
          ) : (
            a.display
          )}
          {a.by && <span className="text-[10px] font-normal text-muted">{a.by}</span>}
        </li>
      ))}
      {rest > 0 && <li className="self-center px-2 py-1 text-xs text-muted">ほか{rest.toLocaleString()}個</li>}
    </ul>
  );
}
