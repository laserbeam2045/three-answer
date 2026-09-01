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
      <RuleSection title="あそびかた">
        <p>3人チームで挑む協力クイズ。答えは声に出さず、<b>手札のひらがなカードを場に出して</b>答えます。</p>
        <p>カードは1人10枚ずつ。見えるのは<b>自分の手札だけ</b>です。</p>
        <p>問題ごとに、制限時間内で「<b>カードを1枚出す</b>」か「<b>出さない</b>」かをこっそり決めます。全員が決めたら一斉オープン！</p>
      </RuleSection>

      <RuleSection title="正解の条件">
        <p>場に出たカードが、答えと<b>ピッタリ一致</b>したら正解です。</p>
        <p>
          たとえば答えが「りんご」で、その札を持っているのがBだけなら——
          <br />⭕ Bが<Card role="b">りんご</Card>を出し、AとCは出さない → <b>正解！</b>
          <br />❌ 関係ないカードが1枚でも出ている → <b>不正解</b>
          <br />❌ Bが出しそびれる → <b>不正解</b>
        </p>
        <p>「これ、自分の札のことかも？」「ここは我慢？」を読み切るのがこのゲームの醍醐味。カードは出しても減りません。</p>
      </RuleSection>

      <RuleSection title="やくそく">
        <p>🤐 自分のカードの内容は教えない（「持ってる」などの匂わせもNG）</p>
        <p>🙅 プレイヤー同士の相談は禁止</p>
        <p>👀 観戦者はプレイヤーにヒントを出さない</p>
      </RuleSection>

      <p className="text-xs text-muted">
        全20問。誰かがタブを閉じたり切り替えたりすると自動で一時停止し、全員が戻ると再開します。
      </p>
    </div>
  );
}
