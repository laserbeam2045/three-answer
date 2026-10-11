import type { ReactNode } from "react";
import {
  BOMBER_MAX_PLAYERS,
  BOMBER_POINTS,
  BOMBER_SLOTS,
  BOMBER_MANY_ANSWERS_MIN,
} from "@/lib/bomber/match";

function RuleSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="font-display text-gold text-xs sm:text-sm font-bold tracking-[0.25em] mb-1.5">
        {title}
      </h3>
      <div className="text-sm text-ink/90 leading-relaxed space-y-1.5">{children}</div>
    </section>
  );
}

export default function BomberRulesContent() {
  return (
    <div className="space-y-4">
      <RuleSection title="どんなゲーム？">
        <p>
          「答えが{BOMBER_SLOTS}つ以上ある問題」に、みんなで1人1つずつ順番に答えていくリレー形式のクイズです。
          1〜{BOMBER_MAX_PLAYERS}人で遊べます。ゲームの途中から参加したり、途中で抜けたりもできます。
        </p>
      </RuleSection>
      <RuleSection title="答え方">
        <p>
          爆弾を持っている人が回答者です。答えを入力して送信し、正解すると爆弾が次の人に移ります。
          <strong className="text-gold">パスはできません。</strong>
          不正解や、すでに出た答えのときは、正解するまで同じ人が答え直します。
        </p>
        <p className="text-muted text-xs">
          ひらがな・カタカナ・漢字のどれで入力しても判定されます。
        </p>
      </RuleSection>
      <RuleSection title="答える順番と数">
        <p>
          参加者の<strong className="text-gold">順番どおりに1人ずつ</strong>答え、最後の人の次は最初の人に戻ります（1→2→3→1→2→3…）。
          次の問題は、前の問題の続きの人から始まります。
        </p>
        <p>
          答えが{BOMBER_MANY_ANSWERS_MIN}個以上ある問題や、全部言えそうな簡単な問題は、5つより多く（最大20個）答えます。
          制限時間は「答え1つあたりの秒数 × 答える数」なので、答える数が多いほど長くなります。
        </p>
      </RuleSection>
      <RuleSection title="爆弾と得点">
        <p>
          画面に出る数（ふつうは{BOMBER_SLOTS}つ）正解すればクリア。時間内に揃わないと爆弾が爆発して、その問題は終わりです。
          1つ正解するごとに{BOMBER_POINTS}点。全10問の合計点を目指します。
        </p>
      </RuleSection>
    </div>
  );
}
