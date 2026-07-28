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
| G5 | US3・US4・US7 | **画面から実行できる** |
| G6 | US3・US5 | **実機で機能が届く**（実機検証で判明した欠陥の修正。ここまでで機能完成） |

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

## G6 — 実機検証で判明した欠陥の修正（**ここまでで機能完成**）

> G5 完了後に Playwright で実機の探索的検証を行い、単体テストが全て緑のまま
> **利用者に届いていない欠陥が3件**見つかった。いずれも本 Issue の主要シナリオに直結する。
> 各欠陥の詳細は `plan.md` の D6（改訂）・D7・D8 を参照。

### G6-1 退出の通知が切断の通知に上書きされる（D8・FR-086）

- [x] **T038** `apps/web/test/sync/client.dispose.test.ts` を新規作成し、失敗するテストを書く。
  ①`dispose()` 後に WebSocket の close が発火しても `onDisconnected` が呼ばれない
  ②`dispose()` していない切断では従来どおり `onDisconnected` が呼ばれる（再接続の導線を壊さない）
  ③`dispose()` 後に `onConnectionChange("reconnecting")` も呼ばれない（既存の抑止が効いていることの固定）。
  _要件: FR-086_

- [x] **T039** `apps/web/src/sync/client.ts` の `onclose` で `onDisconnected` の呼び出しを
  `if (!this.disposed)` の内側へ移し、T038 を通す。再接続の予約は既に同じ条件で抑止されており、
  通知だけが抑止対象から漏れていた。
  _要件: FR-086_

### G6-2 同名参加者の巻き添え退出と、選択時の区別（D6 改訂・FR-084/085）

- [x] **T040** `apps/sync/test/participant-remove.test.ts` に失敗するテストを追加する。
  ①rotation に居ない参加者を退出させても、**同名で rotation に居る別participantの位置が変わらない**
  ②rotation に居る参加者を退出させると、その participant の位置だけが外れる
  ③rotation に居る側を退出させても、同名の別participantが残るならローテーションの枠は維持される
  （rotation は表示名の配列で、`DuplicateName` により同名は1枠しか持てない。
  「同名2名がともに rotation に居る」状態は到達できないため、代わりにこの観点で検証する）。
  _要件: FR-085, SC-024_

- [x] **T041** `apps/sync/src/application/handlers.ts` の `participant.remove` で、
  rotation の位置解決を表示名（`rotation.indexOf(target.displayName)`）から
  **対象の識別子による解決**へ変更し、T040 を通す。
  rotation は表示名の配列のままとし（設計は変えない・D6）、同名が複数居る場合に
  どの位置が当該participantのものかを決める方法を実装する。
  _要件: FR-085_

- [x] **T042** `[P]` `apps/web/test/ui/RosterPanel.test.tsx` に失敗するテストを追加する。
  ①同名の参加者が2名居るとき、退出ボタンの `aria-label` が互いに異なる
  ②同名が居ないときは従来どおり名前だけのラベルにする（通常時に読みにくくしない）
  ③確認ダイアログの文面でも同名の2名を区別できる。
  _要件: FR-084_

- [x] **T043** `apps/web/src/ui/components/RosterPanel.tsx` を改修し T042 を通す。
  同名判定と識別子の短縮表記は `sync/notice-message.ts` の `label()` と規則を揃える
  （同じ画面で同じ人が別の呼ばれ方をしないこと）。共通化するか、同一の規則を参照すること。
  _要件: FR-084_

### G6-3 見学者に画面から到達できない（D7・FR-083）

- [x] **T044** `apps/web/test/ui/SelfDriverToggle.leave-room.test.tsx` に失敗するテストを追加する。
  ①開始後は「見学に回る」が出て、押すと自分の役割を viewer に変える要求が出る
  ②開始前は出ない（開始前の役割変更は主催者の担当・FR-066）
  ③`onSelfRoleChange` が無ければ出さない。
  _要件: FR-083, FR-073b_

- [x] **T045** `apps/web/src/ui/components/SelfDriverToggle.tsx` に「見学に回る」を追加し T044 を通す。
  「列から外れる」（ローテーションの出入り）とは意味が違うので、文言と配置で区別する。
  _要件: FR-083_

- [x] **T046** `[P]` `apps/web/test/ui/Lobby.role.test.tsx` を新規作成し、失敗するテストを書く。
  ①開始前、主催者の画面には他の参加者を見学者にする操作が出る
  ②主催者でない参加者には出ない（開始前の権限範囲は変えない・FR-066）
  ③自分自身の行には出ない（ホストの自己降格は `CANNOT_CHANGE_HOST` で拒否されるため）
  ④見学者になっている参加者には、編集者に戻す操作が出る。
  _要件: FR-083, FR-066_

- [x] **T047** `apps/web/src/ui/Lobby.tsx` に役割の切り替えを追加し、`App.tsx` から
  `role.set`（他人対象）を送る経路を配線して T046 を通す。
  **T036 で「Lobby を変更しない」としたのは開始前の権限範囲を変えないためであり、
  主催者限定の導線を足すことはその方針と両立する。**
  _要件: FR-083_

- [x] **T048** 「あなたは見学中です」という同じ文言が、ローテーション外（役割は編集者）と
  見学者（役割が viewer）の2つの異なる状態に使われている。
  `SelfDriverToggle` と `SpectatorSelfActions` の文言を、状態が読み分けられるように修正する。
  _要件: FR-069, FR-080_

### G6-4 実行できない操作を提示しない（FR-080）

- [x] **T049** 自己退出のボタンが、不変条件（FR-072）で拒否される状況でも押せてしまう。
  `apps/web` 側でも `canRemoveParticipant()` を用いて事前に無効化し、理由を提示する。
  `permissionHint` と同様、判定は `@tdd-mob/core` の関数に問い、web 側に規則を複製しないこと。
  _要件: FR-080, FR-073_

---

## G7 — rotation を識別子の配列にする（**D6b・最終**）

> 2度目の実機検証で、G6 の「参加時刻が最も早い同名参加者を枠の持ち主とする」規則が
> 2通りの経路で実態と乖離することが判明した。参加順は占有の実態を反映しないため、
> 枠と参加者を直接結び付ける。詳細は `plan.md` の D6b を参照。
>
> **段階ごとにスイートを緑に保つこと。** 一度に全部変えると原因の切り分けができなくなる。
>
> ### 現在地（2026-07-28 時点）
>
> **G7 の実装は完了。`pnpm test && typecheck && lint && build` が全て通る。**
>
> | パッケージ | 状態 |
> |---|---|
> | `packages/core` | ✅ 556 tests green（`1322270`） |
> | `apps/sync` | ✅ 298 tests green（`fe91630`） |
> | `apps/web` | ✅ 554 tests green（`d84687c`） |
>
> **残るのは T059 の実機確認3項目のみ。**
>
> 移行の途中で、当初のタスクに無かった穴を2件塞いだ（いずれも `fe91630`）:
>
> - `config.set` の `members` を受け付けないようにした。core の `ConfigSet` は
>   members（表示名）から rotation を組み直すため、通すと rotation が名前に戻り
>   識別子の不変条件が壊れる。輪の出入りは member 系コマンドだけが担う
> - `member.add` に在室者チェックを足した。実在しない ID を輪に入れると
>   表示名を引けない枠が残る

### G7-1 core（判定と状態遷移）

- [x] **T051** `packages/core` の `SessionState.rotation` を参加者IDの配列として扱うよう
  `decide.ts` / `evolve.ts` / `aggregate.ts` を変更する。
  `initialAggregate` は rotation を引数で受け取る（表示名から組み立てない）。
  `member.add` は participantId を受け取る。`participant.rename` は rotation に触れない。
  _要件: FR-085_

- [x] **T052** `participant.rename` の表示名一意性検査を、rotation ではなく
  **participants の表示名**に対して行うよう移す。検査の場所が変わるだけで、
  「既存の表示名へは改名できない」という既存の挙動は維持する。
  _要件: FR-085, 非機能要件「後方互換」_

  > **移設済み（`fe91630`）。** `handlers.ts` の `handleRoomCommand` が participants に対して
  > 検査する。rotation ではなく participants を見るようになったため、**輪の外に居る在室者の
  > 名前とも衝突する**ようになった（旧実装は rotation しか見ておらず素通りしていた）。
  > 回帰テストは `apps/sync/test/handlers.v2.test.ts` に2件追加した
  > （輪の外の名前・大文字小文字違い）。

### G7-2 wire（プロトコル）

- [x] **T053** `member.add` の wire を `{ name }` から `{ participantId }` に変更する。
  名前→IDの解決という曖昧さを発生源で消す。
  _要件: FR-085_

### G7-3 sync（サーバー）

- [x] **T054** `handlers.ts` の rotation 参照を識別子ベースに直す。
  G6 で入れた「枠の持ち主」判定（`sameNameOwner`）は不要になるので**削除する**。
  `config.members` は表示名のまま保ち、rotation から名前へ写して同期する。
  `nextDriverName` シグナルは ID から名前を引いて送る。
  _要件: FR-085_

- [x] **T055** `participant-remove.test.ts` の G6 用テストを識別子ベースの意味に書き直す。
  **再接続の向き（幽霊が先着）を必ず含める**（G6 のテストは幽霊が後着の場合しか見ておらず、
  実際の再接続を取り逃していた）。
  _要件: FR-085, SC-024_

### G7-4 web（画面）

- [x] **T056** 表示名で rotation を照合している箇所を識別子に直す。
  `RosterPanel` の所属判定と順番算出、`Session` / `Lobby` / `RotationLineup` の現ドライバー表示。
  _要件: FR-085, SC-026_

- [x] **T057** ローテーションの出入りを participantId で送るよう `App.tsx` を変更する。
  あわせて `pendingDriverJoinRef` が消えずに残る経路を見直す
  （枠が消えた瞬間に再追加が走り、サーバー側の誤りを隠していた）。
  _要件: FR-085_

- [x] **T058** ソロモード（`solo/roster.ts`・非推奨だがテスト維持）を追随させる。
  _要件: 非機能要件「後方互換」_

### G7-6 検証

- [ ] **T059** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` を実行する。
  あわせて**実機で次を確認する**: ①同名2名で意図した1名だけを退出させられ、残る同名の順番が変わらない
  ②列を抜けた人が一覧の列内に表示されない ③再接続の幽霊を掃除しても本人の順番が変わらない。
  _要件: FR-085, SC-024, SC-026_

---

## 検証

- [x] **T050** G6 完了後に `pnpm test && pnpm typecheck && pnpm lint && pnpm build` を再実行する。
  あわせて **plan.md「手動確認」の 7〜9（実機検証で追加した項目）を実機で確認する**。
  T037 の時点では G6 の欠陥が残っていたため、実機の確認は再度必要である。
  _要件: FR-083, FR-084, FR-085, FR-086, SC-023, SC-024, SC-025_

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
| FR-083（役割変更の導線を画面に置く） | T044, T045, T046, T047 |
| FR-084（同名を選択時点で区別） | T042, T043 |
| FR-085（順番を識別子で保持） | T040, T041, T051, T052, T053, T054, T055, T056, T057 |
| SC-026（同名時の所属表示） | T056 |
| FR-086（退出通知を上書きしない） | T038, T039 |

**孤立タスクなし**（全 50 タスク（T001〜T049 と T016b）が1つ以上の要件または非機能要件に紐づく）。
T048（文言の読み分け）は FR-069/FR-080、T049（不変条件の事前無効化）は FR-080/FR-073 に紐づく。

---

## 本タスクに含めないもの

- ~~実機目視による確認~~ → **G5 完了後に実施し、欠陥3件を検出したため G6 を追加した**。
  再確認は T050 に含める（`plan.md`「手動確認」の 9 項目）
- `apps/web` のコンポーネントテスト基盤の追加（単体テスト＋実機目視で担保する方針）
- リジューム機能の配線（F11・別 Issue）
- 死活監視（ハートビート）の追加（別 Issue）
- デプロイ操作・タグ付け
