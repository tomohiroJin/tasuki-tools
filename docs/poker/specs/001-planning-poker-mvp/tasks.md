# Tasks: プランニングポーカー MVP

**Input**: Design documents from `/specs/001-planning-poker-mvp/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ws-protocol.md, quickstart.md

**Tests**: 憲法原則 I（TDD 必須・NON-NEGOTIABLE）により、全ストーリーで「失敗するテストを先に書く」
タスクを実装タスクの前に配置している。テストタスクの省略は憲法違反となる。

**Organization**: ユーザーストーリー（US1〜US4）単位でフェーズ化。各フェーズは独立して
実装・検証・デモ可能なインクリメントになる。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 並列実行可能（別ファイル・未完了タスクへの依存なし）
- **[Story]**: 対応するユーザーストーリー（US1〜US4）
- パスはすべてリポジトリルート（`planning-poker/`）からの相対

## Path Conventions

plan.md の3パッケージ構成に従う: `packages/core/`（ドメイン + プロトコル）、
`apps/web/`（React + Vite）、`apps/sync/`（Bun + WebSocket）。

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: pnpm + turbo モノレポの骨格と3パッケージの初期化（research R8）

- [X] T001 モノレポルートを作成: `package.json`（private, scripts）、`pnpm-workspace.yaml`（packages/*, apps/*）、`turbo.json`（build/test/typecheck パイプライン、core → web/sync 依存順。リンターは固定スタック外のため導入しない）、`tsconfig.base.json`（strict）、`.gitignore`
- [X] T002 [P] `packages/core` を初期化: `packages/core/package.json`（name: `@planning-poker/core`、valibot・neverthrow 依存）、`packages/core/tsconfig.json`、`packages/core/vitest.config.ts`、空の `packages/core/src/index.ts`
- [X] T003 [P] `apps/sync` を初期化: `apps/sync/package.json`（`@planning-poker/core` を workspace 参照、Bun 型定義）、`apps/sync/tsconfig.json`、`apps/sync/vitest.config.ts`、起動だけの `apps/sync/src/server.ts` スタブ
- [X] T004 [P] `apps/web` を初期化: Vite + React + TypeScript 構成で `apps/web/`（`vite.config.ts` に `base: '/poker/'` と dev proxy `/poker/ws` → `ws://localhost:3311`、`@planning-poker/core` を workspace 参照）
- [X] T005 `pnpm install` 後に `pnpm turbo build typecheck test` が（空テストで）全パッケージ通ることを確認し、失敗があれば構成を修正

**Checkpoint**: モノレポの CI パイプラインが空グリーン

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 全ストーリーが依存する共有ドメイン部品とプロトコル境界・サーバー/画面の骨格

**⚠️ CRITICAL**: このフェーズ完了まではユーザーストーリーに着手しない

- [X] T006 [P] core: デッキ定義の失敗するテストを作成 `packages/core/tests/deck.test.ts`（フィボナッチ 10 種の内容・順序、Card 判別ユニオン、カード同値判定。data-model「Card」）
- [X] T007 core: `packages/core/src/deck.ts` を実装しテストをグリーンに（`Card` 型、`FIBONACCI_DECK`、`cardKey`/`cardEquals`）。`packages/core/src/index.ts` から export
- [X] T008 [P] core: プロトコルスキーマの失敗するテストを作成 `packages/core/tests/protocol.test.ts`（C→S 5種・S→C 3種の正常系パース、不正メッセージが Result の err になること。contracts/ws-protocol.md 準拠）
- [X] T009 core: `packages/core/src/protocol.ts` を実装（メッセージ型定義 + Valibot スキーマ + `parseClientMessage(): Result<ClientMessage, ProtocolError>`。憲法原則 IV）
- [X] T010 sync: 結合テスト基盤と「不正メッセージ → error 応答（接続維持）」「join 前の操作 → `not-joined`」の失敗するテストを作成 `apps/sync/tests/helpers.ts`（`bun run` によるサーバーのサブプロセス起動・ポート 0 → 標準出力 1 行 JSON でポート通知・teardown で kill・WS クライアントヘルパ。research R7）+ `apps/sync/tests/protocol-errors.test.ts`（契約テスト観点 #10 の invalid-message 分 + not-joined）
- [X] T011 sync: `apps/sync/src/server.ts` に Bun.serve + WS upgrade + メッセージ受信→`parseClientMessage`→`invalid-message` error 応答の骨格を実装しテストをグリーンに
- [X] T012 [P] web: 画面骨格を実装 `apps/web/src/main.tsx`・`apps/web/src/App.tsx`・自前ルーティング `apps/web/src/router.ts`（`/poker/` 以下のパスを `top | room(roomId)` にパースする純関数 + `apps/web/tests/router.test.ts` を先に作成。research R5）・WS 接続フック `apps/web/src/hooks/useSync.ts`（接続と再接続の骨格のみ）

**Checkpoint**: 契約の単一情報源（protocol.ts）と3パッケージの骨格が完成 — ストーリー実装開始可能

---

## Phase 3: User Story 1 - ルーム作成と招待リンクによる参加 (Priority: P1) 🎯 MVP

**Goal**: ホストがルームを作成して招待リンクを共有し、参加者が名前入力だけで参加、参加者一覧が全員にリアルタイム表示される

**Independent Test**: 2つのブラウザでルーム作成→リンク参加し、双方に同じ参加者一覧が出ること（quickstart S1）

### Tests for User Story 1（先に書き、失敗を確認する）

- [X] T013 [P] [US1] core: Room 集約の失敗するテストを作成 `packages/core/tests/room.test.ts`（createRoom でホスト+voting ラウンド初期化、joinRoom で joinOrder 採番・同名許容、name バリデーション 1〜24 文字 trim、participantToken の発行。data-model「Room」「Participant」）
- [X] T014 [P] [US1] core: スナップショット投影の失敗するテストを作成 `packages/core/tests/snapshot.test.ts`（participants に token が含まれない、you フィールド、voting 中の hasVoted 形。research R1 / SC-004 の基盤）
- [X] T015 [P] [US1] sync: 契約シナリオ #1・#2・room-not-found の失敗する結合テストを作成 `apps/sync/tests/join.test.ts`（create-room → joined+room-state、2人目 join → 双方に配信、不明 roomId → `room-not-found`）

### Implementation for User Story 1

- [X] T016 [US1] core: `packages/core/src/room.ts` を実装（createRoom / joinRoom / バリデーション、Result 型エラー。T013 をグリーンに）
- [X] T017 [US1] core: `packages/core/src/snapshot.ts` を実装（Room → 受信者別 RoomSnapshot 投影。T014 をグリーンに）
- [X] T018 [US1] sync: `apps/sync/src/rooms.ts`（ルームレジストリ Map、8 文字 ID 生成・衝突再生成。research R4）と `apps/sync/src/server.ts` の create-room / join-room ハンドラ + 受信者別 room-state 配信を実装（T015 をグリーンに）
- [X] T019 [P] [US1] web: トップ画面を実装 `apps/web/src/pages/TopPage.tsx`（名前入力 → create-room 送信、作成後 `/poker/room/<id>` へ遷移）
- [X] T020 [P] [US1] web: 参加フォームと参加者一覧を実装 `apps/web/src/pages/RoomPage.tsx`（未参加なら名前入力 → join-room、参加後は招待リンク表示 + コピー、参加者一覧のリアルタイム表示）+ `apps/web/src/components/ParticipantList.tsx`
- [X] T021 [US1] web: `apps/web/src/hooks/useSync.ts` に room-state 購読・joined 処理（participantId 保持）・`room-not-found` のエラー画面（トップへの導線。FR-015）を実装
- [X] T022 [US1] 実画面検証: quickstart S1（作成・参加・不正リンク）を2ブラウザで目視確認（憲法原則 V）

**Checkpoint**: ルーム作成〜参加が動く。ここまでで最小デモが可能

---

## Phase 4: User Story 2 - カードによる投票と一斉公開 (Priority: P1)

**Goal**: フィボナッチデッキで秘匿投票し、全員投票 or ホスト操作で一斉公開する

**Independent Test**: 複数参加者で投票し、公開前は「投票済み」のみ・公開で全票が同時表示されること（quickstart S2、WS フレーム目視で SC-004 確認）

### Tests for User Story 2（先に書き、失敗を確認する）

- [X] T023 [P] [US2] core: ラウンド状態機械の失敗するテストを作成 `packages/core/tests/round.test.ts`（vote 上書き FR-007、revealed 中の vote 拒否、接続中全員投票で自動 reveal FR-008、参加者1人（ホストのみ）でも投票即自動公開が成立、投票中の途中参加で自動公開が保留される、ホスト reveal FR-009、非ホスト reveal 拒否。data-model 状態遷移）
- [X] T024 [P] [US2] core: 秘匿投影の失敗するテストを追加 `packages/core/tests/snapshot.test.ts`（voting 中: 他者票は hasVoted のみ・yourVote は本人のみ、revealed 後: 全票が votes に載る・未投票者は含まれない。SC-004）
- [X] T025 [P] [US2] sync: 契約シナリオ #3・#4・#5 の失敗する結合テストを作成 `apps/sync/tests/voting.test.ts`（**他者宛フレームに選択値が現れないことの生 JSON 検証を含む**、全員投票で自動 revealed、ホスト reveal で未投票のまま公開、非ホスト reveal → `not-host`）

### Implementation for User Story 2

- [X] T026 [US2] core: `packages/core/src/round.ts` を実装（vote / reveal / 自動公開判定の純関数、Result 型。T023 をグリーンに）
- [X] T027 [US2] core: `packages/core/src/snapshot.ts` に投票秘匿・公開の投影を実装（T024 をグリーンに）
- [X] T028 [US2] sync: `apps/sync/src/server.ts` に vote / reveal ハンドラと自動公開の再評価・全員への配信を実装（T025 をグリーンに）
- [X] T029 [P] [US2] web: カード手札 UI を実装 `apps/web/src/components/CardHand.tsx`（10 種の表示・選択ハイライト・公開前の選び直し、revealed 中は無効化）
- [X] T030 [US2] web: `apps/web/src/pages/RoomPage.tsx` に投票状態表示（投票済みバッジ）・ホストの「公開」ボタン・公開時の全票表示を実装
- [X] T031 [US2] 実画面検証: quickstart S2（秘匿・WS フレーム目視・選び直し・自動公開・手動公開）を目視確認（憲法原則 V / SC-004）

**Checkpoint**: プランニングポーカーの核心体験（秘匿投票→一斉公開）が完成

---

## Phase 5: User Story 3 - 結果表示と次ラウンドへの進行 (Priority: P2)

**Goal**: 公開後に各票・平均・最頻値を表示し、ホストが再投票／次ラウンドで投票状態をリセットできる

**Independent Test**: 公開後に集計が正しく表示され、次ラウンド操作で全員が投票前状態に戻ること（quickstart S3）

### Tests for User Story 3（先に書き、失敗を確認する）

- [X] T032 [P] [US3] core: 集計の失敗するテストを作成 `packages/core/tests/stats.test.ts`（数値票のみの平均、?/☕ 除外 FR-010、全員 ?/☕ で average=null、最頻値の同数複数、単独票。data-model 集計ルール）
- [X] T033 [P] [US3] core: 次ラウンドの失敗するテストを追加 `packages/core/tests/round.test.ts`（revealed → next-round で voting に戻り票が空、voting 中の next-round 拒否 FR-011）
- [X] T034 [P] [US3] sync: 契約シナリオ #6 の失敗する結合テストを作成 `apps/sync/tests/next-round.test.ts`（revealed 後の next-round で全員が voting 状態の room-state を受信、非ホスト → `not-host`、revealed の stats に average/modes が載る）

### Implementation for User Story 3

- [X] T035 [US3] core: `packages/core/src/stats.ts` を実装（average / modes の純関数。T032 をグリーンに）
- [X] T036 [US3] core: `packages/core/src/round.ts` に next-round を実装し、`packages/core/src/snapshot.ts` の revealed 投影に stats を組み込む（T033 をグリーンに）
- [X] T037 [US3] sync: `apps/sync/src/server.ts` に next-round ハンドラを実装（T034 をグリーンに）
- [X] T038 [P] [US3] web: 結果表示を実装 `apps/web/src/components/Results.tsx`（各票・平均は小数 1 桁丸め・算出不能は「—」・最頻値複数表示）
- [X] T039 [US3] web: `apps/web/src/pages/RoomPage.tsx` にホストの「再投票」「次のラウンド」ボタン（どちらも next-round 送信、ラベルのみ区別）と投票前状態への画面リセットを実装
- [X] T040 [US3] 実画面検証: quickstart S3（集計表示・?/☕ 除外・次ラウンドリセット）を目視確認（憲法原則 V）

**Checkpoint**: 実セッション運用（見積もり→合意→次の議題）が一巡できる

---

## Phase 6: User Story 4 - 切断への耐性とホスト権限の繰上 (Priority: P3)

**Goal**: 切断してもセッション継続、ホスト切断時は最先着へ権限繰上、同一ブラウザから復帰できる

**Independent Test**: ホストを切断して残存者にホスト操作が現れ、再接続で票ごと復帰すること（quickstart S4）

### Tests for User Story 4（先に書き、失敗を確認する）

- [X] T041 [P] [US4] core: 切断・復帰の失敗するテストを作成 `packages/core/tests/room.test.ts` に追加（disconnect で connected=false・票は保持、ホスト切断で joinOrder 最小の接続中参加者へ繰上 FR-012、token 照合で同一参加者に復帰・票と joinOrder 引き継ぎ FR-013、元ホスト復帰でホスト権限は戻らない、切断による全員投票成立の再評価 US4-AS1）
- [X] T042 [P] [US4] sync: 契約シナリオ #7・#8・#9 の失敗する結合テストを作成 `apps/sync/tests/reconnect.test.ts`（ホスト切断 → 繰上済み room-state 配信、token 付き join-room で票保持のまま復帰、全員切断 → 即時破棄で再 join が `room-not-found` FR-014、切断で自動公開が成立するケース）

### Implementation for User Story 4

- [X] T043 [US4] core: `packages/core/src/room.ts` に disconnect / reconnectByToken / ホスト繰上（research R6）を実装（T041 をグリーンに）
- [X] T044 [US4] sync: `apps/sync/src/server.ts` の WS close ハンドラ（connected 更新・繰上・自動公開再評価・配信）と `apps/sync/src/rooms.ts` の接続数 0 での即時破棄、join-room の token 照合復帰を実装（T042 をグリーンに）
- [X] T045 [US4] web: `apps/web/src/hooks/useSync.ts` に participantToken の localStorage 保存（キー `poker:participant:<roomId>`。research R3）・ページ読込時の token 付き自動 join・切断時の自動再接続（指数バックオフ）・参加者一覧の切断表示を実装
- [X] T046 [US4] 実画面検証: quickstart S4（ホスト繰上 5 秒以内 SC-005・token 復帰・全員切断で room-not-found）を目視確認（憲法原則 V）

**Checkpoint**: 全ユーザーストーリー完成 — MVP 機能一式が揃う

---

## Phase 7: Polish & デプロイ

**Purpose**: 横断的な仕上げと本番公開（憲法の追加制約: デプロイは最終フェーズ）

- [X] T047 [P] リポジトリの README.md を作成（概要・開発コマンド・quickstart への参照。日本語）
- [X] T048 [P] モバイル幅（375px）の表示調整と `/poker/` サブパスのアセット読込確認: quickstart S5 を目視確認（憲法原則 V）
- [ ] T049 quickstart「4. 受け入れ判定」を一括実施: `pnpm turbo test typecheck` 全件グリーン + S1〜S5 再確認 + SC-002/SC-004 の確認結果を記録 + 初見ユーザー1名に説明なしで投票完了してもらう初回利用テスト（SC-006）
- [X] T050 [P] デプロイ成果物を作成: `deploy/Caddyfile.poker`（`/poker` 静的配信 + `/poker/ws` リバースプロキシ断片）、`deploy/poker-sync.service`（systemd ユニット、別ポート）、`deploy/deploy.sh`
- [ ] T051 本番デプロイと検証: `https://tasuki.niku9.click/poker` で quickstart S1〜S2 を再実施し、既存サービス（tdd-mob-pro-timer）の継続動作を確認

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: 依存なし
- **Phase 2 (Foundational)**: Phase 1 完了後。**全ストーリーをブロック**
- **Phase 3 (US1)**: Phase 2 完了後
- **Phase 4 (US2)**: Phase 2 完了後。ルーム参加が前提のため実質 US1 の後を推奨（別担当なら core/round は並行可）
- **Phase 5 (US3)**: US2 の reveal が前提（stats は revealed 投影に載る）
- **Phase 6 (US4)**: US1 の Room 集約が前提。US2/US3 とは独立に進められる（自動公開再評価のみ US2 に依存）
- **Phase 7 (Polish/デプロイ)**: 全ストーリー完了後

### Within Each User Story

- テストを先に書き、**失敗を確認してから**実装する（Red-Green-Refactor、憲法原則 I）
- core（ドメイン）→ sync（サーバー）→ web（画面）→ 実画面検証 の順
- 各ストーリー末尾の実画面検証タスク（T022/T031/T040/T046）を完了するまでそのストーリーは「完了」にしない（憲法原則 V）

### Parallel Opportunities

- Phase 1: T002・T003・T004 は並列可
- Phase 2: T006・T008・T012 は並列可（T007 は T006 の後、T009 は T008 の後）
- 各ストーリー内: テスト作成タスク（例: T013・T014・T015）は並列可。web の独立コンポーネント（例: T019・T020）も並列可
- 複数人体制なら Phase 2 完了後、US2（core/round 担当）と US4（切断まわり担当）を並行開発可能

---

## Parallel Example: User Story 2

```bash
# テストを同時に書き始める（すべて別ファイル）:
Task: "core: ラウンド状態機械のテスト packages/core/tests/round.test.ts"
Task: "core: 秘匿投影のテスト packages/core/tests/snapshot.test.ts"
Task: "sync: 投票シナリオの結合テスト apps/sync/tests/voting.test.ts"

# 実装は core → sync → web の依存順で:
Task: "packages/core/src/round.ts"        # T026
Task: "packages/core/src/snapshot.ts"     # T027（T026 の後）
Task: "apps/sync/src/server.ts vote/reveal" # T028（T027 の後）
```

---

## Implementation Strategy

### MVP First (US1 → US2)

1. Phase 1〜2 を完了（基盤）
2. Phase 3（US1）→ quickstart S1 で検証 → ルーム参加デモ可能
3. Phase 4（US2）→ quickstart S2 で検証 → **ポーカーとして成立（実質 MVP）**
4. ここで一度立ち止まり、実ユーザー（チーム）で試用するのも可

### Incremental Delivery

- US3（集計・次ラウンド）→ セッション運用が快適に
- US4（切断耐性）→ 実運用の信頼性
- Phase 7 で本番公開（デプロイはここまで行わない — 憲法の追加制約）

---

## Notes

- [P] = 別ファイル・依存なし。同一ファイルを触るタスクは直列にしてある（例: RoomPage.tsx を触る T020 → T030 → T039）
- コミットは 1 タスクまたは Red-Green-Refactor の 1 サイクルごと（git-workflow 規約: Conventional Commits 日本語）
- 各チェックポイントで止めてストーリー単位の検証ができる
- スコープ外（お題リスト・永続化・観戦者・デッキ切替・AI 連携）のタスクは存在しない — 追加したくなったら仕様に戻る
