# Tasks: 依存の最新化と供給網対策（#69）

**Input**: [`docs/superpowers/specs/2026-08-10-dependency-supply-chain-design.md`](../specs/2026-08-10-dependency-supply-chain-design.md)（スペック）/ [`docs/superpowers/plans/2026-08-10-dependency-supply-chain.md`](./2026-08-10-dependency-supply-chain.md)（実装計画）

**Prerequisites**: 実装計画（必須）・スペックの受け入れ条件（EARS）・[`.specify/memory/constitution.md`](../../../.specify/memory/constitution.md) v2.0.0

**Tests**: **ユニットテストの新規作成は無し。**この Issue は設定・依存の版・文書のみを変更し、プロダクションコードを書かないため（憲法 原則 I は「該当なし」）。代わりに **DoD 項目 3「新しく足した検査は、わざと壊して赤くなることを確認した」に対応する破壊検証タスク**を各ストーリーに置く（T020・T021・T049・T050）。既存の `pnpm test`（全 1,970 件）は各 PR で回帰確認として回す。

**Organization**: タスクはユーザーストーリー単位に束ねる。各ストーリー = PR 1 本 = 独立してマージ・検証できる増分。

**数値の扱い**: 実測値（脆弱性・陳腐化の一覧・違反件数・公開日時）の**正本はスペック 1 本**。本ファイルは転記せず参照する（憲法 原則 VIII。初版は 3 文書へ転記した結果、メジャー更新の件数が食い違った）。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 並行実行可（別ファイル・未完了タスクへの依存なし）
- **[Story]**: US1〜US5。Setup / Foundational / Polish フェーズには付けない
- 説明には必ずファイルパスを含める

## Path Conventions

- 作業場所は **`/home/vscode/tasuki-work`（overlay）**。`/workspaces` 側では作業しない
- 設定: `pnpm-workspace.yaml`・`.github/workflows/ci.yml`・`renovate.json`（リポジトリルート）
- 文書: `docs/adr/`（決定）・`docs/guides/`（手順）・`docs/superpowers/`（設計）・`docs/retrospectives/`（振り返り）
- 一時ファイル: scratchpad（コミットしない）

## 実行順の原則

**PR は直列。**前の PR がマージされてから次のブランチを `main` から切る。`gh pr merge` に `--delete-branch` を付けない（憲法 原則 IX / 積み上げ PR の運用）。

> **US4（P3）を US5（P2）より先に実行する。**優先度の順序と食い違うが理由がある。
> ① Renovate を先に有効化すると、US4 で手当てする予定の更新を bot が即座に PR として立て、
> レビュー対象が二重になる ② US5 は GitHub App の有効化という**利用者の手動操作**を待つため、
> 外部ブロッカーを持つタスクを最後に置く。

> **US1（仕組み）を US2（脆弱性の解消）より先に置く。**根拠はスペックの決定 D11。
> high の `nanoid` は `postcss` 経由のビルド時依存で**利用者へ配布されない**。配布される
> `dompurify` は moderate である。したがって「high が出ているので何より先に潰す」状況ではない。

---

## Phase 1: Setup（共通の準備）

**Purpose**: 作業環境を整え、**スペックが前提にしている実測値を測り直す**。実測は 2026-08-11 時点のものであり、着手までに脆弱性・陳腐化・公開日時はすべて変わりうる。

- [ ] T001 `/home/vscode/tasuki-work` で `git checkout main && git pull` し、overlay を `origin/main` の最新へ合わせる
- [ ] T002 [P] `pnpm audit` と `pnpm outdated -r`（**`-r` 必須**。ルートのみでは実行時依存を取りこぼす）を実行し、結果を scratchpad の `measurements.md` へ保存する
- [ ] T003 [P] `pnpm view dompurify time --json`・`pnpm view nanoid time --json`・`pnpm view postcss-selector-parser time --json` で公開日時を取得し、scratchpad の `measurements.md` へ追記する
- [ ] T004 [P] リンク検査スクリプトを scratchpad の `check-links.mjs` として用意する（実装計画「共通手順」の内容。**リポジトリにはコミットしない**）
- [ ] T005 T002・T003 の実測がスペックとずれていた場合、`docs/superpowers/specs/2026-08-10-dependency-supply-chain-design.md` の「実測で確認した前提」節（数値の正本）を更新する。**実装計画とタスクの数値は直さない**（転記していないため）

**Checkpoint**: スペックの数値が現在の事実と一致した状態になる

---

## Phase 2: Foundational（ブロッキング前提 / PR-0）

**Purpose**: 設計文書をリポジトリへ入れ、以降の ADR・ガイドがそれを参照できるようにする。#68 が PR #99 で同じ形を採った（スペックと実装計画を単独 PR でマージしてから実装に入る）。

**⚠️ CRITICAL**: このフェーズが終わるまで US1 以降に着手しない

- [ ] T006 `git checkout -b docs/69-pr0-spec-and-plan` でブランチを切る
- [ ] T007 `docs/superpowers/specs/2026-08-10-dependency-supply-chain-design.md`（スペック）を追加する
- [ ] T008 [P] `docs/superpowers/plans/2026-08-10-dependency-supply-chain.md`（実装計画）を追加する
- [ ] T009 [P] `docs/superpowers/plans/2026-08-10-dependency-supply-chain-tasks.md`（本ファイル）を追加する
- [ ] T010 scratchpad の `check-links.mjs` で上記 3 ファイルの相対リンクを検査し、`リンク OK` を確認する
- [ ] T011 `pnpm test` を実行し `docs/guides/development.md` が記載する全件が緑であることを確認する（文書のみの変更でも回す。実装計画 Global Constraints）
- [ ] T012 `gh pr create --title "docs: #69 依存と供給網対策のスペックと実装計画"` で PR を出す。本文に DoD 8 項目を転記し、1〜6 は「該当なし」（文書のみ）、7 は本 PR 自体、8 は #69 の完了条件の一部と明記する
- [ ] T013 `gh pr checks` で CI が緑であることを確認し、マージする（`--delete-branch` は付けない）

**Checkpoint**: 設計文書が `main` にあり、ADR・ガイドから参照できる

---

## Phase 3: User Story 1 - 公開直後の版を掴まない仕組み（Priority: P1）🎯 MVP

**Goal**: 公開から 7 日未満の版が `pnpm install` で取り込まれない状態を、人の注意力ではなく**設定として強制**する。あわせて緊急時の例外手順を定め、**それが効くことまで確かめる**。

**Independent Test**: 3 つが対で確認できて初めて合格。① その時点で公開 7 日未満の版を `pnpm add` すると `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` で終了コード 1 になる ② `pnpm-workspace.yaml` から `minimumReleaseAge` を消すと同じ操作が成功する ③ 待機期間を引き上げて作った封鎖が `minimumReleaseAgeExclude` で解ける。

対応 PR: PR-1（`chore/69-pr1-minimum-release-age`）

### 実装

- [ ] T014 [US1] `git checkout main && git pull && git checkout -b chore/69-pr1-minimum-release-age` でブランチを切る
- [ ] T015 [US1] **設定を入れる前に**、`rm -rf node_modules apps/*/node_modules packages/*/node_modules e2e/node_modules && pnpm install --frozen-lockfile` を実行し、違反 0 件で通ることを記録する（後から「元から赤かったのか」を切り分けるため）
- [ ] T016 [US1] `pnpm-workspace.yaml` の `allowBuilds` の下に `minimumReleaseAge: 10080`（分 = 7 日）と、判断の根拠を `docs/adr/0008` へ、手順を `docs/guides/development.md` へ委ねるコメントを追記する。**`.npmrc` には書かない**
- [ ] T017 [US1] `rm -rf node_modules apps/*/node_modules packages/*/node_modules e2e/node_modules && pnpm install --frozen-lockfile` を再実行し、違反件数を測る。0 件でなければ実装計画 Task 1 Step 4 の判断表（①そのまま →②待つ →③期限つき除外 →④lockfile 全面再解決は単独 PR）に従い、選んだ対処と理由を PR 本文へ書く。**「違反エントリだけ再解決する」手は存在しない**（`pnpm update` も検証で先に落ちる）
- [ ] T018 [US1] `pnpm install --frozen-lockfile 2>&1 | grep -i "ignored build\|build scripts"` を実行し、`pnpm-workspace.yaml` の `allowBuilds` 許可リスト（現行は `esbuild` の 1 件のみ）の棚卸し結果を記録する。**この PR では許可リストを変更しない**

### 破壊検証（憲法 原則 VII / DoD 3）

- [ ] T019 [US1] `pnpm view <パッケージ> time --json` で**その時点で公開 7 日未満の版を選ぶ**。**版を決め打ちしない**（決め打ちすると日付の経過で拒否されなくなり、検査が壊れても気づけない）
- [ ] T020 [US1] **待機期間が効くことを確かめる**: ① T019 で選んだ版を `pnpm add -w --save-dev <pkg>@<version>` で指定し拒否されることを確認 ② `pnpm-workspace.yaml` の `minimumReleaseAge` を一時削除して同じ操作が通ることを確認 ③ `git checkout pnpm-workspace.yaml package.json pnpm-lock.yaml` で完全に戻す。**①②の出力全文を PR 本文へ貼る**
- [ ] T021 [US1] **例外手順が効くことを確かめる**: ① `pnpm-workspace.yaml` の `minimumReleaseAge` を一時的に `43200`（30 日）へ引き上げ、`node_modules` を消して `pnpm install --frozen-lockfile` が封鎖されることを確認 ② 違反したパッケージを `minimumReleaseAgeExclude` へ追記して通ることを確認 ③ `git checkout pnpm-workspace.yaml` で戻す。**封鎖と解除の両方の出力を PR 本文へ貼る**（実案件を待たない演習にすることで、日付に依存せず何度でも再現できる）

### 文書

- [ ] T022 [P] [US1] `docs/adr/0008-dependency-supply-chain.md` を `docs/adr/template.md` の形式で新規作成する。背景 = Issue 本文の事実誤認 5 点と、待機期間の日数を導入コストの実測で決めたこと（**数表は転記せずスペックを参照**）。決定 = D1〜D4・D8・D11 を MUST / MUST NOT で明示。影響 = 導入時の対処・`allowBuilds` の棚卸し結果・将来 14/30 日へ引き上げる余地・#70 との境界
- [ ] T023 [P] [US1] `docs/guides/development.md` の「テスト」節の前に「依存の更新」節を新設する。内容は ① 通常の更新手順（**`pnpm outdated -r` を使う。ルートのみでは取りこぼす**）② `minimumReleaseAgeExclude` による例外手順（対象パッケージのみ・理由と解除予定日をコメント・解除を完了条件に含める）③ **`node_modules` が最新だと供給網検証が短絡する**こと ④ CI で `--trust-lockfile` を使わないこと ⑤ 違反時に取れる手は待つ・除外・全面再解決の 3 つだけであること
- [ ] T024 [US1] `docs/adr/README.md` の「一覧」表に 0008 の行を追加する（T022 の完了後）

### 検証

- [ ] T025 [US1] `rm -rf node_modules apps/*/node_modules packages/*/node_modules e2e/node_modules && pnpm install --frozen-lockfile` が違反 0 件で通ることを確認する
- [ ] T026 [US1] `pnpm test && pnpm typecheck && pnpm lint && pnpm build` が全緑であることを確認する
- [ ] T027 [US1] scratchpad の `check-links.mjs` で `docs/adr/0008-dependency-supply-chain.md`・`docs/adr/README.md`・`docs/guides/development.md` のリンクを検査する
- [ ] T028 [US1] `git diff --quiet pnpm-lock.yaml` で `pnpm-lock.yaml` が意図せず変わっていないことを確認する（`git status --porcelain` では他の変更ファイルが混じるため使わない）
- [ ] T029 [US1] **マージ可否のゲート**: T025 が違反 0 件であることを確認してからマージする。違反を残したままマージすると `main` の CI が赤くなり、**以降のすべての PR が赤いまま積み上がる**。T017 で対処③（期限つき除外）を選んだ場合は、解除を US2 の完了条件へ持ち越したことを PR 本文に明記する
- [ ] T030 [US1] `gh pr create --title "chore: 公開直後の版を掴まない待機期間を pnpm へ強制する（#69）"` で PR を出す。本文に T020・T021 の証拠と DoD を書き、1・2・4 は「該当なし」、**3 は T020・T021 の結果**、5 は `pnpm install` の実挙動、6 は該当なし、7 は ADR・ガイドの更新、8 は完了条件の一部達成と明記する
- [ ] T031 [US1] CI が緑であることを `gh pr checks` で確認しマージする

**Checkpoint**: 待機期間が強制され、例外手順が文書化され、**どちらも効くことが確認済み**。Issue #69 の完了条件のうち「公開直後の版が仕組みとして取り込まれない」「設定を消すと取り込まれる」の 2 つが充足

---

## Phase 4: User Story 2 - 既知の脆弱性を解消する（Priority: P1）

**Goal**: `pnpm audit` が報告する脆弱性を 0 件にする。

**Independent Test**: `pnpm audit` が 0 件を返し、`pnpm-workspace.yaml` に `minimumReleaseAgeExclude` が残っていないこと。timer の実画面でサニタイズ経路が従来どおり動くこと。

対応 PR: PR-2（`fix/69-pr2-audit-vulnerabilities`）

**Depends on**: US1（待機期間が入った状態で更新できることの確認を兼ねる）

### 実装

- [ ] T032 [US2] `git checkout main && git pull && git checkout -b fix/69-pr2-audit-vulnerabilities` でブランチを切る
- [ ] T033 [US2] `pnpm audit` を実行し、対象の脆弱性を測り直す（内訳と経路はスペックの「脆弱性 2 件の内訳」を参照。**着手時に増減しうる**）
- [ ] T034 [US2] `pnpm view dompurify time --json` と `pnpm view nanoid time --json` を**その場で実行**し、修正版が待機期間 7 日を超えているかを判定する。**T003 の結果を流用しない**（US2 到達までに日数が進み判定が変わる）。超えていなければ `pnpm-workspace.yaml` の `minimumReleaseAgeExclude` へ期限コメントつきで一時追加し、どちらだったかを PR 本文へ記録する
- [ ] T035 [US2] `pnpm --filter @tasuki/timer-web update dompurify` を実行し、`apps/timer-web/package.json`（宣言は `^3.4.8`）の範囲内で修正版へ上げる
- [ ] T036 [US2] `pnpm update -r nanoid` を実行し、`pnpm-lock.yaml` 上の推移依存を `postcss` が要求する範囲内で修正版へ上げる。**`overrides` は使わない**（範囲内で解消できるため。使う必要が生じた場合は理由を PR 本文へ書く）
- [ ] T037 [US2] `pnpm audit` が 0 件になることを確認する
- [ ] T038 [US2] T034 または US1 の T017 で `minimumReleaseAgeExclude` を使った場合、`pnpm-workspace.yaml` から**必ず削除する**。`grep -n "minimumReleaseAgeExclude" pnpm-workspace.yaml` が何も返さないことを確認する

### 検証

- [ ] T039 [US2] **実経路で確認する（DoD 5 / 憲法 原則 V）**: `grep -rn "dompurify\|DOMPurify" apps/timer-web/src` で利用箇所を特定し、`pnpm --filter @tasuki/timer-web dev` で起動して <http://localhost:5173/timer/> から**その機能が通る画面操作を実際に行う**。確認した操作と結果を PR 本文へ書く。**終わったら dev サーバーを必ず止める**（掴んだままにすると利用者の `pnpm dev` を全滅させる）
- [ ] T040 [US2] **先にコミットする**: `git add apps/timer-web/package.json pnpm-lock.yaml pnpm-workspace.yaml && git commit` で依存の更新をコミットする。**`scripts/mutation-check.mjs` は作業ツリーが汚れていると実行を拒否する**（`scripts/mutation-check.mjs:301-308`）ため、この順序でなければ次のタスクが実行できない
- [ ] T041 [US2] **変異検査（DoD 4 / 憲法 原則 VII）**: `git status --porcelain` が空であることを確認してから `node scripts/mutation-check.mjs` を実行する
- [ ] T042 [US2] `rm -rf node_modules apps/*/node_modules packages/*/node_modules e2e/node_modules && pnpm install --frozen-lockfile` で違反 0 件を確認する
- [ ] T043 [US2] `pnpm test && pnpm typecheck && pnpm lint && pnpm build` が全緑であることを確認する
- [ ] T044 [US2] `pnpm build && pnpm e2e` を実行する（timer の実経路に関わる依存が変わるため。`pnpm dev` と同時には実行できない点に注意）
- [ ] T045 [US2] `gh pr create --title "fix: 脆弱性 2 件（nanoid・dompurify）を解消する（#69）"` で PR を出し、CI 緑を確認してマージする

**Checkpoint**: `pnpm audit` が 0 件。完了条件「`pnpm audit` が 0 件を維持している」の初回充足

---

## Phase 5: User Story 3 - 脆弱性の再発を CI で検知する（Priority: P2）

**Goal**: high 以上の脆弱性が入ったら CI が落ち、**moderate 以下では落ちない**状態にする。

**Independent Test**: 既知の high を意図的に固定した一時ブランチで `audit` ジョブが赤くなり、moderate のみの一時ブランチでは**緑のまま**で、かつログに moderate の内容が残ること。**片方だけでは合格にしない**（閾値が緩すぎる／厳しすぎるの両方向で壊れうる）。

対応 PR: PR-3（`ci/69-pr3-audit-job`）

**Depends on**: US2（先に 0 件にしておかないと、導入と同時に CI が赤くなる）

### 実装

- [ ] T046 [US3] `git checkout main && git pull && git checkout -b ci/69-pr3-audit-job` でブランチを切る
- [ ] T047 [US3] **実装前に閾値の挙動を実測する**: `pnpm audit --audit-level high; echo $?` と `pnpm audit --audit-level moderate; echo $?` と `pnpm audit --json | head -40` を実行し、終了コードが深刻度でどう変わるかを scratchpad へ記録する。**決め打ちで書かない**
- [ ] T048 [US3] `.github/workflows/ci.yml` に `audit` ジョブを追加する。**既存の `ci` ジョブには足さない**（`e2e` と同じく独立ジョブにする。`ci` に足すと脆弱性の結果を見るのにテストの所要時間を待つことになる）。構成は checkout → setup-node 22 → `corepack enable` → `pnpm install --frozen-lockfile`（`--trust-lockfile` は付けない）→ `pnpm audit || true`（全件を出力に残す）→ high 以上でのみ落とすステップ。T047 の実測で `--audit-level high` が期待どおり終了コードへ効かなければ、`pnpm audit --json` の `metadata.vulnerabilities.high` と `.critical` を読む形へ差し替える

### 破壊検証（憲法 原則 VII / DoD 3）

- [ ] T049 [US3] **high で落ちることを確かめる**: 一時ブランチで `apps/timer-web/package.json` 等に既知の high 脆弱性を持つ版を明示固定して PR を出し、`.github/workflows/ci.yml` の `audit` ジョブが**実際に赤くなることを確認する**。元に戻して緑になることも確認し、一時ブランチを捨てる。**赤くなった CI の実行 URL を PR 本文へ貼る**
- [ ] T050 [US3] **moderate では落ちないことを確かめる**: 一時ブランチで moderate 以下のみを持つ状態を作り（例: `apps/timer-web/package.json` の `dompurify` を脆弱な版へ戻し、high の `nanoid` は上げたまま）、`audit` ジョブが**緑のまま**であること、かつログに moderate の内容が**出力として残っている**ことを確認する。**緑だった CI の実行 URL とログ断片を PR 本文へ貼る**

### 文書

- [ ] T051 [P] [US3] `docs/adr/0008-dependency-supply-chain.md` に決定 D9（`pnpm audit` を CI へ・high 以上で落とす・moderate 以下は報告に留める）と **#70 との境界**（「`pnpm audit` の CI 組み込みは #69 で完了。#70 側の該当項目は重複追加しない」）を追記する
- [ ] T052 [P] [US3] `docs/guides/development.md` の「検査系」節から `pnpm audit` の記述を整理し、CI で自動実行される旨へ更新する（手動実行の案内と二重管理にしない）
- [ ] T053 [US3] `gh issue comment 70` で #70 へ「`pnpm audit` の CI 組み込みは #69 で完了」「PR / Issue テンプレートは #68 PR-4 で完了済み」の 2 点を申し送る

### 検証

- [ ] T054 [US3] `pnpm test && pnpm typecheck && pnpm lint && pnpm build` が全緑であることを確認する
- [ ] T055 [US3] `gh pr checks` で `ci`・`e2e`・`audit` の 3 ジョブすべてが緑であることを確認する
- [ ] T056 [US3] `gh pr create --title "ci: 依存の脆弱性検査を CI へ組み込む（#69）"` で PR を出し、本文の DoD 3 に **T049（赤くなる）と T050（緑のまま）の両方**の CI 実行 URL を書き、マージする

**Checkpoint**: 脆弱性の再発が自動で検知され、閾値が両方向で正しいことが確認済み

---

## Phase 6: User Story 4 - 非メジャーの依存を最新化する（Priority: P3）

**Goal**: 非メジャーの陳腐化を解消し、**メジャー 12 件を別 Issue へ切り出す**。

**Independent Test**: `pnpm outdated -r` の出力に**メジャーだけが残る**こと。`ws`・`lucide-react` の実画面確認が通り、構造監査が退行していないこと。

対応 PR: PR-4（`chore/69-pr4-non-major-updates`）

**Depends on**: US1（待機期間が効いた状態で更新することが確認のポイント）・US2（`dompurify` は解消済み）

### 実装

- [ ] T057 [US4] `git checkout main && git pull && git checkout -b chore/69-pr4-non-major-updates` でブランチを切る
- [ ] T058 [US4] `pnpm outdated -r` を実行し、対象を測り直す（**`-r` 必須**。初版はルートのみを見て実行時依存 4 件を取りこぼした）。対象はスペックの「陳腐化した依存 20 件の内訳」の非メジャー分から、US2 で解消済みのものを除いた残り
- [ ] T059 [US4] ルートの開発ツールを更新する: `pnpm update -w typescript-eslint eslint turbo`（`package.json` と `pnpm-lock.yaml` が変わる）
- [ ] T060 [US4] `pnpm --filter @tasuki/timer-web update postcss lucide-react @testing-library/user-event` でアプリ側を更新する（`apps/timer-web/package.json`）
- [ ] T061 [US4] `pnpm --filter @tasuki/timer-sync update ws` で同期サーバー側を更新する（`apps/timer-sync/package.json`）
- [ ] T062 [US4] `pnpm outdated -r` を再実行し、**非メジャーが残っていない**ことを確認する。待機期間に弾かれた版があればこの PR に含めず（例外手順は使わない。緊急ではないため）、弾かれた版と解禁日を PR 本文へ記録する
- [ ] T063 [US4] `gh issue create` でメジャー更新 **12 件**の Issue を新規作成する。**一覧はスペックの「メジャー 12 件」の表を参照し、Issue 本文へ転記する**（Issue は #69 の外なので転記してよい）。本文には **1 メジャー = 1 PR**（`typescript` 7 は必ず単独）・#69 コメントの据え置き理由を背景として引く（**2026-06 時点の記録で古いので着手時に再実測**）・epic #67 の「振る舞いを変えない」制約の継承、を書く
- [ ] T064 [US4] T063 で作成した Issue を epic #67 に紐づける（`gh issue edit` またはエピック本文の段階表へ追記）

### 検証

- [ ] T065 [US4] **先にコミットする**: `git add -A && git commit` で依存の更新をコミットする（T040 と同じ理由。`mutation-check.mjs` は汚れた作業ツリーを拒否する）
- [ ] T066 [US4] **変異検査（DoD 4）**: `git status --porcelain` が空であることを確認してから `node scripts/mutation-check.mjs` を実行する（lint / ビルドツールの更新は既存テストの通り方を変えうる）
- [ ] T067 [US4] **実行時依存の実画面確認（DoD 5）**: `pnpm --filter @tasuki/timer-sync dev` と `pnpm --filter @tasuki/timer-web dev` を起動し、**ルームを作成して同期が通ること**（`ws`）と**アイコンが従来どおり表示されること**（`lucide-react`）を <http://localhost:5173/timer/> で確認する。結果を PR 本文へ書き、**終わったら dev サーバーを必ず止める**
- [ ] T068 [US4] `rm -rf node_modules apps/*/node_modules packages/*/node_modules e2e/node_modules && pnpm install --frozen-lockfile` で違反 0 件を確認する
- [ ] T069 [US4] `pnpm test && pnpm typecheck && pnpm lint && pnpm build` が全緑であることを確認する
- [ ] T070 [US4] `node scripts/audit-structure.mjs && node --test scripts/audit-structure.test.mjs` を実行し、構造監査の指標が退行していないことを確認する
- [ ] T071 [US4] `pnpm build && pnpm e2e` を実行する（`ws` は同期サーバーの実プロトコルに関わるため）
- [ ] T072 [US4] `gh pr create --title "chore: 非メジャーの依存を更新する（#69）"` で PR を出す。本文に T063 で切り出した Issue 番号を書き、マージする

**Checkpoint**: 非メジャーの陳腐化が解消され、メジャー更新の受け皿ができた

---

## Phase 7: User Story 5 - 更新の提案が自動で上がる（Priority: P2）

**Goal**: Renovate が依存の更新を提案する状態にする。**minor/patch は PR を自動作成、major は Dependency Dashboard に提示**（PR 作成は人の承認を待つ）。

**Independent Test**: Renovate が実際に minor/patch の PR を立て、その CI が緑であり、**7 日未満の版が提案されていない**こと。major が Dashboard に提示され、PR は自動で立っていないこと。

対応 PR: PR-5（`chore/69-pr5-renovate`）

**Depends on**: US1（Renovate 側の待機期間を pnpm 側の 7 日以上に揃える必要がある）・US4（先に手当てした更新を bot が重複提案するのを避ける）

**⚠️ 外部ブロッカー**: GitHub App の有効化は**リポジトリ管理者の手動操作**。実行者が勝手に外部サービスへ接続しない

### 実装

- [ ] T073 [US5] `git checkout main && git pull && git checkout -b chore/69-pr5-renovate` でブランチを切る
- [ ] T074 [US5] `renovate.json` をリポジトリルートに新規作成する。要点は ① `minimumReleaseAge` を **pnpm 側（7 日）以上**にする（下回らせると bot の PR が pnpm の検証で常に赤くなる）② `automerge: false` ③ **minor/patch はグループ化して PR を自動作成、major は `dependencyDashboardApproval: true`**（スペックの EARS のイベント駆動 2 文にそのまま対応させる）
- [ ] T075 [US5] `renovate.json` を**着手時点の Renovate 現行スキーマで検証する**（`renovate-config-validator` が使えれば通す）。実装計画に載せた JSON は出発点であり、キー名・既定値は変わりうる。**設定を変えるならスペックの EARS も同時に直す**
- [ ] T076 [US5] `docs/guides/development.md` の「依存の更新」節に、Renovate が立てた PR の扱い（人が判断する・自動マージしない）と、**GitHub App の有効化が別途必要**である事実を追記する
- [ ] T077 [US5] `docs/adr/0008-dependency-supply-chain.md` に決定 D5〜D7（Renovate を選んだ理由 = グルーピングの表現力 / Dependabot を却下した理由 / **bot 側 ≧ pnpm 側**という待機期間の関係 / 自動マージしない理由）を追記する
- [ ] T078 [US5] `pnpm test && pnpm typecheck && pnpm lint && pnpm build` が全緑であることを確認し、`gh pr create --title "chore: Renovate による依存の自動更新を導入する（#69）"` で PR を出してマージする

### 有効化と動作確認（マージ後）

- [ ] T079 [US5] **利用者へ GitHub App の有効化を依頼する**。`renovate.json` のコミットだけでは Renovate は動かない
- [ ] T080 [US5] 有効化後、Renovate が **Dependency Dashboard の Issue を立てる**ことを確認する
- [ ] T081 [US5] Renovate が **minor/patch の PR を実際に立てた**ことを確認する（初回スキャンには時間がかかる）
- [ ] T082 [US5] その PR の **CI が緑**であることを確認する（＝ Renovate と pnpm の待機期間が矛盾していない証拠）
- [ ] T083 [US5] 提案された版がいずれも**公開から 7 日以上**経っていることを確認する。確認できない場合は Renovate 側の待機期間設定が効いていないので、`renovate.json` を直してから閉じる
- [ ] T084 [US5] **major が Dashboard に提示され、PR は自動で立っていない**ことを確認する（受け入れ条件のイベント駆動 2 文目）
- [ ] T085 [US5] T080〜T084 の確認結果を `gh issue comment 69` で #69 へ記録する（**PR のマージ後にしか確認できないため、Issue のクローズ前に残す**）

**Checkpoint**: 更新の提案が自動で上がる。完了条件「更新の提案が自動で上がってくる」を充足

---

## Phase 8: Polish & Cross-Cutting Concerns（#69 の締め）

**Purpose**: 完了条件を証拠つきで突き合わせ、記録と申し送りを残す。

- [ ] T086 スペックの「受け入れ条件（EARS）」を上から 1 つずつ確認し、証拠（コマンド出力・CI の URL・画面）を `gh issue comment 69` で #69 へ記録する。対応表は実装計画 Task 6 Step 1 のとおり
- [ ] T087 `pnpm turbo test typecheck lint build` を実行し、**全タスク緑**を確認して #69 へ記録する（Issue #69 の完了条件④）
- [ ] T088 **Issue #69 本文の事実誤認 5 点**（脆弱性 0 件 / 陳腐化 3 件 / `.npmrc` / `onlyBuiltDependencies` / `docs/BACKLOG.md`）の訂正を `gh issue comment 69` でコメントする。**本文は書き換えない**（記録を消さない）
- [ ] T089 **同じコメントにスペックの「受け入れ条件（EARS）」を転記する。**憲法 原則 VIII「要求は Issue（EARS 記法）に記録する（MUST）」に従い、要求の正本を Issue 側へ届ける
- [ ] T090 `docs/retrospectives/2026-XX-XX-issue-69-supply-chain.md` を [`docs/guides/retrospective.md`](../../guides/retrospective.md) の型で作成する。実装計画 Task 6 Step 3 が挙げる 6 点（Issue 本文の誤り / `node_modules` の短絡 / 導入コストで日数を決めた / **自分の文書 3 本の転記で件数が食い違った** / **`pnpm outdated` をルートだけで見て実行時依存 4 件を落とした** / **日付で腐る記述を書いた**）を含める
- [ ] T091 [P] `gh issue comment 71` で #71 へ申し送る: `.specify/feature.json` が実在しない `specs/001-planning-poker-mvp` を指しており、`setup-plan.sh` / `setup-tasks.sh` / `check-prerequisites.sh` がいずれも失敗するか空の `specs/` を作ってしまう（実体は `docs/poker/specs/001-planning-poker-mvp/`）
- [ ] T092 [P] `gh issue create` で `trustPolicy: no-downgrade`（pnpm 11 のもう 1 つの供給網対策）の採否を検討する Issue を起票する。**適用コスト（何件が落ちるか）の実測から始める**旨を本文に書く
- [ ] T093 T090 の振り返りを含む PR を出してマージし、`gh issue close 69` で #69 をクローズする。**本番デプロイは行わない**（#66 で別途まとめて実施。揮発インメモリのため稼働中のルームが全消滅する）

---

## Dependencies

```text
Phase 1: Setup（T001–T005）
        ↓
Phase 2: Foundational / PR-0（T006–T013）  ← ここまで完了しないと US1 に着手しない
        ↓
Phase 3: US1 待機期間の強制 / PR-1（T014–T031）  🎯 MVP
        ↓
Phase 4: US2 脆弱性の解消 / PR-2（T032–T045）
        ↓
Phase 5: US3 CI での検知 / PR-3（T046–T056）      ← US2 で 0 件にしてからでないと導入と同時に赤くなる
        ↓
Phase 6: US4 非メジャー更新 / PR-4（T057–T072）
        ↓
Phase 7: US5 Renovate / PR-5（T073–T085）         ← US4 の後（重複提案の回避）・GitHub App の有効化待ち
        ↓
Phase 8: Polish / 締め（T086–T093）
```

**ストーリー間はすべて直列。**理由は 2 つ。① リポジトリの運用規約が「1 PR = 1 論理変更・前の PR がマージされてから次のブランチを切る」（憲法 原則 IX）② US2→US3 は技術的にも順序が強制される（`pnpm audit` を 0 件にしてからでないと audit ゲートが導入と同時に落ちる）。

**並行できるのはストーリー内のみ**で、[P] を付けた 11 タスク（T002・T003・T004 / T008・T009 / T022・T023 / T051・T052 / T091・T092）に限られる。いずれも別ファイルへの書き込みで、未完了タスクへの依存が無い。

> **並行機会が少ないことは意図的**です。この Issue は設定 1 行の変更が CI 全体を落としうる性質を持ち、直列に積んで各段で実測するほうが、並行して原因の切り分けを失うより安い。

## Parallel Execution Examples

**Phase 1（Setup）**: T002・T003・T004 は同時に走らせてよい。いずれも scratchpad への書き込みで、リポジトリのファイルに触れない。

**Phase 3（US1）**: T022（ADR 0008 の新規作成）と T023（`docs/guides/development.md` への追記）は別ファイルなので同時に書ける。ただし T024（`docs/adr/README.md` の一覧追加）は T022 の完了後。

**Phase 5（US3）**: T051（ADR への追記）と T052（ガイドの整理）は別ファイルなので同時に書ける。

**Phase 8（締め）**: T091（#71 への申し送り）と T092（`trustPolicy` の起票）は独立した GitHub 操作なので同時でよい。

## Implementation Strategy

### MVP スコープ

**US1（Phase 3 / PR-1）が MVP。**Issue #69 の主眼は「今すぐ上げる作業」ではなく仕組み作りであり、US1 だけで完了条件のうち 2 つ（「公開直後の版が仕組みとして取り込まれない」「設定を消すと取り込まれる」）が充足する。US1 をマージした時点で、以降の作業が止まっても**供給網対策としての価値は出ている**。

### 増分デリバリ

| 増分 | 完了時点で得られるもの |
|---|---|
| Phase 2（PR-0） | 設計の記録が `main` にある。以降の判断の拠りどころができる |
| **Phase 3（PR-1）🎯** | **公開直後の版を掴まない。例外手順も、効くことまで確認済み** |
| Phase 4（PR-2） | 既知の脆弱性 0 件 |
| Phase 5（PR-3） | 再発が自動で検知される（両方向の閾値を確認済み） |
| Phase 6（PR-4） | 非メジャーの陳腐化が解消。メジャー更新の受け皿ができる |
| Phase 7（PR-5） | 更新の提案が自動で上がる |

### 中断したときの安全な止めどころ

**Phase 4（PR-2）の直後**が最も安全な中断点。仕組みが入り、既知の脆弱性も 0 件で、外部サービスへの依存がまだ無い。

**避けるべき中断点は Phase 5 の途中**（`audit` ジョブを足したが T049・T050 の破壊検証をしていない状態）。検査が入っているように見えて実は効いていない、という**このリポジトリが 4 回踏んでいる失敗の形**になる。

### 実測をやり直す前提

スペックの数字は **2026-08-11 の実測**に基づく。着手が数日ずれるだけで、脆弱性の件数・修正版の公開からの経過日数・待機期間の違反件数はすべて変わる。**Phase 1 の T002・T003 で必ず測り直し、ずれていれば T005 でスペックを更新してから進む。**実装計画と本ファイルは数値を転記していないので、直すのはスペック 1 本だけでよい。
