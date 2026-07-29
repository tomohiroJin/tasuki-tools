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
