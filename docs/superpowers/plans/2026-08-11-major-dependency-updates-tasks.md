# Tasks: メジャー依存の更新（#113）

**Input**: [`docs/superpowers/specs/2026-08-11-major-dependency-updates-design.md`](../specs/2026-08-11-major-dependency-updates-design.md)（スペック）/ [`docs/superpowers/plans/2026-08-11-major-dependency-updates.md`](./2026-08-11-major-dependency-updates.md)（実装計画）

**Prerequisites**: 実装計画（必須）・スペックの受け入れ条件（EARS）・[`docs/constitution.md`](../../constitution.md) v2.0.0・[`docs/guides/definition-of-done.md`](../../guides/definition-of-done.md)

**Tests**: **ユニットテストの新規作成は無し。** 本件はプロダクションコードを書かず、依存の版と設定のみを変更する（憲法 原則 I は各 PR で「該当なし」と明記する）。既存の `pnpm test` が回帰検出を担う。ただし**新しく持ち込む確認手段が 2 つある**ため、それぞれに破壊検証タスクを置く（憲法 原則 VII）。

1. **テスト実行件数の突合**（FR-006）→ T015 で「わざと 1 件減らして気づけるか」を確認
2. **Tailwind の設定移行が実際に効いているか**（PR-5）→ T046 で「設定を外すと画面が崩れるか」を確認

**Organization**: タスクは **PR 単位**に束ねる。各 PR = 独立してマージ・revert できる増分。スペックのユーザーストーリー（US1〜US4）は PR を横断する性質のため、`_要件:_` で個別にトレースする。

**数値の扱い**: 対象パッケージの一覧と現在版→最新版の**正本は Issue #113**。判断に使った測定値の置き場は**実装計画の「実測ログ」1 本**。本ファイルには転記しない（憲法 原則 VIII。#69 で 3 文書へ転記して件数が食い違った）。

## Format: `[ID] [P?] Description`

- **[P]**: 並行実行可（別ファイル・未完了タスクへの依存なし）
- 説明には必ずファイルパスまたは実行コマンドを含める

## Path Conventions

- 作業場所は **`/home/vscode/tasuki-work`（overlay）**。`/workspaces` 側では検査を回さない
- **成果物のパスは作業開始時に利用者へ伝える**（利用者が見ているのは `/workspaces` 側で、別クローン・別ブランチ）
- 依存の宣言: ルート `package.json`・`packages/*/package.json`・`apps/*/package.json`・`e2e/package.json`
- 設定: `pnpm-workspace.yaml`・`.github/workflows/ci.yml`・各 `vite.config.ts` / `vitest.config.ts` / `postcss.config.js` / `tailwind.config.js`
- 一時ファイル: scratchpad（コミットしない）

## 実行順の原則

**PR は直列。** 前の PR がマージされてから次のブランチを `main` から切る。`gh pr merge` に `--delete-branch` を付けない（憲法 原則 IX）。

> **順序の強い制約は 2 本だけ**（実装計画のアーキテクチャ節）。
> ① **PR-3（vitest）→ PR-4（vite）は必須。** vitest 3 が vite を直接依存で `^5〜^7` に固定しており、
>    逆順にすると vite が 2 つ入り「ビルドは 8・テストは 7」に割れる。
> ② **PR-1 → PR-2（typescript）が望ましい。** `@types/node` の型エラーは、既知の安定状態である
>    TS 5.9 の上で切り分けたい。
> PR-5（tailwind）と PR-6（nanoid）は他と独立で、順序は入れ替え可能。

> **束ねた PR が赤くなったら、原因の 1 件だけを外して別 PR にし、残りは通す**（FR-003）。
> 束ねたことで全体を止めない。

---

## Phase 1: Setup（着手時の再実測）

**Purpose**: 実装計画の「実測ログ」は 2026-08-11 時点のもの。**着手日には最新版・公開日・peer 宣言のすべてが変わりうる**ため、判断の前提を測り直す。

- [X] T001 `/home/vscode/tasuki-work` で `git checkout main && git pull --ff-only` し、overlay を `origin/main` の最新へ合わせる。`corepack pnpm install --frozen-lockfile` が通ることを確認する _要件: —（手続き）_
- [X] T002 `corepack pnpm outdated -r` を実行し、メジャー残件を Issue #113 の表と突き合わせる。差異があれば **Issue #113 の本文を更新**する（本文が正本） _要件: FR-011_
- [X] T003 [P] 対象それぞれについて `corepack pnpm view <pkg> peerDependencies` を実行し、実装計画が挙げる 3 組の束縛（vite↔plugin-react / vitest↔coverage-v8 / stylelint↔config-recommended）が現在も成立するかを確認する。組が増減していたら PR の束ね方を修正する _要件: FR-002_
- [X] T004 [P] 対象それぞれについて `corepack pnpm view <pkg> time` で採用予定版の公開日を取得し、`minimumReleaseAge`（7 日）を満たすことを確認する。満たさないものがあれば、その PR での採用可否を判断する（例外の追加は最後の手段） _要件: FR-013_
- [X] T005 [P] 対象それぞれについて、依存する道具の対応範囲内で最大の版を確定する。`pnpm outdated` の「latest」を無条件に採用しない（TypeScript が該当。実装計画の判断を再確認する） _要件: FR-004_
- [X] T006 **基準の記録**: `corepack pnpm test` を実行し、パッケージごとのテスト実行件数と総数を scratchpad に記録する。以降の各 PR はこの値と突き合わせる _要件: FR-006_
- [X] T007 Issue #113 本文の「1 メジャー = 1 PR」を、実測に基づく更新単位の定義（peer 束縛の 3 組は同一 PR）へ訂正するコメントを投稿する _要件: FR-002_

---

## Phase 2: PR-1 — 検査の外周（束・5 件）

**Branch**: `chore/113-pr1-outer-checks` ・ **Purpose**: 開発時にのみ使われ、失敗の現れ方が互いに区別できる 5 件をまとめて更新する。実画面・実プロトコルの確認は該当なし。

- [X] T008 `main` から `chore/113-pr1-outer-checks` を切る _要件: —（手続き）_
- [X] T009 [P] `package.json`（ルート）と `e2e/package.json` の `@types/node` を T005 で確定した版へ更新する _要件: FR-001, FR-002_
- [X] T010 [P] `packages/ui/package.json` の `stylelint` と `stylelint-config-recommended` を**同一コミットで**更新する（config の peer が stylelint の版を束縛するため分離できない） _要件: FR-002_
- [X] T011 [P] `apps/timer-web/package.json` と `apps/landing/package.json` の `@testing-library/jest-dom` を更新する。`apps/timer-web/test/setup.ts` は素の入口（`@testing-library/jest-dom`）、`apps/landing/tests/setup.ts` は `/vitest` 入口を使っており、**両方の入口が新版にも存在すること**を `pnpm view <pkg> exports` で確認してから更新する _要件: FR-001_
- [X] T012 `apps/timer-web/package.json` と `apps/landing/package.json` の `jsdom` を更新する _要件: FR-001_
- [X] T013 ルート `package.json` の `engines.node` を、T012 で入れた `jsdom` の `engines` が要求する下限へ引き上げる _要件: FR-012_
- [X] T014 `.github/workflows/ci.yml` の `node-version` 指定が T013 の新しい下限を満たすか確認する。満たさない場合のみ指定を修正する（満たす場合は変更しない） _要件: FR-012_
- [X] T015 **破壊検証**: 任意のテストファイル 1 本の 1 ケースを一時的に `.skip` して `corepack pnpm test` を実行し、**T006 の基準と件数が食い違うことを確認**してから元に戻す。件数突合が実際に機能する確認手段であることを示す _要件: FR-006（憲法 原則 VII）_
- [X] T016 `git diff package.json */package.json */*/package.json` を確認し、**更新対象以外の直接依存が巻き込まれていないこと**を確かめる（`pnpm update -r` が同名の直接依存まで書き換える罠。#69 で 2 度発生） _要件: FR-001_
- [ ] T017 `pnpm-workspace.yaml` の `minimumReleaseAgeExclude` から、解除予定日を過ぎた `postcss-selector-parser` の期限つき例外を削除する。削除後に `rm -rf node_modules && corepack pnpm install --frozen-lockfile` が通ることを確認する（**作業日が解除予定日より前なら、このタスクを最後の PR へ移す**） _要件: FR-013_ **→ 実施日 2026-08-11 は解除予定日 2026-08-14 より前のため、この条件に従い PR-6 へ移動。PR-6 の時点でも同日だったため実行できず、#113 唯一の残件として持ち越す。** 実測（例外を外して `pnpm install --frozen-lockfile --force`）: `[ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION] postcss-selector-parser@7.1.5 was published at 2026-08-07T09:32:20.792Z, within the minimumReleaseAge cutoff (2026-08-04T10:39:10.748Z)`。**2026-08-14T09:32:20Z 以降に削除して `--frozen-lockfile` が通ることを確認すること。** **宛先を失わないよう #126 として独立させた。この行は #126 で閉じる。**
- [X] T018 `corepack pnpm typecheck` / `lint` / `test` / `build` の 4 つを実行し、すべて緑であることを確認する _要件: FR-005_
- [X] T019 T006 の基準とテスト実行件数を突き合わせ、減っていないことを確認する _要件: FR-006_
- [X] T020 PR を作成する。DoD の 8 項目を記入し、項目 1・2・3・4・5・6 は「該当なし」とその理由を明記する（新規実装なし・利用者の経路が変わらない・検査を足していない・既存実装を書き換えていない）。CI の `ci` / `audit` / `e2e` の 3 ジョブが緑であることを確認してからマージする _要件: FR-005, FR-014_ **→ #120（CI 3 ジョブ緑・マージ済み）**

---

## Phase 3: PR-2 — TypeScript

**Branch**: `chore/113-pr2-typescript` ・ **Purpose**: 依存する道具の対応範囲内で最大の版へ上げ、範囲外の版を取らない判断を実測とともに記録する。

- [X] T021 PR-1 のマージ後、`main` を pull して `chore/113-pr2-typescript` を切る _要件: —（手続き）_
- [X] T022 `typescript` を宣言している 6 箇所（ルート `package.json`・`e2e/`・`apps/landing/`・`apps/poker-sync/`・`apps/poker-web/`・`packages/poker-core/`）を T005 で確定した版へ更新する。**宣言を持たないパッケージ（`apps/timer-sync`・`apps/timer-web`・`packages/timer-core`・`packages/protocol`・`packages/ui`）には宣言を足さない**（現状の構成を変えない） _要件: FR-001_
- [X] T023 `corepack pnpm peers check` を実行し、**未充足の peer が 1 件も無いこと**を確認する _要件: FR-005_
- [X] T024 `corepack pnpm typecheck` / `lint` / `test` / `build` の 4 つを実行し、すべて緑であることを確認する。**lint のタスク数が全数成功していること**を目視で確かめる（typescript-eslint は非対応版で起動を拒否するため、タスク数の欠けが唯一の兆候になる） _要件: FR-005_
- [X] T025 T006 の基準とテスト実行件数を突き合わせる _要件: FR-006_
- [X] T026 **不採用の根拠を実測する**: 使い捨てブランチで `corepack pnpm update -r typescript@<最新版>` を実行し、`peers check` / `typecheck` / `lint` の結果を記録してからブランチを破棄する。**peer 宣言の読みではなく、実行結果を根拠にする** _要件: FR-009_
- [X] T027 T026 の結果（どの検査が、どう失敗したか）と、取り込めるようになる観測可能な条件を Issue #113 へコメントする。**将来の方針は書かない**（#113 完了時に改めて判断する） _要件: FR-009, FR-010_
- [X] T028 PR を作成する。DoD を記入し、該当しない項目とその理由を明記する。CI の 3 ジョブが緑であることを確認してからマージする _要件: FR-005_ **→ #121（CI 3 ジョブ緑・マージ済み）**

---

## Phase 4: PR-3 — vitest ＋ @vitest/coverage-v8

**Branch**: `chore/113-pr3-vitest` ・ **Purpose**: テストランナーを更新する。**PR-4 より前に完了していること**（vite が 2 つ入るのを防ぐ）。

- [X] T029 PR-2 のマージ後、`main` を pull して `chore/113-pr3-vitest` を切る _要件: —（手続き）_
- [X] T030 `vitest` を宣言している 8 パッケージと `packages/timer-core/package.json` の `@vitest/coverage-v8` を、**同一コミットで**同じ版へ更新する（coverage-v8 の peer が vitest の版と完全一致を要求するため） _要件: FR-002_
- [X] T031 [P] 各 `vitest.config.ts`（`apps/{timer-web,landing,poker-web,poker-sync}/`・`packages/{timer-core,poker-core,protocol}/`・`e2e/`）を新版で読み込ませ、**廃止・移動した設定キーの警告が出ていないか**実行ログを確認する。警告があれば新しい記法へ書き換え、変更の理由をコメントで残す _要件: FR-014_
- [X] T032 `packages/timer-core/vitest.config.ts` の `coverage.thresholds`（`lines` / `branches`）が新版でも維持されることを確認する。**下回った場合にしきい値を下げて通さない**。原因（計測対象の変化か、実際の欠落か）を特定してから対処する _要件: FR-005_ **→ 計測対象の変化だった**（coverage-v8 3 では `experimentalAstAwareRemapping` が既定オフの実験オプションだったのが、4 では両オプションごと消えて AST 対応の再マッピングが唯一の挙動になった）。しきい値は 90 のまま据え置き、実在の未検査分岐（`member.move` の範囲拒否）をテストで埋めて満たした。
- [X] T033 `corepack pnpm typecheck` / `lint` / `test` / `build` の 4 つを実行し、すべて緑であることを確認する _要件: FR-005_
- [X] T034 T006 の基準とテスト実行件数を突き合わせる。**ランナーの更新は「テストが黙って収集されなくなる」事故が起きやすい**ため、パッケージ単位で照合する _要件: FR-006_
- [X] T035 `git diff` で更新対象以外の直接依存が巻き込まれていないことを確認する _要件: FR-001_
- [X] T036 PR を作成する。DoD を記入し、CI の 3 ジョブが緑であることを確認してからマージする _要件: FR-005_ **→ #122（CI 3 ジョブ緑・マージ済み）**

---

## Phase 5: PR-4 — vite ＋ @vitejs/plugin-react

**Branch**: `chore/113-pr4-vite` ・ **Purpose**: バンドラを更新する。**利用者の通る経路（配信されるアセット）が変わりうるため実画面確認あり。**

- [X] T037 PR-3 のマージ後、`main` を pull して `chore/113-pr4-vite` を切る _要件: —（手続き）_
- [X] T038 `apps/{timer-web,poker-web,landing}/package.json` の `vite` と `@vitejs/plugin-react` を、**同一コミットで**更新する（plugin-react の peer が vite のメジャーを束縛するため） _要件: FR-002_
- [X] T039 [P] 各 `vite.config.ts` の設定が新版で有効か確認する。特に `apps/timer-web/vite.config.ts` の `base: "/timer/"`、`resolve.alias`（`@tasuki/timer-core/*` の 9 本）、`server.proxy` の `/timer/ws` → `ws://127.0.0.1:8787` rewrite。廃止された記法があれば書き換え、理由をコメントで残す _要件: FR-014_
- [X] T040 `corepack pnpm build` を実行し、`apps/timer-web/dist/index.html` と `apps/poker-web/dist/index.html` の**アセット参照が `/timer/` `/poker/` の接頭辞を保っていること**を確認する（`base` が効かなくなると本番でだけ 404 になり、ユニットテストでは検出できない） _要件: FR-007_
- [X] T041 `ss -tlnp | grep -E ':(8787|3311|517[3-5])'` で古い dev サーバーが居座っていないことを確認してから `corepack pnpm dev` を起動する _要件: FR-007_
- [X] T042 **実画面確認**: <http://localhost:5175/> を開き、玄関 LP → `/timer/` → `/poker/` の順に遷移して、表示崩れ・アセットの欠落・コンソールエラーが無いことを確認する。timer ではルームを作成し WebSocket が繋がることまで見る _要件: FR-007, US2_
- [X] T043 dev サーバーを停止し、`ss -tlnp` で 5 ポートすべてが解放されたことを確認する _要件: —（手続き）_
- [X] T044 `corepack pnpm typecheck` / `lint` / `test` / `build` の 4 つと、T006 との件数突合を実行する _要件: FR-005, FR-006_
- [X] T045 PR を作成する。DoD の項目 2（E2E）・項目 5（実経路）に **CI の `e2e` ジョブの結果と T042 の確認内容**を記す。CI の 3 ジョブが緑であることを確認してからマージする _要件: FR-007_ **→ #123（CI 3 ジョブ緑・マージ済み）**

---

## Phase 6: PR-5 — Tailwind CSS

**Branch**: `chore/113-pr5-tailwind` ・ **Purpose**: CSS 基盤を更新する。**#78 で確立したトークンに触れるため、移行方式の実測から始める。**

- [X] T046 PR-4 のマージ後、`main` を pull して `chore/113-pr5-tailwind` を切る _要件: —（手続き）_
- [X] T047 **移行方式の実測（未解決の論点 2 の解決）**: 使い捨ての作業で、新版の Tailwind が既存の `apps/timer-web/tailwind.config.js` を `@config` ディレクティブ経由で読めるかを確認する。**読めない場合は最小移行が成立しない**ため、CSS-first への移行範囲を見積もり直し、規模が PR 1 本を超えるなら別 Issue へ切り出す _要件: FR-014_ **→ `@config` は 4.3.3 で機能した。**生成 CSS に config 由来の 11 規則が更新前と同じ形で出ることを確認。最小移行が成立したので、CSS-first への移行範囲の見積もり直しは不要。
- [X] T048 `apps/timer-web/package.json` の `tailwindcss` を更新し、PostCSS プラグインのパッケージ（`@tailwindcss/postcss`）を追加する。追加の根拠（本体からのプラグイン分離であり技術選定の変更ではない）を `apps/timer-web/postcss.config.js` にコメントで残す _要件: FR-014_
- [X] T049 `apps/timer-web/postcss.config.js` のプラグイン指定を新しいパッケージへ差し替える。**`autoprefixer` は残置する**（削除は仕様の非目標。要否の判断は #71 へ申し送る） _要件: FR-014_ **→ 残置してビルドが通ることを確認。あわせて外して測ったところ、「Tailwind 4 が自前で prefix を付けるので不要」は成り立たなかった**（外すと CSS が増え `-moz-column-gap` が消える）。この事実を #71 への申し送りとして `postcss.config.js` と ADR-0001 の追記に記録した。
- [X] T050 T047 の結果に従い、`apps/timer-web/src/index.css` に既存設定を読み込む指定を追加する _要件: FR-014_
- [X] T051 `corepack pnpm build` を実行し、ビルドが通ること・`autoprefixer` を残したまま警告が出ないことを確認する _要件: FR-005_
- [X] T052 `corepack pnpm --filter @tasuki/ui test` と `--filter @tasuki/ui lint` を実行し、**トークン層の契約テスト（`packages/ui/tests/tokens.test.mjs`）が緑**であることを確認する _要件: FR-005_
- [X] T053 dev サーバーを起動し、**実画面確認**: `/timer/` で在室状況の 3 色（`presence-online` / `idle` / `offline`）・角丸・影・書体（`--font-sans` / `--font-mono`）が更新前と同じに見えることを確認する _要件: FR-007, US2_
- [X] T054 **破壊検証**: T050 で追加した設定の読み込み指定を一時的に外してビルドし、**画面のトークン由来の見た目が実際に崩れること**を確認してから戻す。移行が「効いているつもり」で空振りしていないことを示す _要件: FR-014（憲法 原則 VII）_
- [X] T055 dev サーバーを停止し、`ss -tlnp` でポートの解放を確認する _要件: —（手続き）_
- [X] T056 `corepack pnpm typecheck` / `lint` / `test` / `build` の 4 つと、T006 との件数突合を実行する _要件: FR-005, FR-006_
- [X] T057 未解決の論点 1（プラグインパッケージの追加が ADR を要するか）の判断を確定する。ADR が必要と判断した場合は [`docs/adr/0001`](../../adr/0001-design-system-scope.md) へ追記する。不要と判断した場合はその根拠を PR 本文に記す _要件: FR-014_
- [X] T058 PR を作成する。DoD の項目 2・5・7 に T053 の実画面確認と文書への反映を記す。CI の 3 ジョブが緑であることを確認してからマージする _要件: FR-007_

---

## Phase 7: PR-6 — nanoid

**Branch**: `chore/113-pr6-nanoid` ・ **Purpose**: 唯一の実行時依存を更新する。**実プロトコル確認あり。**

- [X] T059 PR-5 のマージ後、`main` を pull して `chore/113-pr6-nanoid` を切る _要件: —（手続き）_
- [X] T060 `apps/timer-sync/package.json` の `nanoid` を更新する。**ワークスペース内に同名の推移依存があるため、更新後に `git diff` で他パッケージの宣言が巻き込まれていないことを必ず確認する**（#69 で 2 度発生した罠の再来しやすい箇所） _要件: FR-001_
- [X] T061 `apps/timer-sync/src/adapters/nanoid-code-gen.ts` の `import { nanoid, customAlphabet } from "nanoid"` が新版の公開インターフェースで有効か確認する。変わっていれば追随し、変更の理由をコメントで残す _要件: FR-014_
- [X] T062 `corepack pnpm --filter @tasuki/timer-sync test`（`bun test`）を実行し、ルームコード生成の既存テストが緑であることを確認する _要件: FR-005_
- [X] T063 **実プロトコル確認**: dev サーバーを起動し、`/timer/` でルームを作成して**ルームコードが 6 文字で発行されること**・別タブから同じコードで参加できることを確認する。参加者 ID（`p_`）と再開トークン（`rt_`）の生成経路も同じアダプタを通るため、再読み込みでの復帰まで見る _要件: FR-008, US2_
- [X] T064 dev サーバーを停止し、`ss -tlnp` でポートの解放を確認する _要件: —（手続き）_
- [X] T065 `corepack pnpm typecheck` / `lint` / `test` / `build` の 4 つと、T006 との件数突合を実行する _要件: FR-005, FR-006_
- [X] T066 PR を作成する。DoD の項目 5 に T063 の実プロトコル確認を記す。CI の 3 ジョブが緑であることを確認してからマージする _要件: FR-008_

---

## Phase 8: 締め

- [X] T067 Issue #113 へ、対象すべてについて**取り込み済みか不採用かの一覧**をコメントする。不採用のものには実測した失敗の内容と再開条件を添える _要件: FR-015, SC-001, SC-007_
- [X] T068 `corepack pnpm outdated -r` を最終実行し、残ったメジャーがすべて T067 の一覧で説明されていることを確認する _要件: SC-001_
- [X] T069 `pnpm-workspace.yaml` に**解除予定日を過ぎた待機期間の例外が残っていないこと**を確認する _要件: FR-013, SC-006_ **→ 0 件（残る 1 件は解除予定日 2026-08-14 前で、過ぎていない）。ただし削除の宛先が無くなるため #126 を起票して引き継いだ。**
- [X] T070 **成功基準の最終確認**: 全 PR の完了後に次を確認する。① 6 本すべてが 4 検査を緑で
      通過してマージされている（SC-002）② テスト実行件数が T006 の基準を下回っていない（SC-003）
      ③ `corepack pnpm audit --audit-level high` が 0 件（SC-004）④ 全 PR の差分に、利用者から
      見える振る舞いの変更を目的とした変更が含まれていない（SC-005） _要件: SC-002, SC-003, SC-004, SC-005_
- [X] T071 `docs/retrospectives/` に振り返りを書く（[`docs/guides/retrospective.md`](../../guides/retrospective.md) に従う）。**踏んだ罠と、宣言の読みで判断して外した箇所**を必ず含める _要件: —（DoD 項目 7）_
- [X] T072 Issue #113 をクローズする _要件: —（手続き）_

---

## 依存関係と並列グループ

**クリティカルパス**（PR は直列）:

```
Setup(T001–T007) → PR-1(T008–T020) → PR-2(T021–T028) → PR-3(T029–T036)
                                                          ↓ 必須
                                     PR-4(T037–T045) → PR-5(T046–T058) → PR-6(T059–T066) → 締め(T067–T072)
```

**並列グループ**:

- Setup 内: T003・T004・T005 は別々の測定で相互依存なし
- PR-1 内: T009・T010・T011 は別ファイルを触る（T012 は T011 と同じ 2 ファイルを触るため直列）
- PR-3 内: T031 の各 `vitest.config.ts` はパッケージごとに独立
- PR-4 内: T039 の各 `vite.config.ts` はアプリごとに独立

**順序を入れ替えてよい箇所**: PR-5 と PR-6 は相互に独立。PR-4 の完了後であれば順序は問わない。

**外部要因で止まりうる箇所**: T017（期限つき例外の削除）は解除予定日以降でなければ実行できない。作業日が早い場合は最後の PR へ移す。

## この計画が守れているかの自己点検

- [ ] すべての `FR-###` が 1 つ以上のタスクに紐づいている
- [ ] どのタスクにも紐づかない要件が無い
- [ ] 版番号・件数をこのファイルに転記していない（正本は Issue #113 と実装計画の実測ログ）
- [ ] 新しく持ち込む確認手段（件数突合・設定移行）に破壊検証タスクがある（T015・T054）
- [ ] 実画面・実プロトコル確認が、それを要する PR にだけ置かれている（T042・T053・T063）
