# タスク: 再接続時の自動リジューム配線（Issue #24）
**入力:** plan.md（＋ spec.md）。タスクは**コーディングのみ**。TDD: 実装の前に失敗するテストを書く。
**凡例:** `[P]` = 並列実行が安全（別ファイル・共有依存なし）。`_要件:_` = 仕様へのトレース。

## フェーズ1 — resume-identity モジュール
- [x] T001 `apps/web/src/sync/resume-identity.test.ts` に `saveResumeIdentity`/`loadResumeIdentity`/
      `clearResumeIdentity` の**失敗するテスト**を書く（保存→読込の往復、未保存時は null、
      破損 JSON 時は null、clear 後は null）。 _要件: FR-001, FR-004, FR-005, FR-006_
- [x] T002 T001 を通すため `apps/web/src/sync/resume-identity.ts` を実装（green）し、
      リファクタする。 _要件: FR-001, FR-004, FR-005, FR-006_

## フェーズ2 — SyncClient の再接続検知
- [x] T003 `apps/web/src/sync/client.test.ts` に「初回 `connect()` の `onopen` では
      `onReconnected` が呼ばれない」「切断→再接続の `onopen` では `onReconnected` が呼ばれる」
      **失敗するテスト**を書く。 _要件: FR-002, FR-003_
- [x] T004 T003 を通すため `client.ts` に `onReconnected` コールバックと
      `hasConnectedOnce` フラグを実装（green）し、リファクタする。 _要件: FR-002, FR-003_

## フェーズ3 — App.tsx の配線
- [x] T005 `App.tsx` に `pendingResumeRef`（participantId/resumeToken の一時保持）と
      `resumeDisplayNameRef`（新規 ref）を追加し、`onIdentity` で前者へ書き込み、
      次に来る `onRoom`（snapshot、room.code を含む）で `saveResumeIdentity` を呼ぶよう
      実装する。room.joined メッセージに code が含まれないため、code は onRoom まで
      持ち越す設計に変更した（plan.md の resumeContextRef 案から実装時に見直し）。
      （`handleCreateRoom`/`handleJoinRoom` 冒頭で `resumeDisplayNameRef` をセット）。 _要件: FR-001_
- [x] T006 `App.tsx` の `makeClient` に `onReconnected` を配線し、
      `loadResumeIdentity()` があれば `room.join`（resumeToken 付き）を再送する。 _要件: FR-002, FR-003_
- [x] T007 `App.tsx` の `leave-room` エラー経路の後始末に `clearResumeIdentity()` を追加する。 _要件: FR-004_
- [x] T008 `App.tsx` の `session-lost` エラー経路の後始末に `clearResumeIdentity()` を追加する。 _要件: FR-005_

## フェーズ4 — 検証・ドキュメント
- [x] T009 `pnpm --filter @tasuki/timer-web typecheck` と `pnpm --filter @tasuki/timer-web lint` を通す。 _要件: —_
- [x] T010 変更に伴い更新すべきドキュメント（README / ARCHITECTURE 等）を調査し、必要なら更新する。 _要件: —_

## 依存関係と並列グループ
- 第1波（並列可）: T001→T002、T003→T004（別ファイルのため並列実行可能）
- クリティカルパス: T002, T004 → T005 → T006 → T007 → T008 → T009 → T010
