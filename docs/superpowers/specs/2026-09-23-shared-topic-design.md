# お題を Tasuki 全体の資産にする（#91）— 設計正本

- **Issue**: [#91](https://github.com/tomohiroJin/tasuki-tools/issues/91)（epic / proposal）
- **日付**: 2026-09-23

**実測時点**: main `31770d7`（v4.0.0 を本番へ配布した直後）

**前提となる規範**: [`docs/constitution.md`](../../constitution.md) 原則 I（TDD）/ III（揮発インメモリ）/
IV（境界の型安全）/ V（実画面検証）/ VI（依存は内向き）/ VII（検査は壊して確かめる）/
VIII（記録が正本）/ IX（小さく回す）/ XI（秘密と個人情報を持ち込まない）

**前提となる ADR**: [`docs/adr/0011`](../../adr/0011-threat-model-and-data-classification.md)（脅威モデル）/
[`docs/adr/0012`](../../adr/0012-logging-secrets-and-disclosure.md)（ログ・秘密・開示。**D10**）/
[`docs/adr/0017`](../../adr/0017-bounded-contexts-and-packages.md)（文脈の分割）/
[`docs/adr/0018`](../../adr/0018-single-entry-and-url-scheme.md)（入口は玄関 1 つ）/
[`docs/timer/adr/0005`](../../timer/adr/0005-secret-zero-byok-problem.md)（BYOK・代表委譲）/
[`docs/timer/adr/0007`](../../timer/adr/0007-volatile-in-memory-state.md)（揮発インメモリ状態）/
[`docs/timer/adr/0008`](../../timer/adr/0008-server-resident-ai-generation.md)（サーバー常駐 AI 生成）

**この文書の位置づけ**: 設計の正本はこの文書である。Issue・PR へ表を転記せず、ここを参照する。

## 1. 目的

お題は、いまは **TDD Mob Pro Timer の中にしかない**。これをルームの持ち物にし、
**玄関に並ぶ 3 枚目の札（お題ツール）で入力して、ルームの全員へ同じ内容を配る。**
各ツールはそのお題を**読んで表示するだけ**である。

利用者の言葉（2026-09-23 の対話）:

- お題として、他の機能でも表示できるようにする
- モブではいま取り組んでいるお題が表示され、ポーカーではお題に見積もりの検討結果が反映される。
  ファシリテーター・ルーレットでは、お題に対するファシリが誰かを決める
- **お題なしで扱うこともできる**
- **それぞれは絡み合いつつ、直接は関係を持たない。** お題機能は、他が呼んで見ることができる程度のものとする
- TDD のお題は以前、TDD 用に作り込みすぎていた。**基本的な運用で使える単純な形こそ、TDD の練習にも価値を持つ**
- モブタイマーのお題作成は廃止する。画面は timer の形にこだわらず考え直す

## 2. 実測した事実（Issue 本文の前提との差）

Issue 本文は 2026-08-09（main `ecd1652`、#95 の着手前）に書かれた。前提の大半は #95 で変わった。

| 本文の前提 | 2026-09-23 の実態 |
|---|---|
| 玄関 LP は完全な静的サイトである | **ハブ**になっている。`apps/landing/src/hub/use-hub-sync.ts` で同期サーバーに繋がる |
| 同期サーバーは `apps/timer-sync` | `apps/tasuki-sync` の 1 本。1 つのルームが timer と poker を両方持つ |
| AI 資産の置き場を決める必要がある | provider・上限・委譲はすべて `apps/tasuki-sync` にある |
| 見送る判断材料は「timer 以外でお題を使う場面が無い」こと | **利用者が場面を挙げた**（§1）。見送りの根拠は無くなった |

本文に書かれていないが、#91 に預けられた宿題がある。

- **`docs/adr/0012` D10（MUST）**: `claude -p` へ渡す権限は既定の挙動に頼らず、明示的に閉じる。
  プロンプトへ埋め込む利用者由来の値（`language` / `difficulty`）は、境界で許可リストに照らして列挙検証する。
  2026-08-13 に持ち出し経路（注入 → Read ツールで `/opt/tasuki/tasuki-sync.env` を読む）が本番で成立すると実測し、
  利用者の判断でリスクを受容したうえで、実装を #91 へ送っていた
  （`docs/superpowers/specs/2026-08-13-security-norms-design.md` §3.4.1・§8）
- **現状は未実装。** `apps/tasuki-sync/src/adapters/claude-cli-problem-provider.ts` はツール権限を指定していない。
  `packages/timer-core/src/schemas.ts` の `language` / `difficulty` は長さしか見ていない
- 画面の選択肢（10 言語・easy / medium / hard）は `apps/timer-web/src/ui/components/ProblemConfigPanel.tsx` にしか無い。
  選択式なので、境界で列挙検証しても利用者の操作は変わらない
- クライアントへ生成を委ねる経路（代表・`hasAiKey`・`need-problem`）は、実クライアントが常に
  `hasAiKey: false` を送るため**実際には使われていない**（`apps/timer-web/src/sync/use-timer-sync.ts`）
- 定型バンク（`packages/timer-core/src/problem-bank.ts`）は 33 件（easy 12 / medium 14 / hard 7）
- timer は未知のフレーム種別を検証エラーとして捨て、利用者へ通知する（`apps/timer-web/src/sync/dispatch.ts`）

## 3. 範囲

### この設計で行うこと（#91）

1. お題を 4 つ目の文脈（`packages/topic-core`）にし、ルームの持ち物にする
2. お題ツール `apps/topic-web`（公開パス `/topic/`）を新設し、玄関に 3 枚目の札を足す
3. お題の状態を、ルームの全接続へ同じ形のフレームで配る
4. 玄関・timer・poker は、お題を**読んで表示するだけ**にする
5. timer のお題作成を撤去する（編集・生成・解錠・自動用意・`problemEnabled`）
6. AI 生成と定型バンクをお題の文脈へ移し、**`docs/adr/0012` D10 を実装する**
7. timer の完成記録には、そのとき掲げていたお題の**タイトル**を写して残す

### 後続に回すこと（この設計では行わない）

- poker の見積もり結果をお題へ反映する（#93 と合流させる）
- ファシリテーター・ルーレット（#94）
- 複数のお題の管理

### やらないこと

- **お題のサーバー永続化。** 揮発インメモリの方針（`docs/timer/adr/0007`）を守る。恒久的な記録は端末側（timer の IndexedDB）だけに置く
- **旧 wire との後方互換。** timer のお題 wire は削除する（§6）

## 4. 決定

番号は `T`（Topic）で振る。`docs/adr/0012` の `D10` などと字面で混ざらないようにするためである。

| # | 決定 | 理由 |
|---|---|---|
| T1 | お題は 4 つ目の文脈 `packages/topic-core` とする。**ツールのドメイン（`timer-core` / `poker-core`）は topic-core に依存しない（MUST NOT）** | `docs/adr/0017` の「文脈をつなぐのはアプリ層」に乗る。「直接は関係を持たない」の構造上の表現 |
| T2 | お題は「タイトル＋本文」の単純な形にする。TDD 専用の項目（要件・テスト例・ヒント）は持たない | 利用者の判断（§1）。poker・ルーレットでも同じお題を置ける |
| T3 | お題の状態は、変わるたびに**ルームの全接続へ**ツールを問わず同じ `topic` フレームで配る | 各ツールのスナップショットへ埋め込む案は、ツールの wire をお題に依存させる。表示側が 2 本目の接続を張る案は接続数を倍にする |
| T4 | お題を変えられるのは**お題ツールの接続だけ**。玄関・timer・poker は表示専用。**拒否は接続の種類ごとのスキーマ振り分けで行い、お題のコマンドは他の接続のスキーマに存在しない**（§5.3） | 「他が呼んで見ることができる程度」の線引き。ツールごとの可否判定（`tool-gate.ts`）は #95 S5b で撤去しており、共通の処理に門を戻さない |
| T5 | お題の既定は「なし」。ルームを作っただけでは用意しない | お題なしでも各ツールが成り立つ |
| T6 | 作る手段は **手入力・AI 生成・定型バンク** の 3 つ。AI と定型は「言語×難易度」の選択式のまま | TDD 練習の価値を保ち、`docs/adr/0012` D10 の列挙検証がそのまま成り立つ |
| T7 | クライアントへ生成を委ねる経路（代表・`hasAiKey`・`need-problem`・`problem.submit`）は廃止する | 実際には使われていない（§2）。残すと守る面だけが増える。脅威モデルの記述は §8 で改める |
| T8 | `claude -p` の組み込みツールを起動引数で明示的に全部閉じる。`language` / `difficulty` は境界で `v.picklist` により検証する。**全部を閉じられることを実測で示せなければ、AI 生成は入れない**（§5.3） | `docs/adr/0012` D10（MUST）。2026-08-13 に持ち出し経路が本番で成立している |
| T9 | timer の完成記録は、**お題の有無にかかわらず毎回作る**。お題があれば完了時点の**タイトルだけ**を**同期サーバーのアプリ層が値として渡して**写し、無ければ `null` にする。本文は写さない | T5 でお題なしが既定になる。現行の「お題があるときだけ記録を作る」を引き継ぐと、大半のセッションで記録が消える（#273 で直した欠陥の拡大版）。本文（最大 4000 字）を写すと、件数の上限が無い `sessionRecords` が毎回のスナップショットで配られ続けて膨らむ（2026-09-23 のレビュー。利用者の判断でタイトルだけにした）。timer-core を topic-core に依存させない |
| T10 | 旧 wire との互換は切る。配布は最後に 1 回行う | 揮発インメモリなので、再起動でルームはどのみち全部消える |
| T11 | **お題は timer のセッションをまたいで残る。** 下ろすのはお題ツールの操作だけである。#273 の「完了からロビーへ戻るとき前のセッションのお題を持ち越さない」は廃止する | お題はルームの持ち物であり、timer の一区切りに縛られない。poker・ルーレットからも同じお題が見えている |
| T12 | topic-core の表現は **直接遷移関数＋`Result`** とする（`docs/adr/0016` 決定 1） | イベントの履歴・再生・段階適用が要らない。状態は 1 つのお題と生成の帳簿だけである |
| T13 | 表示部品は**各アプリに置く**。`packages/ui` には置かない | `packages/ui` は CSS と書体だけのパッケージで、TS のビルドも型検査も持たない（`packages/ui/README.md`）。数行の部品のために React の基盤を持ち込まない |

## 5. 設計

### 5.1 `packages/topic-core`（純粋なドメイン）

```ts
interface Topic {
  title: string;   // 1〜200 字（MAX_TOPIC_TITLE = 200）
  body: string;    // 0〜4000 字（MAX_TOPIC_BODY = 4000）。自由文。改行可
  source: "manual" | "ai" | "fallback";
}

interface TopicState {         // ルームごとに 1 つ
  topic: Topic | null;         // null = お題なし（既定）
  generating: boolean;         // 生成中（#283 のサーバー権威を引き継ぐ）
  degraded: boolean;           // 直近の生成が、AI を求めたのに定型へ落ちた
  aiUnlocked: boolean;         // AI 解錠（timer から移る）
}
```

- 上限は現行の `MAX_PROBLEM_TITLE`（200）・`MAX_PROBLEM_TEXT`（4000）を引き継ぐ。
  AI の出力も定型バンクも、この上限の中に収まる
- 手で書き換えたら `source` は `manual` になる（`edited` は持たない）
- **帳簿の遷移**（現行 `problem-delegation.ts` の `request` / `finalize` の規則を引き継ぐ）:

  | 契機 | `generating` | `degraded` | `topic` |
  |---|---|---|---|
  | `topic.generate` を受けた | `true` | `false` | 据え置き |
  | AI が検証を通るお題を返した | `false` | `false` | AI のお題 |
  | `mode: "fallback"` で定型を掲げた | `false` | `false` | 定型 |
  | `mode: "ai"` を求めたが、失敗・日次上限・同時実行数の超過・時間切れ・未解錠・AI 無効で定型へ落ちた | `false` | `true` | 定型 |
  | `topic.generate` がクールダウンで拒否された | 据え置き | 据え置き | 据え置き |
  | `topic.set` / `topic.clear` | `false` | `false` | 手入力のお題／`null` |

- **`aiUnlocked` は、いったん立ったらルームの寿命の間続く**（現行と同じ。再施錠の操作は持たない）。
  ルームが破棄されれば一緒に消える
- **許可リスト**: `LANGUAGES`（TypeScript / JavaScript / Python / Java / Go / Ruby / Rust / C# / Kotlin / Swift）と
  `DIFFICULTIES`（easy / medium / hard）を topic-core に置く。画面の選択肢もここから引く
- **境界スキーマ**（valibot）: `Topic`・`TopicState`・`topic` フレーム・お題ツールのコマンド。
  `language` / `difficulty` は `v.picklist` で検証する
- **`buildTopicPrompt(language, difficulty)`**: 「タイトル＋本文」の JSON を求める。
  本文には、課題の説明・満たすべき振る舞い・最初に書くテストの例を**自由文で**含めるよう指示する。
  **プロンプトへ入るのは許可リストの値だけで、利用者が手で書いたタイトル・本文は入らない**
- **定型バンク**: 33 件を移し、各件の `description` / `requirements` / `exampleTest` / `hints` を本文 1 本へ畳む。
  `pickFallback(language, difficulty, now, previous)` の選び方（絞り込み・直前と同じものを外す・`now` を種にする）は引き継ぐ
- **`validateTopic(raw)`**: AI 由来の値を信頼しない入力として検証する
- 表現は直接遷移関数＋`Result`（T12）

### 5.2 `packages/timer-core` から消えるもの・残るもの

- **消える**: `Problem` / `ProblemSource` / `ProblemMode` / `ProblemGeneration` / `problem.ts` / `problem-bank.ts` / `buildProblemPrompt` /
  `SessionConfig.language` / `difficulty` / `problemEnabled` /
  状態の `problem` / `problemMode` / `problemGeneration` / `aiUnlocked` / `aiKeyHolders` /
  お題に関わるコマンド（`problem.*` / `problem-mode.set` / `ai.unlock` 等）とイベント / `room.join` の `hasAiKey`
- **完成記録（`CompletionRecord`）の形を改める**:
  - `problemTitle: string` → `topicTitle: string | null`（いまと同じくタイトルだけを持つ。お題なしで完了したら `null`）
  - `language` / `difficulty` は落とす（設定から消えるため）
  - 完了を起こすコマンドは、アプリ層から `topicTitle: string | null` を値として受け取り、**null でも記録を作る**（T9）
- 消し残しは型検査だけでは見つからない。**消した記号を宣言・例外表・散文まで grep する**
  （公開契約の例外表・`audit-*` の許可表・コメント。上の一覧は出発点であり、網羅の保証ではない）

### 5.3 同期サーバー（`apps/tasuki-sync`）

**接続とコマンド**

- ツール ID に `topic` を加える（`application/tool-id.ts`）。`?tool=topic` の接続は
  `adapters/ws-adapter.ts` のプロトコル振り分けで、**お題ツール専用のスキーマとハンドラ**へ流す
- **接続の受理と切断は timer と同じ経路を通す（MUST）。** 受理時に `handleConnectionOpen`（`rateLimitGate.open(connId, rateKey)` を
  呼ぶ）、切断時に `handleConnectionClose` を通す。**poker の形（`onConnect` の手前で return する。`ws-adapter.ts` の受理処理）を
  写してはならない** —— 対応が登録されないと `rate-limit-gate.ts` の `keyOf` は接続 ID を鍵にし、張り直すたびに
  `ai.unlock` の枠がリセットされる（2026-09-23 のレビュー）
- **ルームへの入り方**: 参加・復帰は既存の共有の入口（`join-room.ts`。合言葉の関門・表示名の規約・レート制限を含む）を通し、
  お題の接続を名簿の在席へ載せる（`Room.connections`）。切断時は在席の後始末を timer・poker と同じ規則で行う。
  在室確認・全接続への配信（E2・E4）・レート制限の共有（E21）はすべてこの登録に依存する。
  具体的な関数の組み合わせは実装計画で、timer と poker の現行の経路を読んでから決める
- お題ツールの接続が受け付けるコマンド:
  - `topic.set { title, body }` — 手入力で掲げる
  - `topic.clear` — お題なしに戻す
  - `topic.generate { mode: "ai" | "fallback", language, difficulty }` — 作る
  - `ai.unlock { key }` — timer から移す。合言葉の照合（定数時間）・存在の秘匿（機能が無効でも不一致と同じ失敗を返す）は現行の振る舞いを引き継ぐ。
    **成功時に書くのは `TopicState.aiUnlocked` だけ**（現行が同時に書いている `problemMode` は消える）
- 在室者なら誰でも操作できる（#95 で役割を廃止した方針のまま）
- **拒否の仕組み（T4）**: お題のコマンドは、ハブ・timer・poker の接続が使うスキーマに含めない。
  ほかの接続から届いても、未知のコマンドとして境界で弾かれる。**共通の処理（`handlers.ts` の `handleRoomCommand`）に
  ツール別の可否判定を戻さない**
- **レート制限（`ai.unlock` の総当たり対策）**: お題ツールのハンドラには、`makeHandlers` が作って `room.join` と
  共有しているゲートと**同じインスタンス**を配線で渡す。お題ツールの側でゲートを新たに作らない
  （`handlers.ts` の「★取り違えないこと」の注釈。作り直すと総当たり対策が黙って弱まる）
- 生成中に `topic.set` / `topic.clear` / 次の `topic.generate` が届いたら、進行中の生成を中断する
- **作り直しがクールダウン（`ai-limits.ts` のルームごと 10 秒）に掛かったら、定型へ落とさずに拒否する。**
  `topic.generate` を固定のエラーコードで拒否し、**進行中の生成もお題もそのまま残す**（クールダウンの判定は中断より先に行う）。
  日次上限・同時実行数の超過は従来どおり定型へ落とす
- **ルームが破棄されたら、進行中の生成も中断する**（子プロセスを止める。現行の `destroy-room.ts` が
  `delegator.cancel` を呼んでいるのを引き継ぐ）

**状態と寿命**

- `TopicStore`（ポート）とインメモリのアダプタを足す。ルームと一緒に生まれ、`destroy-room.ts` で一緒に消える
- `RoomState` の合成に topic を加えるかどうかは、実装計画で既存の `commit` の形を見て決める
  （**どちらでも、timer と poker のスナップショットには topic を入れない**）

**配信（T3）**

- お題の状態が変わるたびに `{ type: "topic", state: TopicState }` を**そのルームの全接続**
  （ハブ・timer・poker・お題）へ送る
- ルームへ参加・復帰した接続には、その場で 1 通送る
- 送る窓口は、ツールごとの broadcaster の外に 1 つ置く（どのツールの接続かを問わない）
- 配信先は PR ごとに段階的に広げる（§9）

**AI 生成**

- 新しいファイル `adapters/claude-cli-topic-provider.ts` と `application/topic-generation.ts` を作る。
  **サーバー生成と定型だけを持ち、クライアント委譲の経路（候補列・deadline・再委譲・`submit`）は持たない**（T7）。
  旧 `claude-cli-problem-provider.ts` / `problem-delegation.ts` は timer のお題を撤去する PR（§9 の 3）で消す
- 引き継ぐもの: `ai-limits.ts`（日次上限）・タイムアウト（60 秒）・出力上限（1MB）・stderr の秘密の伏せ字・
  子プロセスへ渡す env の絞り込み・`ProviderFailure` による失敗理由の分類・ログの語彙（`log/vocabulary.ts`）
- AI が失敗・日次上限・同時実行数の超過・時間切れ・未解錠・AI 無効のときは定型へ落とす。クールダウンだけは落とさずに拒否する（帳簿は §5.1 の表）
- **T8 ①（ツールを閉じる）**: 組み込みツールを起動引数で全部閉じる。第一候補は `--tools ""`
  （手元の CLI 2.1.280 の `--help` に `--tools` がある）。
  **本番の CLI（2.1.178）で、利用できるツールが 0 個になることを実測する。** 実測は、同じ起動引数に
  `--output-format stream-json --verbose` を足して起動し、最初の `system` / `init` の行が報告するツール一覧が
  空であることを見る（Read だけを試すのでは足りない）
  - 空にならなければ、`--allowedTools` / `--disallowedTools` / `--permission-mode` などの組み合わせを同じ方法で実測する
  - **どの指定でも空にできなければ、AI 生成は入れない**（手入力と定型だけで出す）。部分的に閉じた状態で妥協しない。
    その場合は実装を止めて利用者へ報告し、本番の CLI の更新などの判断を仰ぐ
- **T8 ②（列挙検証）**: `language` / `difficulty` は `v.picklist` の検証を通った値しかプロンプトへ届かない

**守り**

- レート制限は既存のメッセージ単位の門を通す
- **お題の本文・タイトルをログへ出さない**（利用者の入力。`docs/adr/0012`）
- ロビーでお題を自動で用意する処理（`application/lobby-problem.ts`）と、`PhaseSet` でお題を捨てる処理は削除する（T5・T11）。
  **`SessionCompleted` の「お題があるときだけ記録を作る」分岐も同じ PR で外す**（T9）

### 5.4 お題ツール `apps/topic-web`（公開パス `/topic/`）

timer の形は引き継がず、1 画面で完結させる。

- **いまのお題**: タイトルを大きく、本文をその下に出す。お題が無ければ空の状態を出し、「書く」と「作る」へ誘導する
- **書く**: タイトルと本文の欄、「掲げる」。いまのお題があれば、下書きにその内容を入れて書き換えられる
- **作る**: 言語・難易度を選び、「AI で作る」か「定型から選ぶ」。AI は未解錠なら合言葉の欄を出す。
  生成中は全員の画面で `aria-busy` により知らせる。**生成中も「掲げる」「下ろす」「作り直す」は押せる**（押すと進行中の生成を中断する。E11）。
  作り直しがクールダウンで拒否されたら、少し待ってから押すよう知らせる。`degraded` のときは定型に落ちたことを知らせる
  （AI 生成を入れない判断になった場合（§5.3 T8 ①）は、「AI で作る」と合言葉の欄を出さない）
- **下ろす**: お題なしに戻す
- ルームへの入り方・戻り方は timer / poker と同じにする（玄関経由の入口・`packages/sync-client`・`packages/invite-ui`）
- **スタイルは素の CSS で組み、`@tasuki/ui` は CSS から `@import '@tasuki/ui';` で両層を読む**（landing / poker-web と同じ流儀）。
  **Tailwind は使わない。** Tailwind 4 と CSS の `@import` を併用すると書体の `url()` が解決されず、
  本番で書体が全滅する（#297・`packages/ui/README.md`）
- 意匠は `@tasuki/ui` の語彙（象牙の札・書体スケール・コントラスト検査）に従う。
  UI 文言は書体の base 層に収める。細部は実装時に実画面で詰める
- web 層の 3 責務（`docs/adr/0015`・`0019`）に従う

### 5.5 表示側（玄関・timer・poker）

- **表示部品**: 各アプリに、`{ title, body }` を受け取るだけの小さな部品を置く（T13）
- **フレームの見分け**: 各 web アプリは、ツール固有のスキーマより先に `topic` フレームを topic-core のスキーマで見分ける。
  見分けるのはアプリ層であり、ツールのドメインではない
- **玄関**: `apps/landing/src/tools.ts` の `TOOLS` に 3 枚目の札を足す（pip「お題」・公開パス `/topic/`・新しいマーク 1 つ）。
  ルーム画面の札の近くに「いまのお題: ○○」を**タイトルだけ 1 行**出す。本文は出さない。お題が無ければ何も出さない。
  在席の表示（`screens/RoomChoice.tsx` の `TOOL_NAMES`）は、いまは `TOOLS` を**添字で**引く手書きの対応表で、札を足すだけでは
  お題ツールに居る人が「topic にいます」と生の ID で出る。**`TOOLS` にツール ID を持たせ、ID で引く形に改める**
- **timer**: ロビーとセッション中の画面に、いまのお題（タイトルと本文）を読むだけで出す。お題が無ければ出さない。
  撤去するもの: `ProblemEditor` / `ProblemConfigPanel` / `ProblemModeToggle` / `AiUnlockPanel` /
  `ui/problem-generation.ts` / `ui/problem-text.ts` / `ai/` / 言語プールの端末設定 / 「別のお題にする」
- **timer の完成記録**: 新しい記録は `topicTitle`（null 可）を持つ。IndexedDB の旧い記録（`problemTitle` を持つ）は、
  読むときに `topicTitle: problemTitle` へ畳む。旧い記録の `language` / `difficulty` は表示しない。
  **`topicTitle` が `null` の記録は見出しに「お題なし」と出し、削除ボタンの `aria-label` は完了日時で区別できる文言にする**
  （`ui/History.tsx` はお題名を見出しと `aria-label` に使っており、空になると支援技術から削除ボタンを区別できない）
- **poker**: ルーム画面の上部に、いまのお題を読むだけで出す。本文は畳んでおき、開けるようにする

### 5.6 配備資材と検査の登録

- `deploy/topic/` を新設する（`app.env` の `PUBLIC_PATH=/topic/` と `STATIC_ONLY=1`、Caddy 断片、`NOTES.md`）。
  `deploy.sh topic` で配れるようにする。同期サーバーは増えない
- Caddy 断片の名前と評価順は、既存の断片（`05-hub-ws` / `20-poker` / `30-timer-spa` / `90-landing`）と
  具体性の順で衝突しないことを確かめてから決める
- 公開パスは `tools.ts`・vite の `base`・`app.env`・Caddy 断片の 4 か所を揃える（1 つでも取り残すと白画面か 404）
- dev の入口（`:5175` の玄関）から `/topic/` へ届くよう、dev の中継設定を足す
- **検査の登録**: 新しいパッケージ・アプリを足したら赤になる検査がある。各 PR で次を更新する
  - `scripts/audit-dependency-direction.mjs` の許可表 `ALLOWED`（`packages/topic-core` と `apps/topic-web` の欄を新設し、
    topic-core に依存するアプリの欄へ `@tasuki/topic-core` を足す）
  - 構造監査・ログ衛生・リンク検査・変異検査・走査対象の一覧（`scripts/list-scan-targets.mjs`）
  - 網羅は列挙ではなく**実行で確かめる**: 足した直後に scripts の自己テストと全検査を回し、赤になったものを直す

## 6. 互換と配布

- 旧 wire との互換は切る（T10）。timer のお題 wire を削除する
- 配布は最後に 1 回。同期サーバーを再起動するのは `deploy.sh timer` だけである（ほかは `STATIC_ONLY=1`）。
  順序は **topic → poker → landing → timer**（最後の `deploy.sh timer` が timer の web を配ってから同期サーバーを再起動する）。
  **静的な 3 本と timer は間を空けずに続けて流す**
- 配布中には窓が 3 つある。いずれも**画面の再読込で閉じ、同期サーバーの再起動でルームはどのみち全部消える**ので受容する。
  `deploy/topic/NOTES.md` と `deploy/timer/NOTES.md` に 3 つとも書く
  1. **新しい静的 web × 旧い同期サーバー**（静的な 3 本を配ってから `deploy.sh timer` の再起動までの間）: 新しい topic-web は、
     `?tool=topic` を知らない旧い同期サーバーに 1008 で閉じられ、再接続を繰り返す。新しい玄関と poker には `topic` フレームが
     届かないだけで、お題の表示が出ない。landing を 3 本の最後に回すのは、札が見えてから再起動までの時間を短くするためである
  2. **新しい timer の web × 旧い同期サーバー**（`deploy.sh timer` の内側。web を先に配ってから再起動するまでの数十秒。
     順序は選べない —— #276）: 旧いサーバーの完成記録は `problemTitle` を持ち、新しい timer の契約（`topicTitle`）に合わない。
     **完成記録を持つルームのスナップショットは丸ごと検証に落ち**、timer は通知を出す（#209）
  3. **古い web × 新しい同期サーバー**（再起動の後、開いたままの画面）: 古い timer は、`problem` / `config.language` などを
     必須とする旧い契約で新しいスナップショットを読むため、**`topic` フレームだけでなくスナップショットがすべて落ちる**。
     再読込するまで通知を出し続ける（#209）。古い poker は未知の `topic` フレームを捨てて通知を出す（#212）。古い玄関は黙って捨てる
- サーバー側の移行処理は不要（揮発インメモリ）。端末側は IndexedDB の旧い記録を読むときに畳む（§5.5）
- **本番デプロイは利用者の明示の指示を待つ**

## 7. 検証

### 7.1 EARS

**お題の状態**

- E1 システムは、常にルームごとに高々 1 つのお題を持ち、既定では持たないこと
- E2 お題ツールで利用者がお題を掲げたとき、システムはそのルームの全接続（ハブ・timer・poker・お題）へ同じお題の状態を配ること
- E3 お題ツールで利用者がお題を下ろしたとき、システムはそのルームの全接続へ「お題なし」を配ること
- E4 接続がルームへ参加・復帰したとき、システムはその接続へいまのお題の状態を送ること
- E5 お題ツール以外の接続からお題を変えるコマンドを受信した場合、システムはそのコマンドを不正なメッセージとして拒否し、お題を変えないこと
- E6 ルームが破棄されたとき、システムはそのルームのお題の状態を破棄し、進行中の生成を中断すること
- E19 timer のセッションが完了してロビーへ戻ったとき、システムはお題を変えないこと

**作る**

- E7 利用者が定型から選んだとき、システムは選ばれた言語・難易度に合う定型のお題を、直前のお題と異なるものから掲げること
- E8 AI が解錠されている状態で利用者が AI 生成を求めたとき、システムは AI が生成し検証を通ったお題を掲げること
- E9 AI 生成を求められたが、失敗・日次上限・同時実行数の超過・時間切れ・未解錠・AI 無効のいずれかだった場合、システムは定型のお題を掲げ、定型に落ちたことを全接続へ知らせること
- E10 生成中の間、システムは全接続へ生成中であることを配ること
- E11 生成中に利用者がお題を掲げる・下ろす・作り直すとき、システムは進行中の生成を中断し、その結果を掲げないこと
- E20 利用者がお題を作り始める・掲げる・下ろすとき、システムは定型に落ちたことの知らせを取り下げること
- E22 作り直しがクールダウンの間に届いた場合、システムはその依頼を拒否し、進行中の生成とお題を変えないこと

**D10（`docs/adr/0012`）**

- E12 AI お題生成を備える場合、システムは子プロセスが使える組み込みツールを 0 個に指定すること
- E13 境界で列挙に含まれない言語・難易度を受信した場合、システムは検証エラーとして拒否すること
- E14 システムは、常にお題のタイトル・本文をログへ出力しないこと
- E21 お題ツールの接続から合言葉の照合に失敗し続けた場合、システムは接続を張り直しても続く、`room.join` と同じレート制限の枠で拒否すること

**表示**

- E15 ルームにお題がある間、timer・poker はそのお題のタイトルと本文を、玄関はタイトルを表示すること
- E16 ルームにお題が無い間、玄関・timer・poker はお題の表示を出さず、各ツールの操作はお題なしで成り立つこと
- E17 timer のセッションが完了したとき、システムはお題の有無にかかわらず完成記録を作り、お題があれば完了時点のお題のタイトルを写すこと
- E18 旧い形の完成記録を読んだ場合、システムはそのお題名を完成記録のお題のタイトルとして表示すること
- E23 お題なしの完成記録を表示する場合、システムは「お題なし」と表示し、削除の操作を完了日時で区別できる名前で示すこと

（番号は追加の順である。E19〜E23 はレビューで足した。）

### 7.2 EARS と検査の対応

| EARS | 検査 |
|---|---|
| E1・E6 | 同期サーバーの単体（ルーム作成直後・破棄後の `TopicStore`。生成中に破棄して provider の中断が呼ばれる） |
| E2・E3・E4 | 同期サーバーの単体（4 種の接続すべてにフレームが届く）＋ E2E（お題ツールで掲げ、玄関・timer・poker の別ページで同じ内容が出る／下ろすと全部から消える） |
| E5 | 同期サーバーの単体（timer・poker・ハブの接続から `topic.set` を送り、不正なメッセージとして拒否され、お題が変わらない） |
| E7 | topic-core の単体（`pickFallback`）＋ 同期サーバーの単体 |
| E8・E9・E10・E11・E20・E22 | topic-core の単体（帳簿の遷移表の全行）＋ 同期サーバーの単体（フェイク provider で成功・失敗・遅延・中断を作る） |
| E12 | provider の単体（起動引数に指定が含まれる）＋ **本番と同じ版の CLI で、`system` / `init` が報告するツール一覧が空であることの実機確認** |
| E13 | topic-core の境界スキーマの単体＋ 同期サーバーの単体（列挙外の値でコマンドが拒否され、provider が呼ばれない） |
| E14 | ログ衛生の検査（`scripts/audit-log-hygiene.mjs`）の射程に新しいファイルが入ること＋ 単体（生成の成否ログにタイトルが出ない） |
| E21 | **実 WS の結合テスト**（お題ツールの接続で `ai.unlock` を失敗させ、**接続を張り直しても**枠が続く。同じ接続元の `room.join` も枠に掛かる。逆向きも見る）。`test/join-rate-limit.test.ts` の形に揃える |
| E15・E16 | 各 web の単体＋ E2E＋ 実画面検証 |
| E17 | timer-core の単体（お題あり・なしの両方で記録ができ、本文は写らない）＋ 同期サーバーの単体（お題を掲げずに完了して `sessionRecords` が増える） |
| E18 | timer-web の単体（`problemTitle` を持つ旧い記録を畳む） |
| E23 | timer-web の単体（`topicTitle: null` の記録で見出しと削除ボタンの名前）＋ a11y の走査 |
| E19 | 同期サーバーの単体（完了 → ロビーでお題が残る） |

### 7.3 破壊検証（原則 VII）

新しいガードには変異を足し、壊して赤になることを確かめる（`scripts/mutation-check.mjs`）。
**変異 ID は並びに頼らず、既存の最大値から採番する。**

- timer の接続から届いたメッセージを、お題のハンドラへも流す配線にする → E5 の単体が赤
  （「お題のコマンドを timer のスキーマに足す」変異は置かない。スキーマを通っても `handlers.ts` の既定の分岐で
  `buildDomainCommand` が null を返してお題は変わらないため、E5 は緑のまま残る。2026-09-23 のレビュー）
- `v.picklist` を `v.string` に戻す → E13 の単体が赤
- 起動引数からツールを閉じる指定を外す → E12 の単体が赤
- 全接続への配信を「お題ツールの接続だけ」へ狭める → E2 の単体が赤
- 生成の中断を外す → E11 の単体が赤
- ルーム破棄時の中断を外す → E6 の単体が赤
- お題ツールのハンドラへ新しいゲートを渡す → E21 が赤
- お題の接続の受理で `handleConnectionOpen` を通さない（poker と同じく手前で return する）→ E21（張り直し）が赤
- クールダウンの判定を中断の後ろへ回す → E22 の単体が赤
- 完成記録を作る条件に「お題があるとき」を戻す → E17 の単体が赤

アサーションは、正しい実装と誤った実装で値が分かれる局面に置く（例: E2 は timer・poker の接続で見る。
お題ツールの接続だけで見ると、配信を狭める誤りと区別できない。E17 はお題なしの完了で見る。
お題ありで見ると、条件を戻す誤りと区別できない）。

### 7.4 実画面検証（原則 V）

- 2 つのブラウザで同じルームに入り、片方のお題ツールで掲げ・書き換え・下ろす。
  もう片方の玄関・timer・poker で表示が追従するのを見る
- 新アプリに a11y の 4 走査とコントラスト検査を当てる
- **新アプリの書体が読めていることを、`document.fonts` の各面の `status` で確かめる**
  （リクエストの URL を数えるだけの検査は、#297 で全滅を緑と判定した。既存の `e2e/specs/landing-design.spec.ts`・
  `timer-a11y.spec.ts` の形に揃える）
- 生成中の表示（`aria-busy`）と定型に落ちたときの知らせを、実際の AI 無しの構成で見る

## 8. 文書

- **新 ADR `docs/adr/0021`**: お題を 4 つ目の文脈にし、ルーム横断のフレームで配る（T1・T3・T4・T11）。
  **topic-core の表現の選択（T12）と理由もここに記録する**（`docs/adr/0016` 決定 1 の MUST）
- **`docs/adr/0017`**: 文脈を 4 つにする追記
- **`docs/adr/0011`**:
  - S9 の行を改める。いまは `problem.submit` を「実行者で選別する唯一の関門」の実例として名指ししているが、T7 でこのコマンドは消える。
    消えた後に実行者で選別する関門が残るかを現物で確かめ、残らないならそう書く（`docs/adr/0002` の 2026-09-09 追記に従い、改定節で差分を明記する）
  - 受容判断の節に、D10 の実装が入ったことを記録する
- **`docs/adr/0012` D10**: 実装が入ったことを記録する
- **`docs/timer/adr/0008`**: AI 生成の置き場をお題の文脈へ移した追記
- **`docs/timer/adr/0005`**: クライアント委譲（代表）の廃止を記す改定（T7）
- 上の記録の**完了形は、実装が入った PR の中でだけ書く**
- 振り返りを 1 本書く（`docs/retrospectives/`）

## 9. PR の分け方（`docs/adr/0013`）

main へは順に入れ、本番への配布は最後に 1 回行う。

1. **topic-core＋同期サーバーのお題文脈＋`docs/adr/0012` D10。** 既存のファイルは消さず、**新しいファイルを並べて足すだけ**にする
   （`claude-cli-topic-provider.ts` / `topic-generation.ts` / お題ツールのハンドラ等）。timer のお題はこの段では従来どおり動く。
   **配信先はお題の接続とハブの接続に限る**（玄関は契約に合わないフレームを黙って捨てるので、まだ読めなくても害が無い。
   timer と poker は捨てたことを利用者へ通知するので、この段では送らない）。
   T8 ① の実測はこの PR で行い、結果（使う指定、または「AI 生成は入れない」）を記録する
2. **`apps/topic-web`＋玄関の札と「いまのお題」の 1 行＋`deploy/topic`**
3. **timer・poker の表示と配信先の拡大、timer のお題の撤去**（旧 `claude-cli-problem-provider.ts` / `problem-delegation.ts` /
   `lobby-problem.ts` の削除を含む）、**完成記録の形の変更と移行**、ADR・振り返り

## 10. 実装時に確かめること

- T8 ① の指定で、本番の CLI（2.1.178）のツール一覧が空になるか。ならなければ AI 生成を入れず、利用者へ報告する（§5.3）
  - **実測（2026-09-24・CLI 2.1.178）**: 本番と同じ引数に `--output-format stream-json --verbose` を足し、
    `system` / `init` の行の `tools` を見た。env は本番の provider と同じく `PATH` / `HOME` だけに絞った
    - 指定なし（対照）: 31 個（`Bash` / `Read` / `Write` / `WebFetch` / `LSP` など）
    - **`--tools ""` だけ: `["LSP"]` の 1 個が残り、空にならない。** 空の HOME で流すと 0 個になる ——
      `LSP` は `~/.claude` の利用者設定（有効にしたプラグイン）が足しており、**`--tools ""` は利用者設定が足すツールを閉じない**。
      `--settings '{}'` と `--strict-mcp-config` もこれを止めない。本番の HOME の中身に結果が左右される
    - `--tools "" --allowedTools ""`: `["LSP"]`（変わらない）
    - `--tools "" --disallowedTools LSP`: `[]`。ただし名前の列挙であり、次に利用者設定が足すツールを取りこぼす
    - **`--setting-sources "" --tools ""`: `[]`**（プラグインも `[]`）。LSP を足すプラグインが入った HOME のままで空になり、
      OAuth の認証も通る。対照の `--setting-sources ""` だけでは 30 個（LSP だけが消える）
    - `--bare` は OAuth を受け付けない（`ANTHROPIC_API_KEY` のみ）ので使えない
  - **採用: `--setting-sources "" --tools ""`**（利用者・プロジェクトの設定を読まず、組み込みツールを全部閉じる）。
    列挙に頼らず、本番の HOME の中身にも依存しない
- Caddy 断片の評価順（§5.6）
- `RoomState` の合成に topic を含めるかどうか（§5.3）
- 定型バンク 33 件を畳んだ本文が 4000 字に収まるか（単体で全件を検査する）
- `problem.submit` を消した後に、実行者で選別する関門が残るか（§8 の ADR 0011 S9 の改定に使う）
- お題の接続を名簿の在席へ載せる具体的な関数の組み合わせ（§5.3。timer と poker の現行の経路を読んでから決める）
- 新しいパッケージ・アプリで赤になる検査の実際の一覧（§5.6。列挙ではなく実行で確かめる）

### 10.1 PR 2（`apps/topic-web`・玄関の札）で実測して外したこと（2026-09-24）

- **UI の言葉と書体の base 層**: `packages/ui/src/tokens/fonts.css` の `zkgn-{400,500,700}-base` の `unicode-range` に当てると、
  §5.4 の「掲げる」の「掲」と「本文」の 2 字が 3 つの太さすべてで外れた。画面では「このお題にする」「お題を下ろす」
  「説明（なくてもよい）」と言う（EARS の「掲げる／下ろす」は振る舞いの名前として残す）。PR 1 の topic-core の文言も
  3 件外れていたので改めた（`GENERATION_COOLDOWN`「少」・`AI_UNLOCK_FAILED`「違」・`RATE_LIMITED`「多」。
  timer の同じコードの文と揃えるのはやめた —— 利用者の承認済み）。以後は `apps/topic-web/tests/copy-fits-font-base.test.ts`
  と `rendered-text-fits-font-base.test.tsx` が守る
- **お題の本文は Markdown として描く**: 定型バンク（PR 1）の本文は見出し・箇条書き・コードの囲みを持つ Markdown である。
  §5.4 の「本文をその下に出す」を素の文字列で行うと記法がそのまま見える（実画面で発見）。timer の安全な Markdown サブセット
  （`apps/timer-web/src/ui/components/Markdown.tsx`・innerHTML 不使用）を topic-web へ移植した。札のタイトルが h3 なので、
  本文の見出しは 1 段下げる（`#`→h4）。解析の共有化は、timer がお題を表示する PR 3 で決める
- Caddy 断片の評価順（上の一覧の項目）: `deploy/topic/caddy/40-topic.conf`。`/topic/*` は既存の断片と接頭辞が重ならず、
  包括フォールバック（`90-landing.conf`）より具体的なので先に評価される。40 番は撤去済みの旧 `40-timer-legacy-room.conf` と別物
- お題ツールの招待は**リンクのコピーだけ**にした（§5.4 の `packages/invite-ui` のうち `useCopyText`）。QR は玄関の「仲間を招く」に任せる
- §7.4 の a11y の走査のうち **reduced-motion は置かない**。お題ツールは演出を持たないので、「演出が止まる」を見ると 0 件で恒真になる
- §7.4 の「生成中の表示と定型に落ちたときの知らせを、実際の AI 無しの構成で見る」は**できない**。`CLAUDE_CODE_OAUTH_TOKEN` が
  無いと AI は無効（`create-sync-server.ts` の `aiReady`）で、`TopicGenerator#request` は生成中を立てずにその場で定型へ落とし、
  クールダウンも判定しない。生成中・縮退・クールダウンの表示は、フェイクの WebSocket を使う画面の単体テストで見た
- **参加の返事が来ないまま待つ期限は置かない**（timer は 10 秒・#292。poker にも無い）。お題ツールは「ルームに参加しています」と
  接続の告知を出し続ける。受容
- **お題ツールも抜けた知らせを受ける**: サーバーは退出した人の全接続へ `LEFT_ROOM` / `REMOVED_FROM_ROOM` を送る。お題ツールは
  timer と同じく復帰の組を捨てて玄関の `?left=` へ送る（別のタブで抜けても取り残されない）
- 玄関の選択画面は、札 3 枚が並ぶよう札の列を全幅にし、参加者と招待のパネルをその下に並べた（3fr : 2fr の 2 列のままでは
  1280px で一行説明が折り返す見込みだった）。E2E が 320・768・1024・1280px で札の文字が 1 行に収まることを測る
- **玄関の「いまのお題」は `@tasuki/ui` の既定の h2 と同じ問題を抱えうる**: 既定の h2 の色 `--gold` は、地の無い
  felt-700 の上で約 3.92:1 と AA を割る（topic-web の実測）。topic-web は「いまのお題」に felt-900 の地を与えて直した。
  poker-web の地の無い h2 も同じ測り方なら割る見込み（poker には走査が無い。PR 3 で見る）
