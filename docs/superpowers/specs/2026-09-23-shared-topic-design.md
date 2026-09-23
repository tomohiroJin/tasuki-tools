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
7. timer の完成記録には、そのとき掲げていたお題を写して残す

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
| T4 | お題を変えられるのは**お題ツールの接続だけ**。玄関・timer・poker は表示専用 | 「他が呼んで見ることができる程度」の線引き |
| T5 | お題の既定は「なし」。ルームを作っただけでは用意しない | お題なしでも各ツールが成り立つ |
| T6 | 作る手段は **手入力・AI 生成・定型バンク** の 3 つ。AI と定型は「言語×難易度」の選択式のまま | TDD 練習の価値を保ち、`docs/adr/0012` D10 の列挙検証がそのまま成り立つ |
| T7 | クライアントへ生成を委ねる経路（代表・`hasAiKey`・`need-problem`）は廃止する | 実際には使われていない（§2）。残すと守る面だけが増える |
| T8 | `claude -p` の組み込みツールを起動引数で明示的に全部閉じる。`language` / `difficulty` は境界で `v.picklist` により検証する | `docs/adr/0012` D10 |
| T9 | timer の完成記録には、完了時点のお題（`title` / `body`）を**同期サーバーのアプリ層が値として渡して**写す。timer は自分の小さな型で持つ | 振り返りの価値を保ちつつ、timer-core を topic-core に依存させない |
| T10 | 旧 wire との互換は切る。配布は最後に 1 回行う | 揮発インメモリなので、再起動でルームはどのみち全部消える |

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
  degraded: boolean;           // 直近の AI 生成が定型へ落ちた
  aiUnlocked: boolean;         // AI 解錠（timer から移る）
}
```

- 上限は現行の `MAX_PROBLEM_TITLE`（200）・`MAX_PROBLEM_TEXT`（4000）を引き継ぐ。
  AI の出力も定型バンクも、この上限の中に収まる
- 手で書き換えたら `source` は `manual` になる（`edited` は持たない）
- **許可リスト**: `LANGUAGES`（TypeScript / JavaScript / Python / Java / Go / Ruby / Rust / C# / Kotlin / Swift）と
  `DIFFICULTIES`（easy / medium / hard）を topic-core に置く。画面の選択肢もここから引く
- **境界スキーマ**（valibot）: `Topic`・`TopicState`・`topic` フレーム・お題ツールのコマンド。
  `language` / `difficulty` は `v.picklist` で検証する
- **`buildTopicPrompt(language, difficulty)`**: 「タイトル＋本文」の JSON を求める。
  本文には、課題の説明・満たすべき振る舞い・最初に書くテストの例を**自由文で**含めるよう指示する
- **定型バンク**: 33 件を移し、各件の `description` / `requirements` / `exampleTest` / `hints` を本文 1 本へ畳む。
  `pickFallback(language, difficulty, now, previous)` の選び方（絞り込み・直前と同じものを外す・`now` を種にする）は引き継ぐ
- **`validateTopic(raw)`**: AI 由来の値を信頼しない入力として検証する

### 5.2 `packages/timer-core` から消えるもの・残るもの

- **消える**: `Problem` / `ProblemSource` / `ProblemMode` / `problem.ts` / `problem-bank.ts` / `buildProblemPrompt` /
  `SessionConfig.language` / `difficulty` / `problemEnabled` / 状態の `problem` / `problemMode` / `aiUnlocked` / `aiKeyHolders` /
  お題に関わるコマンド（`problem.*` / `problem-mode.set` / `ai.unlock` 等）とイベント / `room.join` の `hasAiKey`
- **残る**: 完成記録の「そのとき掲げていたお題」。timer-core 自身の型 `SessionTopic { title: string; body: string }` で持つ。
  完了を起こすコマンドは、アプリ層から `topic: SessionTopic | null` を値として受け取る
- 消し残しは型検査だけでは見つからない。**消した記号を宣言・例外表・散文まで grep する**
  （公開契約の例外表・`audit-*` の許可表・コメント）

### 5.3 同期サーバー（`apps/tasuki-sync`）

**接続とコマンド**

- ツール ID に `topic` を加える（`application/tool-id.ts`）
- お題ツールの接続が受け付けるコマンド:
  - `topic.set { title, body }` — 手入力で掲げる
  - `topic.clear` — お題なしに戻す
  - `topic.generate { mode: "ai" | "fallback", language, difficulty }` — 作る
  - `ai.unlock { key }` — timer から移す。照合・レート制限・存在の秘匿は現行（`command-handlers/ai-unlock.ts`）のまま
- 在室者なら誰でも操作できる（#95 で役割を廃止した方針のまま）
- **お題ツール以外の接続からお題のコマンドが届いたら拒否する**（T4）
- 生成中に `topic.set` / `topic.clear` / 次の `topic.generate` が届いたら、進行中の生成を中断する

**状態と寿命**

- `TopicStore`（ポート）とインメモリのアダプタを足す。ルームと一緒に生まれ、`destroy-room.ts` で一緒に消える
- `RoomState` の合成に topic を加えるかどうかは、実装計画で既存の `commit` の形を見て決める
  （**どちらでも、timer と poker のスナップショットには topic を入れない**）

**配信（T3）**

- お題の状態が変わるたびに `{ type: "topic", state: TopicState }` を**そのルームの全接続**
  （ハブ・timer・poker・お題）へ送る
- ルームへ参加・復帰した接続には、その場で 1 通送る
- 送る窓口は、ツールごとの broadcaster の外に 1 つ置く（どのツールの接続かを問わない）

**AI 生成**

- `adapters/claude-cli-problem-provider.ts` → `claude-cli-topic-provider.ts`、
  `application/problem-delegation.ts` → `topic-generation.ts`。
  **クライアント委譲の経路（候補列・deadline・再委譲）は削除し、サーバー生成と定型だけを残す**（T7）
- 引き継ぐもの: `ai-limits.ts`（日次上限）・タイムアウト（60 秒）・出力上限（1MB）・`ProviderFailure` による
  失敗理由の分類・ログの語彙（`log/vocabulary.ts`）
- AI が失敗・上限到達・未解錠のときは定型へ落とし、`degraded: true` にする
  （未解錠で `mode: "ai"` を求められた場合の扱いは現行の `problemMode` の振る舞いに揃える）
- **T8 ①**: 組み込みツールを起動引数で全部閉じる。想定は `--tools ""`。
  **本番の CLI（2.1.178）でこの指定が効くことを実装時に実測する。** 効かなければ、同じ効果を持つ別の指定を実測で選ぶ
- **T8 ②**: `language` / `difficulty` は `v.picklist` の検証を通った値しかプロンプトへ届かない

**守り**

- レート制限は既存のメッセージ単位の門を通す
- **お題の本文・タイトルをログへ出さない**（利用者の入力。`docs/adr/0012`）
- ロビーでお題を自動で用意する処理（`application/lobby-problem.ts`）と、`PhaseSet` でお題を捨てる処理は削除する（T5）

### 5.4 お題ツール `apps/topic-web`（公開パス `/topic/`）

timer の形は引き継がず、1 画面で完結させる。

- **いまのお題**: タイトルを大きく、本文をその下に出す。お題が無ければ空の状態を出し、「書く」と「作る」へ誘導する
- **書く**: タイトルと本文の欄、「掲げる」。いまのお題があれば、下書きにその内容を入れて書き換えられる
- **作る**: 言語・難易度を選び、「AI で作る」か「定型から選ぶ」。AI は未解錠なら合言葉の欄を出す。
  生成中は全員の画面で操作を止め、`aria-busy` で知らせる。`degraded` のときは定型に落ちたことを知らせる
- **下ろす**: お題なしに戻す
- ルームへの入り方・戻り方は timer / poker と同じにする（玄関経由の入口・`packages/sync-client`・`packages/invite-ui`）
- 意匠は `@tasuki/ui` の語彙（象牙の札・書体スケール・コントラスト検査）に従う。
  UI 文言は書体の base 層に収める。細部は実装時に実画面で詰める
- web 層の 3 責務（`docs/adr/0015`・`0019`）に従う

### 5.5 表示側（玄関・timer・poker）

- **表示部品**: `@tasuki/ui` に `{ title, body }` を受け取るだけの部品を 1 つ置く。**topic-core に依存させない**
- **フレームの見分け**: 各 web アプリは、ツール固有のスキーマより先に `topic` フレームを topic-core のスキーマで見分ける。
  見分けるのはアプリ層であり、ツールのドメインではない
- **玄関**: `apps/landing/src/tools.ts` の `TOOLS` に 3 枚目の札を足す（pip「お題」・公開パス `/topic/`・新しいマーク 1 つ）。
  ルーム画面の札の近くに「いまのお題: ○○」を 1 行出す。お題が無ければ何も出さない
- **timer**: ロビーとセッション中の画面に、いまのお題を読むだけで出す。お題が無ければ出さない。
  撤去するもの: `ProblemEditor` / `ProblemConfigPanel` / `ProblemModeToggle` / `AiUnlockPanel` /
  `ui/problem-generation.ts` / `ui/problem-text.ts` / `ai/` / 言語プールの端末設定 / 「別のお題にする」
- **timer の完成記録**: IndexedDB の旧い記録は、読むときに `{ title, body: description }` へ畳む
- **poker**: ルーム画面の上部に、いまのお題を読むだけで出す。本文は畳んでおき、開けるようにする

### 5.6 配備資材

- `deploy/topic/` を新設する（`app.env` の `PUBLIC_PATH=/topic/`、Caddy 断片、`NOTES.md`）。
  `deploy.sh topic` で配れるようにする。同期サーバーは増えない
- Caddy 断片の名前と評価順は、既存の断片（`05-hub-ws` / `20-poker` / `30-timer-spa` / `90-landing`）と
  具体性の順で衝突しないことを確かめてから決める
- 公開パスは `tools.ts`・vite の `base`・`app.env`・Caddy 断片の 4 か所を揃える（1 つでも取り残すと白画面か 404）
- dev の入口（`:5175` の玄関）から `/topic/` へ届くよう、dev の中継設定を足す

## 6. 互換と配布

- 旧 wire との互換は切る（T10）。timer のお題 wire を削除する
- 配布は最後に 1 回。**web（topic → landing → poker → timer）を配ってから、同期サーバーを再起動する**
- 開いたままの古い timer は、未知の `topic` フレームを検証エラーとして捨て、再読込するまで通知を出す。
  同期サーバーの再起動でルームはどのみち全部消えるので、**この窓は受容する**。`deploy/topic/NOTES.md` と
  `deploy/timer/NOTES.md` に書く
- サーバー側の移行処理は不要（揮発インメモリ）。端末側は IndexedDB の旧い記録を読むときに畳む（§5.5）
- **本番デプロイは利用者の明示の指示を待つ**

## 7. 検証

### 7.1 EARS

**お題の状態**

- E1 システムは、常にルームごとに高々 1 つのお題を持ち、既定では持たないこと
- E2 お題ツールで利用者がお題を掲げたとき、システムはそのルームの全接続（ハブ・timer・poker・お題）へ同じお題の状態を配ること
- E3 お題ツールで利用者がお題を下ろしたとき、システムはそのルームの全接続へ「お題なし」を配ること
- E4 接続がルームへ参加・復帰したとき、システムはその接続へいまのお題の状態を送ること
- E5 お題ツール以外の接続からお題を変えるコマンドを受信した場合、システムはそのコマンドを拒否し、お題を変えないこと
- E6 ルームが破棄されたとき、システムはそのルームのお題の状態も破棄すること

**作る**

- E7 利用者が定型から選んだとき、システムは選ばれた言語・難易度に合う定型のお題を、直前のお題と異なるものから掲げること
- E8 AI が解錠されている状態で利用者が AI 生成を求めたとき、システムは AI が生成し検証を通ったお題を掲げること
- E9 AI 生成が失敗・上限到達・時間切れになった場合、システムは定型のお題を掲げ、定型に落ちたことを全接続へ知らせること
- E10 生成中の間、システムは全接続へ生成中であることを配ること
- E11 生成中に利用者がお題を掲げる・下ろす・作り直すとき、システムは進行中の生成を中断し、その結果を掲げないこと

**D10（`docs/adr/0012`）**

- E12 AI お題生成を備える場合、システムは子プロセスへ渡す権限を明示的に指定すること
- E13 境界で列挙に含まれない言語・難易度を受信した場合、システムは検証エラーとして拒否すること
- E14 システムは、常にお題のタイトル・本文をログへ出力しないこと

**表示**

- E15 ルームにお題がある間、玄関・timer・poker はそのお題のタイトルと本文を表示すること
- E16 ルームにお題が無い間、玄関・timer・poker はお題の表示を出さず、各ツールの操作はお題なしで成り立つこと
- E17 timer のセッションが完了したとき、システムは完了時点のお題を完成記録へ写すこと
- E18 旧い形の完成記録を読んだ場合、システムはそのお題をタイトルと本文へ畳んで表示すること

### 7.2 EARS と検査の対応

| EARS | 検査 |
|---|---|
| E1・E6 | 同期サーバーの単体（ルーム作成直後・破棄後の `TopicStore`） |
| E2・E3・E4 | 同期サーバーの単体（4 種の接続すべてにフレームが届く）＋ E2E（お題ツールで掲げ、玄関・timer・poker の別ページで同じ内容が出る／下ろすと全部から消える） |
| E5 | 同期サーバーの単体（timer・poker・ハブの接続から `topic.set` を送り、拒否とお題の不変を見る） |
| E7 | topic-core の単体（`pickFallback`）＋ 同期サーバーの単体 |
| E8・E9・E10・E11 | 同期サーバーの単体（フェイク provider で成功・失敗・遅延・中断を作る） |
| E12 | provider の単体（起動引数に権限の指定が含まれる）＋ **本番と同じ版の CLI で Read が拒否されることの実機確認** |
| E13 | topic-core の境界スキーマの単体＋ 同期サーバーの単体（列挙外の値でコマンドが拒否され、provider が呼ばれない） |
| E14 | ログ衛生の検査（`scripts/audit-log-hygiene.mjs`）の射程に新しいファイルが入ること＋ 単体（生成の成否ログにタイトルが出ない） |
| E15・E16 | 各 web の単体＋ E2E＋ 実画面検証 |
| E17・E18 | timer-core の単体（完成記録）＋ timer-web の単体（IndexedDB の旧い形を畳む） |

### 7.3 破壊検証（原則 VII）

新しいガードには変異を足し、壊して赤になることを確かめる（`scripts/mutation-check.mjs`）。
**変異 ID は並びに頼らず、既存の最大値から採番する。**

- E5 のツール判定を外す → 単体が赤
- `v.picklist` を `v.string` に戻す → E13 の単体が赤
- 起動引数から権限の指定を外す → E12 の単体が赤
- 全接続への配信を「お題ツールの接続だけ」へ狭める → E2 の単体が赤
- 生成の中断を外す → E11 の単体が赤

アサーションは、正しい実装と誤った実装で値が分かれる局面に置く（例: E2 は timer・poker の接続で見る。
お題ツールの接続だけで見ると、配信を狭める誤りと区別できない）。

### 7.4 実画面検証（原則 V）

- 2 つのブラウザで同じルームに入り、片方のお題ツールで掲げ・書き換え・下ろす。
  もう片方の玄関・timer・poker で表示が追従するのを見る
- 新アプリに a11y の 4 走査とコントラスト検査を当てる
- 生成中の表示（`aria-busy`）と定型に落ちたときの知らせを、実際の AI 無しの構成で見る

## 8. 文書

- **新 ADR `docs/adr/0021`**: お題を 4 つ目の文脈にし、ルーム横断のフレームで配る（T1・T3・T4）
- **`docs/adr/0017`**: 文脈を 4 つにする追記
- **`docs/timer/adr/0008`**: AI 生成の置き場をお題の文脈へ移した追記
- **`docs/timer/adr/0005`**: クライアント委譲（代表）の廃止を記す改定（T7）
- **`docs/adr/0012` D10・`docs/adr/0011` の受容判断の節**: 実装が入ったことを記録する。
  **完了形は、実装が入った PR の中でだけ書く**
- 振り返りを 1 本書く（`docs/retrospectives/`）

## 9. PR の分け方（`docs/adr/0013`）

main へは順に入れ、本番への配布は最後に 1 回行う。

1. **topic-core＋同期サーバーのお題文脈＋`docs/adr/0012` D10。** timer のお題はまだ残し、追加だけにする
   （この段で timer・poker の接続へ `topic` フレームを送ると、古い timer が検証エラーを出す。
   **配信先はこの段ではハブとお題の接続に限り**、timer・poker へ広げるのは 3 で行う）
2. **`apps/topic-web`＋玄関の札＋`deploy/topic`**
3. **timer・poker の表示、timer のお題の撤去、完成記録の移行、ADR・振り返り**

## 10. 実装時に確かめること

- `--tools ""` が本番の CLI（2.1.178）で組み込みツールを全部閉じるか（§5.3）
- Caddy 断片の評価順（§5.6）
- `RoomState` の合成に topic を含めるかどうか（§5.3）
- 定型バンク 33 件を畳んだ本文が 4000 字に収まるか（単体で全件を検査する）
