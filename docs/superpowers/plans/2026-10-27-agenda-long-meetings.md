# 進行タイマーで 1 日〜半日の会を組む（#455）— 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 予定の合計の上限を 720 分・定義のステップの数の上限を 40 に上げ、予定の合計が 180 分以上の会はすべての時計を `h:mm:ss` で出す。画面と同期サーバーが同じ境目で受け付け・拒む。

**Architecture:** 上限は `packages/agenda-core/src/limits.ts` の 2 つの値を変えるだけで、判定（`ScenarioInputSchema`）は画面の下書き・端末の保存・同期サーバーの境界が共有している。時計は `apps/agenda-web/src/agenda-view.ts` に書き方（`ClockStyle`）を足し、会の予定の合計（`plannedTotalMs`）から決めて、盤（`centerLines`）と終了の一覧（`durationClock`・`signedDuration`）へ渡す。盤の数字は長い会だけ字を小さくする（`dial-time--hms`）。進行表は回数 1 でも 20 行を超えたら枠を付ける。

**Tech Stack:** TypeScript（strict）・valibot・React 19・vitest＋jsdom＋Testing Library（agenda-core・agenda-web）・bun test（同期サーバー）

**Spec:** [`docs/superpowers/specs/2026-10-27-agenda-long-meetings-design.md`](../specs/2026-10-27-agenda-long-meetings-design.md)（以下「設計」）。実装者は設計と本計画の両方を読むこと。

- **日付**: 2026-10-27・**実測時点**: main `32d1784a`
- **枝**: `feature/455-agenda-long-meetings`（worktree `/workspaces/claym/local/Tasuki-wt-455`）。PR は 1 本
- **実装役**: Task 1〜3・5 は **Sonnet**。Task 4（変異のパッチ）は **Opus**。仕上げは統括

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md)）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | Task 1〜3 は赤いテスト（境目の両側）から始まる。Task 4 は変異で既存と新しい試験の検出力を見る |
| II. 技術選定は ADR を通す | 通過 | 新しい依存なし。ADR 0027 は上限の値を写さない（正本は `limits.ts`）ので ADR は変えない |
| III. 揮発インメモリと単純運用 | 通過 | 状態の持ち方は変えない。ルームの回収（30 分）は変えず、運用で避ける（設計 §7・D7） |
| IV. 境界の型安全 | 通過 | 境界のスキーマは同じ 1 本のまま、値だけを変える。同期サーバーの試験で 720/721 分・40/41 ステップを境界から見る（Task 1） |
| V. 実画面検証 | 通過 | 8 時間と 12 時間（29 ステップ）の会を本物の WebSocket 越しに組み・進め・映して撮る。短い会の対照も撮る（統括） |
| VI. 依存は内向き | 通過 | 書き方の境目は agenda-web に置き、agenda-core は表示を知らない。依存の向きは変わらない |
| VII. 検査は壊して確かめる | 通過 | 変異 530〜538 を足し、旧い値に依っていた m453・m454 の試験と注記を新しい値で殺し直す（Task 4） |
| VIII. 記録が正本 | 通過 | 第 1 段・第 2 段の設計の上限の表に、決定の時制で追記する（Task 5） |
| IX. 小さく回す | 通過 | PR 1 本。配布は agenda-web と同期サーバーの両方で、利用者の指示を待つ（同期サーバーの配布で本番のルームが消える） |
| X. 抽象は実需で | 通過 | 上限を設定で変えられるようにはしない（Issue のスコープ外）。書き方は 2 通りの文字列の型だけ |
| XI. 秘密と個人情報を持ち込まない | 通過 | 新しい利用者由来のテキストは無い。試験の名前の例は架空 |

**逸脱なし。**

## Global Constraints

- 上限の値は `limits.ts` の 1 か所。画面の文言・注記・エラー文は今のまま定数から組む（**数を直書きしない**）
- 変える上限は `MAX_ITEMS`（20 → 40）と `MAX_TOTAL_SEC`（10800 → 43200）だけ。`STEP_SEC_MAX`・`MAX_STEP_BUDGET_SEC`・`MAX_PLANNED_STEPS`・`MAX_ROUNDS` は変えない
- 書き方の境目は `apps/agenda-web/src/agenda-view.ts` の `LONG_MEETING_SEC = 10_800`。**`MAX_TOTAL_SEC` から導かない**（設計 §3.1・R5）
- 書き方を決めるのは `plannedTotalMs(v)` だけ。延長込みの見込み（`projectedEndMs`）や、出す値の大きさで決めない
- 秒の丸めは変えない（残りは切り上げ・オーバーとかかった時間は切り捨て・差は絶対値で四捨五入）
- 分の文（「予定より +3 分」「全部で 710 分」・読み上げ・終わる見込みの時刻）は変えない（設計 R2・R3）
- 新しい生の色を書かない。字の大きさは理由つきの `scale-exempt`（`.dial-time` と同じ扱い）
- E2E に新しい spec・タグを足さない（設計 R4）
- 試験は `describe`・`it` を日本語で書き、**試験の名前に Issue 番号を入れない**（`@requirements` の注記には書いてよい）。既存の変異の番号の注記（`（m453）` など）は名前に残してよい
- 新しい依存を足さない。**`pnpm install` は打たない**
- コミットの末尾は `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`（Opus のタスクは `Claude Opus 5.5`）。閉鎖キーワード（Closes / Fixes / Resolves と番号の組）を書かない
- **サブエージェントは push・PR 作成・マージをしない。プロセスを止めない（`kill`・`pkill` をしない）。dev サーバー・E2E・Playwright を起動しない。ブランチを切り替えない（`git checkout`・`switch`・`stash`・`reset`・`restore` をしない）。`/workspaces/claym/local/Tasuki`（本体の作業ツリー）に触らない**

## Review Focus

設計が求めているのに、素のテストでは突かない入力のうち、使う人に効きそうなもの（効く順）。各行のテストは担当のタスクに足してある。

1. **179 分の会を 5 分延長した** → 書き方は `m:ss` のまま（延長は予定の合計に入らない）。途中で `h:mm:ss` に切り替わらない（Task 2・m532）
2. **長い会で 1 時間未満の残り** → `0:04:00`（`4:00` にしない。5 時間と読める）（Task 2・m531）
3. **回数 1 で 21 ステップ** → 進行表に枠が付くが、「1 回」の見出しは出ない（`grouped` を `scrolling` から導くと出る）（Task 3・m536）
4. **合計 721 分のシナリオを古い画面や手で作った電文で送る** → 同期サーバーが送り主にだけ `INVALID_COMMAND` を返し、他の人に配らない（Task 1）
5. **長い会の終了の一覧の合計の行** → 各行と同じ `h:mm:ss`（合計の行だけ `m:ss` に残さない）（Task 2・m534）
6. **12 時間の会の開始前の盤 `12:00:00`** → 読む欄に収まり、針の軸と重ならない（撮影・統括）

## 検証の実行時間の見積もり

**見込みである（手元の 9p 越し・CI は手元より遅い）。想定の 2 倍を超えたら統括へ報告する。**

| 何を | いつ | 1 回の見込み | 回数 | 小計 |
|---|---|---|---|---|
| `pnpm --filter @tasuki/agenda-core test` | Task 1・4 | 20 秒 | 6 | 2 分 |
| `pnpm --filter @tasuki/sync test -- test/agenda-handlers.test.ts` | Task 1 | 20 秒 | 3 | 1 分 |
| `pnpm --filter @tasuki/agenda-web test`（ファイルを絞って） | Task 2・3・4 | 20〜40 秒 | 15 | 8 分 |
| `pnpm --filter @tasuki/agenda-web test`（全件） | Task 2・3 の終わり | 1〜2 分 | 2 | 4 分 |
| 各パッケージの `typecheck`・`lint`、`@tasuki/ui` の test | Task 1〜3 | 30 秒 | 7 | 4 分 |
| 変異を 1 本ずつ当てて赤を見る（新しい 9 本＋直す 4 本） | Task 4 | 1 分 | 13 | 13 分 |
| 既存のパッチの `git apply --check` | Task 1〜4 | 数秒 | 15 | 1 分 |
| `node scripts/check-links.mjs`・`node scripts/audit-plan-gate.mjs` | Task 5 | 10 秒 | 2 | 1 分 |
| `pnpm test`（turbo の全件）＋ scripts の自己テスト ＋ 全 audit | 統括・PR の前 | 10〜15 分 | 1〜2 | 25 分 |
| 変異の `--changed` | 統括 | 宣言を足すので全件に倒れる → CI に任せる（約 11 分） | 1 | CI 11 分 |
| E2E 全件 | 統括 | 25〜40 分 | 1 | 40 分 |
| 撮影（2 つの会 × 2 幅 × 7 局面・対照） | 統括 | 40 分 | 1 | 40 分 |
| **合計の見込み** | | | | **約 2.5 時間**（うち統括の直列 1.7 時間） |

## 取り決め

- 各タスクは**テストファースト**: 赤いテストを書き、赤を見てから実装し、緑にする。境目の「拒む側」など、今の実装でも緑になる試験は、そう書いて残す（境目の反対側を固定するため）
- `pnpm` が見つからなければ `corepack pnpm` で打つ
- **既存の変異が当たらなくなる恐れ**: 触ったファイルに当たる既存のパッチを、タスクの終わりに `git apply --check scripts/mutations/<名前>.patch` で 1 本ずつ確かめる。当たらなければ**パッチの文脈の行だけ**を今のファイルに合わせて直す（番号・変異の中身は変えない）。直したら、当てて対象の試験が赤くなり、`git apply -R` で戻ることを見る。対象:
  - Task 1: `m436-command-schema-loosened.patch`・`m453-total-limit-ignores-rounds.patch`・`m454-expanded-step-count-unchecked.patch`（`schemas.ts` は変えないので当たるはず。m453 は**試験の側が変わる**ので Task 4 で中身を見直す）
  - Task 2: `m446-overrun-without-plus.patch`（**中身の行が変わるので当たらない**。直すのは Task 4）・`m458-round-badge-shows-for-single-round.patch`・`m450-reduced-motion-hides-needle.patch`
  - Task 3: `m455-view-copies-all-expanded-steps.patch`・`m456-key-ignores-rounds.patch`・`m457-draft-sends-rounds-one.patch`・`m459-step-list-scrolls-page.patch`・`m460-step-list-ignores-box-scroll-top.patch`。`m462-single-step-rounds-show-headings.patch` は文脈の 3 行（`const scrolling = view.rounds >= 2;`・注記「回数 2 以上の枠の中で」・`const grouped = scrolling && !flatRounds;`）がすべて変わるので**当たらない**。直すのは Task 4
  - パッチの対象の試験は `scripts/lib/mutation-declarations.mjs` の、そのパッチの宣言の `pkg` と `tests` にある
- `node scripts/mutation-check.mjs` は打たない（全件に倒れて数時間かかる）
- **コミットは `git add <パス>` で自分の変えたファイルだけを足す**（`git add -A`・`git add .` をしない）
- 実行してよいのは `pnpm --filter <パッケージ> test|typecheck|lint` と `node scripts/check-links.mjs`・`node scripts/audit-plan-gate.mjs` と `git` の add・commit・diff・log・show・apply だけ。コマンドは 1 つずつ・各 5 分以内

## ファイルの地図

| 層 | 変える | 作る |
|---|---|---|
| `packages/agenda-core` | `src/limits.ts`・`tests/limits.test.ts`・`tests/schemas.test.ts`・`tests/error-messages.test.ts` | — |
| `apps/tasuki-sync` | `test/agenda-handlers.test.ts` | — |
| `apps/agenda-web` | `src/agenda-view.ts`・`src/components/SummaryTable.tsx`・`src/components/Dial.tsx`・`src/dial.css`・`src/components/StepList.tsx`・`src/run.css`（コメント）・`src/scenario-draft.ts`（コメント）・`tests/agenda-view.test.ts`・`tests/summary-table.test.tsx`・`tests/dial.test.tsx`・`tests/time-digits.test.tsx`・`tests/scenario-draft.test.ts`・`tests/scenario-builder.test.tsx`・`tests/step-list.test.tsx` | — |
| 検査 | `scripts/lib/mutation-declarations.mjs`・`scripts/mutations/m446-*.patch`・`m453-*.patch`・`m454-*.patch` | `scripts/mutations/m530〜m538-*.patch` |
| 文書 | `docs/superpowers/specs/2026-10-19-agenda-timer-design.md`・`docs/superpowers/specs/2026-10-21-agenda-timer-repeat-design.md` | — |

---

### Task 1: core の上限と同期サーバーの境目（Sonnet）

**Files:**
- Modify: `packages/agenda-core/src/limits.ts`（`MAX_ITEMS = 40`・`MAX_TOTAL_SEC = 43200`。注記を「予定の合計の上限（秒。720 分。回数で展開したあとの合計で数える）」に）
- Test: `packages/agenda-core/tests/limits.test.ts`・`tests/schemas.test.ts`・`tests/error-messages.test.ts`・`apps/tasuki-sync/test/agenda-handlers.test.ts`

**Interfaces:**
- 公開の名前・型は変えない。値だけが変わる

- [ ] **Step 1: 赤いテストを書く（agenda-core）**
  - `limits.test.ts` の「各上限の値を固定する」: `expect(MAX_ITEMS).toBe(40)`・`expect(MAX_TOTAL_SEC).toBe(43200)`（ほかの行はそのまま）
  - `schemas.test.ts` の `describe("ScenarioInputSchema")`:
    - 「通る: 名前 40 字・会の名前が空・合計ちょうど 10800 秒」を「通る: 名前 40 字・会の名前が空・合計ちょうど 43200 秒・40 項目」に改め、合計の行を `Array.from({ length: 6 }, () => step({ durationSec: 7200 }))` に、40 項目の行 `scenario({ steps: Array.from({ length: 40 }, () => step({ durationSec: 60 })) })` を足す
    - 「落ちる」の表: `["21 項目", …]` を `["41 項目", scenario({ steps: Array.from({ length: 41 }, () => step({ durationSec: 60 })) })]` に、`["合計 10860 秒", …]` を `["合計 43260 秒", scenario({ steps: [...Array.from({ length: 6 }, () => step({ durationSec: 7200 })), step({ durationSec: 60 })] })]` に
  - `schemas.test.ts` の `describe("ScenarioInputSchema の回数")`:
    - 「通る」の `["展開後 180 分（1 区切り 6 分 × 30 回）", …]` を `["展開後 720 分（1 区切り 24 分 × 30 回）", sc(30, [step({ durationSec: 1440 })])]` に
    - 「拒む」の `["展開後 181 分以上（7 分 × 26 回）（m453）", …]` を `["展開後 721 分以上（25 分 × 29 回 ＝ 725 分）（m453）", sc(29, [step({ durationSec: 1500 })])]` に（1 回あたり 25 分・展開後 29 区切りは上限の内。合計だけが上限を超える）
  - `error-messages.test.ts` に足す: `it("INVALID_SCENARIO は定義の数と合計の上限を言う", …)` → `expect(agendaErrorMessageFor("INVALID_SCENARIO")).toBe("ステップは 40 まで、合計 720 分までです")`
- [ ] **Step 2: 赤いテストを書く（同期サーバー）**。`agenda-handlers.test.ts` の末尾（`describe("ログ")` の前）に `describe("シナリオの上限（境界のスキーマ）", …)` を足し、`/** @requirements #455 */` を付ける。土台は同じファイルの `setup`・`joined`・`errorsTo`・`viewsTo`（`joined` の後に `h.sent.length = 0` で送信の記録を空にしてから送る。`loadScenario` と同じ型）。ステップは `{ name: "s", durationSec, onTimeout: "wait" }`
  - 「合計 720 分（120 分 × 6）のシナリオは受けて全員へ配る」: a-1・a-2 が入り、a-1 が `agenda.scenario.set` → `errorsTo(h, "a-1")` が `[]`・`viewsTo(h, "a-2").at(-1)!.steps` の長さが 6
  - 「合計 721 分（120 分 × 6 ＋ 1 分）は送り主にだけ INVALID_COMMAND を返し、配らない」: `errorsTo(h, "a-1")` が `["INVALID_COMMAND"]`・`h.sent.filter((s) => s.connId === "a-2")` が `[]`
  - 「40 ステップ（各 1 分）は受け、41 ステップは INVALID_COMMAND」: 40 の後に `errorsTo(h, "a-1")` が `[]` で `viewsTo(h, "a-1").at(-1)!.steps` の長さが 40。`h.sent.length = 0` の後に 41 を送り、`errorsTo(h, "a-1")` が `["INVALID_COMMAND"]`
- [ ] **Step 3: 赤を見る**: `pnpm --filter @tasuki/agenda-core test` と `pnpm --filter @tasuki/sync test -- test/agenda-handlers.test.ts`。落ちる見込みは、値の固定・43200 秒・40 項目・展開後 720 分・エラー文・同期サーバーの 720 分と 40 ステップ。拒む側（41 項目・43260 秒・725 分・同期サーバーの 721 分と 41 ステップ）は今も拒まれるので**緑**（境目の反対側の固定）。どれが赤でどれが緑だったかを報告に書く
- [ ] **Step 4: 実装**: `limits.ts` の 2 つの値と注記
- [ ] **Step 5: 緑を見る**: `pnpm --filter @tasuki/agenda-core test`・`typecheck`・`lint`、`pnpm --filter @tasuki/sync test -- test/agenda-handlers.test.ts`・`pnpm --filter @tasuki/sync typecheck`。取り決めのパッチ 3 本の `git apply --check`
- [ ] **Step 6: コミット**: `feat: 進行タイマーの上限を合計 720 分・40 ステップに上げる（#455）`

### Task 2: 長い会の時計（Sonnet）

**Files:**
- Modify: `apps/agenda-web/src/agenda-view.ts`・`src/components/SummaryTable.tsx`・`src/components/Dial.tsx`・`src/dial.css`
- Test: `apps/agenda-web/tests/agenda-view.test.ts`・`tests/summary-table.test.tsx`（既存の 3 か所を直す。下の Step 2）・`tests/dial.test.tsx`・`tests/time-digits.test.tsx`

**Interfaces:**
- Produces（`agenda-view.ts`。名前はこのとおり）:
  - `export type ClockStyle = 'm:ss' | 'h:mm:ss';`
  - `export const LONG_MEETING_SEC = 10_800;`（注記: 予定の合計がこれ以上の会は、その会のすべての時計を `h:mm:ss` で書く。#455 の決定。上限 `MAX_TOTAL_SEC` とは別の値で、そこから導かない）
  - `export function clockStyleForPlannedMs(plannedMs: number): ClockStyle` — `plannedMs >= LONG_MEETING_SEC * 1000 ? 'h:mm:ss' : 'm:ss'`
  - `export const clockStyleOf = (v: AgendaView): ClockStyle => clockStyleForPlannedMs(plannedTotalMs(v));`
  - `export function formatClock(totalSec: number, style: ClockStyle): string` — 今の `clockOf` を置き換える。`m:ss` は今と同じ。`h:mm:ss` は `${Math.floor(totalSec / 3600)}:${pad2(Math.floor(totalSec / 60) % 60)}:${pad2(totalSec % 60)}`
  - `remainingClock(ms, style)`・`elapsedClock(ms, style)`（ファイルの中だけ。丸めは今のまま）
  - `export const durationClock = (ms: number, style: ClockStyle): string`・`export function signedDuration(ms: number, style: ClockStyle): string` — **第 2 引数は必須**（省略の既定を持たせない。渡し忘れを型検査が拾う）
  - `centerLines(v)` は中で `clockStyleOf(v)` を使う（引数は変えない）
- `SummaryTable`: `const style = clockStyleOf(view);` を 1 回作り、4 か所の `durationClock`・`signedDuration` に渡す
- `Dial` の `Readout`: `<div className={clockStyleOf(view) === 'h:mm:ss' ? 'dial-time dial-time--hms' : 'dial-time'}>`
- `dial.css`: `.is-paused .dial-time` の規則の直後に `.dial-time--hms { font-size: clamp(1.8rem, 12cqi, 7.2rem); /* scale-exempt: 長い会の h:mm:ss（設計 §3.3）。12:00:00 が読む欄 56% に収まる大きさ。.dial-time の 0.8 倍。撮影で 0.9 倍と比べ、0.8 倍にする（`0:44:59`・`11:50:00` が 390px と 1280px と映す表示で盤の読む欄に収まる）。下限 1.8rem は 2.2rem × 0.8 ＝ 1.76rem を丸めた値 */ }`
- **盤の字の倍率は 0.8 倍にする**（撮影で 0.9 倍 `clamp(2rem, 13.5cqi, 8.1rem)` と比べた。設計 §3.3。`0:44:59`・`11:50:00` が 390px と 1280px と映す表示で盤の読む欄に収まる）。下限 1.8rem は 2.2rem × 0.8 ＝ 1.76rem を丸めた値
- `clockOf` の上の注記（「盤の 1 周は最大 180 分」）は、書き方の規則（設計 §3.2）を指す注記に書き換える

- [ ] **Step 1: 赤いテストを書く**（`agenda-view.test.ts` に `describe('長い会の時計', …)` を足し、`@requirements #455（設計 §3）` の注記を付ける。状態は `./support/agenda-states` の `Driver`・`idleView`・`MIN`）
  - 「書き方は m:ss と h:mm:ss」: `formatClock(240, 'm:ss')` が `'4:00'`・`formatClock(7200, 'm:ss')` が `'120:00'`・`formatClock(0, 'h:mm:ss')` が `'0:00:00'`・`formatClock(300, 'h:mm:ss')` が `'0:05:00'`・`formatClock(11109, 'h:mm:ss')` が `'3:05:09'`・`formatClock(43200, 'h:mm:ss')` が `'12:00:00'`・`formatClock(47100, 'h:mm:ss')` が `'13:05:00'`
  - 「境目は予定の合計 180 分ちょうど（以上が h:mm:ss）」: `clockStyleForPlannedMs(10_799_000)` が `'m:ss'`・`clockStyleForPlannedMs(10_800_000)` が `'h:mm:ss'`
  - 「179 分の会は m:ss、180 分の会は h:mm:ss」: `centerLines(idleView([120, 59])).primary` が `'179:00'`・`centerLines(idleView([120, 60])).primary` が `'3:00:00'`・`centerLines(new Driver([120, 59]).view(0)).primary` が `'120:00'`・`centerLines(new Driver([120, 60]).view(0)).primary` が `'2:00:00'`
  - 「長い会の 1 時間未満の残りも時を省かない」: `centerLines(new Driver([120, 60]).next(120 * MIN).view(176 * MIN)).primary` が `'0:04:00'`（Review Focus 2）
  - 「長い会のオーバーは +h:mm:ss」: `centerLines(new Driver([120, 60]).view(120 * MIN + 30_000)).primary` が `'+0:00:30'`
  - 「延長しても書き方は変わらない（179 分の会を 5 分延長しても m:ss）」: `const v = new Driver([120, 59]).extend(5).view(MIN);` → `clockStyleOf(v)` が `'m:ss'`・`centerLines(v).primary` が `'124:00'`（Review Focus 1）
  - 「長い会を終えたら、かかった時間を h:mm:ss」: `centerLines(new Driver([120, 60]).next(125 * MIN).next(175 * MIN).view(175 * MIN)).primary` が `'2:55:00'`
  - 「差と長さは渡した書き方で書く」: `signedDuration(30_000, 'h:mm:ss')` が `'+0:00:30'`・`signedDuration(-600_000, 'h:mm:ss')` が `'−0:10:00'`（U+2212）・`signedDuration(400, 'h:mm:ss')` が `'0:00:00'`・`durationClock(7_500_000, 'h:mm:ss')` が `'2:05:00'`
  - 既存の「差は印を付けて m:ss（…）」の 4 行は、第 2 引数に `'m:ss'` を渡す形に直す（期待値は変えない）。既存の「60 分を超える残りも分を繰り上げずに出す」（90 分の会）はそのまま残す（短い会の見た目を変えないことの固定）
- [ ] **Step 2: 赤いテストを書く（部品）**
  - `summary-table.test.tsx` の既存の 3 か所（`signedDuration` の引数を必須にすると型検査で落ちる）: 9 行の `import { signedDuration } from '../src/agenda-view';` を外す。68 行の `expect(within(total).getByText(signedDuration(summaryOf(v).driftMs))).toBeInTheDocument();` を消す（69 行に `'−1:50'` の直書きがある）。118 行は `expect(within(total).getByText('+3:00')).toBeInTheDocument();` の直書きにする（実装と同じ関数で期待値を作る恒真をやめる）。試験の名前の「summaryOf(v).driftMs と同じ表記」はそのままでよい（`summaryOf(v).driftMs` の値の行は残る）
  - `summary-table.test.tsx` に「Given 予定の合計 180 分で終えた / When 一覧を見る / Then かかった時間と差を h:mm:ss で書き、合計の行も同じ」: `joinedRoom(new Driver([120, 60]).next(125 * MIN).next(175 * MIN).view(175 * MIN))`。`rowOf('S1')` に `'2:05:00'` と `'+0:05:00'`・`rowOf('S2')` に `'0:50:00'` と `'−0:10:00'`・`rowOf(SUMMARY_TOTAL_LABEL)` に `'2:55:00'` と `'−0:05:00'`（Review Focus 5。`MIN` はそのファイルが使う `./support/agenda-states` から import）
  - `dial.test.tsx` に「Given 予定の合計 180 分の会 / When 描く / Then 数字は h:mm:ss で、長い会の字の大きさのクラスが付く」: `render(<Dial view={new Driver([120, 60]).view(0)} wallNow={WALL} reducedMotion={false} />)` の `.dial-time` の `textContent` が `'2:00:00'`・`classList.contains('dial-time--hms')` が true。同じ試験で `new Driver([5, 7]).view(MIN)` を描いた `.dial-time` は `dial-time--hms` を持たない
  - `time-digits.test.tsx` に「h:mm:ss の 2 つのコロンはどちらも狭い箱に入る」: `<TimeDigits text="+3:05:09" />` の `.time-colon` が 2 個・`.time-sign` が 1 個・`.time-digit` が 5 個（部品は変えないので**最初から緑**。部品が `h:mm:ss` を扱えることの固定。報告に書く）
- [ ] **Step 3: 赤を見る**: `pnpm --filter @tasuki/agenda-web test -- tests/agenda-view.test.ts tests/summary-table.test.tsx tests/dial.test.tsx tests/time-digits.test.tsx`（`formatClock` 等が無いので落ちる）
- [ ] **Step 4: 実装**（上の Interfaces のとおり）
- [ ] **Step 5: 緑を見る**: 上の 4 ファイル、続けて `pnpm --filter @tasuki/agenda-web test`（全件。書体の層の試験 `rendered-text-fits-font-base` も含む）・`typecheck`・`lint`、`corepack pnpm --filter @tasuki/ui test`（`dial.css` を触るため。`typography-scale.test.mjs` が apps の CSS を読み、`scale-exempt` の理由を見る）。取り決めのパッチ m458・m450 の `git apply --check`。m446 は当たらない見込み（Task 4 で直す）。結果を報告に書く
- [ ] **Step 6: コミット**: `feat: 予定の合計が 180 分以上の会は時計を h:mm:ss で出す（#455）`

### Task 3: 組む画面の上限と進行表の枠（Sonnet）

**Files:**
- Modify: `apps/agenda-web/src/components/StepList.tsx`・`src/run.css`（`.step-list-rows--scroll` の上の注記「回数 1 は枠のクラスを付けない」を「回数 1 でも 20 行を超えたら付ける」の趣旨に）・`src/scenario-draft.ts`（`addBlockedByItems` の注記「足せない理由が 20 の上限か（そうでなければ 60 の上限）」を「定義の数の上限（`MAX_ITEMS`）か（そうでなければ展開後の上限）」に。**値を書かない**）
- Test: `apps/agenda-web/tests/scenario-draft.test.ts`・`tests/scenario-builder.test.tsx`・`tests/step-list.test.tsx`

**Interfaces:**
- `StepList.tsx`: `/** 回数 1 の平らな一覧を枠なしで出す最大の行数（第 1 段で撮影して確かめた 20 行。#455 で定義の上限が 40 になった） */ const FLAT_LIST_MAX_ROWS = 20;`。`const scrolling = view.rounds >= 2 || rows.length > FLAT_LIST_MAX_ROWS;`・**`const grouped = view.rounds >= 2 && !flatRounds;`**（`scrolling` から導かない。Review Focus 3）。`useEffect` の注記「回数 2 以上の枠の中で」は「枠の中で」に

- [ ] **Step 1: 赤いテストを書く**
  - `scenario-draft.test.ts`:
    - 「ステップの追加は…」と「回数が範囲外（99・0）でも…」の `Array.from({ length: 20 }, …)` を `{ length: 40 }` に（期待値 false のまま）。それぞれに `Array.from({ length: 39 }, …)` で true の行を足す（回数 `'1'` と `'99'`）
    - 「1 回あたり 40 分 × 5 回は合計の理由で止まる」を「1 回あたり 120 分 × 7 回は合計の理由で止まる」に: `draftOf([step('a', 7200)], '7')`・`perRoundMinutes` が 120・`totalMinutes` が 840・理由が `totalTooLongText(840)`
    - 足す「合計 720 分ちょうどは通り、721 分は上限といまの合計を示して止まる」: 6 行 × 7200 秒・回数 `'1'` の `checkDraft(…, '汎用').ok` が true。それに 60 秒の行を足すと `{ ok: false, reason: totalTooLongText(721) }`・`totalTooLongText(721)` が `'合計は 720 分までです（いま 721 分）'`
  - `scenario-builder.test.tsx`:
    - 「Given 40 ステップのルームのシナリオ / When 見る / Then 追加ボタンは無効で、『ステップは 40 までです』が出る」: `joinedRoom(idleAgenda('Long', Array.from({ length: 40 }, (_, i) => [`s${i}`, 1] as const)))` → `getByRole('button', { name: ADD_STEP_BUTTON })` が無効・`getByText('ステップは 40 までです')`・`MAX_PLANNED_NOTE` は出ない
    - 「Given 39 ステップ / When 見る / Then 追加ボタンは押せて、上限の注記は出ない」
  - `step-list.test.tsx`:
    - 「Given 回数 1 で 21 ステップ / When 描く / Then 枠のクラスが付き、回の見出しは無い」: `new Driver(Array.from({ length: 21 }, () => 1)).view(0)` → `.step-list-rows--scroll` がある・その枠の `tabIndex` が `0`・`getAttribute('aria-labelledby')` が `container.querySelector('h2')?.id`（キーボードでスクロールでき、名前を持つ。回数 2 以上の既存の試験と同じ見方）・`queryAllByRole('heading', { level: 3 })` が `[]`・`.step-list-round` が無い（Review Focus 3）
    - 「Given 回数 1 で 20 ステップ / When 描く / Then 枠も見出しも無い（第 1 段の DOM のまま）」
    - 「Given 回数 1 で 30 ステップ / When 25 番目へ移る / Then 枠の scrollTop だけが動き、ページは動かない」: 同じファイルの「Given 1 回あたり 1 ステップの平らな一覧 / When 区切りが移る / …」の土台（行の高さの差し替えと `scrollTops`）をそのまま使い、`Driver(Array.from({ length: 30 }, () => 1))` を 24 回 `next` して描き直す。枠の `scrollTop` が 0 より大きく、ページは動かない。ページの見方は既存の試験に揃える: `scrollIntoView` を `vi.fn()` に差し替え（`override(Element.prototype, 'scrollIntoView', …)`）、`vi.spyOn(window, 'scrollTo')` を張り、どちらも `not.toHaveBeenCalled()`
- [ ] **Step 2: 赤を見る**: `pnpm --filter @tasuki/agenda-web test -- tests/scenario-draft.test.ts tests/scenario-builder.test.tsx tests/step-list.test.tsx`。Task 1 の後なので、上限の試験は**緑のものがある**（定数から組んでいるため）。落ちるのは進行表の 2 本の見込み。どれが赤でどれが緑だったかを報告に書く
- [ ] **Step 3: 実装**（上の Interfaces と注記）
- [ ] **Step 4: 緑を見る**: 上の 3 ファイル、続けて `pnpm --filter @tasuki/agenda-web test`・`typecheck`・`lint`。取り決めのパッチ 6 本の `git apply --check`
- [ ] **Step 5: コミット**: `feat: 進行表は回数 1 でも 20 行を超えたら枠の中でスクロールする（#455）`

### Task 4: 変異 530〜538 と、旧い値に依っていた変異の見直し（Opus）

**Files:**
- Create: `scripts/mutations/m530〜m538-<名前>.patch`
- Modify: `scripts/lib/mutation-declarations.mjs`（末尾に `{ id, label, patch, pkg, tests, note }` で足す。`note` は `"#455。…"` で始める。`pkg` はパス）・`scripts/mutations/m446-overrun-without-plus.patch`・`m453-total-limit-ignores-rounds.patch`・`m454-expanded-step-count-unchecked.patch`・`m462-single-step-rounds-show-headings.patch`

**帯の確かめ**（2026-10-28 追記: 並行する #406 の枝が 495〜504・519 を使うので、#455 は 530〜539 に付け替えた）: main の台帳の最大は 484、PR #453（#447-2）が 485〜493 を使い、494〜499 は #449 に空けてある。着手時に `grep -oE 'id: *[0-9]+' scripts/lib/mutation-declarations.mjs | sort -t: -k2 -n | tail -3` と `gh pr diff 453 | grep -oE 'm[0-9]{3}' | sort -u` で 530〜538 が空いていることを見る。PR #453 も宣言の末尾に足すので、後からマージする側で台帳の末尾が衝突する（中身はどちらも残す）

**新しい変異**（各 1 本・当てると対象の試験が赤・戻すと緑）:

| ID | 名前 | 壊し方 | pkg | 赤になる試験 |
|---|---|---|---|---|
| m530 | long-clock-threshold-exclusive | `clockStyleForPlannedMs` の `>=` を `>`（180 分ちょうどが `m:ss`） | `apps/agenda-web` | `tests/agenda-view.test.ts` |
| m531 | clock-style-per-value | 書き方を会でなく値で決める（`formatClock` の中で `totalSec >= 3600` なら `h:mm:ss`、`style` を見ない） | `apps/agenda-web` | `tests/agenda-view.test.ts` |
| m532 | clock-style-from-projection | `clockStyleOf` が `plannedTotalMs` でなく `projectedEndMs` で決める（延長で切り替わる） | `apps/agenda-web` | `tests/agenda-view.test.ts` |
| m533 | hms-minutes-not-padded | `h:mm:ss` の分を 2 桁に詰めない（`3:5:09`） | `apps/agenda-web` | `tests/agenda-view.test.ts` |
| m534 | summary-table-always-mss | `SummaryTable` が `clockStyleOf(view)` でなく `'m:ss'` を渡す | `apps/agenda-web` | `tests/summary-table.test.tsx` |
| m535 | dial-time-without-hms-class | `Readout` が `dial-time--hms` を付けない | `apps/agenda-web` | `tests/dial.test.tsx` |
| m536 | flat-list-never-scrolls | `scrolling` から `rows.length > FLAT_LIST_MAX_ROWS` を外す（回数 1 の 40 行が枠なし） | `apps/agenda-web` | `tests/step-list.test.tsx` |
| m537 | grouped-follows-scrolling | `grouped = scrolling && !flatRounds` に戻す（回数 1 の 21 行に「1 回」の見出し） | `apps/agenda-web` | `tests/step-list.test.tsx` |
| m538 | add-step-allows-one-over | `canAddStep` の `d.steps.length < MAX_ITEMS` を `<=`（41 行目を足せる） | `apps/agenda-web` | `tests/scenario-draft.test.ts` |

**直す変異**:
- **m446**（オーバーの `+` を落とす）: Task 2 で `centerLines` の行が変わり当たらない。今の行に合わせて**中身の行**を作り直す（壊し方は同じ: オーバーの `+` を落とす）。試験 `tests/agenda-view.test.ts` の「オーバー中は「+」が付いて…（m446）」で赤を見る
- **m453**（合計の上限を 1 回あたりで見る）: パッチは当たるが、殺していた試験が 180 分の値（7 分 × 26 回）に依っていた。Task 1 で試験を「25 分 × 29 回 ＝ 725 分」に改めたので、それで赤になることを確かめる。宣言の `note` を「#429 第 2 段。1 区切り 25 分 × 29 回（725 分）が 1 回あたり 25 分で通り、720 分の上限を回数で破れる（#455 で値を改めた）。」に、パッチの頭の説明の「180 分」を「720 分」に直す
- **m454**（展開後の区切りの数を見ない）: 試験（4 区切り × 16 回）は新しい値でも効く。宣言の `note` の「定義の上限 20 以下」を「定義の上限 40 以下」に直す。当てて赤を見る
- **m462**（1 回あたり 1 ステップでも回の見出しを出す）: Task 3 で文脈の 3 行（`scrolling`・`useEffect` の注記・`grouped`）が変わり当たらない。新しい壊し方を `const grouped = view.rounds >= 2;`（`!flatRounds` を落とす）として作り直す。試験 `tests/step-list.test.tsx` の「Given 回数 2 以上で 1 回あたり 1 ステップ / When 描く / Then 回の見出しを出さず、…（m462）」で赤を見る。宣言の `label`・`note` の意味は変わらないので直さない
- ほかに旧い値（`180 分`・`10800`・`20 項目`）を note・パッチに書いた変異が無いことを `grep -n "180 分\|10800\|20 項目\|上限 20" scripts/lib/mutation-declarations.mjs scripts/mutations/*.patch` で確かめる（2026-10-27 の実測では m453 と m454 だけ）

- [ ] 各パッチの 1 行目は `# 変異 NNN: <名前>`、検出を期待する試験・説明・適用と復元の手順は既存のパッチ（m446）の型に合わせる
- [ ] 1 本ずつ: `git status --porcelain` が空 → `git apply` → 対象の試験で赤 → `git apply -R` → 空に戻る。13 本の赤の行（試験の名前）を報告に書く
- [ ] Task 1〜3 で「当たる」と確かめた既存のパッチをもう一度 `git apply --check`（m436・m450・m455〜m460）
- [ ] コミット: `test: 長い会の時計と上限の変異を足し、旧い値に依っていた変異を直す（#455）`（`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`）

### Task 5: 第 1 段・第 2 段の設計へ追記（Sonnet）

**Files:**
- Modify: `docs/superpowers/specs/2026-10-19-agenda-timer-design.md`・`docs/superpowers/specs/2026-10-21-agenda-timer-repeat-design.md`

- [ ] 第 1 段の設計の**末尾**に `## 13. 長い会のための上限の見直し（#455・2026-10-27）` を足す。中身: 定義の項目の数を 40・予定の合計を 720 分とする（理由は #455 のコメントの表を 1 行ずつ）。区切りの長さ（120 分）と延長込みの 240 分は変えない。予定の合計が 180 分以上の会は時計を `h:mm:ss` で書く。詳細は同じ置き場の `2026-10-27-agenda-long-meetings-design.md` を相対リンクで指す
- [ ] 第 2 段の設計の**末尾**に `## 12. 長い会のための上限の見直し（#455・2026-10-27）` を足す。中身: 予定の合計は 720 分とし、展開後の合計で数える規則はそのまま。展開後の区切りの数（60）と回数（30）は変えない。定義の区切りの数を 40 とする。回数 1 でも進行表が 20 行を超えたら枠を付ける（§4.4 の「回数 2 以上のときだけ」を広げる）。同じ設計を指す
- [ ] 各設計の上限の表（第 1 段 §6・第 2 段 §5.2）の**直後**に 1 行の注記を置く: `> 予定の合計と定義の項目の数の値は #455 で改めた（§13）。` と `> 予定の合計と定義の区切りの数の値は #455 で改めた（§12）。`。**表の中の値は書き換えない**（当時の決定の記録を保つ。`docs/adr/0002`）。**見出しを表の直後に足さない**（直後の小節の親が変わる）
- [ ] 第 2 段の設計 §5.2 の表の下の箇条書き「展開後の区切りの数の上限は、`STEP_SEC_MIN = 60` と予定の合計 180 分からは 180 まで通ってしまうので…」（約 131 行）も古くなる（720 分では 720 まで通る）。§12 に、この理由が 720 分でも成り立つこと（60 区切りの上限は合計からは導けない）を 1 文で書き添える。箇条書きそのものは書き換えない
- [ ] 書き方は**決定の時制**（「〜とする」）。完了形（「〜にした」「〜になった」）で書かない
- [ ] `node scripts/check-links.mjs` が通る
- [ ] コミット: `docs: 第 1 段・第 2 段の設計の上限の表に #455 の見直しを追記する`

### 統括の仕上げ（タスクにしない）

- `pnpm test --force`・scripts の自己テスト・全 audit・`pnpm typecheck`・`pnpm lint`
- E2E 全件（`e2e/specs/agenda.spec.ts` を含む）。短い会の見た目が変わっていないこと
- 撮影（設計 §8.3）: 8 時間の会と 12 時間の会（29 ステップ）を、組む画面・進める画面・映す表示・進行表・盤の 1 周・終了の一覧で、1280px と 375px。720 分ちょうどを読み込めること・721 分の下書きが止まること・40 行で追加が止まること。対照に KPT のサンプル（60 分）。盤の数字の大きさ（`dial-time--hms`）は 0.8 倍と 0.9 倍（`clamp(2rem, 13.5cqi, 8.1rem)`）を同じ局面で撮って比べ、`12:00:00` と `+0:59:59` が読む欄に収まり読みやすい方に決める（`dial.css` の 1 か所）
- 撮るために起動した dev サーバーは使い終わったら止める（`ss -tlnp` で確かめる）。8787 は headroom のプロキシが持っていることがあるので、同期サーバーは別のポートで起動する
- 最終レビュー（Opus）・PR（本文に「配布は agenda-web と同期サーバーの両方。同期サーバーの配布で本番のルームが消える」）・`/code-review <番号>`・CI
- 利用者へ一覧で渡すもの: 設計 §9 の R1〜R6
