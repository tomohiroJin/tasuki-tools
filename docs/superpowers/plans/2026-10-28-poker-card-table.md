# poker の隠しモード・トランプのポーカー（#403）実装計画

**Goal:** 隠しの入口から、同じルームの仲間と 5 枚の「せーので見せる」ポーカーを遊べる。手札は本人にしか届かず、普段の利用者には何も変わらない。

**Architecture:** テーブルは poker の集約ルート `Round` の `table` に持ち、保管・配信・破棄の経路は見積もりと同じ 1 本を通す。役の判定と配る・見せるはドメイン（`packages/poker-core`）の純関数で、乱数は注入する。秘匿は既存の受信者別の投影（`snapshot.ts`）に乗せる。画面のテーブルは遅延読み込みの別の塊に置く。

**Spec:** [`docs/superpowers/specs/2026-10-28-poker-card-table-design.md`](../specs/2026-10-28-poker-card-table-design.md)（以下「設計」）。T-n・D-n は設計の項目番号。

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 各タスクは失敗するテストから始める |
| II. 技術選定は ADR を通す | 該当なし | 新しい依存を足さない（`React.lazy` は既存の React） |
| III. 揮発インメモリと単純運用 | 通過 | テーブルは `Round` に持つだけ。新しい保管も永続化も無い |
| IV. 境界の型安全 | 通過 | C→S の 3 コマンドは `v.strictObject`、S→C の `table` は `v.optional`（docs/poker/adr/0004）。失敗は `Result` |
| V. 実画面検証 | 通過 | Task 6 の E2E と実画面の確認 |
| VI. 依存は内向き | 通過 | 乱数は `dealHands` へ注入。poker-core は外へ依存しない |
| VII. 検査は壊して確かめる | 通過 | Task 7 で変異 m494〜m499 |
| VIII. 記録が正本 | 通過 | 設計正本・ws-protocol 契約・data-model・ADR-0011 の分類表を更新 |
| IX. 小さく回す | 通過 | PR 1 本（PR の粒度の既定）。デプロイは伴わない |
| X. 抽象は実需で | 通過 | 交換・チップなど実需の無い規則を足さない（D1・D2） |
| XI. 秘密と個人情報を持ち込まない | 通過 | 席は「個人に紐づく」に置き、ログへ出さない（設計 §7） |

**逸脱なし。** Complexity Tracking での正当化を要する項目はない。

## タスク

### Task 1: 役の判定（poker-core `hand-rank.ts`）

- テスト先行: 10 分類それぞれ・A-2-3-4-5 のストレート（5 高）・同じ役の比べ方（ペアの数字 → 残り）・完全な同点
- `evaluateHand(cards)` → `{ category, ranks }`、`compareHands(a, b)`

### Task 2: テーブルの状態遷移（poker-core `card-table.ts`・`round.ts`）

- テスト先行: T-3（52 枚から重複なく 5 枚ずつ・注入した乱数で決まる）、T-6〜T-10、T-11（`discardVote` が席も捨てる）、T-12（見積もりの操作がテーブルを変えない・逆も）
- `createRound` に空のテーブル。`setSeated` / `dealHands` / `showHands`

### Task 3: 境界と投影（poker-core `protocol.ts`・`snapshot.ts`・`error-messages.ts`）

- テスト先行: 3 コマンドの受理と拒否、`table` の省略・受理、T-4（他人の手がどのフィールドにも無い）、T-5（役と勝者）、席が空なら `table` を載せない
- エラー 4 つ（`table-not-seated` / `table-in-play` / `table-no-hand` / `table-full`）と文言

### Task 4: 同期サーバー（tasuki-sync）

- テスト先行（実プロトコル越し）: 2 人が着いて配ると、各自に自分の手だけが届く／見せると全員の手が届く／見積もりの状態が動かない
- `dispatch` に 3 コマンド、`PokerHandlerDeps.random`、`create-sync-server.ts` の配線

### Task 5: 画面（poker-web）

- テスト先行: 入口 2 つ（コナミコマンド・見出し 5 回。入力欄の中では反応しない・間が空けば数え直す）、席に着いた人だけにテーブル、帯の出し分け、文言が書体の base 層に収まる
- `useSync` に 3 操作、`secret-entry.ts`、`components/CardTable.tsx`（`React.lazy`）、`card-table-copy.ts`

### Task 6: E2E（`e2e/specs/poker-card-table.spec.ts`）

- 2 人のブラウザで、入口 → 引く → 互いの手が見えない → 見せる → 役と印

### Task 7: 変異と文書

- 変異 m494〜m499（役の判定・投影の秘匿・席の検査・入口）
- ws-protocol 契約・data-model・ADR-0011 の分類表
- `pnpm test`・検査系（audit-*・check-links・scripts の自己テスト）・`mutation-check --id`
