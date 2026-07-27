# 実行タスク: 開始後は全員同格 — セッション進行から主催者を外す

**対応 spec:** [`spec.md`](./spec.md) ・ **対応 plan:** [`plan.md`](./plan.md) ・ **Issue:** [#22](https://github.com/tomohiroJin/tasuki-tools/issues/22)

> **原則:** すべてテストファースト（red → green → refactor）。各振る舞いについて「失敗するテスト」を
> 実装タスクの前に置く。`[P]` は依存のない別ファイルを触るため並列実行が安全なタスク。
> 作業ディレクトリはすべて `tdd-mob-pro-timer/`。

## グループ分けの方針

本機能は**技術レイヤの依存が強制的に順序を決める**（`packages/core` が存在しないと `apps/sync` が
呼べず、サーバーが緩和されないと UI を検証できない）。そのため `plan.md` の段階 P0〜P5 を
グループとし、各グループがどのユーザーストーリーを満たすかを明記する。
各グループは独立してマージ可能である。

| グループ | 満たすストーリー | マージ時点での利用者から見た変化 |
|---|---|---|
| G0 | なし（基盤） | なし（挙動不変） |
| G1 | なし（基盤） | なし（挙動不変） |
| G2 | US1・US2 | **サーバー側の詰みが解消**（UI が隠しているボタンは未解決） |
| G3 | US3（一部）・US5 | 退出・自己役割変更が可能に。詰み防止の不変条件が有効 |
| G4 | US3-4・US4-3 | 誰が何をしたかが全員に伝わる |
| G5 | US3・US4・US7 | **画面から実行できる**（ここまでで機能完成） |

---

## G0 — `packages/core` に権限判定と不変条件を新設（配線しない）

- [x] **T001** `packages/core/test/permissions.test.ts` を新規作成し、`checkPermission()` の失敗するテストを書く。
  表駆動で「段階（未開始/開始済み）× 役割（host/editor/viewer）× 対象（自分/他人）」を網羅する。
  最低限、次を含める: ①開始後は editor が `driver.assign` を実行できる ②開始前は editor が `driver.assign` を実行できない
  ③viewer は他人対象の操作を実行できない ④viewer は自分対象の `participant.rename` を実行できる。
  _要件: FR-062, FR-063, FR-064, FR-066, FR-067, FR-068, US1, US2_

- [x] **T002** `packages/core/test/permissions.test.ts` に、**`HOST_ONLY_COMMANDS` 13 コマンド全件**について
  「開始前は host のみ／開始後は editor も可」を1件ずつ検証する失敗するテストを追加する。
  対象コマンドは `session.complete` / `session.abort` / `session.reset` / `phase.set` / `role.set` /
  `room.passphrase.set` / `ai.unlock` / `host.transfer` / `participant.addProxy` / `participant.remove` /
  `member.move` / `member.shuffle` / `driver.assign` の各件。網羅を目視に頼らない。
  _要件: FR-063, FR-064, FR-066, US1_

- [x] **T003** `packages/core/test/permissions.test.ts` に default-deny の失敗するテストを追加する。
  ①規則表に無いコマンド名（例 `"unknown.command"`）が拒否される
  ②**ルームスコープかつ到達可能な 25 コマンド**が規則表に登録されている（未登録＝拒否になるため
  登録漏れを検出できる）。テスト内に除外リストを定数として明示する:
  在室前の 4 件（`room.create` / `room.join` / `presence.ping` / `time.ping`）は `checkPermission` を
  通らないため対象外。到達不能な 2 件（`break.start` / `break.end`。`buildDomainCommand` に case がなく
  受理されない）も対象外。`CommandSchema` は全 31 件なので `31 - 4 - 2 = 25` を検算に使う。
  _要件: FR-071_

- [x] **T003b** `packages/core/test/permissions-differential.test.ts` を新規作成し、
  **現行 5 層のロジックを参照実装（オラクル）として一度だけ書き下し**、
  25 コマンド × 3 役割 × 2 対象 = 150 通りの**開始前**の判定を `checkPermission` と機械的に比較する
  失敗するテストを書く。開始後は緩和が入るため、別の独立した述語
  （「編集者以上なら許可・見学者は自己対象の `SELF_SCOPED` 以外拒否」）で 150 通りを検証する。
  **人手による突き合わせは禁止**（本設計では層⑤・層①・層② の見落としを 3 回起こした）。
  オラクルの出典は `apps/sync/src/application/handlers.ts` の 443-459（層②）/ 464-481（層③）/
  1078-1138（層①）とし、コメントに行番号を記録する。
  _要件: FR-066, FR-071, 非機能要件「後方互換」_

- [x] **T004** `packages/core/src/permissions.ts` を新規作成し、T001〜T003b を通す。
  `PermissionInput` / `PermissionVerdict` 型、規則表（`SELF_SCOPED_COMMANDS` / `SELF_SCOPED_AFTER_START` /
  `HOST_ONLY_BEFORE_START` / `EDITOR_PLUS_COMMANDS`）、`checkPermission()`、`isAllowed()` を実装する。
  判定順序は `plan.md`「判定の順序」のステップ 0〜5 に厳密に従う。
  _要件: FR-062, FR-063, FR-064, FR-066, FR-067, FR-068, FR-071_

- [x] **T005** `[P]` `packages/core/test/participants.test.ts` を新規作成し、失敗するテストを書く。
  ①`countManagers` が `isPlaceholder: true` の参加者を数えない ②実在 editor が1名のとき
  `canDemote` がその1名の降格を拒否する ③`canRemoveParticipant` が同じ1名の退出を拒否する
  ④代理 editor が別に1名いても②③の判定が変わらない。
  _要件: FR-072, FR-073, US5_

- [x] **T006** `[P]` `packages/core/src/participants.ts` を新規作成し、T005 を通す。
  `countManagers()` / `canDemote()` / `canRemoveParticipant()` を実装する。
  _要件: FR-072, FR-073_

- [x] **T007** `packages/core/src/index.ts` に `export * from "./permissions.js";` と
  `export * from "./participants.js";` を追加する（既存の全モジュールが `export *` 様式なので揃える）。
  これにより `apps/sync` と `apps/web` の両方から参照できる
  （`apps/web` は `package.json:17` で `@tdd-mob/core` に依存済み・実行時関数も既に利用している）。
  _要件: FR-071_

---

## G1 — `Room.startedAt` の追加と記録（判定にはまだ使わない）

- [x] **T008** `packages/core/test/schemas.test.ts` に失敗するテストを追加する。
  ①`startedAt` を省略した既存形式の room オブジェクトが `RoomSchema` でパースできる（後方互換）
  ②`startedAt: null` と数値の双方が通る。
  _要件: FR-062_

- [x] **T009** `packages/core/src/schemas.ts` の `RoomSchema` に
  `startedAt: v.optional(v.nullable(v.number()))` を追加し、`Room` 型（`aggregate.ts` の interface）にも
  `startedAt?: number | null` を追加して T008 を通す。既存の任意フィールド群の直後に置く。
  _要件: FR-062_

- [x] **T010** `apps/sync/test/started-monotonic.test.ts` を新規作成し、失敗するテストを書く。
  ①`phase.set session` で `startedAt` が記録される ②**`phase.set` を送らず `session.act START` だけを
  送った場合も記録される** ③`phase.set setup` へ後戻りしても `startedAt` が消えない
  ④2 回目の開始で値が更新されない。
  _要件: FR-062, US6_

- [x] **T011** `apps/sync/src/application/handlers.ts` の `applyRoomLevelEvent()` に、
  `PhaseSet`（`phase === "session"` のとき）と **`SessionStarted`** の case で
  `startedAt` を記録する処理を追加し、T010 を通す。`startedAt !== null` のときは上書きしない。
  `SessionStarted` は現在この関数に case が無いため新規追加になる（集約側は変更しない）。
  _要件: FR-062_

---

## G2 — 権限判定を 5 層から 1 層へ置換（**ここで詰みが解消する**）

- [x] **T012** `apps/sync/test/permissions-before-start.test.ts` を新規作成し、失敗するテストを書く。
  開始前に editor が `driver.assign` / `member.shuffle` / `member.move` / `role.set` /
  `room.passphrase.set` / `ai.unlock` / `participant.remove` を送ると `UNAUTHORIZED` になる。
  あわせて在室していない接続からの操作が `NOT_IN_ROOM` になることを確認する。
  _要件: FR-066, FR-070, US6_

- [x] **T013** `apps/sync/test/permissions-after-start.test.ts` を新規作成し、失敗するテストを書く。
  開始後に host でない editor が T012 と同じ 7 コマンドをすべて実行できる。
  **専用ハンドラ経由の4件（`role.set` / `room.passphrase.set` / `ai.unlock` / `host.transfer`）を
  必ず含める**（集合表だけ直しても緩和されないため、ここが回帰検出点になる）。
  あわせて `requireEditor` 経由の2件（`problem.request` / `problem.submit`）について
  「viewer は拒否・editor は許可」が段階に関わらず維持されることを検証する。
  _要件: FR-063, FR-064, FR-067, US1_

- [x] **T014** `apps/sync/src/application/handlers.ts` に `isSelfTarget` を算出する単一の関数を追加する。
  `plan.md`「`isSelfTarget` の算出は単一の resolver に集約する」の表に従い、`participantId` /
  `name` / `index` の 3 形態と「対象なし」を扱う。まだ既存ガードは削除しない。
  _要件: FR-068_

- [x] **T015** `apps/sync/src/application/handlers.ts` の `handleRoomCommand` から
  ①`authorize()` 呼び出し（484 行付近）②`RELATIONAL_SELF_OR_HOST` ガード（443-459）
  ③`member.add` / `member.remove` の個別ガード（464-481）を削除し、
  `checkPermission()` の単一呼び出しに置き換える。`HOST_ONLY_COMMANDS` / `EDITOR_PLUS_COMMANDS` /
  `authorize()` の定義（1078-1138）も削除する（core へ移設済み）。T013 の該当部分が通る。
  _要件: FR-063, FR-064, FR-066, FR-071_

- [x] **T016** `apps/sync/src/application/handlers.ts` の**専用ハンドラ4箇所（層⑤）**の
  `actor.role !== "host"` 検査を `checkPermission()` に置き換える。
  対象は `handleRoleSet`（717 付近）/ `handleRoomPassphraseSet`（782 付近）/
  `handleAiUnlock`（832 付近）/ `handleHostTransfer`（896 付近）。T013 の該当部分が通る。
  **これらは `authorize()` に到達しないため、T015 だけでは緩和されない。**
  _要件: FR-063, FR-064, FR-071_

- [x] **T016b** `apps/sync/src/application/handlers.ts` の **`requireEditor()`（1026-1050・層④）**の
  `actor.role === "viewer"` 検査を `checkPermission()` に置き換える。在室確認（`NOT_IN_ROOM`）と
  アクター解決は残す。この関数は `handleProblemRequest`（954）と `handleProblemSubmit`（988）が使い、
  こちらも `authorize()` に到達しないため個別の置換が必要。これを省くと viewer 判定が2箇所に残り
  **FR-071（判定を単一の規則として保持）を満たせない**。T013 の残りが通る。
  _要件: FR-067, FR-071_

- [x] **T017** `apps/sync/src/application/handlers.ts` の `UNAUTHORIZED` メッセージを段階込みの文言に統一する
  （`plan.md`「変更: `UNAUTHORIZED` の message」の表に従う）。「開始前はホストのみ実行できます」
  「見学者では実行できません（進行に加わると実行できます）」の2系統にする。
  _要件: FR-069_

- [x] **T018** `apps/sync/test/authorize.test.ts` を、`authorize()` の削除と `checkPermission()` への
  移設に追随して更新する。core 側（T001〜T004）と重複する純粋な判定ケースは削除し、
  **コマンド経路を通した結合の観点だけを残す**。
  _要件: FR-071_

---

## G3 — 不変条件・自己退出・自己役割変更・ホスト引き継ぎ

- [x] **T019** `apps/sync/test/participant-remove.test.ts` に失敗するテストを追加する。
  ①host 以外の editor が他人を退出させられる ②参加者が自分自身を退出させられる
  ③実在の editor が1名しか残っていないときその1名は退出させられない
  ④退出させられた本人に `REMOVED_FROM_ROOM` が届く
  ⑤**開始前にホストが自己退出した後も、残った editor が `phase.set` を実行できる**
  ⑥**他人がホストを退出させた場合もホストが引き継がれる**。
  _要件: FR-065, FR-072, FR-073, FR-079, US3, US5_

- [x] **T020** `apps/sync/src/application/handlers.ts` の `participant.remove` 分岐（497-539）を改修し
  T019 を通す。①自己対象の `INVALID` 拒否（500 行）を削除する ②`canRemoveParticipant()` を検査して
  破る要求を拒否する ③対象が `room.hostParticipantId` と一致する場合、退出処理の**前に**
  `transferHost(room, 次のホスト)` を適用する（次のホスト＝代理でない在室者のうち `joinedAt` 最小。
  候補がいなければ引き継がずそのまま退出）。
  _要件: FR-065, FR-073, FR-079_

- [x] **T021** `[P]` `apps/sync/test/self-role-change.test.ts` を新規作成し、失敗するテストを書く。
  ①開始後に viewer が自分を editor に変更できる ②開始前は自分の役割を変更できない（host のみ）
  ③ホスト自身の自己降格は `CANNOT_CHANGE_HOST` で拒否される
  ④最後の実在 editor が自分を viewer に降格しようとすると拒否される。
  _要件: FR-073b, FR-072, US5_

- [x] **T022** `apps/sync/src/application/handlers.ts` の `handleRoleSet`（702-760）を改修し T021 を通す。
  `checkPermission()`（T016 で置換済み）に加えて `canDemote()` を検査する。
  `CANNOT_CHANGE_HOST`（727 付近）の制約は**維持する**。
  _要件: FR-073, FR-073b_

---

## G4 — 実行者の通知（`signal: "notice"` と退出通知の改称）

- [x] **T023** `packages/core/test/schemas.test.ts` に `SignalNoticeMsg` の失敗するテストを追加する。
  `action` の 4 値（`participant-removed` / `session-aborted` / `session-reset` / `session-completed`）と
  `actorName` / `actorParticipantId` の必須、`targetName` / `targetParticipantId` の任意を検証する。
  _要件: FR-077_

- [x] **T024** `packages/core/src/schemas.ts` に `SignalNoticeMsg` を追加し、`ServerMsgSchema` の
  variant に登録して T023 を通す。
  _要件: FR-077_

- [x] **T025** `apps/sync/test/notice-signal.test.ts` を新規作成し、失敗するテストを書く。
  ①退出・中断・リセット・完成の各操作後に `signal: "notice"` が在室者へ配信される
  ②`actorName` と `actorParticipantId` が実行者を指す
  ③`participant-removed` で `targetName` / `targetParticipantId` が対象を指す
  ④退出させられた本人には notice が届かない（snapshot 配信対象外のため）。
  _要件: FR-077_

- [x] **T026** `apps/sync/src/application/handlers.ts` で `participant.remove` / `session.abort` /
  `session.reset` / `session.complete` の成功後に `broadcaster.broadcastSignal()` で notice を配信し、
  T025 を通す。
  _要件: FR-077_

- [x] **T027** `apps/sync/src/application/handlers.ts:533-537` の退出通知を、
  `code: "REMOVED_FROM_ROOM"` と「`<実行者名>` さんにより退出させられました。招待から再参加できます。」に
  変更する。T019-④が通る。
  _要件: FR-075, US3_

- [x] **T028** `[P]` `apps/web/src/sync/dispatch.ts` に `signal: "notice"` の受信分岐を追加し、
  `ui/announce.ts` 経由でライブリージョンへ流す。文言の組み立ては `ui/permission-hints.ts`（T030）ではなく
  この近傍に置き、同名参加者がいる場合は識別子で区別する。
  _要件: FR-077_

- [x] **T029** `[P]` `apps/web/src/App.tsx:219` の `REMOVED_BY_HOST` 分岐を `REMOVED_FROM_ROOM` に対応させる。
  **旧コードも受理し続ける**（開いたままのタブが存在しうるため）。
  _要件: FR-075_

---

## G5 — 画面の整合（**ここまでで機能完成**）

- [x] **T030** `[P]` `apps/web/src/ui/permission-hints.ts` を新規作成し、拒否理由の表示文言を1箇所に集約する。
  `checkPermission()` の `PermissionVerdict` を受けて「いつ・誰が実行できるか」の日本語ヒントを返す。
  _要件: FR-069, FR-080_

- [x] **T031** `apps/web/src/ui/Session.tsx` の `isHost` による **6 箇所**のゲート
  （361 / 394 / 405 / 442 / 454 / 465）を `isAllowed()` の呼び出しに置き換え、150-151 の定義を
  判定入力の算出に置き換える。
  `EndSessionZone`（361）は開始後は全員に表示する。`room.startedAt` を判定入力に使う。
  _要件: FR-076, FR-080, FR-081, US1, US7_

- [x] **T032** `apps/web/src/ui/components/RosterPanel.tsx` の `canHostAction`（定義 59 / 89、
  使用 157 / 165 / 246 / 255 / 289 / 299 / 323 の 7 箇所）を `canManage` に改名し、
  他人の退出（299 付近）に `ConfirmDialog` を追加する。確認文には**対象者の名前**と
  **招待から再参加できる旨**を含め、共有ルームでは他参加者への影響も明示する。
  自分の行には退出ボタンを出さない。
  _要件: FR-075, FR-076, FR-078, FR-080, US3_

- [x] **T033** `apps/web/src/ui/components/SelfDriverToggle.tsx` に「ルームから抜ける」を追加する。
  確認は課さないが、他人向けの退出操作とは配置を分ける（誤タップ防止）。
  _要件: FR-078, FR-079, US3_

- [x] **T034** `apps/web/src/ui/components/EndSessionZone.tsx` の `PendingAction` に `"complete"` を追加し、
  完成にも確認を課す。文言は中断・リセットとは分け、「何が失われるか」ではなく
  「記録として締めてよいか」を問う（記録は残る）。
  _要件: FR-074b, US4_

- [x] **T035** `apps/web/src/ui/Session.tsx` および
  `apps/web/src/ui/components/RosterPanel.tsx`（289 付近）で、開始後は `host.transfer` の
  操作を提示しない。開始者の表示は特権の保持者ではなく記録上の情報として扱う。
  _要件: FR-082, US7_

- [x] **T036** `apps/web/src/ui/Lobby.tsx` を**変更しない**ことを確認し、型エラーが出る場合のみ
  `RosterPanel` の prop 改名（T032）に追随する最小修正を行う。開始前の権限範囲は変えない。
  _要件: FR-066, US6_

---

## 検証

- [x] **T037** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` をリポジトリ直下で実行し、
  すべて通ることを確認する。既存の `presence.ts` 関連テスト（開始前の自動委譲）が
  **無変更で通る**ことを確認する（後方互換の担保）。
  _要件: 非機能要件「後方互換」_

---

## 要件 → タスクの対応（孤立要件の検出用）

| 要件 | 対応タスク |
|---|---|
| FR-062（段階で判定を切替・単調） | T001, T004, T008, T009, T010, T011 |
| FR-063（開始後は主催者条件を使わない） | T001, T002, T004, T013, T015, T016 |
| FR-064（開始後は editor+ が全操作） | T001, T002, T004, T013, T015, T016 |
| FR-065（開始後は他人の退出も可） | T019, T020 |
| FR-066（開始前は従来維持） | T001, T002, T004, T012, T015, T036 |
| FR-067（viewer の状態変更を拒否） | T001, T004, T013, T016b |
| FR-068（自己対象は常に許可） | T001, T004, T014 |
| FR-069（拒否理由の提示） | T017, T030 |
| FR-070（未在室の要求を拒否） | T012 |
| FR-071（判定を単一の規則に） | T003, T004, T007, T015, T016, T016b, T018 |
| FR-072（編集者以上が1名以上） | T005, T006, T019, T021 |
| FR-073（不変条件を破る要求を拒否） | T005, T006, T019, T020, T022 |
| FR-073b（開始後は自分の役割を変更可） | T021, T022 |
| FR-074（中断・リセットの確認） | 既存実装（`EndSessionZone`）で充足。T031 により全員に提示される |
| FR-074b（完成の確認） | T034 |
| FR-075（退出の確認・対象名・再参加） | T027, T029, T032 |
| FR-076（共有ルームでの影響明示） | T031, T032 |
| FR-077（実行者を全員に提示） | T023, T024, T025, T026, T028 |
| FR-078（破壊的操作の視覚的分離） | T032, T033 |
| FR-079（自己退出に同等の確認を課さない） | T019, T020, T033 |
| FR-080（実行できる操作のみ提示） | T030, T031, T032 |
| FR-081（主催者限定に見せない） | T031 |
| FR-082（開始者は記録上の情報） | T035 |

**孤立タスクなし**（全 38 タスク（T001〜T037 と T016b）が1つ以上の要件または非機能要件に紐づく）。

---

## 本タスクに含めないもの

- 実機目視による確認（`plan.md`「手動確認（実機・タスク外）」の 6 項目）
- `apps/web` のコンポーネントテスト基盤の追加（単体テスト＋実機目視で担保する方針）
- リジューム機能の配線（F11・別 Issue）
- 死活監視（ハートビート）の追加（別 Issue）
- デプロイ操作・タグ付け
