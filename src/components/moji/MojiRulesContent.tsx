import type { ReactNode } from "react";
import { MOJI_GAME_LENGTH, MOJI_MAX_PLAYERS, MOJI_MIN_PLAYERS, MOJI_POINTS } from "@/lib/moji/engine";

function RuleSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="font-display text-gold text-xs sm:text-sm font-bold tracking-[0.25em] mb-1.5">{title}</h3>
      <div className="text-sm text-ink/90 leading-relaxed space-y-1.5">{children}</div>
    </section>
  );
}

export default function MojiRulesContent() {
  return (
    <div className="space-y-4">
      <RuleSection title="どんなゲーム？">
        <p>
          答えの読みを、参加者が<strong className="text-gold">1人1文字ずつ</strong>書いてつくる協力クイズです。
          全員の文字が正しければ正解。{MOJI_MIN_PLAYERS}〜{MOJI_MAX_PLAYERS}人で遊べます。
        </p>
        <p>
          問題は、正答率がだいたい60〜70%のものから、<strong className="text-gold">読みの文字数が参加人数と同じ</strong>ものが自動で選ばれます（3人なら3文字の答え）。
        </p>
      </RuleSection>
      <RuleSection title="答え方">
        <p>
          参加した順に1文字目・2文字目…を担当します。自分の担当の文字を<strong className="text-gold">かな1文字</strong>で書いて「決定」します。
          ほかの人が書いた文字は、判定まで見えません。全員が決定するか、時間切れで判定します。
        </p>
        <p className="text-muted text-xs">
          ひらがなでもカタカナでもかまいません。小さい「っ」「ゃ」は大きい字でも正解です。のばす音は「ー」で書きます。
        </p>
      </RuleSection>
      <RuleSection title="途中参加・途中離脱">
        <p>
          ゲームの途中でも参加できます（次の問題から）。人数が変わると、次の問題からその人数の文字数の問題になります。
          答えている人が抜けた問題は中止になり、得点には数えません。
        </p>
      </RuleSection>
      <RuleSection title="得点">
        <p>
          正解1問につき{MOJI_POINTS}点。中止を除いて{MOJI_GAME_LENGTH}問で1ゲームです。
        </p>
      </RuleSection>
    </div>
  );
}
