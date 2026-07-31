# タスク: サーバー側の死活監視（WS ping/pong ヘルスチェック）

**入力:** plan.md（＋ spec.md）。タスクは**コーディングのみ**。TDD: 実装の前に失敗するテストを書く。
**凡例:** `[P]` = 並列実行が安全（別ファイル・共有依存なし）。`_要件:_` = 仕様へのトレース。

## フェーズ1 — セットアップ

- [x] T001 `apps/sync/test/ws-adapter.heartbeat.test.ts` を新規作成し、フェイクタイマーを使う既存テストの書き方（`ws-adapter.integration.test.ts` 参照）に倣ってテストファイルの雛形（describe ブロック・共通セットアップ）を用意する。 _要件: —_

## フェーズ2 — 基盤（ブロッキング）

- [x] T002 `apps/sync/src/config.ts` の `SyncConfig` に `heartbeatIntervalMs` / `heartbeatMaxMisses` を追加し、`loadSyncConfig` で `intEnv(env["HEARTBEAT_INTERVAL_MS"], 15_000)` / `intEnv(env["HEARTBEAT_MAX_MISSES"], 2)` からロードする。 _要件: FR-005_

## フェーズ3 — ユーザーストーリー1: 応答のない接続を切断する（P1）

- [x] T003 `apps/sync/test/ws-adapter.heartbeat.test.ts` に「pong を一切返さない接続は `heartbeatMaxMisses` 回分の interval 経過後に `terminate` され、`onDisconnect` が呼ばれる」失敗するテストを書く（Red）。 _要件: FR-001, FR-002, FR-003, FR-004 (US1)_
- [x] T004 `apps/sync/src/adapters/ws-adapter.ts` に `missedPongs: Map<string, number>` と `heartbeatTimer` を追加し、コンストラクタで `startHeartbeat()` を開始、`handleConnection` で `pong` イベントをハンドリングし、T003 を通す最小実装を行う（Green）。 _要件: FR-001, FR-002, FR-003, FR-004 (US1)_
- [x] T005 T004 の実装を `refactor-safely` スキルでレビューし、命名・責務分割（`startHeartbeat`/`stopHeartbeat`/`tickHeartbeat` 等への分割）を整理する（Refactor）。 _要件: FR-001〜004 (US1)_

## フェーズ4 — ユーザーストーリー2: 一時的な揺れで誤検出しない（P1）

- [x] T006 `apps/sync/test/ws-adapter.heartbeat.test.ts` に「1回だけ pong 欠落し、その後 pong を返した接続は `terminate` されない」失敗するテストを書く（Red）。 _要件: FR-003, US2_
- [x] T007 T006 のために `missedPongs` のリセットロジック（`pong` 受信時に 0 にする）を確認・調整して Green にする。 _要件: FR-003, US2_

## フェーズ5 — ユーザーストーリー3: 環境変数での調整（P2）

- [x] T008 [P] `apps/sync/test/config.test.ts`（既存があれば追記、無ければ新規）に `HEARTBEAT_INTERVAL_MS` / `HEARTBEAT_MAX_MISSES` の読み込みと不正値フォールバックの失敗するテストを書く（Red）。 _要件: FR-005 (US3)_
- [x] T009 T008 を通すため `config.ts` の実装を確認・調整する（Green、T002 で概ね実装済みのはず）。 _要件: FR-005 (US3)_

## フェーズ6 — シャットダウン時のタイマー停止

- [x] T010 `apps/sync/test/ws-adapter.heartbeat.test.ts` に「`close()` 呼び出し後は heartbeat の `setInterval` が停止する」失敗するテストを書く（Red）。 _要件: FR-006_
- [x] T011 `ws-adapter.ts` の `close()` に `stopHeartbeat()` を追加して Green にする。 _要件: FR-006_

## フェーズ7 — 配線・非破壊確認

- [x] T012 `apps/sync/src/server.ts` の `new WsAdapter({...})` 呼び出しに `heartbeatIntervalMs: config.heartbeatIntervalMs` / `heartbeatMaxMisses: config.heartbeatMaxMisses` を追加する。 _要件: FR-005_
- [x] T013 `pnpm --filter @tdd-mob/sync test` を実行し、新規テストに加え既存の `driver-absence.test.ts` / `room-reclaimer.test.ts` / `ws-adapter.integration.test.ts` / `ws-adapter.admin.test.ts` が非破壊であることを確認する。 _要件: SC-002_
- [x] T014 `pnpm --filter @tdd-mob/sync typecheck` と `pnpm --filter @tdd-mob/sync lint` を実行し通す。 _要件: —_

## フェーズ8 — ドキュメント

- [x] T015 `apps/sync` 配下または該当する README/ARCHITECTURE/ADR に `HEARTBEAT_INTERVAL_MS` / `HEARTBEAT_MAX_MISSES` の環境変数を追記する（既存の環境変数一覧の場所を調査した上で追記）。 _要件: FR-005_

## 依存関係と並列グループ

- 第1波（並列可）: T001, T002
- クリティカルパス: T001 → T003 → T004 → T005 → T006 → T007 → T010 → T011 → T012 → T013 → T014
- T008/T009 は T002 完了後であれば他フェーズと並列実行可能（`config.test.ts` は `ws-adapter.ts` に依存しない）
- T015 は実装が全て Green になった後に着手
