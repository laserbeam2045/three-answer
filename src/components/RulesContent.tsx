import type { ReactNode } from "react";

function RuleSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-gold text-xs font-bold tracking-widest mb-1.5">{title}</h3>
      <div className="text-sm text-ink/90 leading-relaxed space-y-1.5">{children}</div>
    </section>
  );
}

function Card({ children, role }: { children: ReactNode; role: "a" | "b" | "c" }) {
  const bar = { a: "border-b-player-a", b: "border-b-player-b", c: "border-b-player-c" }[role];
  return (
    <span
      className={`inline-block bg-card-face text-card-ink font-bold text-xs px-1.5 pt-0.5 pb-1 rounded border-b-2 ${bar} mx-0.5 align-middle`}
    >
      {children}
    </span>
  );
}

/** ルール説明（トップページとロビーの両方で使用） */
export default function RulesContent() {
  return (
    <div className="flex flex-col gap-4">
      <RuleSection title="どんなゲーム？">
        <p>
          3人で協力して挑むクイズゲームです。クイズの答えを声や文字で答えるのではなく、
          <b>手札のひらがなカードを場に出して</b>答えます。全20問、みんなで何問正解できるかに挑戦します。
        </p>
      </RuleSection>

      <RuleSection title="じゅんび">
        <p>
          プレイヤーはA・B・Cの3人。それぞれに<b>異なるひらがなカードが10枚ずつ</b>配られます。
        </p>
        <p>
          見えるのは<b>自分の手札だけ</b>。仲間の2人がどんなカードを持っているかは分かりません。
        </p>
      </RuleSection>

      <RuleSection title="1問の流れ">
        <p>① 問題文が読み上げられます（タイプライター表示）。</p>
        <p>② 制限時間内に、各自こっそり「<b>カードを1枚出す</b>」か「<b>出さない</b>」を選んで決定します。</p>
        <p>③ 3人全員が決定する（か時間切れになる）と、出したカードが一斉にオープンされ判定されます。</p>
      </RuleSection>

      <RuleSection title="正解のしくみ（いちばん大事！）">
        <p>
          正解の言葉は、<b>場に出たカードの読みをつなげたもの</b>です。序盤は1枚で完成しますが、
          問題が進むと2枚、最後は3枚の合体が必要になります。
          <b>何枚の合体なのかは知らされません。</b>そこを読むのもゲームのうちです。
        </p>
        <p>
          たとえば答えが「ホットケーキ」で、Aが<Card role="a">ほっと</Card>、Cが
          <Card role="c">けーき</Card>を持っているなら——
        </p>
        <p>
          ⭕ Aが<Card role="a">ほっと</Card>、Cが<Card role="c">けーき</Card>を出し、Bが何も出さない
          → <b>正解！</b>
        </p>
        <p>
          ❌ AとCが正しく出しても、Bが余計なカードを1枚でも出したら → <b>不正解</b>
          <br />❌ Cが「Aは持ってないだろう」と思って出さなかったら → <b>不正解</b>
        </p>
        <p>
          つまり、<b>必要なカードを持っている人が過不足なくピッタリ出せたときだけ正解</b>。
          「自分の札は必要か？　それとも誰かに任せて我慢するべきか？」を読み切りましょう。
        </p>
      </RuleSection>

      <RuleSection title="カードについて">
        <p>カードは出しても<b>なくなりません</b>。一度使ったカードが後の問題で再び必要になることもあれば、ずっと出番のなかったカードが終盤に輝くこともあります。</p>
        <p>手札には「出したくなるけれど実は不正解」の<b>引っかけカード</b>も混ざっています。問題文をよく読めば必ず見破れます。</p>
      </RuleSection>

      <RuleSection title="たいせつな約束（フェアプレイ）">
        <p>🤐 <b>自分のカードの内容を他の人に教えてはいけません。</b>「持ってる」「持ってない」のような匂わせもNGです。</p>
        <p>🙅 <b>3人の間での相談は禁止です。</b>通話やチャットをつなぎながら遊ぶ場合も、答えやカードに関するやりとりはしないでください。</p>
        <p>👀 観戦者はプレイヤーにヒントを出さないでください（観戦者どうしで盛り上がるのは大歓迎！）。</p>
      </RuleSection>

      <RuleSection title="そのほか">
        <p>・誰かのブラウザが非アクティブになる（タブを切り替える等）と、カウントダウンごと自動で一時停止します。全員が戻ると再開します。</p>
        <p>・判定画面では毎問、正解と解説（引っかけの種明かし）が表示されます。</p>
        <p>・全20問が終わるとスコアと全問の履歴、全員の手札が公開されます。目指せ20問全問正解！</p>
      </RuleSection>
    </div>
  );
}
