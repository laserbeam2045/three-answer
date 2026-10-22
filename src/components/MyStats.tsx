import OrnateTitle from "@/components/OrnateTitle";

export interface MyStat {
  label: string;
  value: string | number;
  /** 値のあとに小さく添える（「/ 10問」など） */
  unit?: string;
  /** 悪い数字（お手つきなど）を赤で出す */
  bad?: boolean;
}

/**
 * リザルト画面の「あなたの成績」。協力ゲームなので、ほかの人の成績は並べず自分の分だけを出す
 */
export default function MyStats({ stats, note }: { stats: MyStat[]; note?: string }) {
  return (
    <section>
      <OrnateTitle className="mb-3">あなたの成績</OrnateTitle>
      <div className="ornate-2 px-3 py-4">
        <div className={`grid gap-2 ${stats.length >= 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {stats.map((s) => (
            <div key={s.label} className="slot flex flex-col items-center justify-center px-2 py-3 text-center min-w-0">
              <p className="text-muted text-[11px] sm:text-xs leading-tight">{s.label}</p>
              <p className={`font-display text-2xl sm:text-3xl font-extrabold leading-none mt-1.5 ${s.bad ? "text-crimson" : "text-gold-2"}`}>
                {s.value}
                {s.unit && <span className="text-muted text-xs sm:text-sm font-bold ml-0.5">{s.unit}</span>}
              </p>
            </div>
          ))}
        </div>
        {note && <p className="text-muted text-xs text-center mt-3">{note}</p>}
      </div>
    </section>
  );
}
