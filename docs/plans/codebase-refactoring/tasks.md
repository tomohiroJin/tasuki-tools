# 実行タスク: コードベースの構造是正 — 原則違反の棚卸しと解消

**対応 spec:** [`spec.md`](./spec.md) ・ **対応 plan:** [`plan.md`](./plan.md) ・ **Issue:** [#28](https://github.com/tomohiroJin/tasuki-tools/issues/28)

> **原則:** 作業ディレクトリはすべて `tdd-mob-pro-timer/`。
> `[P]` は依存のない別ファイルを触るため並列実行が安全なタスク。
>
> **本計画はリファクタリングであり、新しい振る舞いを作らない。** したがって TDD の適用は次のとおり:
> - **新規に作るもの**（ビルダー・走査スクリプト・`conflictsWithExisting` 等）は**失敗するテストを先に書く**
> - **移動・置換のみのもの**（`export *` の列挙、データ分離、import 差し替え）は**既存のテストが安全ネット**であり、
>   新規テストは書かない。**書けば「移動を検証するテスト」という無価値なものが増える**
> - **B-2 だけは特性テスト（characterization test）を先に書く**。現在の振る舞いを固定してから触る

## グループ分けの方針

`plan.md` の段階 G0〜G7 をそのままグループとする。**各グループは独立してマージ可能**であり、
**任意のグループの途中で停止できる**（FR-113・FR-116）。

| グループ | 満たすストーリー | マージ時点での変化 |
|---|---|---|
| G0 | なし（基盤） | 計測手段が増えるだけ。挙動不変 |
| G1 | US1 | 約 1,400 行 + 未配線 UI 一式（8 ファイル）減る。挙動不変 |
| G2 | US2（機械的） | テストの重複が消える。**製品コード不変** |
| G3 | US2（判断） | テストが仕様書として読める。**製品コード不変** |
| G4 | US5 | 構造が責務を表す。挙動不変 |
| G5 | US4 | 規則が 1 箇所になる。挙動不変 |
| G6 | US3 | 型が契約を語る。挙動不変 |
| G7 | FR-119 | **唯一の挙動変更**（到達不能分岐の撤去） |

### G3 のタスク粒度（145 ファイルをどう割るか）

**1 タスク = 1 ファイルにすると 145 タスクになり管理できない。1 グループにまとめると FR-116（任意の時点で停止可能）を満たせない。**
そこで **関心ごとのバッチ（1 バッチ 6〜14 ファイル）**とする。`core` と `sync` はテストが
1 ディレクトリ直下に平置きされているため、ディレクトリではなく**ファイル名の主題**で束ねる。

- **1 バッチ = 1 コミット**。バッチ内でファイルの途中に旧規約を残さない（FR-121）
- **バッチはすべてファイル名（`test/` からの相対パス）で列挙する。** ディレクトリ指定と混ぜない。
  混ぜると網羅性を機械的に検査できず、実際に二重割り当てを生んだ
- **着手前に網羅性を検査する**: 全バッチのファイル名を集め、
  **実在する 144 ファイルが 1 回ずつ現れることを確認する**（過不足・重複がゼロ）
- 各バッチの完了時に `docs/adr/0009-test-conventions.md` の移行済み一覧を更新する（FR-122）

---

## G0 — 計測基盤（`scripts/` のみ・挙動不変）

> ★ **`v2.12.0` は 2026-07-29 にデプロイ済み。G0〜G7 の全段階が着手可能である**（spec の前提 1）。
> 以前あった「G0 のみデプロイ前に着手可・G1 以降はデプロイ後」という待ちの条件は、
> デプロイ完了により解消した。

- [x] **T001** `scripts/audit-structure.mjs` を新規作成し、**spec の「操作的定義（何を数えるか）」表の
  各行に 1 対 1 対応する関数**を置く（`sc027UnreachableModules` / `sc028DuplicateTestDoubles` /
  `sc029SpecIdsInNames` / `sc030CallNamesInNames` / `sc031GuardExpects` / `sc032GwtMarkers` /
  `sc035MessageDefinitions` / `sc036TestCount` / `sc039UnreachableElements`）。各関数は件数を返すだけにする。
  **Node で書く**（SC-027 の import グラフ探索と SC-032 の本体行数判定は grep では書けない）。
  _要件: FR-098, SC-027〜SC-036_

- [x] **T002** `scripts/audit-structure.test.mjs` を新規作成し、**既知の入力に対する期待値を固定する
  失敗するテスト**を書く。最低限、SC-031 について「そのテスト内により後ろの `expect` があるものだけを数え、
  最後の `expect` は数えない」ことを検証する（**この判定を誤って当初 95→実際 84 という過大計上をした**）。
  _要件: FR-098_

- [x] **T003** T001 を実行し、**現状値が spec の記載と一致することを確認する**。
  一致しない項目があれば、**spec の表と実装のどちらが正しいかを判断し、ズレを解消する**
  （spec の表が正本。実装を直すのが原則だが、表の定義が曖昧なら表を直す）。
  結果を `docs/plans/codebase-refactoring/baseline.md` に記録する。
  _要件: FR-098, SC-027〜SC-036_

- [x] **T004** `scripts/mutations/` に**変異パッチ 9 件**を作成する。対象と内容は `plan.md`
  「変異と『検出を期待するテスト』の対応表」に従う。**各パッチに、検出を期待するテストファイルの
  パスをコメントで書く**。
  _要件: FR-098_

- [x] **T005** `scripts/mutation-check.mjs` を新規作成する。
  各変異を適用 → **対応表のテストファイルを実行** → 検出可否を記録 → 復元。
  **`--full` で変異の属するパッケージ全体を実行**するモードも持つ（既定は絞り込み実行）。
  復元は `git checkout -- <path>` で行い、**作業ツリーに未コミット変更がある状態では実行を拒否する**。
  _要件: FR-098_

- [x] **T006** T005 に**ベースラインの妥当性検査**を実装する。
  **全 9 変異が検出されることを確認し、検出されない変異があればエラーで終了する**。
  検出されない変異は前後比較の材料にならず、「表が一致した」という誤った安心を与えるため。
  _要件: FR-098_

- [x] **T007** T005 を実行し、**ベースラインの検出結果表**を `baseline.md` に記録する。
  検出されない変異があれば、変異を差し替えるか**検出できるテストを先に追加する**。
  _要件: FR-098_

---

## G1 — 休眠コードの撤去（挙動不変・削除のみ）

- [x] **T008** T001 の SC-027 を実行し、**撤去対象が `apps/web/src/solo/` ・ `apps/web/src/ai/byok.ts` ・
  `apps/web/src/ai/key-storage.ts` ・ `apps/web/src/ui/components/AiSettingsModal.tsx` の 4 系統であることを
  機械的に確認する**。製品コードの入口から辿って到達しないことを根拠とする（テストからの参照は根拠にしない）。
  _要件: FR-087, FR-090, US1_

- [x] **T009** **削除とその参照除去を 1 コミットで行う（solo 系）。**
  `apps/web/src/solo/`（`local-engine.ts` / `roster.ts` / `eligibility.ts`）、
  `apps/web/test/solo/`（3 ファイル・32 テスト）、
  **`apps/web/test/ui/Solo.roster.test.tsx`（3 テスト）**を削除する。
  ⚠ **最後の 1 件を忘れると `src/solo/roster.js` への import が解決できずツリーが壊れる**
  （`Solo.roster.test.tsx:13`）。`test/solo/` 配下ではなく `test/ui/` 配下にあるため見落としやすい。
  _要件: FR-087, FR-088, FR-116, US1_

- [x] **T010** **削除とその参照除去を 1 コミットで行う（BYOK 系）。**
  `apps/web/src/ai/byok.ts` ・ `apps/web/src/ai/key-storage.ts` ・
  `apps/web/src/ui/components/AiSettingsModal.tsx` ・
  `apps/web/test/ai/`（2 ファイル・11 テスト）・
  `apps/web/test/ui/AiSettingsModal.test.tsx`（8 テスト）を削除し、
  **同じコミットで `apps/web/test/ui/a11y.test.tsx` から `AiSettingsModal` の import（11 行目）と
  `describe` 節（102 行目〜）を削除する**。
  ⚠ **削除と参照除去を別コミットに分けるとツリーが壊れる。**
  **`apps/web/src/ai/no-ai.ts` と `provider.ts` は残す**（`App.tsx` が参照している）。
  `a11y.test.tsx` の他のコンポーネントの検証は残す（ファイルごと消さない）。
  _要件: FR-087, FR-088, FR-116, US1_

- [x] **T011** `apps/web/src/App.tsx:79` の休眠コードに関するコメント
  （「ByokProvider / AiSettingsModal / key-storage は将来の再有効化に備えて残置（休眠）。」）を削除する。
  対象が消えたため記述が嘘になる。
  _要件: FR-087, US1_

- [x] **T012** **i18n 一式を撤去する（生きたモジュール内の死んだデータ・FR-119）。**
  `packages/core/src/i18n/ja.ts`（162 行）と `en.ts`（151 行）、
  `packages/core/src/index.ts` の再エクスポート 2 行、
  `apps/web/test/ui/i18n-coverage.test.ts`（72 行・10 テスト）、
  型 `JaMessages` / `EnMessages`（他から一度も参照されていない）、
  `packages/core/test/coverage-supplement.test.ts` の i18n 節（197 行目〜と import 2 行）を削除する。
  **これらを 1 コミットで行う**（分けるとツリーが壊れる）。

  **根拠:** `ja` / `en` を参照している製品コードは**ゼロ**である（`index.ts` の再エクスポートのみ）。
  画面の文言は各コンポーネントに直接書かれており、i18n は一度も通っていない。
  参照はテスト 2 ファイルのみで、`i18n-coverage.test.ts` は
  **キーが存在することだけを検証するテスト**である（US1 が否定した循環そのもの）。

  ⚠ **`packages/core` のカバレッジ閾値（90%）への影響を必ず確認する。**
  i18n は `include: ["src/**/*.ts"]` に含まれており、コードとテストの両方が消えるため比率が動く。
  閾値を割った場合は**閾値を下げるのではなく、割った原因を確認する**。
  _要件: FR-119, FR-088, FR-116, US1_

- [x] **T009b** **削除とその参照除去を 1 コミットで行う（未配線 UI 一式）。**
  G0 の走査（T003）で spec の想定外に見つかった 8 ファイルを撤去する:
  `apps/web/src/ui/Celebration.tsx` ・ `apps/web/src/ui/components/Button.tsx` ・
  `apps/web/src/ui/components/ThemeToggle.tsx` ・ `apps/web/src/ui/theme.ts` ・
  `apps/web/src/ui/stage-theme.ts` ・ `apps/web/src/ui/stage-transitions.ts` ・
  `apps/web/src/platform/wake-lock.ts` ・ `apps/web/src/records/io.ts`。
  **対応するテストも同じコミットで撤去する**（FR-088）。
  ⚠ `Celebration.tsx` は `records/io.ts` と `components/Button.tsx` を、
  `ThemeToggle.tsx` は `theme.ts` を引き連れている。**頂点だけ消すと残りが宙に浮く。**
  ⚠ 撤去後に `apps/web/test/ui/a11y.test.tsx` など、削除対象を参照しているテストが
  残っていないことを確認する（T010 と同じ失敗の型）。
  _要件: FR-087, FR-088, FR-116, US1_

- [x] **T013 [P]** 空ディレクトリ `apps/sync/adapters/` ・ `apps/sync/application/` ・
  `apps/sync/domain/` ・ `apps/sync/ports/` を削除する（git 未追跡・過去の cwd 誤りの産物）。
  _要件: FR-111, US5_

- [x] **T014** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` を実行し全緑を確認する。
  **`packages/core` のカバレッジ閾値（90%）を割っていないことを確認する**。
  T001 を実行し **SC-027 が 0 件になったこと**を確認する
  （対象は当初の 6 ファイルに T009b の 8 ファイルを加えた **計 14 ファイル**）。
  **実機確認（RC-003）**: `vite` を再起動し、ロビー・セッション・お題の各画面が
  撤去前と同じであることを目視する（削除した BYOK 導線は元々画面に無い）。
  _要件: FR-114, SC-027, RC-003_

- [x] **T015** **P1 完了時点のテスト件数を測定し `baseline.md` に記録する**。
  これが SC-036 の基準値になる（以後この値を下回らない）。
  _要件: SC-036_

---

## G2 — テスト共有ヘルパの新設と差し替え（**製品コードを 1 行も変えない**）

> **このグループと G3 では `git diff --stat -- 'tdd-mob-pro-timer/*/src/*'` が空であること**を
> 各コミットの完了条件とする（FR-114 の構造的な担保）。

### G2-a `apps/sync/test/support/`

- [x] **T016** `apps/sync/test/support/spy-broadcaster.test.ts` を新規作成し、
  `SpyBroadcaster` の**失敗するテスト**を書く。既存 29 ファイルの定義の和集合に加えて、
  問い合わせ `latestSnapshot()` / `errorsTo(connId)` / `hasErrorCode(connId, code)` /
  `signalsOf(signal)` の振る舞いを検証する。
  _要件: FR-097, FR-118, US2_

- [x] **T017** `apps/sync/test/support/spy-broadcaster.ts` を実装し T016 を緑にする。
  **既存定義の和集合を超える機能を足さない**（FR-118）。
  _要件: FR-097, FR-118, US2_

- [x] **T018 [P]** `apps/sync/test/support/fake-code-gen.ts` に `FakeCodeGen` を実装する
  （既存 27 ファイルの定義の和集合。決定的な連番）。
  _要件: FR-097, US2_

- [x] **T019** `apps/sync/test/support/room-builder.test.ts` を新規作成し、`aRoom()` の**失敗するテスト**を書く。
  `withParticipants()` / `withDriver()` / `started()` / `build()` の各段が期待どおりのルームを作ること、
  **前提の構築に失敗したら `throw` すること**（`expect` を使わないこと）を検証する。
  _要件: FR-096, FR-097, US2_

- [x] **T020** `apps/sync/test/support/room-builder.ts` に `aRoom()` と `makeTestHandlers()` を実装し
  T019 を緑にする。
  _要件: FR-096, FR-097, US2_

- [x] **T021** `apps/sync/test/` の 44 ファイルから `SpyBroadcaster` / `FakeCodeGen` のローカル定義を削除し、
  `support/` からの import に差し替える。**この段階では名前も構造も変えない**（機械的変更のみ・FR-117）。
  _要件: FR-097, FR-117, SC-028, US2_

### G2-b `packages/core/test/support/`

- [x] **T022** `packages/core/test/support/aggregate-builder.test.ts` を新規作成し、
  `anAggregate()` の**失敗するテスト**を書く（`withRotation()` / `withCurrentDriver()` /
  `running()` / `paused()` / `at()` / `build()`、および失敗時の `throw`）。
  _要件: FR-096, FR-097, US2_

- [x] **T023** `packages/core/test/support/aggregate-builder.ts` を実装し T022 を緑にする。
  `initialAggregate` を内部で使い、**現在 12 ファイルが手で組んでいる形の和集合以上を作らない**。
  _要件: FR-097, FR-118, US2_

- [x] **T024** `packages/core/test/` のうち **`initialAggregate` を使う 12 ファイル**を
  `anAggregate()` に差し替える。残り 12（`display-name` / `permissions` / `permissions-differential` /
  `participants` / `clock` / `schemas` / `passphrase-schema` / `driver-assign-schema` / `ai-unlock` ほか）
  は**集約を組み立てないため対象外**。
  _要件: FR-097, FR-117, US2_

### G2-c `apps/web/test/support/`

- [x] **T025** `apps/web/test/support/room-view.test.ts` を新規作成し、**`aRoomView()` の失敗するテスト**を書く。
  既定値が返ること、上書きが部分的に効くことを検証する。
  **既定値は `App.tsx` が実際に渡している値から取る**（テスト専用の都合のよい既定値を作らない）。
  _要件: FR-097, FR-118, US2_

- [x] **T026** `apps/web/test/support/room-view.ts` に `aRoomView(overrides?)` を実装し T025 を緑にする。
  **これが web の主役である**（48 ファイルが使う）。
  _要件: FR-097, US2_

- [ ] **T027 [P]** `apps/web/test/support/fakes.ts` に `FakeAudio` / `FakeOsc` / `FakeGain` / `FakeWS` を
  集約する（現在 5 / 2 / 2 / 2 ファイルで重複定義）。
  _要件: FR-097, SC-028, US2_

- [x] **T028** `apps/web/test/support/render.tsx` に汎用ラッパ `renderWith(Component, props?)` を実装する。
  **コンポーネント固有のラッパ（`renderSession()` 等）は、必要になったバッチで初めて足す。
  先回りして 8 個作らない**（FR-118）。
  _要件: FR-097, FR-118, US2_

- [x] **T029** `apps/web/test/` の **render を使う 48 ファイル**を `aRoomView()` と
  `support/fakes.ts` に差し替える。**この段階では名前も構造も変えない**。
  _要件: FR-097, FR-117, SC-028, US2_

- [x] **T030** 全パッケージで `pnpm test && typecheck && lint && build` 全緑を確認する。
  T001 で **SC-028 が 0 種**になったことを確認する。
  **`git diff --stat -- 'tdd-mob-pro-timer/*/src/*'` が空であることを確認する**（製品コード不変）。
  _要件: FR-114, SC-028_

---

## G3 — テストの名前・構造・関心の一括是正（**製品コードを 1 行も変えない**）

> **各バッチの手順（すべてのバッチで共通）**
> 1. 対象ファイルを読む。**既に FR-092/093/095 を満たしている名前と分割は変えない**（FR-123）
> 2. 仕様 ID を名前から `describe` 直上の JSDoc `@requirements` へ移す（FR-094）
> 3. 名前を観測可能な振る舞いに書き換える（FR-092）。「〜が呼ばれる」を結果の記述に直す
> 4. 前提段階の `expect` ガードをビルダーの `throw` に置き換える（FR-096）
> 5. `// Given` `// When` `// Then` の区切りを付ける。**本体 2 行以下のテストには付けない**（SC-032）
> 6. 複数の振る舞いを検証しているテストを、前提を共有したまま分割する（FR-095）
> 7. 位置依存の検証（`result.value[0]` 等）を意図で取り出す形に置き換える（FR-093 の位置依存条項）
> 8. **1 バッチ = 1 コミット。** ADR 0009 の移行済み一覧を更新する（FR-121, FR-122）

### G3-a 実績の測定（最初のバッチで見積もりを検証する）

- [x] **T031** **最初のバッチ（T032）に着手する前に開始時刻を記録し、完了後に実績を出す。**
  1 ファイルあたりの所要が `plan.md` の前提（重い 25〜40 分 / 軽い 8〜15 分）と
  **1.5 倍以上乖離していたら、この時点で見積もりを引き直す**（撤退基準 1）。
  _要件: FR-116_

### G3-b `packages/core/test`（24 ファイル・重い 10）

- [x] **T032** バッチ「集約と時計」（8 ファイル）: `aggregate` / `clock` / `evolve` /
  `pause-freeze` / `break-freeze` / `driver-timer-restart` / `reset-restart` / `properties`。
  ⚠ `timer-restart` は **core に存在しない**（`apps/sync/test/timer-restart.test.ts`・T039 が扱う）。
  _要件: FR-091〜FR-096, FR-123, US2_

- [x] **T033** バッチ「decide と不変条件」（5 ファイル）: `decide` / `decide-v3` / `shuffle` /
  `transfer-host` / `records`。
  _要件: FR-091〜FR-096, FR-123, US2_

- [x] **T034** バッチ「スキーマと純粋関数」: `schemas` / `schemas.problem-enabled` /
  `passphrase-schema` / `driver-assign-schema` / `ai-unlock` / `problem` / `display-name` / `participants`。
  **本体 2 行以下のテストが多く、SC-032 の対象外が大半**である。名前と分割のみを見る。
  _要件: FR-091〜FR-096, FR-123, SC-032, US2_

- [x] **T035** **`permissions-differential.test.ts` を単独のコミットで扱う**（安全ネット自身の書き換え）。
  書き換えは**名前の付け方と構造の表現に限る**。オラクルと検証の組み合わせは変えない。
  **前後で検証される組み合わせの総数が一致すること**（開始前 150 通り + 開始後）を確認する。
  FR-093 の例外表に載っているため、**組み合わせを名前に含めてよい**。
  _要件: FR-091, FR-093（例外）, US2_

- [x] **T036** `packages/core/test/coverage-supplement.test.ts` を**解体する**。
  `evolve` と `records` の無関係な検証が同居しているため、それぞれの関心のファイルへ移す。
  （i18n 節は T012 で削除済み）
  **検証内容は変えない**（移動のみ）。移動後に `packages/core` のカバレッジ閾値 90% を割らないことを確認する。
  _要件: FR-095, FR-099, US2_

- [x] **T037** バッチ「権限」: `permissions.test.ts`（`permissions-differential` は T035 で完了済み）。
  _要件: FR-091〜FR-096, FR-123, US2_

### G3-c `apps/sync/test`（44 ファイル・重い 24）

- [x] **T038** バッチ「ハンドラ基礎」: `handlers.room` / `handlers.snapshot` / `handlers.lifecycle` /
  `handlers.time-ping` / `handlers.v2` / `in-memory-room-store` / `code-gen`。
  _要件: FR-091〜FR-096, FR-123, US2_

- [x] **T039** バッチ「交代とドライバー」: `handlers.driver-advance` / `driver-assign` /
  `driver-absence` / `driver-absence.integration` / `proxy-auto-switch` / `manual-skip-eligible` /
  `shuffle` / `timer-restart` / `schedule`。
  _要件: FR-091〜FR-096, FR-123, US2_

- [x] **T040** バッチ「参加者と権限」: `authorize` / `permissions-before-start` / `permissions-after-start` /
  `participant-remove` / `self-role-change` / `host-transfer` / `handoff-host` / `started-monotonic`。
  _要件: FR-091〜FR-096, FR-123, US2_

- [x] **T041** バッチ「お題と AI」: `handlers.problem` / `problem-delegation` / `problem-delegation.ai` /
  `handlers.ai-unlock` / `ai-limits` / `claude-cli-problem-provider` / `config-ai`。
  _要件: FR-091〜FR-096, FR-123, US2_

- [x] **T042** バッチ「接続・運用・セキュリティ」: `resume` / `join-rate-limit` / `passphrase` /
  `secure-compare` / `room-reclaimer` / `admin` / `config` / `config.admin` /
  `ws-adapter.admin` / `ws-adapter.integration`。
  _要件: FR-091〜FR-096, FR-123, US2_

- [x] **T043** バッチ「通知と共有メモ」: `notice-signal` / `break-suggestion` / `handoff-concurrent`。
  _要件: FR-091〜FR-096, FR-123, US2_

### G3-d `apps/web/test`（76 ファイル・重い 38）

> **すべてのバッチをファイル名で列挙する。** 当初 T044/T045 をディレクトリ指定、
> T046 以降をファイル名指定と混在させたため、**`connection-status` が二重に割り当てられ、
> しかも同名ファイルが 2 つあるため（`test/connection-status.test.ts` = 純粋関数 /
> `test/ui/connection-status.test.tsx` = `StatusStrip`）どちらを指すか判別できなくなった**。
> 網羅性を機械的に検査できるよう、以下はすべて `test/` からの相対パスで書く。

- [x] **T044 [P]** バッチ「直下と設定・記録」（9 ファイル）:
  `connection-status.test.ts` / `empty-hint.test.tsx` / `host-change.test.ts` /
  `platform/notify.test.ts` / `platform/sound.test.ts` /
  `prefs/local-prefs.test.ts` / `prefs/notify-hint.test.ts` / `prefs/notify-prefs.test.ts` /
  `records/persist.test.ts`。
  （`records/io.test.ts` は T009b で撤去済みのため対象外）
  **本体 2 行以下が多く SC-032 の対象外が大半。**
  _要件: FR-091〜FR-096, FR-123, SC-032, US2_

- [x] **T045 [P]** バッチ「sync クライアント」（5 ファイル）:
  `sync/client.connection.test.ts` / `sync/client.dispose.test.ts` / `sync/clock-offset.test.ts` /
  `sync/dispatch.test.ts` / `sync/notice-message.test.ts`。
  _要件: FR-091〜FR-096, FR-123, US2_

- [x] **T046** バッチ「Session」（10 ファイル）:
  `ui/Session.assertive.test.tsx` / `ui/Session.break.test.tsx` / `ui/Session.countdown.test.tsx` /
  `ui/Session.handoff.test.tsx` / `ui/Session.invite.test.tsx` / `ui/Session.permissions.test.tsx` /
  `ui/Session.problem.test.tsx` / `ui/Session.restart.test.tsx` / `ui/Session.roster.test.tsx` /
  `ui/Session.rotation.test.tsx`。
  **必要なら `renderSession()` をこのバッチで新設する**（先回りしない・FR-118）。
  _要件: FR-091〜FR-096, FR-118, FR-123, US2_

- [x] **T047** バッチ「Lobby と招待」（8 ファイル）:
  `ui/Lobby.empty.test.tsx` / `ui/Lobby.host-transfer.test.tsx` / `ui/Lobby.invite.test.tsx` /
  `ui/Lobby.problem-gate.test.tsx` / `ui/Lobby.role.test.tsx` / `ui/Lobby.rotation.test.tsx` /
  `ui/InvitePanel.test.tsx` / `ui/PassphrasePanel.test.tsx`。
  _要件: FR-091〜FR-096, FR-123, US2_

- [x] **T048** バッチ「参加者一覧」（8 ファイル）:
  `ui/RosterPanel.test.tsx` / `ui/SelfDriverToggle.test.tsx` / `ui/SelfDriverToggle.leave-room.test.tsx` /
  `ui/RotationLineup.test.tsx` / `ui/rotation-names.test.ts` / `ui/rotation-status.test.ts` /
  `ui/participant-label.test.ts` / `ui/presence.test.ts`。
  _要件: FR-091〜FR-096, FR-123, US2_

- [x] **T049** バッチ「お題」（6 ファイル）:
  `ui/ProblemEditor.test.tsx` / `ui/ProblemConfigPanel.test.tsx` / `ui/ProblemModeToggle.test.tsx` /
  `ui/problem-generation.test.ts` / `ui/AiUnlockPanel.test.tsx` / `ui/SessionConfigPanel.test.tsx`。
  _要件: FR-091〜FR-096, FR-123, US2_

- [x] **T050** バッチ「通知と音」（7 ファイル）:
  `ui/NotifyHint.test.tsx` / `ui/NotifySettings.test.tsx` / `ui/NotifySettingsPanel.test.tsx` /
  `ui/use-countdown-tick.test.ts` / `ui/use-notify-preferences.test.tsx` /
  `ui/use-switch-alert.test.ts` / `ui/use-switch-alert.test.tsx`。
  ⚠ `use-switch-alert` は **`.ts` と `.tsx` の 2 ファイルが同名で存在する**。両方が対象。
  _要件: FR-091〜FR-096, FR-123, US2_

- [x] **T051** バッチ「画面遷移と入口」（9 ファイル）:
  `ui/Setup.onboarding.test.tsx` / `ui/Join.test.tsx` / `ui/join-driver-intent.test.ts` /
  `ui/screen.test.ts` / `ui/History.test.tsx` / `ui/Summary.test.tsx` /
  `ui/EndSessionZone.test.tsx` / `ui/EndSessionZone.complete.test.tsx` / `ui/Tabs.test.tsx`。
  （`ui/transition.test.ts` は stage-transitions.ts 専用テストであり、
  T009b で撤去済みのため対象外）
  _要件: FR-091〜FR-096, FR-123, US2_

- [ ] **T052** バッチ「表示部品と横断」（9 ファイル）:
  `ui/StatusStrip.test.tsx` / **`ui/connection-status.test.tsx`** /
  `ui/Markdown.test.tsx` / `ui/SharedMemo.test.tsx` / `ui/format-time.test.ts` /
  `ui/permission-hints.test.ts` /
  `ui/dev-artifacts.test.ts` / `ui/announce.test.ts` / `ui/a11y.test.tsx`。
  （i18n-coverage・stage-theme.test.ts・theme.test.ts は G1（T009b・T012）で
  撤去済みのため対象外。ファイル名をバッククォートで囲むと
  網羅性の検査が割り当てと誤判定するため、ここでは囲まない）

  > ⚠ **dev-artifacts はメタテストであり、通常の手順が適用できない。**
  > `apps/web/src` を `readdirSync` で再帰的に読み、本番描画経路に開発専用表示が
  > 混入していないことを検査する。**前提・操作・検証という区切りが通常の意味で当てはまらない**ため、
  > **SC-032 の構造付与は行わない**。名前が振る舞いを述べているかだけを見る。
  _要件: FR-091〜FR-096, FR-123, US2_

  > ⚠ **connection-status という名前のテストは 2 つある。**
  > 本バッチが扱うのは **ui 配下の .tsx**（StatusStrip コンポーネントの表示を検証）。
  > **直下の .ts**（deriveConnectionStatus という純粋関数を検証）は T044 が扱う。**別物である。**
  > 本レビューの過程で、この 2 つを取り違えて変異検査の結論を誤ったことがある。
  > （注: この注記でファイル名をバッククォートで囲むと、網羅性の検査が
  > 二重割り当てと誤判定する。検査は列挙の書式に依存するため、説明文では囲まない）

### G3-e 完了確認

- [ ] **T053** `scripts/mutation-check.mjs` を実行し、**T007 のベースラインと検出結果の表が
  一致することを確認する**。一致しない場合:
  検出されなくなった変異があれば**検証内容を減らしている**ので差し戻す。
  新たに検出されるようになった変異があれば**検証内容を増やしている**ので FR-099 違反として分離する。
  _要件: FR-098, FR-099_

- [ ] **T054** `scripts/audit-structure.mjs` を実行し、**SC-029 / SC-030 / SC-031 / SC-032 が
  目標を満たすことを確認する**。SC-036（テスト件数が T015 の基準値を下回らない）も確認する。
  全パッケージで `pnpm test && typecheck && lint && build` 全緑。
  **`git diff --stat -- 'tdd-mob-pro-timer/*/src/*'` が空であることを確認する**。
  _要件: SC-029〜SC-032, SC-036, FR-114_

---

## G4 — 構造（挙動不変・移動と列挙が中心）

- [ ] **T055** `packages/core/src/index.ts` の `export *` 11 本を、**現在公開されている記号の明示列挙**に
  置換する。型定義出力から公開記号を機械的に抽出し、**本タスクでは削減はしない**。
  **公開の必要性の見直しは T057 が行う**（機械的な変更と判断を要する変更を分ける・FR-117）。
  `pnpm typecheck` が通ることで同値性を確認する。
  _要件: FR-110, US5_

- [ ] **T056** `packages/core/src/problem-bank.ts` を新規作成し、`FALLBACK_PROBLEMS`（33 件）と
  `ALL_LANGS` を `problem.ts` から**移動**する（`problem.ts:27-1229` 相当）。
  `problem.ts` は `validateProblem` / `pickFallback` / `buildProblemPrompt` と型のみ（約 70 行）にする。
  **`index.ts` の公開記号は変えない**（`problem.ts` から再エクスポート）。
  _要件: FR-109, US5_

- [ ] **T057** **自ファイル内でのみ使う公開記号の `export` を外す**（FR-119 の③・SC-039）。
  `audit-structure.mjs` の SC-039 ③で候補を出す（**現状 17 件**:
  `aggregate.ts` の `ConnId` / `ParticipantId` / `RoomCode`、`decide.ts` の `DecideCommand`、
  `errors.ts` の `Unauthorized`、`participants.ts` の `countManagers`、
  `permissions.ts` の `PermissionVerdict`、`problem.ts` の `FallbackProblemEntry` /
  `FALLBACK_PROBLEMS`、`schemas.ts` の `SessionConfigSchema` / `SessionActionValues` /
  `Command` / `ParticipantSchema` / `ServerClockSchema` / `SessionStateSchema` /
  `RoomSchema` / `ServerMsgSchema`）。

  **走査の結果をそのまま適用しない。1 件ずつ確認してから外す。**
  走査は名前の一致で判定するため、動的な参照や同名の別記号を取りこぼす可能性がある。
  `pnpm typecheck` が通ることを 1 件ずつの根拠とする。

  ⚠ **テストからの参照は残す理由にならない**（FR-090）。ただし
  **テストがその記号を直接使っている場合、`export` を外すとテストが壊れる。**
  該当する 5 件（`countManagers` / `FALLBACK_PROBLEMS` / `SessionConfigSchema` /
  `RoomSchema` / `ServerMsgSchema`）は、**テスト側を公開 API 経由の検証に寄せるか、
  その記号は対象外とするかを個別に判断する**。

  > **T056（`export *` の明示列挙）と分ける理由（FR-117）。**
  > T056 は「現在公開されているものを機械的に列挙する」変更、本タスクは
  > 「公開の必要性を 1 件ずつ判断する」変更である。
  > **機械的な変更と判断を要する変更は別の変更単位に分ける。**
  _要件: FR-119, FR-110, FR-117, SC-039, US5_

- [ ] **T058 [P]** `docs/adr/0009-test-conventions.md` を新規作成する。
  `plan.md` の「テストの書き方の規約」を ADR として記録し、**移行済みファイルの一覧**を持たせる
  （G3 の各バッチで更新済みのはず。ここで最終状態に整える）。
  _要件: FR-122, US2_

- [ ] **T059 [P]** `docs/adr/0010-design-doc-source.md` を新規作成し、**設計文書の正本**を記録する。
  `docs/plans/` と `docs/superpowers/` の 2 系統が併存し計 64 の md がある現状に対し、
  どちらが正本かの規則を定める。
  _要件: FR-112, US5_

- [ ] **T060** `pnpm test && typecheck && lint && build` 全緑。
  **実機確認（RC-003）**: `vite` を再起動し、お題の生成・表示が変わっていないことを目視する
  （T056 でお題データを移動しているため）。確認した画面と操作をコミットに列挙する。
  _要件: FR-114, RC-003_

---

## G5 — 規則の一元化（挙動不変）

- [ ] **T061** `packages/core/test/display-name.test.ts` に `conflictsWithExisting()` の
  **失敗するテスト**を書く。判定内容は**現在の `handlers.ts` と同一**にする
  （`trim().toLowerCase()` 比較・自分自身を除外）。
  **`nameSkeleton` を使う「より正しい判定」にしてはならない**（それは振る舞いの変更）。
  _要件: FR-104, FR-114, US4_

- [ ] **T062** `packages/core/src/display-name.ts` に
  `conflictsWithExisting(participants, desiredName, excludeId?)` を実装し T061 を緑にする。
  _要件: FR-104, US4_

- [ ] **T063** `apps/sync/src/application/handlers.ts` の 2 箇所
  （`participant.addProxy` の重複検査 `573-586` 相当、`participant.rename` の重複検査 `590-618` 相当）を
  `conflictsWithExisting()` の呼び出しに置換する。
  _要件: FR-104, FR-107, US4_

- [ ] **T064** `packages/core/src/error-messages.ts` を新規作成し、
  **現在クライアントが表示している文言**（`App.tsx:38-58` の `ERROR_MESSAGES`）をそのまま移す。
  **文言は 1 文字も変えない。**
  _要件: FR-105, FR-114, US4_

- [ ] **T065** `apps/web/src/App.tsx` の `ERROR_MESSAGES` を T064 の表の参照に置き換える。
  _要件: FR-105, US4_

- [ ] **T066** `apps/sync/src` の `message:` リテラル（ユニーク 23 種・出現 36 箇所 ＋ テンプレート 5）を
  T064 の表からの引き当てに置換する。**wire の `message` フィールドは維持する**（FR-089）。
  ⚠ **同一コードで文言が複数あるものが 5 種ある**が、その区別は現在も画面に出ていないため
  **表の 1 文言に寄せる**。具体性の回復は [#29](https://github.com/tomohiroJin/tasuki-tools/issues/29) が扱う。
  _要件: FR-089, FR-105, FR-114, US4_

- [ ] **T067** `apps/web/test/ui/participant-label.test.ts` に、
  **Lobby と RosterPanel が共通で使う「操作の可否判定」**の失敗するテストを書く。
  _要件: FR-107, US4_

- [ ] **T068** `apps/web/src/ui/participant-label.ts`（または隣接の純粋関数モジュール）に
  可否判定を実装し、`Lobby.tsx` と `RosterPanel.tsx` の**両方**がこれを経由するようにする。
  **描画（JSX）は両者に残す。統合しない**（FR-118）。
  _要件: FR-107, FR-118, US4_

- [ ] **T069** `apps/web/test/ui/` に `useLatestRef` の失敗するテストを書く。
  _要件: FR-120, US4_

- [ ] **T070** `apps/web/src/ui/use-latest-ref.ts` に `useLatestRef(value)` を実装し、
  `App.tsx` の **state と ref の二重管理 5 組**の同期処理をこれに集約する。
  **reducer への作り替えは行わない。**
  **純粋なガード用 ref（`problemRequestedRef` など state を持たないもの）は触らない。**
  _要件: FR-120, FR-118, US4_

- [ ] **T071** `pnpm test && typecheck && lint && build` 全緑。
  `mutation-check.mjs` を再実行し検出結果が変わらないことを確認する。
  T001 で **SC-035** が目標を満たすことを確認する。
  **RC-002 をレビューで確認する**（同じ入力に同じ結論を出すコードが 2 箇所以上ないか）。
  **実機確認（RC-003）**: 改名の重複エラー・代理追加の重複エラー・各種操作エラーのバナー文言が
  変わっていないことを目視する。
  _要件: SC-035, RC-002, RC-003, FR-114_

---

## G6 — 契約（挙動不変）

- [ ] **T072** `packages/core/src/errors.ts` に `ErrorCode` 列挙（文字列リテラルの union）を追加する。
  **値は現在使われている文字列と完全に同一**にする（wire にも挙動にも影響させない）。
  _要件: FR-101, FR-114, US3_

- [ ] **T073** `apps/sync/src/application/handlers.ts` の `err("...")` と
  `broadcaster.sendTo(connId, { type: "error", code: "..." })` を `ErrorCode` 型で受けるようにする。
  **型を付けるだけで、値も分岐も変えない。**
  _要件: FR-101, US3_

- [ ] **T074** ハンドラの戻り値型を見直す。**`server.ts:127` が戻り値を破棄しているため、
  この型はテストだけが参照する契約である。** `room.create` / `room.join` のみ `CreateResult` を返し、
  他は副作用の完了を表す型に変える。ダミー値の充填（`hostToken: ""` 等 10 箇所）を無くす。
  **テストは戻り値ではなく `SpyBroadcaster` の観測に寄せる**（本番と同じ観測点にする）。
  ⚠ **このタスクは G3 で新規約に移行済みのテストを再び書き換える。**
  書き換えたテストは**新規約（ADR 0009）に従って書くこと**。
  G3 が達成した SC-029〜SC-032 を崩さないよう、本グループの完了時に再走査する。
  _要件: FR-100, US3_

- [ ] **T075** `packages/core/test/` に **B-2 の特性テスト**を書く。
  現在の交代の振る舞い（`session.act SWITCH` が `advanceDriver` の結果になること）を固定する。
  **この時点では実装を変えない。**
  _要件: FR-102, FR-114, US3_

- [ ] **T076** `packages/core/test/` に **`fast-check`（v4・既存の devDependency）による
  プロパティテスト**を書き、`decide` に ineligible 集合を渡した場合の
  `evolve(DriverSwitched)` と `advanceDriver` が**すべての入力で同じ集約を生むか**を検証する。
  生成する入力は rotation の長さ・`currentIndex`・ineligible 集合の全組み合わせとする。
  _要件: FR-102, US3_

- [ ] **T077** **T076 の結果で分岐する。**
  - **同値が示せた場合**: `decide` に ineligible を渡す形にし、
    `handlers.ts:679-688` 相当の置き換え分岐を撤去する
  - **示せなかった場合**: **実装を変えず、結果を新規 Issue に記録して撤退する**。
    T075 / T076 は成果として残す（捨てない）
  _要件: FR-102, FR-115, US3_

- [ ] **T078** `applyRoomLevelEvent` と `evolve` の**適用順序の契約を型または明示的な契約として表現する**
  （現在はコメントによる注意喚起のみ）。**統合はしない**（Issue #26 の担当）。
  _要件: FR-103, US3_

- [ ] **T079** `pnpm test && typecheck && lint && build` 全緑。
  `mutation-check.mjs` を再実行し検出結果が変わらないことを確認する。
  **RC-001 をレビューで確認する**（呼び出し側が使わないダミー値が残っていないか）。
  **`audit-structure.mjs` を実行し、SC-029〜SC-032 が G3 完了時から悪化していないことを確認する**
  （本グループがテストを書き換えるため）。
  **実機確認（RC-003）**: 交代・手動スキップ・指名・一時離脱の各操作が変わっていないことを目視する。
  _要件: RC-001, RC-003, FR-114_

---

## G7 — 唯一の挙動変更（到達不能分岐の撤去）

- [ ] **T080** `apps/sync/src/application/handlers.ts:97` の `!room.onBreak`（到達不能な条件）を撤去する。
  **`break.start` / `break.end` の wire スキーマは残す**（FR-089・後方互換）。
  **`Room.onBreak` フィールドも残す**（snapshot の形を変えない）。
  **このタスクは単独のコミットにする**（FR-115）。
  _要件: FR-119, FR-115, FR-089, US1_

- [ ] **T081** `pnpm test && typecheck && lint && build` 全緑。
  **実機確認（RC-003）**: セッションの開始・交代・一時停止・再開・完成が変わっていないことを目視する。
  **この段階は挙動を変えうるため、確認した画面と操作をコミットに必ず列挙する。**
  _要件: FR-115, RC-003_

---

## 完了条件

> **FR-106（共通前処理の単一経路化）と FR-108（責務の分割）は本仕様のタスクに含まれない。**
> どちらも `handlers.ts` の構造そのものを変える要件であり、**Issue #26 が担う**（spec のスコープ外）。
> 本仕様の完了は、これら 2 件を除いた要件で判定する。

- [ ] **T082** `scripts/audit-structure.mjs` を実行し、**SC-027〜SC-036 がすべて目標を満たす**ことを確認する
  （SC-033 / SC-034 / SC-037 は欠番。SC-039 は G1 の分岐・データと G4 の公開記号の双方を含む。
  RC-001〜RC-003 は各グループのレビューで確認済み）。
  _要件: SC-027, SC-028, SC-029, SC-030, SC-031, SC-032, SC-035, SC-036, SC-039_

- [ ] **T083** `scripts/mutation-check.mjs --full` を実行し、**ベースライン（T007）と検出結果が一致する**ことを
  確認する。一致しない場合は FR-098 / FR-099 に従って原因を切り分ける。
  _要件: FR-098, FR-099_

- [ ] **T084** `docs/adr/0009-test-conventions.md` の移行済み一覧が **145 ファイル全件**になっていることを
  確認する。**停止した場合は、その時点の一覧を残して完了とする**。
  _要件: FR-116, FR-121, FR-122_

- [ ] **T085** **各グループが単独でマージ可能な状態で提出されたことを確認する**（G0〜G7 の各コミットが
  単独で `pnpm test && typecheck && lint && build` を通ること）。
  実績時間を `baseline.md` に記録し、`spec.md` / `plan.md` の見積もり（95〜168 h）との乖離を残す。
  **次回のリファクタリングの見積もりの根拠になる。**
  _要件: FR-113, SC-038_
