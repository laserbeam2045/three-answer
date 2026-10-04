import type { ReactNode } from "react";
import { BOMBER_MAX_PLAYERS, BOMBER_POINTS, BOMBER_SLOTS } from "@/lib/bomber/match";

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
          1〜{BOMBER_MAX_PLAYERS}人で遊べます。
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
      <RuleSection title="爆弾と得点">
        <p>
          {BOMBER_SLOTS}つ正解すればクリア。時間内に{BOMBER_SLOTS}つ揃わないと爆弾が爆発して、その問題は終わりです。
          1つ正解するごとに{BOMBER_POINTS}点。全10問の合計点を目指します。
        </p>
      </RuleSection>
    </div>
  );
}
