import type { BomberMissView } from "@/lib/types";

/** その問題で出た誤答（不正解・既出）の一覧。誰が何と答えたかを全員に見せる */
export default function BomberMissList({
  misses,
  animateLatest = false,
}: {
  misses: BomberMissView[];
  /** 最新の誤答を揺らして目立たせる（回答中の画面） */
  animateLatest?: boolean;
}) {
  if (misses.length === 0) return null;
  return (
    <ul className="flex flex-wrap justify-center gap-1.5">
      {misses.map((m, i) => {
        const latest = i === misses.length - 1;
        return (
          <li
            key={`${m.seq}-${m.name}`}
            className={`inline-flex items-baseline gap-1 rounded-md border px-2 py-0.5 text-xs sm:text-sm ${
              m.reason === "dup" ? "border-line text-muted" : "border-crimson/50 text-ink/90"
            } ${animateLatest && latest ? "miss-shake" : ""}`}
          >
            <span className={`font-black ${m.reason === "dup" ? "text-muted" : "text-crimson"}`}>×</span>
            <span className={m.isYou ? "text-gold" : "text-muted"}>{m.name}</span>
            <span>「{m.text}」</span>
            {m.reason === "dup" && <span className="text-[10px] text-muted">既出</span>}
          </li>
        );
      })}
    </ul>
  );
}
