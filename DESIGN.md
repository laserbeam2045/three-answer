# 3人協力カード合体クイズ — 設計仕様書

カプリティオチャンネル考案の3人協力型カードゲームのWebアプリ実装。
本ドキュメントが唯一の正であり、実装・データ作成はすべてこれに従うこと。

## 1. ゲームルール

- プレイヤーは A / B / C の3人。各自に**相異なるひらがなワードカード10枚**が配られる（合計30枚、全て相異なる）。
- 自分の手札のみ見える。他人の手札は見えない。
- 20問のクイズが順に出題される。各問題の正解は、**場に出されたカードの読みの連結**で表現される：
  - 序盤: 1枚（例: 正解「らいと」= Bの「らいと」1枚）
  - 中盤〜: 2枚の連結（例: 正解「むーんらいと」= Aの「むーん」+ Bの「らいと」）
  - 最終盤: 3枚の連結（例: 「むーんらいとでんせつ」= A+B+C）
- **判定ルール（最重要）**: 正解に必要なカードを持つプレイヤー全員が、必要なカードを**ちょうど1枚ずつ**出し、かつ**不要なプレイヤーが誰も何も出さなかった**場合のみ正解。誰か一人でも「必要なのに出さない」「不要なのに出す」「違うカードを出す」をしたら不正解。
- カードは消費されない。過去に使ったカードが再登場することもある。
- プレイヤーは1問につき「カード1枚を出す」か「出さない（パス）」を選ぶ。相談は不可（同室音声チャット等はプレイヤーの自由だがアプリは支援しない）。
- スコア = 正解数 / 20。

## 2. 技術スタック

- Next.js 15 (App Router) + TypeScript strict + Tailwind CSS v4。Vercelにデプロイ。
- 状態管理: Upstash Redis (REST, `@upstash/redis`)。環境変数 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`（Vercel Marketplace 統合の `KV_REST_API_URL` / `KV_REST_API_TOKEN` にもフォールバック）。
- **ローカル開発時は環境変数が無ければ in-memory ストアに自動フォールバック**（`next dev` の単一プロセスで動作）。
- リアルタイム同期: クライアントが約1秒間隔でGETポーリング。WebSocketなし。
- 問題データ: `data/sets/*.json` に静的同梱（ビルドに含める）。

## 3. データモデル

### 3.1 問題セット (`src/lib/types.ts` 参照が正)

```ts
type Role = "A" | "B" | "C";

interface QuestionSet {
  id: string;            // "set1" .. "set5"
  title: string;         // 表示名
  difficulty: 1|2|3|4|5; // セット全体の難易度
  description: string;   // ロビーでの説明文
  hands: Record<Role, string[]>; // 各10語のひらがなカード
  questions: SetQuestion[];      // ちょうど20問
}

interface SetQuestion {
  q: string;              // 問題文
  answerDisplay: string;  // 表示用正解（漢字・カナ等）
  answerReading: string;  // ひらがな読み = requiredのカードをこの順に連結したもの
  required: { role: Role; card: string }[]; // 連結順。1〜3要素
  explanation: string;    // 解説（引っかけの種明かし含む。判定画面・履歴で表示）
  source: string;         // "quizzes3:<id>" または "original"
}
```

### 3.2 ルーム状態 (Redis: `room:{roomId}` にJSON)

```ts
interface RoomState {
  v: number;               // バージョン。全書き込みで+1（CAS用）
  roomId: string;
  createdAt: number;       // serverMs
  hostToken: string;       // ルーム作成者
  clients: Record<string, ClientInfo>; // token -> info
  seats: Partial<Record<Role, string>>; // role -> token
  phase: "lobby" | "question" | "judging" | "results";
  setId: string | null;    // 選択中セット
  playedSetIds: string[];  // このルームで遊び終えたセット
  qIndex: number;          // 0..19
  timer: TimerState | null;   // question フェーズのみ
  pausedRoles: Role[];     // 非アクティブで一時停止の原因になっている席
  answers: Record<Role, AnswerState>; // 現在の問題への各自の選択
  results: QuestionResult[]; // 判定済み履歴（judging画面は results[qIndex] を表示）
  settings: { answerSeconds: number }; // デフォルト 45
}

interface ClientInfo { name: string; }

interface TimerState {
  totalMs: number;              // revealMs + answerSeconds*1000
  elapsedBeforeResumeMs: number;
  resumedAt: number;            // serverMs。paused中は無意味
  paused: boolean;
}

interface AnswerState {
  cardIndex: number | null; // 手札のindex。null = パス（現在の仮選択）
  locked: boolean;
}

interface QuestionResult {
  qIndex: number;
  correct: boolean;
  played: { role: Role; cardIndex: number; card: string }[]; // 出されたカード
  // 正解表示は毎問すぐ行う（answerDisplay / answerReading / required / explanation をクライアントに渡す）
}
```

### 3.3 プレゼンス (Redis: `room:{roomId}:presence` ハッシュ)

- field = token, value = `"{lastSeenMs}|{visible:0|1}"`。
- GETポーリングのたびに自分のfieldを更新（`visible` は Page Visibility API の値）。
- **アクティブ判定**: `lastSeen >= now - 6000 && visible`。
- 両キーとも TTL 24h（書き込み時に更新）。

## 4. タイマー・一時停止のセマンティクス

- `question` フェーズ開始時: `revealMs = min(12000, 400 + q.length * 100)`（問題文タイプライター表示時間）、`totalMs = revealMs + answerSeconds*1000`。
- 経過時間: `effectiveElapsed = paused ? elapsedBeforeResumeMs : elapsedBeforeResumeMs + (serverNow - resumedAt)`。
- クライアントは `effectiveElapsed < revealMs` の間はタイプライター表示（`revealMs`に対する進捗で文字数決定）、以降は残り秒カウントダウン表示。**一時停止中はタイプライターもカウントダウンも止まる。**
- **遅延遷移（lazy transition）**: 状態のGET/POSTのたびにサーバーが以下を評価し、変化があればCAS書き込み:
  1. `phase === "question"` かつ 3席のうち誰かが非アクティブ かつ `!paused` → `paused = true; elapsedBeforeResumeMs = effectiveElapsed; pausedRoles = [...]`。
  2. `paused` かつ 全席アクティブ → `paused = false; resumedAt = now; pausedRoles = []`。
  3. `phase === "question"` かつ `!paused` かつ `effectiveElapsed >= totalMs` → 判定実行 → `phase = "judging"`（未ロックの選択もそのまま採用。null はパス）。
  4. 全員 `locked` → 即判定 → `phase = "judging"`。
- 判定は `judge()`（純関数）: 出されたカード集合（role+cardIndex, cardIndex!==null のもの）が `required` 集合と完全一致なら正解。
- serverMs は常にサーバー時刻。クライアントはレスポンスの `serverNow` とローカル時刻の差分オフセットで補正。

## 5. API（App Router route handlers）

すべて JSON。エラーは `{ error: string }` + 4xx。

- `POST /api/rooms` body `{ name?: string }` → `{ roomId, token }`。ルーム作成、作成者をclientsに登録。
- `GET /api/rooms/{roomId}?token=T&visible=1` → `{ state: RedactedState, serverNow }`。
  - プレゼンス更新 + 遅延遷移をここで実施。
  - 未知トークンは観戦者として自動登録（名前は「観戦者N」）→ **リンクを開くだけで参加**。
  - **Redaction**: `question`フェーズ中、`answers` は自分の選択のみ・他人は `{locked}` のみ。手札 `hands` は自分の分のみ（観戦者には `spectatorReveal=true` クエリ時のみ全手札を返す。judging/results では played/正解情報は全員に公開。resultsフェーズでは全手札公開）。
- `POST /api/rooms/{roomId}/actions` body `{ token, action }`。actionはタグ付きユニオン:
  - `{ type: "setName", name }`
  - `{ type: "sit", role }`（空席のみ。ゲーム中は非アクティブ席の引き継ぎも可）
  - `{ type: "standUp" }`（lobbyのみ）
  - `{ type: "selectSet", setId }`（**ルーム作成者のみ**、lobbyのみ）
  - `{ type: "setAnswerSeconds", seconds }`（**ルーム作成者のみ**、lobbyのみ）
  - `{ type: "start" }`（**ルーム作成者(hostToken)のみ**。3席埋まり・全席アクティブ・setId選択済み、lobby→question。answers初期化）
  - `{ type: "select", cardIndex: number | null }`（着席者、questionフェーズ、未locked時）
  - `{ type: "lock" }` / `{ type: "unlock" }`（unlockは全員locked前のみ）
  - `{ type: "next" }`（judgingフェーズ、**ルーム作成者のみ**。qIndex<19→次のquestion、=19→results。resultsで playedSetIds に追加）
  - `{ type: "backToLobby" }`（resultsフェーズ、着席者。スコア履歴はルームに保持したまま lobby へ。別セットを選んで再戦可能）
- 書き込みは全て CAS リトライループ（`store.ts` の `mutate(roomId, fn)`）。

## 6. 画面構成（1ページSPA: `/room/[roomId]`、ポーリング駆動）

トップページ `/`: タイトル、ゲームルール説明、名前入力 + 「ルームを作る」。作成後 `/room/xxx` へ遷移し、URLコピーUIを表示。

`/room/[roomId]` は `phase` に応じて切替:

1. **Lobby**: 名前設定、A/B/C席（クリックで着席、codenames風。**スマホでも3席横並び**）、観戦者一覧、セット選択（難易度表示・遊了バッジ付きカードUI）、開始ボタン（**ルーム作成者のみ表示**。条件未満はdisabled + 理由表示。非ホストには「開始は作成者が行います」表記）。
2. **Question**: 上部に「第n問 / 20」、問題文タイプライター、残り時間バー+秒数。下部に自分の手札10枚（カードUI、選択でハイライト）、「出さない」ボタン、「決定」（ロック）。他プレイヤーの状態インジケータ（考え中/決定済み）。観戦者は手札の代わりに「決定状況」を見る（revealトグルONなら全手札表示）。
3. **Judging（全員同一表示）**: 場に出たカードをプレイヤー別に表示 → 正解/不正解を大きく演出（○/×、色）。正解の場合は出たカードが連結して正解語になる演出。**毎問、本来の正解（answerDisplay + 読み）と解説を表示**。「次の問題へ」ボタン。
4. **Results**: スコア（n/20）大表示、全20問の履歴テーブル（問題・正解・必要カード・出たカード・○×・解説の展開）、全員の手札公開、「ロビーに戻る（別セットで再戦）」。
5. **Pause overlay**: questionフェーズで `pausedRoles` 非空のとき全員に「⏸ ○○さんの復帰を待っています」オーバーレイ（タイマー停止表示）。

### デザイン言語
- ダークテーマ固定のクイズ番組風。背景 `#0f1117` 系、アクセントはプレイヤー色 A=`#f43f5e`(rose) / B=`#3b82f6`(blue) / C=`#22c55e`(green)、正解=金 `#fbbf24`、不正解=グレー/赤。
- カードは白地に濃紺文字の「札」風（角丸、影、hoverで浮く）。日本語フォント: `next/font/google` の Noto Sans JP（题字は太字）。
- レスポンシブ必須（スマホ縦でプレイ可能に。手札は横スクロール or グリッド）。
- 演出はCSS transitionで軽く（フリップ、フェード、正解時の金色グロー）。効果音なし。

## 7. ファイル構成と所有権

```
src/lib/types.ts        … 型定義（共有・変更は要合意）
src/lib/time.ts         … タイマー計算純関数
src/lib/judge.ts        … 判定純関数
src/lib/engine.ts       … アクション適用・遅延遷移の純関数 (state, action|tick) => state
src/lib/redact.ts       … 状態のredaction純関数
src/lib/store.ts        … Redis/メモリ CAS mutate + presence
src/lib/sets/index.ts   … セットJSON読み込み・一覧
src/app/api/...         … route handlers（engineの薄いラッパ）
src/app/page.tsx        … トップ
src/app/room/[roomId]/page.tsx … ルームSPA（クライアントコンポーネント）
src/components/*.tsx    … 画面部品
src/hooks/useRoom.ts    … ポーリング + アクション送信 + サーバー時刻オフセット
data/sets/set1..5.json  … 問題セット
scripts/validate-sets.ts … セット検証（CIで実行可能）
tests/*.test.ts         … engine/judge/time のユニットテスト
```

## 8. 問題セットの設計原則（データ作成者向け）

- 20問構成の目安: 単独11問（Q1〜Q11）、2枚合体8問（Q12〜Q19: A+B / A+C / B+C を混ぜる）、3枚合体1問（Q20）。
- 序盤→終盤で難化。**知識がなくても問題文から推測できる**問題を選ぶ（固有名詞の丸暗記系は避けるか、ヒントを問題文に含む形に）。
- 各カードの役割を設計する:
  - 再利用: 単独正解に使ったカードが後半の合体で再登場（例: らいと→むーんらいと）。
  - 温存: 序盤一度も使わないカードが後半の合体で初登場（例: ぺぐ+しる）。
  - 引っかけ: 正解には不要だが「出すべきか？」と悩む札を意図的に配る（例: サンドイッチ問題に れたす・はむ、駅伝問題に かなくりしそうはい）。**各問題に最低1枚は引っかけ候補があること**。引っかけは熟考すれば「出さない」と判断できる明確な根拠があること。
  - 未使用カードは最小限に（0〜3枚程度。全て引っかけとして機能させる）。
- 禁止事項: 30枚に重複、正解が2通りの出し方で作れる構成、必要カードを複数人が持つ構成、判定の曖昧さ。
- `explanation` には「なぜこの答えか」+「引っかけの種明かし」を書く。ただし**手札のネタバレ禁止**:
  第i問の判定時点で公開済みなのは Q1〜Qi の required のカードのみ。それ以外のカードは
  名前を出すだけで「誰かが持っている」ことがバレるため、カード名・持ち主とも言及禁止
  （概念レベルの言い換えで種明かしする。バリデータが「」引用の未公開カード名を機械検出する）。
