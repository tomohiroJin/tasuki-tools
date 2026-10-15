# R2 接続層のエラーの文言を単一の情報源へ（#362）— 実装計画

- **Issue**: [#362](https://github.com/tomohiroJin/tasuki-tools/issues/362)（親 [#360](https://github.com/tomohiroJin/tasuki-tools/issues/360)）
- **設計正本**: [`2026-10-13-large-refactoring-design.md`](../specs/2026-10-13-large-refactoring-design.md) §5.2
- **日付**: 2026-10-13
- **実測時点**: main `e9180c9`

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | いまの文言を wire の上で固定する特性テストを先に足す（Task 1）。写しの一致を守るテストは赤から書く（Task 3） |
| II. 技術選定は ADR を通す | 該当なし | 依存を足さない |
| III. 揮発インメモリと単純運用 | 該当なし | 状態の持ち方に触れない |
| IV. 境界の型安全 | 通過 | 境界の解析（`parseBoundaryMessage`）とその後のエラーコードの決め方は変えない。段からコードへの対応を 1 つの関数にする（Task 2） |
| V. 実画面検証 | 通過 | 実プロトコル（実 WS 越しのテスト）で、送るフレームの文言が変わらないことを確かめる（Task 1・Task 5） |
| VI. 依存は内向き | 通過 | 文言の正本は同期サーバーのアプリケーション層に置き、アダプタから読む（外から内）。core の依存の許可表は広げない（§2） |
| VII. 検査は壊して確かめる | 通過 | 新しい一致の検査と特性テストを、壊して赤を見る（Task 1・Task 3） |
| VIII. 記録が正本 | 通過 | wire の文言は契約である。同期サーバーの中の正本を 1 つに宣言し、依存の向きで共有できない core の写しは、一致をテストで固定する |
| IX. 小さく回す | 通過 | PR 1 本。デプロイは伴わない |
| X. 抽象は実需で | 通過 | 新しい抽象は作らない（定数の表と 1 行の関数だけ）。重複は 20 行に満たないが、契約の単一情報源（原則 VIII）を優先する（§2 の理由） |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 秘密・個人情報を扱わない |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## 1. 着手時点の実測（Issue 本文・設計正本 §5.2 の前提との差）

| 前提 | 実測 | 確かめた場所 |
|---|---|---|
| 接続層のエラーのコードと文言を `packages/protocol` へ集め、**各 core はそこから取る** | **core は `@tasuki/protocol` に依存できない。** 依存の許可表は topic-core・roulette-core・timer-core を `[]` にしており、「`@tasuki/*` に依存しない」理由を行ごとに書いている（文脈は同格で、つなぐのはアプリ層。`docs/adr/0017` 決定 1・2）。許可するのは poker-core → protocol だけ | `scripts/audit-dependency-direction.mjs:94-113` |
| 段（json / schema）からエラーコードへの対応を `packages/protocol` の関数にする | **`packages/protocol` は、コードも文言も決め打ちしないと明言している。** timer の系統は INVALID_JSON / INVALID_COMMAND を区別するが、poker はどちらも invalid-message に畳む。対応は timer の系統（timer・ハブ・お題・ルーレット）の決めごとで、置き場は同期サーバー | `packages/protocol/src/boundary.ts:8-12` |
| エラーフレームのスキーマ 5 つを 1 つにする | **5 つは、わざと形が違う。** timer・ハブ・poker は `code` に空でない任意の文字列を通す（古い画面が、新しいコードのフレームを捨てないため。poker は #214・#216 で前方互換にした）。お題・ルーレットは既知のコードだけを通す（`v.picklist`）。それぞれ 4 行で、そろえると片方の契約が変わる | timer `schemas.ts:341-345`・room-core `wire.ts:144`・poker `protocol.ts:126-138`・topic `schemas.ts:83-87`・roulette `schemas.ts:58-62` |
| 文言の写しが 6 箇所にある | 正しい。ただし**層で 2 つに分かれる** | 下の 2 行 |
| 〃 同期サーバーの中 | `ws-adapter.ts` に定数 2 つ（`:117-118`）と直書き 3 つ（`:724` の 2 文・`:742`・`:784`）。`hub-handlers.ts` に定数 1 つ（`:59`）と直書き 1 つ（`:240`）。段からコードへの対応の式が 4 箇所（ws-adapter `:723`・hub `:238`・topic `:246`・roulette `:233`） | `grep` |
| 〃 core の中 | topic-core・roulette-core の文言の表に、接続層の 4 つ（INVALID_JSON・INVALID_COMMAND・MESSAGE_TOO_LARGE・INTERNAL_ERROR）と NOT_IN_ROOM が入っている。**表が `Record<コード, 文>` で全域なので、接続層のコードの文も持たざるをえない。** 同じ文であることは「ws-adapter と同じ文にする」というコメントで守っている。timer-core は NOT_IN_ROOM を `SERVER_ONLY_ERROR_MESSAGES` に持つ | topic `error-messages.ts:10-23`・roulette `:7-17`・timer `:172-176` |
| wire の文言はテストで固定されている | **MESSAGE_TOO_LARGE と INTERNAL_ERROR の文言は、同期サーバーのどのテストも見ていない**（`toMatchObject({ code })` だけ）。core の表のテストが文を見ているだけ。INVALID_JSON・INVALID_COMMAND は timer とハブの経路だけ見ている。poker の rate-limited の文も見ていない | `test/ws-adapter.message.test.ts:94,155,343,398,469`・`test/live-ws.errors.test.ts`・`test/live-ws.hub.test.ts` |
| poker の中の写し | 「ルームが見つかりません」が 3 箇所（`poker-handlers.ts:491,618`・`poker-commit-room-action.ts:80`）、「試行が多すぎます。しばらくしてからお試しください」が 2 箇所（`poker-handlers.ts:476,602`）。**poker の契約は timer の系統とは別**（コードはケバブ記法）。「ルームに参加していません」（`not-joined`）は NOT_IN_ROOM と同じ文だが、別の契約の別のコードである | 同左 |
| 変異のパッチ | 触るファイルに当たるもの: ws-adapter（m13・m36・m82・m83・m167）・hub-handlers（m108・m110）・poker-handlers（m30・m33）・topic-handlers（m78・m86）・roulette-handlers（m156・m171・m172）・topic-core `error-messages.ts`（m91） | `scripts/mutations/*.patch` の `+++ b/` 行 |

## 2. この PR でやること・やらないこと

**やること（PR 1 本）**

1. **wire の文言を固定する特性テストを足す**（Task 1）。いまは見ていない MESSAGE_TOO_LARGE・INTERNAL_ERROR の文と、お題・ルーレット・poker の経路
2. **同期サーバーの中の正本を 1 つにする**（Task 2）。`apps/tasuki-sync/src/application/connection-errors.ts` に、接続層の 4 つの文と、段からコードへの対応を置く。ws-adapter・hub-handlers・topic-handlers・roulette-handlers がそこから取る
3. **core の写しとの一致をテストで固定する**（Task 3）。core は依存の向きのせいで正本を取り込めない。写しを残し、「同じ文にする」というコメントの代わりに、同期サーバーのテストで一致を守る（設計正本 §2: 決まりは文書でなくコードで守らせる）
4. **poker の中の写しを定数にする**（Task 4）。poker の契約の中だけでまとめ、timer の系統とは混ぜない

**原則 X との関係**: どの写しも 20 行に満たない（`docs/adr/0007` 基準 2）。それでも集めるのは、wire の文言が**契約**だからである。憲法 原則 VIII は「契約には単一の情報源を宣言する」と求めている。基準 2 は抽出による間接参照のコストを避けるためのもので、契約の正本の宣言は対象が違う。新しい抽象（関数の層・パターン）は作らない。

**やらないこと（理由つき）**

| 項目 | 理由 |
|---|---|
| 文言を `packages/protocol` に置き、core がそこから取る | core の依存の許可表を広げることになる（`docs/adr/0017` 決定 1・2 の見直しが要る）。#360 の「構造監査を緩めない」に反する |
| 段からコードへの対応を `packages/protocol` に置く | protocol は「コードも文言も決め打ちしない」設計で、poker は別の畳み方をする（§1） |
| エラーフレームのスキーマを 1 つにする | 前方互換（任意のコード）と厳密（既知のコードだけ）で、わざと違う。そろえると片方の契約が変わる |
| core の文言の表から接続層のコードを外す | 表の全域性（`Record<コード, 文>`）が崩れ、`topicErrorMessageFor` の型が変わる。得られるものに対して変更が大きい |
| poker の文言を timer の系統の正本へ寄せる | 別の契約である。いま同じ文でも、一方だけを変えたいときに縛り合う |
| 「ルームが見つかりません」を選ぶ三項演算（5 箇所） | 参加の流れの重複で、#366 の範囲 |
| 既定の文言の句点の違い | 振る舞いが変わる。#378 |

## 3. 振る舞いを保つ方法

**「変えない」の定義**（設計正本 §4.1 の「プロトコル」の行）: どの接続の種類（timer・ハブ・お題・ルーレット・poker）でも、接続層のエラーで送るフレームの JSON（`type`・`code`・`message`）が変更前と同じ。

確かめるもの:

- Task 1 の特性テスト（文言を文字列のまま比べる）
- 既存の実 WS 越しのテスト・同期サーバーの全テスト・`pnpm e2e`
- 変異検査

## 4. タスク

### Task 1: wire の文言を固定する特性テスト

**変えるファイル**: `apps/tasuki-sync/test/connection-error-text.test.ts`（新規）

- 既存のテストが使っている起動の仕組みを使う。アダプタの段は `ws-adapter.message.test.ts` の `startAdapter` の形、ハンドラの段は `test/support/live-sync-server.ts` を使う
- **期待する文言は、テストの中に文字列で直書きする。** 正本の定数を取り込んで比べると、正本を書き換えたときにテストも一緒に変わってしまい、何も守らない
- 固定する組（`Given/When/Then`。`docs/adr/0006`）

  | 接続 | 起こし方 | 期待するフレーム |
  |---|---|---|
  | timer | 壊れた JSON | `INVALID_JSON` / 「JSON の形式が不正です」 |
  | timer | 形の違うコマンド | `INVALID_COMMAND` / 「コマンドの形式が不正です」 |
  | timer | 表示名が規約に合わない `room.join` | `INVALID_COMMAND` / 「コマンドの形式が不正です」（`:742` の経路） |
  | timer | 上限を超える本文 | `MESSAGE_TOO_LARGE` / 「メッセージが大きすぎます」 |
  | timer | `onMessage` が reject | `INTERNAL_ERROR` / 「サーバー内部でエラーが発生しました」 |
  | ハブ・お題・ルーレット | 上の 4 つ（壊れた JSON・形の違うコマンド・上限超え・reject） | 同じ 4 つ |
  | poker | 上限を超える本文 | `message-too-large` / 「メッセージが大きすぎます」 |
  | poker | 参加の試行の上限を超える | `rate-limited` / 「試行が多すぎます。しばらくしてからお試しください」 |

- 既存のテストで固定済みの組（timer とハブの INVALID_JSON・INVALID_COMMAND、poker の room-not-found）は重ねて書かない。表の中で「既存」と印を付け、どのテストが守っているかを書く

**確かめる**

- 追加した時点で全部緑（いまの振る舞いを書いたので）
- **緑で入れたので、壊して赤を見る**（設計正本 §4.2）: `ws-adapter.ts:117` の文を 1 字変える → 上限超えの組が timer・ハブ・お題・ルーレット・poker で赤。`:118` を変える → reject の組が赤。戻す
- 所要: 2 時間

### Task 2: 同期サーバーの中の正本を 1 つにする

**変えるファイル**

- `apps/tasuki-sync/src/application/connection-errors.ts`（新規）
  - `CONNECTION_ERROR_TEXT`: INVALID_JSON・INVALID_COMMAND・MESSAGE_TOO_LARGE・INTERNAL_ERROR の 4 つの文（`as const`）
  - `boundaryErrorCode(stage: BoundaryStage): "INVALID_JSON" | "INVALID_COMMAND"`。doc コメントに「timer の系統の決めごと。poker は別に畳む」と書く
  - 単体テスト `test/connection-errors.test.ts` を先に書く（`boundaryErrorCode` の 2 通り）
- `adapters/ws-adapter.ts`: 定数 2 つを外し、`:713,724,742,784,856,866,874,907,917,925,958,968,976` を正本から取る。段からコードへの対応は `boundaryErrorCode`
- `application/hub-handlers.ts`: `INVALID_COMMAND_MESSAGE`（`:59`）を外して正本から取る（`:122,182,240`）。対応は `boundaryErrorCode`
- `application/topic-handlers.ts:246`・`application/roulette-handlers.ts:233`: 対応の式を `boundaryErrorCode` に置き換える（文言は今までどおり core の表から取る）

**コミットの順番**: 正本と単体テスト → ws-adapter → hub-handlers → topic / roulette の 4 コミット。各コミットで、同期サーバーの全テストが緑

**確かめる**

- Task 1 の特性テストが、各コミットで緑
- `apps/tasuki-sync/src` の中で 4 つの文が `connection-errors.ts` にしか無いこと（Task 3 の検査で固定する）
- 所要: 1.5 時間

### Task 3: core の写しとの一致をテストで固定する

**先に書く赤いテスト**: `apps/tasuki-sync/test/connection-error-text-sources.test.ts`（新規）

1. **core の写しが正本と一致する**: 4 つのコードについて、`topicErrorMessageFor(code)` と `rouletteErrorMessageFor(code)` が `CONNECTION_ERROR_TEXT[code]` と等しい
2. **NOT_IN_ROOM の文が 3 つの core でそろう**: `topicErrorMessageFor`・`rouletteErrorMessageFor`・timer-core の `errorMessageFor` が同じ文を返す
3. **同期サーバーの中に写しが残っていない**: `apps/tasuki-sync/src/**/*.ts` を読み、4 つの文の文字列リテラルが `connection-errors.ts` の外に 0 件である。走査量（ファイル数）を出し、0 件なら落とす（ADR-0014 決定 6・8）

置き場を同期サーバーにするのは、ここが全部の core に依存してよい唯一の場所だから（`ALLOWED` の `apps/tasuki-sync`）。

**赤から書く**: 3 は Task 2 より前には赤になる（ws-adapter・hub-handlers に直書きが残っている）。Task 2 の前に 3 を書いて赤を見て、Task 2 で緑にする。1 と 2 はいまの時点で緑なので、壊して赤を見る

**確かめる（壊して赤を見る）**

- topic-core の `MESSAGE_TOO_LARGE` の文を 1 字変える → 1 が赤
- roulette-core の `NOT_IN_ROOM` の文を 1 字変える → 2 が赤
- `hub-handlers.ts` に `"コマンドの形式が不正です"` の直書きを戻す → 3 が赤
- 所要: 1.5 時間

### Task 4: poker の中の写しを定数にする

**変えるファイル**

- `application/poker-commit-room-action.ts`: 「ルームが見つかりません」を、poker の文言の定数として 1 つ置く（置き場は、poker-handlers と commit-room-action の両方から取り込める最も内側の既存モジュールにする。新しいモジュールが要るなら `application/poker-error-text.ts`）
- `application/poker-handlers.ts:476,491,602,618`: 定数から取る
- `adapters/ws-adapter.ts:784`: poker の上限超えの文を `CONNECTION_ERROR_TEXT.MESSAGE_TOO_LARGE` から取る（同じアダプタの、同じ「本文が大きすぎる」の判定の文）

**確かめる**

- Task 1 の poker の組と、既存の `test/poker/check-room.test.ts`・`commit-room-action.test.ts` が緑
- 所要: 45 分

### Task 5: コメント・変異のパッチ・文書を合わせ、通して確かめる

- core の文言の表のコメント（topic `error-messages.ts:10-11`・roulette `:7-9`）を、「ws-adapter と同じ文にする」から「同期サーバーの `application/connection-errors.ts` と同じ文。一致は `test/connection-error-text-sources.test.ts` が守る」へ直す
- **変異のパッチを当て直す**（ID は変えない）: §1 の 16 本それぞれに `git apply --check` を流し、当たらないものだけ文脈を直す。宣言の `tests` のパスは変わらない
- 設計正本 §5.2 に、この計画で見直したこと（§2）を日付つきで追記する
- 通しで確かめる: `pnpm test`・`pnpm e2e`・`node scripts/audit-dependency-direction.mjs`・`node scripts/audit-domain-error-shape.mjs`・`node scripts/audit-structure.mjs`・`node scripts/mutation-check.mjs`
- 所要: 1.5 時間（変異検査の時間を除く）

## 5. 変異の ID

**新しい ID は使わない。** 新しい検査（Task 3）と特性テスト（Task 1）の破壊検証は、手で壊して赤を見る。
`mutation-check.mjs` の宣言の表は、#94 PR 3 が m162〜m164 を足す予定で、ここで行を足すとぶつかる（#380 の背景と同じ）。

## 6. 完了条件（#362 の完了条件をこの計画に合わせて読み替えたもの）

- [ ] どの接続の種類でも、接続層のエラーのフレーム（`type`・`code`・`message`）が変更前と同じ（Task 1 の特性テスト）
- [ ] 同期サーバーの中で、接続層の 4 つの文が `connection-errors.ts` にしか無い（Task 3 の 3）
- [ ] core の写しが正本と一致することをテストが守り、壊すと赤になる（Task 3 の 1・2）
- [ ] `audit-dependency-direction.mjs`・`audit-domain-error-shape.mjs` が、許可表を広げずに緑
- [ ] 変異検査が緑（パッチの ID は変えない）
- [ ] 見直したことを設計正本 §5.2 と #362 に残した

## 7. 実施の記録（2026-10-13）

計画から外れたこと・計画の時点で分かっていなかったことだけを書く。

- **timer の `INTERNAL_ERROR` の文言だけが違った。** Task 1 の特性テストを書いて初めて分かった。timer は「内部エラーが発生しました」（`ws-adapter.ts` の `sendInternalError`）、ハブ・お題・ルーレットは「サーバー内部でエラーが発生しました」である。
  - リファクタリングでは変えずに固定した。正本には `TIMER_INTERNAL_ERROR_TEXT` として別に置いた
  - そろえるかどうかは #381 で決める
  - **解消（#381）**: timer の文も `CONNECTION_ERROR_TEXT.INTERNAL_ERROR` にそろえ、`TIMER_INTERNAL_ERROR_TEXT` は廃した。
  - 計画 §1 の「接続層の 4 つの文は timer の系統で共通」は、`INTERNAL_ERROR` について誤りだった
- **ws-adapter の旧コメントは「poker の文言はここに無い」と書いていたが、実際には同じ文を直書きしていた**（`:784`）。計画どおり正本から取る形にし、コメントを実態に合わせた
- **「写しが残っていない」の検査を、poker の正本（`poker-error-text.ts`）にも効かせた。** 計画は timer の系統の正本だけを対象にしていた。Task 4 で poker の正本を置いたので、同じ形の検査で守る
- **変異のパッチは 15 本で、すべてそのまま当たった**（計画 §1 は 16 本と数えていた。数え違い）。当て直しは要らなかった
- core のテスト（topic-core・roulette-core の `error-messages.test.ts`）が持つ写しの名前（`WS_ADAPTER_*`）とコメントを、正本の置き場に合わせて改名した。テストの本体は変えていない
