# ADR-0009: テストの書き方の規約（G3: 名前・構造・関心の一括是正）

- **ステータス**: Accepted（一部実施中。移行は G3 バッチ単位で進行）
- **関連**: 設計正本 `../../../docs/plans/codebase-refactoring/plan.md`（「テストの書き方の規約」節）,
  `../../../docs/plans/codebase-refactoring/spec.md`（FR-091〜099, FR-121〜123, SC-029〜032）,
  `../../../docs/plans/codebase-refactoring/tasks.md`（G3 節）

## 背景

Issue #28 の構造是正レビューにより、テストの `it`/`test` 名の 89% が仕様の識別番号（`T031` 等）や
内部の関数名・「呼ばれる」という実装都合の言い回しを含み、外部から観測可能な振る舞いを述べていないこと、
前提の構築段階に `expect` ガードが 84 箇所あること、前提・操作・検証の区切りが本体 3 行以上のテストの
1% にしか付いていないことが判明した（詳細は spec.md の実測値を参照）。

これらは緑のまま放置でき、検出しづらい形で検証内容を減衰させるリスクを持つ。G2（共有ヘルパ・ビルダー新設）
の完了により Given を 1〜2 行に圧縮できる状態が整ったため、G3 でテストの名前・構造・関心を
ファイル単位で一括是正する。

## 決定

新規・移行済みのテストは次の規約に従う。

```ts
describe("<対象の名詞>", () => {
  /**
   * @requirements FR-006, US1
   */
  describe("<状況>", () => {
    it("<観測可能な結果を述べる平叙文>", () => {
      // Given
      const agg = anAggregate().withRotation("p1", "p2").running().build();
      // When
      const result = decide(agg, { type: "SWITCH" });
      // Then
      expect(...).toBe(...);
    });
  });
});
```

- **名前（FR-092, FR-093）**: 「〜のとき、〜する」。仕様 ID・内部の関数名・「〜が呼ばれる」を含めない
  （差分テスト等 FR-093 の例外表にあるファイルを除く）
- **仕様への追跡（FR-094）**: 仕様 ID は `describe` 直上の JSDoc `@requirements` に置く
- **前提の失敗（FR-096）**: 前提の構築に失敗した場合はビルダーが `throw` する。前提段階に `expect`
  ガードを置かない
- **区切り（SC-032）**: `// Given` `// When` `// Then` を付ける。**本体が 2 行以下のテストには付けない**
  （区切りを付けるまでもなく自明なため）
- **1 テスト 1 振る舞い（FR-095）**: 複数の振る舞いを検証しているテストは、前提を共有したまま分割する
- **位置ではなく意図（FR-093 位置依存条項）**: `result.value[0]` のような位置依存の取り出しは、
  `.find((e) => e.type === "...")` 等の意図が読み取れる形に置き換える
- **FR-123（既に満たしているテストは書き換えない）**: 名前・関心の分割・検証内容が既に規約を満たす
  テストは、それらを変えない。**構造の付与（GWT の区切り）は対象外**であり、良い名前を持つテストにも
  区切りは付ける
- **FR-099（構造と内容を混ぜない）**: 1 回の変更単位で、検証内容（何を assert するか）を変えない。
  分割は検証の複製であり新設ではない

## 影響

- **利点**: テスト名だけで振る舞いが分かるようになり、仕様との対応は JSDoc に一元化される。
  前提の失敗とテスト対象の検証失敗が区別できる。GWT の区切りにより可読性が上がる。
- **代償**: 145 ファイルを 1 ファイルずつ移行する必要があり（G3 は複数バッチに分割）、
  移行完了までは新旧 2 つの規約がファイル間で混在する（FR-121: ファイル内では混在させない）。
- **移行状況の記録（FR-122）**: 下表がこの ADR の時点で新規約に移行済みのファイルである。
  未列挙のファイルは旧規約のままであり、該当バッチが実施され次第この表に追記する。

## 移行済みファイル

### `packages/core/test`（T032: バッチ「集約と時計」）

- `aggregate.test.ts`
- `clock.test.ts`
- `evolve.test.ts`
- `pause-freeze.test.ts`
- `break-freeze.test.ts`
- `driver-timer-restart.test.ts`
- `reset-restart.test.ts`
- `properties.test.ts`

### `packages/core/test`（T033: バッチ「decide と不変条件」）

- `decide.test.ts`
- `decide-v3.test.ts`
- `shuffle.test.ts`
- `transfer-host.test.ts`
- `records.test.ts`

### `packages/core/test`（T034: バッチ「スキーマと純粋関数」）

- `schemas.test.ts`
- `schemas.problem-enabled.test.ts`
- `passphrase-schema.test.ts`
- `driver-assign-schema.test.ts`
- `ai-unlock.test.ts`
- `problem.test.ts`
- `display-name.test.ts`
- `participants.test.ts`

### `packages/core/test`（T035: `permissions-differential.test.ts` 単独）

- `permissions-differential.test.ts`

  ⚠ このファイルは FR-093 の例外表に載っており、コマンド名/役割/自己対象かの組み合わせを
  名前に含めてよい。書き換えは GWT の区切り（`// Given` `// When` `// Then`）の付与のみに
  限定し、オラクル・検証内容・組み合わせ生成（150通り×2＝300＋検算2＝302件）は変更していない。

### `packages/core/test/coverage-supplement.test.ts` の解体（T036）

`evolve` / `records` / `decide` / `problem` の無関係な検証が同居していたため、
`coverage-supplement.test.ts` は削除し、20 件すべてを各関心のファイルへ移動した
（`evolve.test.ts` へ 8 件・`records.test.ts` へ 3 件・`decide.test.ts` へ 6 件・
`problem.test.ts` へ 3 件）。検証内容は変えていない。移動先はいずれも T032〜T034 で
新規約へ移行済みのため、移した節も同じ規約（GWT 区切り等）に従わせた（FR-121）。

### `packages/core/test`（T037: バッチ「権限」）

- `permissions.test.ts`

  describe 名に混在していた T001/T002/T004/T003・HIGH-1/HIGH-2/MEDIUM-1 と、
  `it` 名に混在していた FR-066/FR-067 を、describe 直上の JSDoc `@requirements` へ移した。
  `permissions-differential.test.ts`（T035）とは異なりこのファイルは FR-093 の例外表に
  載っていないため、名前に仕様IDや組み合わせを残していない。

### `apps/sync/test`（T038: バッチ「ハンドラ基礎」）

- `handlers.room.test.ts`
- `handlers.snapshot.test.ts`
- `handlers.lifecycle.test.ts`
- `handlers.time-ping.test.ts`
- `handlers.v2.test.ts`
- `in-memory-room-store.test.ts`
- `code-gen.test.ts`

  describe/it 名に混在していた T0xx・FR-0xx を JSDoc `@requirements` へ移した。
  `handlers.v2.test.ts` ではローカル定義の `getLatestSnapshot()`（`.snapshots.at(-1)?.room` の
  再実装）を `SpyBroadcaster.latestSnapshot()` に置き換えた（G2 の問い合わせメソッドの利用）。
  同ファイルの「v2 コマンド実行後に broadcastSnapshot が呼ばれる」は
  「v2 コマンド実行後に新しい snapshot が全員へ配信される」へ改名した（FR-093：呼び出しの
  発生ではなく結果を述べる）。`handlers.room.test.ts` の「room.join」describe では、前提の
  ルーム作成を `expect(...).toBe(true); if (!x.isOk()) return;` という前提段階の
  expect ガードから `aRoom()`（失敗時 throw）へ置き換えた（FR-096）。
  `handlers.room.test.ts` の「maxRooms に達した場合、2件目の room.create は
  ROOM_LIMIT_EXCEEDED を返す」は「失敗すること」と「拒否された接続へエラー通知が届くこと」の
  2つの振る舞いを検証していたため、前提を共有したまま2テストに分割した（FR-095）。
  検証内容は変えていない。

### `apps/sync/test`（T039: バッチ「交代とドライバー」）

- `handlers.driver-advance.test.ts`
- `driver-assign.test.ts`
- `driver-absence.test.ts`
- `driver-absence.integration.test.ts`
- `proxy-auto-switch.test.ts`
- `manual-skip-eligible.test.ts`
- `shuffle.test.ts`
- `timer-restart.test.ts`
- `schedule.test.ts`

  `shuffle.test.ts` のローカル `latest()` ヘルパ（`spy.snapshots.at(-1)?.room` の再実装）を
  `SpyBroadcaster.latestSnapshot()` に置き換えた。`driver-absence.test.ts` の
  「onDriverAbsence(code) が呼ばれる」・`schedule.test.ts` の「onSwitch が呼ばれる」系の
  名前は、コールバック呼び出しがコンポーネントの外部契約そのものであっても FR-093 の
  「呼び出しの発生」規定の対象になるため、「発火する」という結果の記述に改めた
  （アサーション自体は `toHaveBeenCalledWith` のまま変更していない）。
  T0xx・FR-0xx を describe 名から JSDoc `@requirements` へ移した。検証内容・分割は変更していない。

### `apps/sync/test`（T040: バッチ「参加者と権限」）

- `authorize.test.ts`
- `permissions-before-start.test.ts`
- `permissions-after-start.test.ts`
- `participant-remove.test.ts`
- `self-role-change.test.ts`
- `host-transfer.test.ts`
- `handoff-host.test.ts`
- `started-monotonic.test.ts`

  `participant-remove.test.ts` のローカル `latest()` ヘルパ（`snapshots[snapshots.length - 1]?.room`
  の再実装）を `SpyBroadcaster.latestSnapshot()` に置き換えた（このファイルは変異検査 変異5 の
  検出元であるため、検証内容自体は一切変更していない）。`host-transfer.test.ts` の describe 名に
  含まれていた `R2-3`（SC-029 の `R\d-\d` パターンに合致）を JSDoc `@requirements` へ移した。
  T0xx・FR-0xx・G\d を describe 名から JSDoc `@requirements` へ移した。検証内容・分割は変更していない。

### `apps/sync/test`（T041: バッチ「お題と AI」）

- `handlers.problem.test.ts`
- `problem-delegation.test.ts`
- `problem-delegation.ai.test.ts`
- `handlers.ai-unlock.test.ts`
- `ai-limits.test.ts`
- `claude-cli-problem-provider.test.ts`
- `config-ai.test.ts`（既に規約を満たしており無変更・FR-123）

  `problem-delegation.ai.test.ts` は既に `// Arrange` `// Act` `// Assert` で前提・操作・検証を
  区切っていたため、ADR-0009 の表記（`// Given` `// When` `// Then`）へラベルだけを合わせた
  （区切りの位置・検証内容は変えていない）。`handlers.ai-unlock.test.ts` のローカル
  `getLatestSnapshot()`（`.snapshots.at(-1)?.room` の再実装）を `SpyBroadcaster.latestSnapshot()`
  に置き換え、未使用になった `Room` 型 import を削除した。`ai-limits.test.ts` は
  1 テストが複数の振る舞い（例:「初回は取得でき、release 前の別ルームの取得は concurrent で拒否」）
  を検証していたため、前提を共有したまま複数テストに分割した（FR-095。6 件から分割後 9 件へ
  増加。検証内容は変えていない）。T0xx・FR-0xx を describe/it 名から JSDoc `@requirements` へ移した。

### `apps/sync/test`（T042: バッチ「接続・運用・セキュリティ」）

- `resume.test.ts`
- `join-rate-limit.test.ts`
- `passphrase.test.ts`
- `secure-compare.test.ts`（既に規約を満たしており無変更・FR-123）
- `room-reclaimer.test.ts`
- `admin.test.ts`
- `config.test.ts`（既に規約を満たしており無変更・FR-123）
- `config.admin.test.ts`（既に規約を満たしており無変更・FR-123）
- `ws-adapter.admin.test.ts`
- `ws-adapter.integration.test.ts`

  `passphrase.test.ts` と `admin.test.ts` の describe 名に含まれていた `R4-2` / `R3-2` 等
  （SC-029 の `R\d-\d` パターンに合致）を JSDoc `@requirements` へ移した。T0xx・FR-0xx を
  describe/it 名から JSDoc `@requirements` へ移した。検証内容・分割は変更していない。

### `apps/sync/test`（T043: バッチ「通知と共有メモ」）

- `notice-signal.test.ts`
- `break-suggestion.test.ts`
- `handoff-concurrent.test.ts`

  `handoff-concurrent.test.ts` の `broadcaster.snapshots[broadcaster.snapshots.length - 1]`
  （位置依存の直接添字アクセス）を `SpyBroadcaster.latestSnapshot()` に置き換えた。
  T0xx・FR-0xx を describe 名から JSDoc `@requirements` へ移した。検証内容・分割は変更していない。

これで G3-c（`apps/sync` 44 ファイル）の T038〜T043 が完了した。

### `apps/web/test`（T044: バッチ「直下と設定・記録」）

- `connection-status.test.ts`（既に規約を満たしており無変更・FR-123）
- `empty-hint.test.tsx`
- `host-change.test.ts`
- `platform/notify.test.ts`
- `platform/sound.test.ts`
- `prefs/local-prefs.test.ts`
- `prefs/notify-hint.test.ts`（既に規約を満たしており無変更・FR-123）
- `prefs/notify-prefs.test.ts`
- `records/persist.test.ts`

  `v2.2 R2-4` / `v2.2 R5-2` / `#1` / `Issue #2` / `Issue #3` / `Issue #5` / `T062/T063` /
  `FR-053,054` / `FR-020` を describe 名から JSDoc `@requirements` へ移した。
  `records/persist.test.ts` の「saver を呼ぶ/呼ばない」という記述は、saver がテスト対象の
  実処理そのもの（永続化の唯一の経路）であるため「記録が永続化される/されない」という結果の
  記述に改めた（アサーション自体は `toHaveBeenCalledTimes`/`toHaveBeenCalledWith`/
  `not.toHaveBeenCalled` のまま変更していない）。本体 2 行以下が多く SC-032 の対象外が大半。
  検証内容・分割は変更していない。

### `apps/web/test/sync`（T045: バッチ「sync クライアント」）

- `client.connection.test.ts`
- `client.dispose.test.ts`
- `clock-offset.test.ts`
- `dispatch.test.ts`
- `notice-message.test.ts`

  `R5-1` / `FR-086` / `T041, FR-007, SC-001` / `T055, FR-025, FR-026` / `Issue #22 G4, FR-077` を
  describe 名・行内コメントから JSDoc `@requirements` へ移した。`client.dispose.test.ts` と
  `dispatch.test.ts` の「onDisconnected/onConnectionChange/onRoom 等を呼ぶ・呼ばない」という
  記述は、これらのコールバックが検証対象の関数の外部契約そのもの（`dispatchServerMessage` は
  メッセージ種別ごとに対応するハンドラへ値を渡すことが仕様であり、
  `SyncClient` の dispose 後は通知を上げないことが仕様）であるため、
  「〜へ渡す/渡る」「切断を通知する/しない」という結果の記述に改めた
  （アサーション自体は `toHaveBeenCalledWith`/`not.toHaveBeenCalled` のまま変更していない）。
  `notice-message.test.ts`（変異検査 変異9 の検出元）は既に振る舞いベースの名前・関心の分割を
  持っていたため、GWT の区切り付与のみを行い、検証内容・組み合わせは一切変更していない。

### `apps/web/test/ui`（T046: バッチ「Session」6ファイル・残り分）

- `Session.break.test.tsx`（既に規約を満たしており無変更・FR-123。休憩UI撤去確認テストで
  本体2行以下のみのため GWT 対象外）
- `Session.permissions.test.tsx`
- `Session.problem.test.tsx`
- `Session.restart.test.tsx`
- `Session.roster.test.tsx`
- `Session.rotation.test.tsx`

  describe 名・it 名に混在していた FR-0xx・T0xx・R\d-\d・Issue #N・v2.3 #N・D1 等を
  describe 直上の JSDoc `@requirements` へ移した。`Session.restart.test.tsx` の
  「onRestartTimer が呼ばれる」・`Session.rotation.test.tsx` の「onJoinRotation(自名) が呼ばれる」
  「onDriverSkip(自ID) を呼ぶ」「onDriverResume(自ID) を呼ぶ」・`Session.roster.test.tsx` の
  「onShuffle が呼ばれる」「onMoveRotation(from, to) が呼ばれる」は、いずれも SC-030 の
  「呼ぶ/呼ばれる」規定に抵触するため、「持ち時間がリセットされる」「ローテーションに加入する」
  「一時離脱する」「復帰する」「ランダムに並べ替わる」「指定した位置へドライバーが移動する」という
  結果の記述に改めた（アサーション自体は `toHaveBeenCalledWith`/`toHaveBeenCalledTimes` のまま
  変更していない）。本体が3行以上のテストに `// Given` `// When` `// Then` を付与した
  （2行以下のテストは対象外）。検証内容・分割は変更していない。
  `Session.break.test.tsx` は既に規約を満たしており（仕様IDなし・呼称なし・本体2行以下）無変更。

### `apps/web/test/ui`（T047: バッチ「Lobby と招待」8ファイル）

- `Lobby.empty.test.tsx` / `Lobby.host-transfer.test.tsx` / `Lobby.invite.test.tsx` /
  `Lobby.problem-gate.test.tsx` / `Lobby.role.test.tsx` / `Lobby.rotation.test.tsx` /
  `InvitePanel.test.tsx` / `PassphrasePanel.test.tsx`

  describe 名・it 名に混在していた R\d-\d・T0xx・FR-0xx・Issue #N・v2.3 #N・Task N・C2・D7・G6 等を
  describe 直上の JSDoc `@requirements` へ移した（`Lobby.rotation.test.tsx` は同名参加者の区別・
  退出の確認の各 describe にも分けて付与）。`Lobby.host-transfer.test.tsx` の
  「onTransferHost が呼ばれる」・`Lobby.rotation.test.tsx` の「onJoinRotation(自分のID) が呼ばれる」
  「onShuffle が呼ばれる」・`Lobby.rotation.test.tsx` の「onRemoveParticipant が呼ばれる」・
  `Lobby.problem-gate.test.tsx` の「onConfigSet(...) が呼ばれる」・`PassphrasePanel.test.tsx` の
  「onSet(...) を呼ぶ」2件は、いずれも SC-030 の「呼ぶ/呼ばれる」規定に抵触するため、
  「ホスト移譲の要求が送られる」「ローテーションに加入する」「ランダムに並べ替わる」
  「退出処理が実行される」「お題機能を無効にする設定が保存される」「パスフレーズが保存される/
  保護が解かれる」という結果の記述に改めた（アサーション自体は `toHaveBeenCalledWith`/
  `toHaveBeenCalledTimes` のまま変更していない）。本体が3行以上のテストに
  `// Given` `// When` `// Then` を付与した（2行以下は対象外）。検証内容・分割は変更していない。

### `apps/web/test/ui`（T048: バッチ「参加者一覧」8ファイル）

- `RosterPanel.test.tsx` / `SelfDriverToggle.test.tsx` / `SelfDriverToggle.leave-room.test.tsx` /
  `RotationLineup.test.tsx` / `rotation-names.test.ts` / `rotation-status.test.ts` /
  `participant-label.test.ts` / `presence.test.ts`

  describe 名・it 名に混在していた T0xx・FR-0xx・Issue #N・v2.2/v2.3 #N・Task N・G5・G6 等を
  describe 直上の JSDoc `@requirements` へ移した（`RosterPanel.test.tsx` は各内側 describe
  にも分けて付与）。「onAddProxy/onRename/onMove/onTransferHost が呼ばれる」は SC-030 の
  「呼ぶ/呼ばれる」規定に抵触するため、「代理参加者が追加される」「名前が変わる」
  「ドライバーが前/後の順番へ移動する」「ホスト移譲の要求が送られる」という結果の記述に
  改めた（アサーション自体は変更していない）。本体3行以上のテストに `// Given` `// When`
  `// Then` を付与した。`rotation-names.test.ts`・`rotation-status.test.ts`・
  `participant-label.test.ts`・`presence.test.ts` は純粋関数テストで明確な「操作」が
  無いため、既存の T034 バッチ（`packages/core/test/display-name.test.ts`）の先例に倣い
  `// Given` の後に `// When / Then` を1行で付与した。検証内容・分割は変更していない。

これで G3-d の T046〜T048 が完了した。

### `apps/web/test/ui`（T049: バッチ「お題」6ファイル）

- `ProblemEditor.test.tsx` / `ProblemConfigPanel.test.tsx` / `ProblemModeToggle.test.tsx` /
  `problem-generation.test.ts` / `AiUnlockPanel.test.tsx` / `SessionConfigPanel.test.tsx`

  describe 名・it 名に混在していた `T050/T051`・`FR-009,012,013,038,039,040,041` を
  describe 直上の JSDoc `@requirements` へ移した。`ProblemEditor.test.tsx` の
  「コピーボタンを押すと onCopy が呼ばれる」「やり直しボタンを押すと onRegenerate が呼ばれる」
  「持ち込みボタンを押すと onPaste が呼ばれる」・`ProblemConfigPanel.test.tsx` の
  「言語/難易度を変更すると onChange(...) が呼ばれる」・`SessionConfigPanel.test.tsx` の
  「交代間隔ボタン/ナビゲータートグルで onChange(...) が呼ばれる」・`AiUnlockPanel.test.tsx` の
  「入力値で onUnlock を呼ぶ」は、いずれも SC-030 の「呼ぶ/呼ばれる」規定に抵触するため、
  「お題がコピーされる」「別のお題への差し替えが要求される」「持ち込みへの切替が要求される」
  「言語/難易度設定が更新される」「交代間隔が変更される」「ナビゲーター機能が有効になる」
  「入力値が送られる」という結果の記述に改めた（アサーション自体は `toHaveBeenCalled`/
  `toHaveBeenCalledWith`/`toHaveBeenCalledOnce` のまま変更していない）。本体が3行以上の
  テストに `// Given` `// When` `// Then` を付与した（2行以下は対象外）。
  `problem-generation.test.ts` は既に仕様IDなし・呼称なし・本体2行以下中心で規約を満たしており
  無変更（FR-123）。検証内容・分割は変更していない。
