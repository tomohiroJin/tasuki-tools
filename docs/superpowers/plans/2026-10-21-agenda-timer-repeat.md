# 進行タイマーの繰り返し（#429 第 2 段）— 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** シナリオに回数（1〜30）を持たせ、区切りの並び全体を回数ぶん続けて計れるようにする。朝会・LT 会のサンプルを足す。

**Architecture:** 繰り返しは `packages/agenda-core` の `expand` で平らに並べて終わりにする（ADR 0027 決定 5 の継ぎ目）。状態には定義の回数を残し、`reset` と画面の「ルームから下書きへの写し」は 1 回目の区切りと回数から定義を組み直す。次へ・延長・飛ばす・自動で次への遷移の中身と、同期サーバーの経路は変えない。画面は回数 2 以上のときだけ「n / N 回」・回の見出し・枠の中のスクロールを出す。

**Tech Stack:** TypeScript（strict・`exactOptionalPropertyTypes`）、valibot、neverthrow、React 19、vitest（core・web）、bun test（tasuki-sync）、Playwright（e2e）

**Spec:** [`docs/superpowers/specs/2026-10-21-agenda-timer-repeat-design.md`](../specs/2026-10-21-agenda-timer-repeat-design.md)（以下「設計」。V・K は設計 §10 の番号）。第 1 段の設計 [`2026-10-19-agenda-timer-design.md`](../specs/2026-10-19-agenda-timer-design.md)（以下「第 1 段」）も前提。実装者は設計と本計画の両方を読むこと。

- **日付**: 2026-10-21・**実測時点**: main `ae527d03`
- **型にした先例**: 第 1 段の計画 [`2026-10-20-agenda-timer.md`](./2026-10-20-agenda-timer.md)。迷ったら第 1 段の同じ場所の書き方に合わせる

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md)）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 全タスクが赤いテストから始まる。不変条件の性質テストの生成器に回数を足す（Task 1） |
| II. 技術選定は ADR を通す | 通過 | 新しい依存・文脈なし。決定は ADR 0027 の決定 10 として足す（Task 6・K8） |
| III. 揮発インメモリと単純運用 | 通過 | 回数はルームの揮発の状態と端末の localStorage にだけ持つ。サーバーの構成は変えない |
| IV. 境界の型安全 | 通過 | 回数はコマンドのスキーマ（strict）で整数 1〜30。受けるフレームは非 strict で省略を 1 とみなす（Task 1・2） |
| V. 実画面検証 | 通過 | 2 ブラウザで LT 会を回数 2 で走らせ、60 区切りを 375px／1920px で撮る（Task 7） |
| VI. 依存は内向き | 通過 | 依存の向きは変わらない |
| VII. 検査は壊して確かめる | 通過 | 変異 m452〜m459 を足し、1 本ずつ赤を見る（§変異の割り当て） |
| VIII. 記録が正本 | 通過 | ADR 0027 決定 10・設計の末尾に実装で外したことを戻す（Task 6） |
| IX. 小さく回す | 通過 | PR 1 本（K9）。配布は利用者の指示を待って 1 回、順は timer → agenda（K10） |
| X. 抽象は実需で | 通過 | 部分の繰り返し・回ごとの担当者を作らない（設計 §2.2）。進行表の枠は回数 2 以上でだけ |
| XI. 秘密と個人情報を持ち込まない | 通過 | 新しい利用者由来のテキストは無い。回数は数値 |

**逸脱なし。**

## Global Constraints

- 回数は**整数 1〜30**（`MIN_ROUNDS = 1`・`MAX_ROUNDS = 30`）。**省略は 1 とみなす**（コマンドもフレームも・K6）
- 展開後の区切りの数は **60 まで**（`MAX_PLANNED_STEPS = 60`）。定義の区切りは 20 まで（第 1 段のまま）
- 予定の合計 10800 秒（180 分）は**展開後（1 回あたり × 回数）で数える**
- 長さの刻みは 60 秒のまま（K2）
- 展開した区切りの ID は `s-1` から回をまたいで通し番号。ID に回を埋め込まない
- **回数 1 のシナリオは第 1 段と同じ画面・同じ振る舞い**（「回」の表示を出さない・進行表を枠に入れない）
- 画面は**回数が 1 のときコマンドに回数のキーを載せない**（K10）
- 画面の固定文言は書体の base 層に収める。**「目」「返」「繰」は base 層に無い**（「回目」「くり返す」「繰り返し」「番目」は使えない）。使える: 「回」「回数」「くりかえし」「ラウンド」「×」「あたり」「全部で」「＝」。文言は `apps/agenda-web/src/copy.ts` に置き、`tests/copy-fits-font-base.test.ts` が守る
- 新しい生の色を書かない。字の大きさは 5 段か理由つきの `scale-exempt`
- コミットの末尾は `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`（実装役）。閉鎖キーワード（Closes / Fixes / Resolves と番号の組）を書かない
- **サブエージェントは push・PR 作成・マージをしない**（統括が行う）

## Review Focus

設計が求めているのに、素のテストでは突かない入力のうち、使う人に効きそうなもの（効く順）。各行のテストは担当のタスクに足してある。

1. **回数 6 の朝会を走らせてから「最初から」を 2 回押した** → 区切りは 6 個のまま（36 個・216 個に増えない）（Task 1 `agenda.test.ts`〈m452〉）
2. **ルームに回数 6 の朝会があり、組む画面を開いて何も触らず「ルームに読み込む」を見る** → 下書きは 1 区切り × 6 回で、「ルームと同じ」と出る。読み込み直しても区切りが増えない（Task 3 `scenario-draft.test.ts`〈m455〉）
3. **1 回あたり 40 分 × 5 回を組んだ** → 送る前に画面が「全部で 200 分」の理由で止め、サーバーも拒む（Task 1 `schemas.test.ts`〈m453〉・Task 3）
4. **60 区切りの進行表で自動で次へが進む** → 枠の中だけが動き、ページは動かない（盤とボタンが画面の外へ出ない）（Task 5 `step-list.test.tsx`〈m459〉）
5. **第 1 段の画面を開いたまま新しいサーバーへ配った（回数を知らない画面が回数なしで送る）・新しい画面が回数 1 で古いサーバーへ送る** → どちらも通る（Task 1 `schemas.test.ts`・Task 3 `scenario-draft.test.ts`〈m457〉）

## 検証の実行時間の見積もり

**見込みである（手元の 9p 越し・CI は手元より遅い）。想定の 2 倍を超えたら統括へ報告する。**

| 何を | いつ | 1 回の見込み | 回数 | 小計 |
|---|---|---|---|---|
| `pnpm --filter @tasuki/agenda-core test` | Task 1 | 20 秒 | 8 | 3 分 |
| `pnpm --filter @tasuki/sync test -- test/live-ws.agenda.test.ts` | Task 2 | 30〜60 秒 | 3 | 3 分 |
| `pnpm --filter @tasuki/agenda-web test -- <ファイル>` | Task 3〜5 | 30 秒 | 25 | 13 分 |
| `pnpm --filter @tasuki/agenda-web test`（全件） | Task 3〜5 の終わり | 1 分 | 3 | 3 分 |
| 自分の変異を 1 本ずつ当てて赤を見る | 変異を足すタスク | 1〜2 分 | 8 | 12 分 |
| `pnpm typecheck` / `pnpm lint` | Task 6 | 3〜5 分 | 2 | 10 分 |
| `pnpm test`（turbo の全件）＋ scripts の自己テスト ＋ 全 audit | Task 6 | 10〜15 分 | 1〜2 | 25 分 |
| **変異の `--changed`（統括）** | PR の前 | 宣言を足すので全件に倒れる → CI に任せる（約 11 分） | 1 | CI 11 分 |
| **E2E の agenda（統括）** | Task 7 | 3〜5 分（`agenda.spec.ts` だけ）／全件 25〜40 分 | 2／1 | 50 分 |
| **実画面と撮影（統括）** | Task 7 | 1 時間 | 1 | 1 時間 |
| **合計の見込み** | | | | **約 3〜4 時間**（うち統括の直列 2 時間） |

見た目の直しの往復（撮影のあと）は見積もりに入れていない。1 往復を見込む。

## 取り決め

- **枝**: 実装は `feature/issue-429-agenda-repeat`（設計と計画のコミットがある `docs/429-agenda-repeat-design` から切る）。PR は 1 本（設計・計画・実装を含む）
- 各タスクは**テストファースト**: 赤いテストを書き、赤を見てから実装し、緑にする。**アサーションは回数 2 以上で値が分かれる局面に置く**（回数 1 では N² の罠も 1 回目への絞り込みも見えない）
- 変異の ID は **452〜459 だけ**。着手時に `ls scripts/mutations | sort | tail` と `scripts/lib/mutation-declarations.mjs` で 452 以降が空いていることを確かめる（別セッションの epic #360 と衝突しないため）。ファイルは `scripts/mutations/m452-<名前>.patch`、1 行目は `# 変異 452: <名前>`。宣言は既存の `{ id, label, patch, pkg, tests, note }` の形で足す
- 自分の変異を 1 本だけ当てて赤を見る手順は第 1 段の計画の「取り決め」のとおり（`git status --porcelain` が空 → `git apply` → 対象テストで赤 → `git apply -R` → 空に戻る）。`node scripts/mutation-check.mjs` は打たない
- **既存の変異が当たらなくなる恐れ**: 触るファイルに当たる既存パッチ（`grep -l '<パス>' scripts/mutations/*.patch`。少なくとも m430〜m437・m444〜m448・m450・m451 が agenda-core と agenda-web に当たる）を、触ったタスクの終わりに `git apply --check` で 1 本ずつ確かめる。当たらなければ文脈を直す（番号は変えない）
- **`pnpm install` は打たない**（依存は足さない）。E2E の実行・撮影・`pnpm dev` は統括

## ファイルの地図

| 層 | 変える | 作る |
|---|---|---|
| `packages/agenda-core` | `src/{limits,types,scenario,agenda,projection,schemas,index}.ts`・`tests/{limits,scenario,agenda,agenda-invariant,projection,schemas}.test.ts`・`tests/support/fixtures.ts`（あれば） | — |
| `apps/tasuki-sync` | `test/live-ws.agenda.test.ts`（製品コードは変えない見込み） | — |
| `apps/agenda-web` | `src/{scenario-draft,sample-scenarios,copy,agenda-view,dial-geometry}.ts`・`src/storage/saved-scenarios.ts`・`src/components/{ScenarioBuilder,SavedScenarioList,StepList,SummaryTable,Dial}.tsx`・`src/run.css`・`src/builder.css`・既存のテスト | `tests/scenario-draft.test.ts`・`tests/step-list.test.tsx` |
| E2E | `e2e/specs/agenda.spec.ts` | — |
| 検査 | `scripts/lib/mutation-declarations.mjs` | `scripts/mutations/m452〜m459-*.patch` |
| 文書 | `docs/adr/0027-agenda-timer.md`・`deploy/agenda/NOTES.md`・設計の末尾（§11 として足す） | — |

---

### Task 1: core — 回数・展開・上限・`reset`・フレームのスキーマ

**Files:**
- Modify: `packages/agenda-core/src/limits.ts`・`types.ts`・`scenario.ts`・`agenda.ts`（`INITIAL_AGENDA_STATE`・`replaceScenario`・`reset`・`toView`）・`projection.ts`（`SummaryRow`）・`schemas.ts`・`index.ts`
- Test: `packages/agenda-core/tests/{limits,scenario,agenda,agenda-invariant,projection,schemas}.test.ts`

**Interfaces:**
- Produces（後のタスクが使う。名前はこのとおりにする）:
  - `limits.ts`: `MIN_ROUNDS = 1`・`MAX_ROUNDS = 30`・`MAX_PLANNED_STEPS = 60`
  - `types.ts`: `ScenarioInput` に `readonly rounds?: number | undefined`（省略 = 1）。`PlannedStep` に `readonly round: number`（1 始まり）。`AgendaState` と `AgendaView` に `readonly rounds: number`
  - `scenario.ts`: `roundsOf(input: Pick<ScenarioInput, "rounds">): number`（省略を 1 に）・`scenarioTotalSec(input: ScenarioInput): number`（`totalPlannedSec(steps) × roundsOf`）・`plannedStepCount(input: ScenarioInput): number`（`steps.length × roundsOf`）・`definitionOf(v: { title: string; rounds: number; steps: readonly PlannedStep[] }): ScenarioInput`（`round === 1` の区切りの名前・長さ・振る舞いと回数から定義を組み直す。**回数 1 のときは `rounds` キーを持たない**）
  - `projection.ts`: `SummaryRow` に `readonly round: number`
  - `index.ts` から上の新しい名前をすべて出す

- [ ] **Step 1: 赤いテストを書く**（`describe` は日本語・Given/When/Then。既存の書き方に合わせる）
  - `scenario.test.ts`「回数 3 の LT 会を展開すると 6 区切りになり、回と通しの ID を持つ」: 入力 `{ title: 'LT', rounds: 3, steps: [{ name: '発表', durationSec: 300, onTimeout: 'advance' }, { name: '入れ替え', durationSec: 60, onTimeout: 'advance' }] }` → `expand` の `map(s => [s.id, s.name, s.round])` が `[['s-1','発表',1],['s-2','入れ替え',1],['s-3','発表',2],['s-4','入れ替え',2],['s-5','発表',3],['s-6','入れ替え',3]]`。`scenarioTotalSec` が `1080`、`plannedStepCount` が `6`
  - `scenario.test.ts`「回数を省略した入力は回数 1 と同じ展開になる」: `expand(x)` と `expand({ ...x, rounds: 1 })` が等しく、全区切りの `round` が 1
  - `scenario.test.ts`「`definitionOf` は 1 回目だけと回数を返し、回数 1 では回数のキーを持たない」: 上の LT の展開から組み直すと `steps` が 2 つ・`rounds` が 3。回数 1 のシナリオでは `'rounds' in result` が `false`
  - `agenda.test.ts`「回数 3 の進行を最初からに 2 回戻しても 6 区切りのまま」（**m452**）: `replaceScenario` → `start` → `next` → `reset` → `start` → `reset` のあと `steps.length === 6`・`rounds === 3`・ID が `s-1`〜`s-6`
  - `agenda.test.ts`「回をまたいで次へが続き、最後の回の最後で終了する」: 回数 2・区切り 2 つで `next` を 4 回 → 3 回目のあと `currentId === 's-4'`、4 回目のあと `phase === 'finished'`
  - `agenda.test.ts`「`toView` が回数を載せる」: 回数 3 で `toView(...).rounds === 3`
  - `projection.test.ts`「予定の合計は 1 回あたり × 回数」: 回数 3 の LT で `plannedTotalMs === 1_080_000`。`summaryOf(...).rows.map(r => r.round)` が `[1,1,2,2,3,3]`
  - `schemas.test.ts`（`ScenarioInputSchema`）: 受ける — 回数の省略・`1`・`30`・**展開後 60 区切り**（3 区切り × 20 回・各 1 分）・**展開後 180 分**（1 区切り 6 分 × 30 回）。拒む — `0`・`31`・`1.5`・`'2'`・**展開後 61 区切り**（区切り 61 個は定義の上限 20 で落ちるので、`MAX_ITEMS` 以下の区切りの組で 61 を超える組み合わせを使う。例: 4 区切り × 16 回 = 64・各 1 分）（**m454**）・**展開後 181 分以上**（1 区切り 7 分 × 26 回 = 182 分。1 回あたりは 7 分で通る）（**m453**）
  - `schemas.test.ts`（`AgendaCommandSchema`）: `agenda.scenario.set` は回数つきでも回数なしでも受け、知らないキー（例 `repeat: 2`）は拒む
  - `schemas.test.ts`（`AgendaFrameSchema`）: `rounds` も各区切りの `round` も無いフレーム（第 1 段の形）を受けて、出力の `rounds` と各 `round` が `1`。`rounds: 3` と `round: 2` はそのまま出る
  - `limits.test.ts`: `MIN_ROUNDS === 1`・`MAX_ROUNDS === 30`・`MAX_PLANNED_STEPS === 60`
  - `agenda-invariant.test.ts`: 既存の生成器に回数（1〜4）を足し、既存の 2 つの不変条件（所要の合計 ＝ 実時間の経過・差の合計 ＝ 押し巻き）がそのまま成り立つことを見る。生成した操作の列に `reset` を含めているなら、`reset` のあとの区切りの数が `steps.length × rounds` であることも見る

- [ ] **Step 2: 赤を見る**
  Run: `pnpm --filter @tasuki/agenda-core test`
  Expected: 新しいテストが型か値で FAIL（`round`・`rounds`・新しい関数が無い）

- [ ] **Step 3: 実装する**
  - `expand` は `roundsOf(input)` 回、`steps` を写して並べ、ID を通しで振る
  - `replaceScenario` は状態に `rounds: roundsOf(input)` を持たせる。`INITIAL_AGENDA_STATE.rounds` は `1`
  - **`reset` は `expand(definitionOf(s))` で展開し直す**（いまの `expand({ title, steps: s.steps })` が N² 倍の原因）
  - `toView` は `rounds` を載せる
  - `ScenarioInputSchema` に `rounds: v.optional(v.pipe(v.number(), v.integer(), v.minValue(MIN_ROUNDS), v.maxValue(MAX_ROUNDS)))` を足し、配列の `v.check` を**オブジェクト全体の `v.check`** に移して `scenarioTotalSec(input) <= MAX_TOTAL_SEC` と `plannedStepCount(input) <= MAX_PLANNED_STEPS` を見る（合計は回数が無いと数えられないため）。メッセージは英語の短い文（既存と同じ）
  - フレームの `stepViewSchema` に `round: v.optional(v.number(), 1)`、`AgendaViewSchema` に `rounds: v.optional(v.number(), 1)`
  - 次へ・一時停止・再開・延長・飛ばす・`advanceIfDue`・`deadlineOf` の中身は**変えない**。変えたくなったら止まって統括へ報告する

- [ ] **Step 4: 緑を見る**
  Run: `pnpm --filter @tasuki/agenda-core test`
  Expected: 全件 PASS

- [ ] **Step 5: 変異 m452・m453・m454 を足して 1 本ずつ赤を見る**（§変異の割り当て）。既存の m430〜m437 が `git apply --check` で当たることを確かめる

- [ ] **Step 6: コミット**
  `git commit -m "feat: 進行タイマーのシナリオに回数を持たせて展開する（#429 第 2 段）"`（本文に要点・末尾に Co-Authored-By）

### Task 2: 同期サーバー — 回数が wire を通ることを確かめる

**Files:**
- Test: `apps/tasuki-sync/test/live-ws.agenda.test.ts`

**Interfaces:**
- Consumes: Task 1 の `ScenarioInput.rounds`・`AgendaView.rounds`・`PlannedStep.round`

- [ ] **Step 1: テストを足す**（既存の live-ws の書き方に合わせる）
  - 「回数 2 のシナリオを置き換えると、全員のフレームに展開済みの 4 区切りと回数 2 が届く」: 区切り 2 つ・`rounds: 2` を送り、届いたフレームの `state.rounds === 2`・`state.steps.map(s => s.round)` が `[1,1,2,2]`
  - 「回数を持たないシナリオの置き換えを受ける（第 1 段の画面）」: `rounds` を載せずに送り、フレームの `state.rounds === 1`
  - 「回数 31 のシナリオは送り主にだけ失敗が返る」: 既存の失敗の検査と同じ形でコードを見る

- [ ] **Step 2: 走らせる**
  Run: `pnpm --filter @tasuki/sync test -- test/live-ws.agenda.test.ts`
  Expected: PASS（製品コードを変えずに通る見込み。**赤になったら原因をハンドラ・ストア・配信のどこか特定して統括へ報告し、直す範囲を確かめてから直す**）

- [ ] **Step 3: コミット**
  `git commit -m "test: 回数つきのシナリオが同期サーバーを通ることを確かめる（#429）"`

### Task 3: web — 下書き・写し・保存・サンプル

**Files:**
- Modify: `apps/agenda-web/src/scenario-draft.ts`・`src/storage/saved-scenarios.ts`・`src/sample-scenarios.ts`・`src/copy.ts`
- Create: `apps/agenda-web/tests/scenario-draft.test.ts`
- Test: `apps/agenda-web/tests/saved-scenarios.test.ts`

**Interfaces:**
- Consumes: Task 1 の `roundsOf`・`scenarioTotalSec`・`definitionOf`・`MIN_ROUNDS`・`MAX_ROUNDS`
- Produces:
  - `Draft` に `readonly rounds: string`（分の欄と同じく文字で持つ。新しい下書きは `'1'`）
  - `roundsOfDraft(d: Draft): number | null`（整数でなければ null）・`bumpRounds(d: Draft, delta: -1 | 1): string`（`MIN_ROUNDS`〜`MAX_ROUNDS` に収める）
  - `draftFromInput(input)` は `rounds: String(roundsOf(input))` を持たせる
  - `inputFromView(view)` は `definitionOf(view)` を返す（**展開済みの全部を写さない**）
  - `inputFromDraft(d)` は回数が 1（または読めない）なら `rounds` キーを持たない
  - `scenarioKey(input)` は `roundsOf(input)` を鍵に含める
  - `totalMinutes(d)` は**全部の分**（1 回あたり × 回数）。新しく `perRoundMinutes(d): number`
  - `previewView(d)` は回数を反映した展開で組む
  - 文言（`copy.ts`）: `ROUNDS_LABEL = 'くりかえし'`・`roundsUnit = '回'` 相当・`roundsRangeText()`（範囲外の理由）・`plannedStepsTooManyText(count)`（展開後の区切りが多すぎる理由）・`perRoundSummary(perRoundMin, rounds, totalMin)`（例「1 回あたり 8 分 × 6 回 ＝ 全部で 48 分」）。`totalTooLongText` は全部の分を受ける
  - `saved-scenarios.ts`: `CURRENT_VERSION = 2`・`MIGRATIONS[1]` が各項目の `scenario` に回数を足さずにそのまま版 2 へ移す（省略 = 1 なので、版を上げるだけでよい。**形を書き換えない**）

- [ ] **Step 1: 赤いテストを書く**
  - `scenario-draft.test.ts`「回数 6 のルームのシナリオを下書きへ写すと 1 区切りと回数 6 になる」（**m455**）: `inputFromView(toView(replaceScenario(初期, 朝会 × 6)))` の `steps.length === 1`・`rounds === 6`
  - `scenario-draft.test.ts`「回数だけ違う下書きはルームと同じと見なさない」（**m456**）: 同じ区切りで回数 2 と 3 の `scenarioKey` が違う
  - `scenario-draft.test.ts`「回数 1 の下書きは回数のキーを送らない」（**m457**）: `'rounds' in inputFromDraft(回数 '1' の下書き)` が `false`。回数 `'3'` なら `rounds === 3`
  - `scenario-draft.test.ts`「1 回あたり 40 分 × 5 回は合計の理由で止まる」: `checkDraft` が `ok: false`、理由が `totalTooLongText(200)`
  - `scenario-draft.test.ts`「回数 0・31・空欄は回数の理由で止まる」「4 区切り × 16 回は区切りの数の理由で止まる」
  - `scenario-draft.test.ts`「`bumpRounds` は 1 と 30 で止まる」
  - `saved-scenarios.test.ts`「版 1 の保存を読むと回数 1 のシナリオとして読める」: 版 1 の JSON を置いて `loadSaved` が 1 件・`roundsOf(scenario) === 1`
  - `saved-scenarios.test.ts`「回数 6 を保存して読み直すと回数 6 が残り、版 2 で書かれる」
  - サンプル: `SAMPLE_SCENARIOS` の `label` が `['KPT のふりかえり', '朝会', 'LT 会']` の順で、どれも `ScenarioInputSchema` を通る。朝会は `{ name: '話す', durationSec: 120, onTimeout: 'advance' }` × `rounds: 6`、LT 会は `{ name: '発表', durationSec: 300, onTimeout: 'advance' }`・`{ name: '入れ替え', durationSec: 60, onTimeout: 'advance' }` × `rounds: 5`（設計 §4.5）

- [ ] **Step 2: 赤を見る**
  Run: `pnpm --filter @tasuki/agenda-web test -- tests/scenario-draft.test.ts tests/saved-scenarios.test.ts`
  Expected: FAIL

- [ ] **Step 3: 実装する**（上の Produces のとおり。`firstReason` に回数と展開後の区切りの数の理由を、**会の名前 → 行 → 回数 → 区切りの数 → 合計**の順で足す）

- [ ] **Step 4: 緑を見る**
  Run: `pnpm --filter @tasuki/agenda-web test`
  Expected: 全件 PASS（`copy-fits-font-base` を含む。落ちたら文言を `outsideBase` に合わせて言い換える）

- [ ] **Step 5: 変異 m455・m456・m457 を足して赤を見る。** 既存の m444〜m448・m450 の `git apply --check`

- [ ] **Step 6: コミット**
  `git commit -m "feat: 組む画面の下書きと保存に回数を足し、朝会と LT 会のサンプルを置く（#429）"`

### Task 4: web — 組む画面と保存済みの一覧

**Files:**
- Modify: `apps/agenda-web/src/components/ScenarioBuilder.tsx`・`SavedScenarioList.tsx`・`src/builder.css`・`src/copy.ts`（`scenarioDetail`）
- Test: `apps/agenda-web/tests/scenario-builder.test.tsx`

**Interfaces:**
- Consumes: Task 3 の `Draft.rounds`・`bumpRounds`・`perRoundMinutes`・`totalMinutes`・`perRoundSummary`・`ROUNDS_LABEL`
- Produces: `scenarioDetail(steps: number, minutes: number, rounds: number): string`（回数 2 以上で「× 6 回」を添える。`minutes` は全部の分）

- [ ] **Step 1: 赤いテストを書く**
  - 「くりかえしの欄で回数を 6 にすると、合計が『1 回あたり 2 分 × 6 回 ＝ 全部で 12 分』になる」: ラベル `くりかえし` の数字の欄（`getByRole('spinbutton', { name: ... })` か既存の分の欄と同じ取り方）に入力
  - 「回数 1 では合計の行が第 1 段と同じ『予定 n 分』」
  - 「朝会のサンプルを読み込むと、回数の欄が 6 になる」
  - 「保存済みの一覧で、回数 6 の朝会は『1 ステップ・12 分 × 6 回』のように全部の分と回数を出す」（文言の正確な形は `scenarioDetail` に合わせる）
  - 「ルームのシナリオが回数 6 のとき、組む画面を開くと『ルームと同じ』の状態になる（読み込むボタンが押せない／既存の同じ状態の表示）」— Review Focus 2

- [ ] **Step 2: 赤を見る**
  Run: `pnpm --filter @tasuki/agenda-web test -- tests/scenario-builder.test.tsx`

- [ ] **Step 3: 実装する**: 区切りの並びの下・合計の行の上に「くりかえし」の欄（数字の入力と −／＋。分の欄の部品と同じ作り・44px 以上）。プレビューの盤は `previewView` のまま。`SavedScenarioList` は `scenarioTotalSec` と `roundsOf` で出す

- [ ] **Step 4: 緑を見る**
  Run: `pnpm --filter @tasuki/agenda-web test`

- [ ] **Step 5: コミット**
  `git commit -m "feat: 組む画面にくりかえしの欄を置く（#429）"`

### Task 5: web — 進める画面・映す表示・進行表・盤・終了の一覧

**Files:**
- Modify: `apps/agenda-web/src/agenda-view.ts`・`src/dial-geometry.ts`・`src/components/{Dial,StepList,SummaryTable}.tsx`・`src/run.css`・`src/copy.ts`
- Create: `apps/agenda-web/tests/step-list.test.tsx`
- Test: `apps/agenda-web/tests/{agenda-view,dial-geometry,dial,summary-table,projection-view}.test.ts(x)`

**Interfaces:**
- Consumes: Task 1 の `AgendaView.rounds`・`StepView.round`・`SummaryRow.round`
- Produces:
  - `agenda-view.ts`: `roundBadge(v: AgendaView): string`（進行中・一時停止中で回数 2 以上なら `roundBadgeText(cur, total)`＝「2 / 6 回」、それ以外は空）。`StepRow` に `readonly round: number`。`summaryText` は回数 2 以上なら名前の次に回を入れる（例「発表、2 / 6 回、残り 3 分、予定より +1 分」）
  - `dial-geometry.ts`: `MIN_NUMBER_SPAN = 14` を `Dial.tsx` から移す。`planLabels(v: AgendaView): { key: string; text: string; deg: number; skipped: boolean }[]` — 回数 1 は第 1 段と同じ（区画ごとの番号・幅が `MIN_NUMBER_SPAN` を超える区画だけ）。**回数 2 以上は回ごとに 1 つ**（文字は回の数・角度はその回の区画全体の中央・その回の幅が `MIN_NUMBER_SPAN` を超えるときだけ・`skipped` はその回の全区切りが飛ばされたとき）
  - `step-list` の枠: `scrollTopToReveal(box: { scrollTop: number; clientHeight: number }, row: { offsetTop: number; offsetHeight: number }): number`（行が枠に収まっていればいまの `scrollTop`、上にはみ出せば `row.offsetTop`、下にはみ出せば `row.offsetTop + row.offsetHeight − box.clientHeight`）を `StepList.tsx` の近く（`agenda-view.ts` か新しい小さなファイル）に置く
  - 文言: `roundBadgeText(cur, total)`・`roundHeading(n)`（「2 回」）

- [ ] **Step 1: 赤いテストを書く**
  - `agenda-view.test.ts`: 回数 6 の進行で 2 回目の区切りにいると `roundBadge === '2 / 6 回'`。回数 1・開始前・終了では `''`。`summaryText` が回を含む
  - `dial-geometry.test.ts`: 回数 5 の LT 会（10 区画）で `planLabels` の `text` が `['1','2','3','4','5']`、隣り合う `deg` の差がすべて `MIN_NUMBER_SPAN` より大きい。**回数 30・2 区切り（60 区画）でも隣の差が `MIN_NUMBER_SPAN` を超える札だけが出る**（重ならない・MUST）。回数 1 の KPT は第 1 段と同じ番号の札（`['1','2','4','5']` のように幅の足りない 3 が出ない——既存の値に合わせる）
  - `dial.test.tsx`: 回数 2 以上の進行で盤の中央に「2 / 6 回」が出る。回数 1 では出ない
  - `step-list.test.tsx`「回数 2 以上では回ごとの見出し『1 回』『2 回』で区切られ、回数 1 では見出しが無い」
  - `step-list.test.tsx`「回数 2 以上で区切りが移っても、ページはスクロールしない」（**m459**）: `Element.prototype.scrollIntoView` と `window.scrollTo` を spy にし、`view` を次の区切りへ変えて再描画したあと、どちらも呼ばれていない。枠の要素（`.step-list-rows` か新しい枠）の `scrollTop` に `scrollTopToReveal` の値が入る（jsdom ではレイアウトが無いので、枠と行の `offsetTop`・`clientHeight` などを `Object.defineProperty` で与える。**後片付けで元に戻す**——`unstubAllGlobals` では戻らない）
  - `step-list.test.tsx`: `scrollTopToReveal` の 3 つの場合（収まる・上にはみ出す・下にはみ出す）
  - `summary-table.test.tsx`: 回数 2 以上で回の見出しの行（`roundHeading`）が出て、合計の押し巻きは第 1 段と同じ（`summaryOf(v).driftMs`）。回数 1 では見出しの行が無い
  - `projection-view.test.tsx`: 映す表示でも「n / N 回」が出る

- [ ] **Step 2: 赤を見る**
  Run: `pnpm --filter @tasuki/agenda-web test -- tests/agenda-view.test.ts tests/dial-geometry.test.ts tests/dial.test.tsx tests/step-list.test.tsx tests/summary-table.test.tsx tests/projection-view.test.tsx`

- [ ] **Step 3: 実装する**
  - 盤の中央の札（`Readout` の `dial-tags`）に回の札を足す（オーバー・一時停止の札と並ぶ。色に頼らない文字の札）
  - 進行表: 回数 2 以上で回ごとに見出しを付けた群にし、**回数 2 以上のときだけ**枠（高さの上限 `max-height` とその中の `overflow-y: auto`）に入れる。いまの行が変わったとき・最初の描画で、枠の `scrollTop` を `scrollTopToReveal` で合わせる（`scrollIntoView` は祖先のページまで動かすので使わない）。高さの上限の値は撮影で詰める（Task 7）
  - 終了の一覧: 回数 2 以上で回の境目に見出しの行（`<tr><th colSpan={5} scope="rowgroup">`）を入れる
  - 回数 1 の DOM と CSS は第 1 段のまま（クラスの付け外しで分ける）

- [ ] **Step 4: 緑を見る**
  Run: `pnpm --filter @tasuki/agenda-web test`
  Expected: 全件 PASS（`rendered-text-fits-font-base` を含む）

- [ ] **Step 5: 変異 m458・m459 を足して赤を見る。** 既存の m444〜m448・m450 の `git apply --check`

- [ ] **Step 6: コミット**
  `git commit -m "feat: 進める画面に回の札と回ごとの進行表を出す（#429）"`

### Task 6: 文書・配布の手順・全体の検査

**Files:**
- Modify: `docs/adr/0027-agenda-timer.md`・`deploy/agenda/NOTES.md`・`scripts/lib/mutation-declarations.mjs`（Task 1〜5 で足した宣言の確認）・設計（`docs/superpowers/specs/2026-10-21-agenda-timer-repeat-design.md` の末尾に §11「実装で実測して外したこと・決めたこと」）

- [ ] **Step 1: ADR 0027 に決定 10 を足す**（設計 §5.5 の 2 点。決定の段で完了形を書かない。「却下した案」に部分の繰り返しと回ごとの担当者を足す）
- [ ] **Step 2: `deploy/agenda/NOTES.md` に第 2 段の配布の順を足す**: `deploy.sh timer` → `deploy.sh agenda`（K10 の理由を 1 行）。第 1 段の記録の節は書き換えない
- [ ] **Step 3: 全体の検査**
  Run: `pnpm typecheck && pnpm lint && pnpm test`、scripts の自己テストと全 audit（第 1 段の計画で使ったものと同じ。`package.json` の scripts を見る）
  Expected: すべて緑。**`pnpm test` に入らない scripts の自己テストを忘れない**
- [ ] **Step 4: 設計の末尾に §11 を書く**（実装で外したこと・閾値の値など。§1〜§10 は書き換えない）
- [ ] **Step 5: コミット**
  `git commit -m "docs: 繰り返しの決定を ADR 0027 と配布の手順に書く（#429）"`

### Task 7: E2E と実画面（統括）

**Files:**
- Modify: `e2e/specs/agenda.spec.ts`

- [ ] **Step 1: E2E を 1 本足す**（新しいタグは足さない）: 2 ページで同じルームを開き、LT 会のサンプルを読み込んで回数を 2・発表と入れ替えを 1 分に変えて開始し、両ページで「1 / 2 回」が出ること。自動で次へを待たず、「次へ」を 2 回押して両ページが「2 / 2 回」になること
- [ ] **Step 2: E2E を走らせる**: まず `agenda.spec.ts` だけ、PR の前に全件
- [ ] **Step 3: 実画面**（設計 §7.2）: 2 ブラウザで LT 会を回数 2・各 1 分で自動で次へに任せ、回をまたいで揃うこと。60 区切り（1 分の区切り 2 つ × 30 回。合計 60 分で通る）の進行表と盤を 375px・1920px の映す表示で撮り、いまの行が枠の中に見えていること・盤の札が重ならないこと・ページが動かないことを見る。回数 1 の KPT を第 1 段の撮影と並べる
- [ ] **Step 4: 撮影を利用者に見せる。** 直しがあれば Task 5 の CSS を直して撮り直す
- [ ] **Step 5: PR を作り、`/code-review <番号>` を流す。** PR のコメントを push のたびに読む。マージと配布は利用者の指示を待つ

## 変異の割り当て

**ID の帯は 452〜459**（着手時に台帳で空きを確かめる）。

| ID | 名前（パッチのファイル名の後半） | 足すタスク | パッケージ | 赤になるテスト |
|---|---|---|---|---|
| m452 | reset-expands-all-rounds | 1 | agenda-core | `tests/agenda.test.ts` |
| m453 | total-checked-per-round | 1 | agenda-core | `tests/schemas.test.ts` |
| m454 | planned-step-count-unchecked | 1 | agenda-core | `tests/schemas.test.ts` |
| m455 | draft-copies-all-rounds | 3 | agenda-web | `tests/scenario-draft.test.ts` |
| m456 | scenario-key-ignores-rounds | 3 | agenda-web | `tests/scenario-draft.test.ts` |
| m457 | rounds-one-sent | 3 | agenda-web | `tests/scenario-draft.test.ts` |
| m458 | round-badge-on-single-round | 5 | agenda-web | `tests/agenda-view.test.ts` |
| m459 | step-list-scrolls-page | 5 | agenda-web | `tests/step-list.test.tsx` |

壊し方:
- m452: `reset` を第 1 段の `expand({ title: s.title, steps: s.steps, rounds: s.rounds })` に戻す
- m453: 合計の上限を 1 回あたり（`totalPlannedSec(steps)`）で見る
- m454: 展開後の区切りの数の検査を外す
- m455: `inputFromView` が `view.steps` の全部を写す
- m456: `scenarioKey` から回数を外す
- m457: `inputFromDraft` が回数 1 でも `rounds: 1` を載せる
- m458: `roundBadge` の「回数 2 以上」の条件を外す（回数 1 でも「1 / 1 回」を出す）
- m459: いまの行へ合わせるのを `scrollIntoView` にする

## この計画で足した判断（統括が最後に一覧で渡す）

- 回数のフィールド名は `rounds`、展開した区切りの何回目かは `round`
- 合計と区切りの数の検査は、配列ではなくシナリオ全体の `v.check` に置く（回数が無いと数えられない）
- 保存の移行は版を上げるだけで、形は書き換えない（回数の省略 = 1）
- 盤の札は回数 2 以上で回ごとに 1 つ（K4 の閾値は第 1 段の `MIN_NUMBER_SPAN = 14` をそのまま使う）
- E2E は 1 本だけ足す（回数 2 で 2 ページの回の札が揃う）
