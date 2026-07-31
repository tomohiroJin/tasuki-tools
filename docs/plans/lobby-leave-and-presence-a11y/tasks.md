# タスク: ロビーの自己退出導線 ＋ ロビー在席状態の sr-only テキスト
**入力:** plan.md（＋ spec.md）。タスクは**コーディングのみ**。TDD: 実装の前に失敗するテストを書く。
**凡例:** `[P]` = 並列実行が安全（別ファイル・共有依存なし）。`_要件:_` = 仕様へのトレース。

コミットは Issue ごとに分ける（フェーズ1は #37 のみのコミット、フェーズ2は #42 のみの
コミットにする）。

## フェーズ1 — Issue #37: ロビーの自己退出導線

- [x] T001 `apps/web/test/ui/Lobby.leave-room.test.tsx` を新規作成し、以下の**失敗するテスト**を書く（red）:
  - 自分の行に「ルームから抜ける」ボタンが表示される
  - クリックすると確認ダイアログを経由せず `onRemoveParticipant(自分のparticipantId)` が直接呼ばれる
  - 在室する編集者以上が自分1名のみ（他が viewer のみ、または自分しかいない）のとき disabled になり、title に理由が出る
  - 他に編集者以上がいる場合は enabled のまま
  - `onRemoveParticipant` が未指定なら「ルームから抜ける」ボタンを描画しない
  _要件: FR-001, FR-002, FR-003, FR-004_
- [x] T002 T001 を通すため `apps/web/src/ui/Lobby.tsx` に `@tdd-mob/core` の
  `canRemoveParticipant`（別名 import）を使った「ルームから抜ける」`GhostButton` を
  `isMe` ブロックに追加する（green）。文言・title は plan.md 前提2の通り。
  _要件: FR-001, FR-002, FR-003, FR-004_
- [x] T003 実装をリファクタする（disabled 判定・title 文言の重複が無いか確認し、
  必要なら小さなヘルパーに切り出す。ただし新規コンポーネント化はしない — plan.md 参照）。
  `apps/web/test/ui/Lobby.rotation.test.tsx` と
  `apps/web/test/ui/Lobby.host-transfer.test.tsx` を実行し、既存の
  「ホストが他参加者を退出させる」フロー（確認ダイアログ含む）に回帰が無いことを確認する。
  _要件: FR-005_
- [x] T004 `pnpm --filter @tdd-mob/web test -- test/ui/Lobby.rotation.test.tsx
  test/ui/Lobby.host-transfer.test.tsx test/ui/Lobby.empty.test.tsx test/ui/Lobby.role.test.tsx
  test/ui/Lobby.invite.test.tsx test/ui/Lobby.problem-gate.test.tsx` を実行し、
  既存 Lobby テスト39件が回帰なく通過することを確認した。
  `test/ui/Lobby.leave-room.test.tsx` は6件通過。 _要件: FR-001〜FR-005_
- [x] T005 `git add` で #37 の変更（`Lobby.tsx` の該当差分・`Lobby.leave-room.test.tsx`）
  のみをコミットした（`da7d9da`）。 _要件: —_

## フェーズ2 — Issue #42: ロビー在席状態の sr-only テキスト

- [x] T006 [P] `apps/web/test/ui/Lobby.presence-a11y.test.tsx` を新規作成し、以下の
  **失敗するテスト**を書いた（red・1件失敗を確認）:
  - online/idle/offline の3状態それぞれで、`presenceLabel()` に対応する `sr-only` テキストが
    参加者行に存在する
  - 参加者一覧の `<ul>` に `aria-live` 属性が付与されていない（回帰ガード）
  _要件: FR-006, FR-008_
- [x] T007 T006 を通すため `apps/web/src/ui/Lobby.tsx` の `PresenceDot` の直後に
  `<span className="sr-only">{presenceLabel(p.presence)}</span>` を追加した（green）。
  `presence.ts` / `PresenceDot.tsx` は変更していない。
  _要件: FR-006, FR-007_
- [x] T008 リファクタ不要と判断（追加は1行のみで抽出の余地なし）。
  `apps/web/test/ui/components/PresenceDot.test.tsx`（4件）と
  `apps/web/test/ui/RosterPanel.test.tsx`（57件）を実行し、`PresenceDot` 無改修による
  無回帰を確認した（計61件通過）。 _要件: FR-007, SC-004_
- [x] T009 `pnpm --filter @tdd-mob/web test -- test/ui/Lobby` を実行し、フェーズ1・2の
  `Lobby.*.test.tsx` 一式（8ファイル・47件）が通過することを確認した。 _要件: FR-006〜FR-008_
- [x] T010 `git add` で #42 の変更（`Lobby.tsx` の該当差分・
  `Lobby.presence-a11y.test.tsx`）のみをコミットする（Conventional Commits, `feat:`）。
  _要件: —_

## フェーズ3 — 仕上げ

- [x] T011 `apps/web` の `typecheck` と `lint` を実行し通過を確認した
  （`pnpm --filter @tdd-mob/web typecheck` / `pnpm --filter @tdd-mob/web lint`、いずれも
  エラー0件）。code-review の指摘（`canLeaveRoomInvariant` の重複呼び出し）を受けて
  リファクタも実施し、再度 typecheck/lint/test を通し直した。 _要件: —_
- [x] T012 `docs/plans/roster-row-unification/spec.md` の「スコープ外 / 非目標」節
  （218行目）に、Issue #42 で対応済みである旨の注記を追記した。`docs/BACKLOG.md` に
  #37/#42 相当の記載は見つからず、追記不要と判断した。 _要件: —_
- [x] T013 PR 作成前の最終確認: `pnpm --filter @tdd-mob/web test -- test/ui/Lobby` を
  再実行し、8ファイル・47件が通過することを確認した（リファクタ後の最終実行）。 _要件: —_

## 依存関係と並列グループ

- 第1波（並列可）: T001（#37 のテスト作成）と T006（#42 のテスト作成）は別関心事なので
  並列に着手可能（ただし同一ファイル `Lobby.tsx` を編集するため、実装コミット T002/T005 と
  T007/T010 は競合しないよう順番に行う）。
- クリティカルパス: T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010
  → T011 → T012 → T013
