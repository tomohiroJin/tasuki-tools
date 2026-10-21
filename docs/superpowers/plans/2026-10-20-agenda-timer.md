# 進行タイマー（#429 第 1 段）— 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 名前と長さを持つステップの並び（シナリオ）を組み、ルームの全員で同じ時計を見ながら順に進め、押し巻きとオーバーを懐中時計の盤で見せる 5 つ目のツール（`?tool=agenda`）を足す。

**Architecture:** 規則は新しい文脈 `packages/agenda-core`（純粋関数・どの `@tasuki/*` にも依存しない）に置く。同期サーバーは接続の種類 `?tool=agenda` と専用のメッセージ層・配信・期限の予約（単調時計）を持ち、自動で次へ移す判断はサーバーが行う。画面 `apps/agenda-web` は経過を受け取って手元の単調時計で描き、シナリオは端末の localStorage に保存する。ルーレット（#94）を足したときと同じ形で足す。

**Tech Stack:** TypeScript（strict・`exactOptionalPropertyTypes`）、neverthrow、valibot、React 19、Vite、vitest（core・web・landing）、bun test（tasuki-sync）、Playwright（e2e）

**Spec:** [`docs/superpowers/specs/2026-10-19-agenda-timer-design.md`](../specs/2026-10-19-agenda-timer-design.md)（以下「設計」。U・J は設計 §11 の番号）。実装者は設計と本計画の両方を読むこと。

- **日付**: 2026-10-20・**実測時点**: main `e3879758`
- **型にした先例**: ルーレット #94 の PR 1（`513742a6`）・PR 2（`ac7403c6`）・PR 3（`1e65fe25`）と計画 [`2026-10-12-facilitator-roulette.md`](./2026-10-12-facilitator-roulette.md)。その後 #360 の大規模リファクタリングで ws-adapter（`adapters/ws/tool-channel.ts`・`connection-gate.ts`）と web の同期フック（`@tasuki/web-kit/sync` の `useToolRoomSync`）が動いている。**迷ったら現在のルーレットの同じ場所を読む**（`git show <SHA>` の差分は配線の顔ぶれの目安にだけ使う）

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md)）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 全タスクが「先に書く赤いテスト」から始まる。§4.1 の不変条件は性質テストで守り、オラクルは実装と別の計算（区切りごとに足し上げる）で組む |
| II. 技術選定は ADR を通す | 通過 | 新しい文脈と時計・期限の扱いを ADR 0027 で決める（Task 1.8）。外部の依存は足さない（`valibot`・`neverthrow` は既存の版の指定） |
| III. 揮発インメモリと単純運用 | 通過 | 進行の状態はルームの揮発メモリだけ。シナリオの保存は端末の localStorage（原則 III のクライアント側の例外）。新しいサーバー・ユニットを立てない。配布は静的サイト 1 本ぶん |
| IV. 境界の型安全 | 通過 | コマンドは `v.strictObject`、フレームは非 strict の `v.object`。localStorage の中身も Valibot で検証する（Task 3.4） |
| V. 実画面検証 | 通過 | 2 つのブラウザで揃うこと・同時押し・映す表示 1920px・手元 375px を統括が撮る（Task 4.4） |
| VI. 依存は内向き | 通過 | `agenda-core` は依存ゼロ。時計は引数で受ける。`audit-dependency-direction` の `ALLOWED` に登録（Task 1.6） |
| VII. 検査は壊して確かめる | 通過 | 変異 m430〜m450 を足し、1 本ずつ赤を見る（§6）。全件は統括 |
| VIII. 記録が正本 | 通過 | 決定は ADR 0027、設計は設計正本、データ分類は ADR 0011 の表、実装で外したことは設計正本の末尾へ戻す |
| IX. 小さく回す | 通過 | PR を 4 本に分け（設計 §9）、配布は最後に 1 回・利用者の指示を待つ |
| X. 抽象は実需で | 通過 | timer の `Scheduler` と共通化しない（専用の予約を別ファイルに持つ）。音は timer-web から必要な最小だけを写し、共通化は 3 つ目の利用者が来たときに検討する（Task 3.6 の注記） |
| XI. 秘密と個人情報を持ち込まない | 通過 | ステップの名前・会の名前は「個人に紐づく」（J18）。ログに出さない。ハンドラはログを書かない（Task 2.4 で偽のロガーが空であることを見る） |

**逸脱なし。**

## Global Constraints

- 接続の種類の綴りは `agenda`（`TOOL_AGENDA = "agenda"`）。公開パスは `/agenda/`。dev のポートは `5178`
- 長さは core・wire・保存のすべてで**秒の整数**。第 1 段の入力は 60〜7200 秒で 60 の倍数（1〜120 分）
- 上限: 定義の項目 20・ステップの名前 40 字・会の名前 0〜60 字・予定の合計 10800 秒（180 分）・延長を含めた 1 ステップの持ち時間 14400 秒（240 分）
- 延長の刻みは 1 / 3 / 5 分だけ
- 名前は前後の空白を除いて空なら拒む（会の名前は空を許す）。C0 制御文字と DEL（`/[\u0000-\u001F\u007F]/`）を含めば拒む
- サーバーの経過・期限はすべて `MonotonicClock`。`WallClock` を agenda の計測に使わない
- 単調時計の値（開始の瞬間・`runningSince` など）を wire に載せない。載せるのは**送る時点で計った経過**
- 画面の固定文言は書体の base 層に収める（U9）。文言は §5 の表から取り、足すときは `outsideBase` で実測してから
- 新しい生の色を書かない。字の大きさは 5 段か、理由つきの `scale-exempt`
- ハンドラはログを書かない。ステップの名前・会の名前・表示名をログへ出さない
- コミットの末尾は `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`（実装役）。閉鎖キーワード（Closes / Fixes / Resolves と番号の組）を書かない
- **サブエージェントは push・PR 作成・マージをしない**（統括が行う）

## Review Focus

設計が求めているのに、どのタスクのテストも素では突かない入力のうち、使う人に一番効きそうなもの（効く順）。各行のテストは担当のタスクに足してある。

1. **ノート PC をスリープさせて 40 分後に開いた** → 手元の時計で描き続けず、表示に戻った瞬間にサーバーへ求め直して正しい残りになる（Task 3.2 `use-agenda-sync.test.tsx`「visibilitychange で agenda.sync を送る」〈m448〉）
2. **2 人が同じ秒に「次へ」を押す／自動で次へ移った直後に古い画面の「次へ」が届く** → 進むのは 1 つ（Task 1.4 `agenda.test.ts`・Task 2.5 `live-ws.agenda.test.ts`〈m430〉）
3. **組んでいる最中に別の人がルームのシナリオを置き換えた** → 手元の下書きは消えず「シナリオが変わりました」が出る（Task 3.5 `scenario-builder.test.tsx`）
4. **ステップの名前に改行を貼り付けた・空白だけ・41 字** → 送る前に画面が止め、サーバーも拒む（Task 1.3 `schemas.test.ts`・Task 3.5）
5. **一時停止したまま 20 分話し込んだ** → 残りは止まったまま、押しは 20 分増え、盤の針と内の環の先端がずれない（Task 1.5 性質テスト〈m431〉・Task 3.3 `dial-geometry.test.ts`〈m447〉）

## 検証の実行時間の見積もり

**見込みである（手元の 9p 越し・CI は手元より遅い）。想定の 2 倍を超えたら統括へ報告する。**

| 何を | いつ | 1 回の見込み | 回数 | 小計 |
|---|---|---|---|---|
| `pnpm --filter @tasuki/agenda-core test` | 1.x | 20 秒 | 20 | 7 分 |
| `pnpm --filter @tasuki/sync test -- <ファイル>` | 2.x | 30〜60 秒 | 25 | 20 分 |
| `pnpm --filter @tasuki/sync test`（全件） | PR 2 の終わり・各 PR の前 | 3〜5 分 | 4 | 20 分 |
| `pnpm --filter @tasuki/agenda-web test` | 3.x | 30 秒〜1 分 | 35 | 30 分 |
| `pnpm --filter @tasuki/landing test` | 4.1 | 1 分 | 4 | 4 分 |
| `pnpm typecheck` / `pnpm lint` | 各 PR の終わり | 3〜5 分 | 8 | 40 分 |
| `pnpm test`（turbo の全件） | 各 PR の終わり | 8〜12 分 | 4 | 45 分 |
| scripts の自己テスト ＋ 全 audit | 各 PR の終わり・許可表を触った後 | 2〜3 分 | 6 | 15 分 |
| 自分の変異を 1 本ずつ当てて赤を見る | 変異を足すタスク | 1〜2 分 | 21 | 40 分 |
| **変異の全件（統括・CI に任せてよい）** | 各 PR の前 | 手元 60〜90 分／CI 約 11 分 | 4 | CI なら 45 分 |
| **E2E の全件（統括）** | PR 3・4 の前 | 25〜40 分 | 2〜3 | 1〜2 時間 |
| **盤のモックと利用者の確認（統括）** | PR 3 の前 | 1〜2 時間（往復を含めない） | 1 | 1〜2 時間 |
| **実画面検証と撮影（統括）** | PR 4 | 1〜2 時間 | 1 | 1〜2 時間 |
| **合計の見込み** | | | | **約 10〜14 時間**（うち統括の直列 4〜6 時間） |

**見た目の直しの往復は見積もりに入れていない。** モック（Task 3.0）と実画面（Task 4.4）でそれぞれ 1〜2 往復を見込む。

## 取り決め

- **枝**: 実装は `feature/issue-429-agenda-timer`（設計と計画のコミットがある `docs/issue429-agenda-timer-design` から切る）。PR は 4 本を順に main へ入れる。PR を分けるときの枝の切り直しは統括が行う
- 各タスクは**テストファースト**: 赤いテストを書き、**赤を見てから**実装し、緑にする
- **アサーションは値が分かれる局面に置く**（例: 一時停止を所要に含めるか否かは、一時停止を挟んだ後でしか分かれない）
- 変異の ID は **430〜450 だけ**（§6）。ファイルは `scripts/mutations/m430-<名前>.patch`、1 行目は `# 変異 430: <名前>`。宣言は `scripts/lib/mutation-declarations.mjs` に `{ id, label, patch, pkg, tests, note }` で足す（既存の宣言が型）。**着手時に台帳で 430〜450 が空いていることを確かめる**（別セッションの epic #360 と衝突しないため）
- **自分の変異を 1 本だけ当てて赤を見る手順**（全件は統括）:
  ```bash
  git status --porcelain          # 空であること
  git apply scripts/mutations/m43X-*.patch
  pnpm --filter <pkg> test -- <テストファイル>   # 赤を見る
  git apply -R scripts/mutations/m43X-*.patch
  git status --porcelain          # 空に戻ったこと
  ```
  `git checkout -- <file>` で戻さない。`node scripts/mutation-check.mjs` は打たない（統括が `--changed` か CI で流す）
- **`pnpm install` は打たない。** 新しい `package.json` を足したら統括に lockfile の更新を依頼して止まる（統括は `pnpm install --frozen-lockfile=false --virtual-store-dir=.pnpm-virtual --config.confirm-modules-purge=false` で更新する）
- **E2E の実行・撮影・`pnpm dev` は統括。** 実装役は E2E の spec を書くが Playwright を打たない
- 製品コードを触ったら、そのファイルに当たる既存の変異パッチが当たるかを `git apply --check` で確かめる（§6 の後半）

## ファイルの地図

| 層 | 作る | 変える |
|---|---|---|
| `packages/agenda-core` | `package.json`・`tsconfig.json`・`vitest.config.ts`（roulette-core を写す）・`src/{index,limits,types,errors,error-messages,scenario,agenda,projection,schemas}.ts`・`tests/{limits,scenario,agenda,agenda-invariant,projection,schemas,error-messages}.test.ts`・`tests/support/{font-base,fixtures}.ts` | — |
| `apps/tasuki-sync` | `src/ports/{agenda-store,agenda-server-msg}.ts`・`src/adapters/in-memory-agenda-store.ts`・`src/application/{agenda-broadcast,agenda-handlers,agenda-deadlines}.ts`・`test/{in-memory-agenda-store,agenda-deadlines,agenda-handlers,live-ws.agenda}.test.ts` | `package.json`・`src/application/{tool-id,destroy-room,topic-broadcast}.ts`・`src/application/log/vocabulary.ts`・`src/adapters/ws-adapter.ts`・`src/adapters/ws/{connection-gate,tool-channel}.ts`・`src/create-sync-server.ts`・`test/support/{live-sync-server,test-ws-adapter,room-builder,spy-destroyer}.ts`・`test/{destroy-room,ws-adapter-tool-query,ws-adapter.message}.test.ts` |
| `apps/agenda-web` | roulette-web の骨組みを写す（`index.html`・`package.json`・`tsconfig.json`・`vite.config.ts`・`vitest.config.ts`・`src/{main,App,router,copy,server-message}.ts(x)`・`src/index.css`・`src/components/{LoadingView,InviteLink}.tsx`・`tests/{setup,router.test,server-message.test,copy-fits-font-base.test,rendered-text-fits-font-base.test,screens-do-not-import-sync-client.test}.ts(x)`・`tests/support/{font-base,scripted-web-socket}.ts`）＋ 固有: `src/hooks/{use-agenda-sync,use-local-clock,use-reduced-motion}.ts`・`src/{agenda-view,dial-geometry,timeout-signal,sample-scenarios}.ts`・`src/storage/saved-scenarios.ts`・`src/platform/sound.ts`・`src/screens/AgendaRoom.tsx`・`src/components/{ScenarioBuilder,StepEditorRow,SavedScenarioList,Dial,RunControls,StepList,SummaryTable,ProjectionView,SoundToggle}.tsx` と各テスト | — |
| 玄関・dev | — | `apps/landing/src/{tools.ts,ToolMark.tsx,index.css}`・`apps/landing/vite.config.ts`・`apps/landing/tests/{tool-public-paths,dev-hub-redirect-wiring,index-html-loading-placeholder,room-choice-layout}.test.ts(x)`・`packages/dev-hub-redirect/{src/index.ts,README.md}` |
| 配備 | `deploy/agenda/{app.env,NOTES.md,caddy/60-agenda.conf}` | `deploy/README.md`・`deploy/caddy/{README.md,tasuki.conf}`・`deploy/deploy.sh`（ルーレットが触った箇所） |
| 検査 | `scripts/mutations/m430〜m450-*.patch` | `scripts/audit-{dependency-direction,structure,domain-side-effects,domain-error-shape,log-hygiene,ui-components,web-sync-boundary}.mjs`（**実行して赤になったものだけ**）・`scripts/audit-web-sync-boundary.test.mjs`・`scripts/lib/mutation-declarations.mjs`・`turbo.json` |
| E2E | `e2e/specs/agenda.spec.ts`・`e2e/support/agenda.ts` | `e2e/harness/paths.ts`・`e2e/package.json`・`e2e/tests/{workspace,fragment-sources}.test.ts`・`e2e/specs/{routing,landing,landing-design,buttons}.spec.ts` |
| 文書 | `docs/adr/0027-agenda-timer.md` | `docs/adr/{README,0011-threat-model-and-data-classification,0017-bounded-contexts-and-packages}.md`・`docs/guides/{architecture,development}.md`・`README.md`・`packages/ui/README.md`・設計正本の末尾 |

---

## PR 1 — agenda-core と ADR（変異 m430〜m437）

### Task 1.1: パッケージの骨組みと上限

**Files:** Create `packages/agenda-core/{package.json,tsconfig.json,vitest.config.ts,src/index.ts,src/limits.ts}`・`tests/limits.test.ts`。Modify `turbo.json`（roulette-core と同じ扱いの行があれば並べる）

**Interfaces:**
- Produces（`src/limits.ts`）: `MAX_ITEMS = 20`・`MAX_STEP_NAME = 40`・`MAX_SCENARIO_TITLE = 60`・`STEP_SEC_MIN = 60`・`STEP_SEC_MAX = 7200`・`STEP_SEC_GRANULARITY = 60`・`MAX_TOTAL_SEC = 10800`・`MAX_STEP_BUDGET_SEC = 14400`・`EXTEND_MINUTES = [1, 3, 5] as const`

- [ ] **Step 1:** `package.json` は roulette-core を写し、`name` を `@tasuki/agenda-core`、依存を `valibot` と `neverthrow`（同じ版の指定）だけにする。**足したら統括に lockfile の更新を依頼して止まる**
- [ ] **Step 2: 赤いテスト** `tests/limits.test.ts` —— 上の 9 つの値をそのまま固定する。加えて `STEP_SEC_MAX * MAX_ITEMS > MAX_TOTAL_SEC`（合計の上限が別に効くこと）と `STEP_SEC_MAX < MAX_STEP_BUDGET_SEC`
- [ ] **Step 3:** 赤を見る → `limits.ts` を書く → `pnpm --filter @tasuki/agenda-core test` で緑
- [ ] **Step 4:** コミット `feat(agenda-core): パッケージの骨組みと上限を足す（#429）`

### Task 1.2: 型とエラーコード

**Files:** Create `src/types.ts`・`src/errors.ts`

**Interfaces（Produces。以降のタスクはこの名前で使う）:**
```ts
export type TimeoutBehavior = "wait" | "advance";
export interface StepInput { readonly name: string; readonly durationSec: number; readonly onTimeout: TimeoutBehavior }
export interface ScenarioInput { readonly title: string; readonly steps: readonly StepInput[] }
export interface PlannedStep extends StepInput {
  readonly id: string;            // "s-1", "s-2", …（置き換えの時点の並び順で採番）
  readonly skipped: boolean;
  readonly extensionSec: number;  // 延長の合計
  readonly spentMs: number | null; // 確定した所要（終えたら数値・飛ばしたら 0・まだなら null）
}
export type AgendaPhase = "idle" | "running" | "paused" | "finished";
export interface AgendaState {
  readonly phase: AgendaPhase;
  readonly title: string;
  readonly steps: readonly PlannedStep[];
  readonly currentId: string | null;
  readonly startedAt: number | null;      // 単調時計。実時間の経過の基準
  readonly stepStartedAt: number | null;  // 単調時計。いまのステップの所要の基準
  readonly runningSince: number | null;   // 単調時計。計時が動いている間だけ値を持つ
  readonly accumulatedMs: number;         // いまのステップの計時の積算（一時停止で確定した分）
  readonly finishedAtMs: number | null;   // 終了した時点の実時間の経過（確定値）
}
export interface StepView extends PlannedStep {}
export interface AgendaView {
  readonly phase: AgendaPhase;
  readonly title: string;
  readonly steps: readonly StepView[];
  readonly currentId: string | null;
  readonly runElapsedMs: number;   // 実時間の経過（送る時点で計る）
  readonly stepTimerMs: number;    // いまのステップの計時
  readonly stepSpentMs: number;    // いまのステップの所要
}
```
- `src/errors.ts`: `AGENDA_DOMAIN_ERROR_CODES = ["AGENDA_EMPTY","AGENDA_ALREADY_STARTED","AGENDA_NOT_STARTED","AGENDA_IN_PROGRESS","AGENDA_FINISHED","STEP_NOT_FOUND","STEP_NOT_SKIPPABLE","STEP_BUDGET_EXCEEDED","INVALID_SCENARIO"] as const`・`type AgendaDomainErrorCode`・`interface AgendaError<C extends AgendaDomainErrorCode = AgendaDomainErrorCode> { code: C }`。**文言を持たない**（`scripts/audit-domain-error-shape.mjs`）

- [ ] **Step 1:** 型だけのファイルなので赤いテストは Task 1.3〜1.5 が兼ねる。`pnpm --filter @tasuki/agenda-core typecheck` が通ること
- [ ] **Step 2:** コミット

### Task 1.3: シナリオの検証と展開・wire のスキーマ・文言

**Files:** Create `src/scenario.ts`・`src/schemas.ts`・`src/error-messages.ts`・`tests/{scenario,schemas,error-messages}.test.ts`・`tests/support/font-base.ts`（`packages/roulette-core/tests/support/font-base.ts` を写す）

**Interfaces:**
- Produces（`scenario.ts`）: `expand(input: ScenarioInput): PlannedStep[]`（ID を `s-1` から振り、`skipped: false`・`extensionSec: 0`・`spentMs: null`）・`totalPlannedSec(steps: readonly PlannedStep[]): number`
- Produces（`schemas.ts`）: `StepInputSchema`・`ScenarioInputSchema`・`AgendaCommandSchema`・`AgendaFrameSchema`・`AgendaErrorFrameSchema`・`AGENDA_ERROR_CODES`（ドメインのコード ＋ `INVALID_JSON`・`INVALID_COMMAND`・`NOT_IN_ROOM`・`RATE_LIMITED`・`MESSAGE_TOO_LARGE`・`INTERNAL_ERROR`。ルーレットの共通部分と同じ並び）・`type AgendaCommand`・`type AgendaErrorCode`
- コマンド（すべて `v.strictObject`）: `agenda.scenario.set { scenario: ScenarioInput }`・`agenda.start`・`agenda.next { stepId }`・`agenda.pause`・`agenda.resume`・`agenda.extend { stepId, minutes: 1|3|5 }`・`agenda.skip { stepId, skipped: boolean }`・`agenda.reset`・`agenda.sync`。`stepId` は 1〜16 字
- フレーム（非 strict の `v.object`）: `{ type: "agenda", state: AgendaView }`
- Produces（`error-messages.ts`）: `agendaErrorMessageFor(code: AgendaErrorCode): string`（文言は §5）

- [ ] **Step 1: 赤いテスト** `tests/scenario.test.ts` —— `expand` の ID が `s-1, s-2, s-3`・3 項目の合計 `totalPlannedSec` が 780（300 + 420 + 60）
- [ ] **Step 2: 赤いテスト** `tests/schemas.test.ts`
  - 9 つのコマンドが通る。**余剰の項目（`{ command: "agenda.start", x: 1 }`）が落ちる**〈m436〉
  - `ScenarioInputSchema`: 21 項目・0 項目・名前 41 字・名前が空白だけ・名前に `\n`・`\t`・`\u007f` を含む・会の名前 61 字・`durationSec` が 59・7260・90（60 の倍数でない）・合計 10860 秒 —— すべて落ちる。名前 40 字・会の名前が空文字・合計ちょうど 10800 は通る
  - `agenda.extend` の `minutes: 2` が落ちる
  - フレームは項目を足しても通る（非 strict）
- [ ] **Step 3: 赤いテスト** `tests/error-messages.test.ts` —— 全コードに文言がある。**文言が書体の base 層に収まる**（roulette-core の同名テストが型）
- [ ] **Step 4:** 赤を見る → 実装 → 緑 → `node scripts/audit-domain-error-shape.mjs`・`node scripts/audit-domain-side-effects.mjs`（新しいパッケージを射程に入れる。赤なら Task 1.6 で許可表を足す）
- [ ] **Step 5:** コミット

### Task 1.4: 進行の遷移（状態 × 操作）

**Files:** Create `src/agenda.ts`・`tests/agenda.test.ts`・`tests/support/fixtures.ts`（KPT の入力 `kptInput`: K 300 秒・P 420・投票 60・Try 2400・予備 420、全部 `wait`）

**Interfaces（Produces）:** すべて `Result<AgendaState, AgendaError<…>>` を返す。**状態が変わらないときは同じ参照を `ok` で返す**（ハンドラが「変わらなければ配らない」を参照の比較で決める）
- `INITIAL_AGENDA_STATE: AgendaState`（idle・空）
- `replaceScenario(s, input: ScenarioInput)`
- `start(s, now: number)`
- `next(s, { stepId, now })`
- `pause(s, now)`・`resume(s, now)`
- `extend(s, { stepId, minutes, now })`
- `setSkipped(s, { stepId, skipped })`
- `reset(s)`（シナリオを残して idle。展開をやり直して延長・飛ばし・所要を消す）

**状態 × 操作は設計 §4.6 の表のとおり**。拒むときのコード:

| 操作 | idle | running | paused | finished |
|---|---|---|---|---|
| replaceScenario | ok | `AGENDA_IN_PROGRESS` | `AGENDA_IN_PROGRESS` | `AGENDA_FINISHED` |
| start | ok／ステップ 0 なら `AGENDA_EMPTY` | `AGENDA_ALREADY_STARTED` | 同左 | 同左 |
| next | `AGENDA_NOT_STARTED` | 進む（ID 違いは同じ参照） | 進み、次は running で始まる（J19） | 同じ参照 |
| pause / resume | `AGENDA_NOT_STARTED` | pause: paused へ／resume: 同じ参照 | resume: running へ／pause: 同じ参照 | 同じ参照 |
| extend | `AGENDA_NOT_STARTED` | 足す（ID 違いは同じ参照）。持ち時間が 14400 秒を超えたら `STEP_BUDGET_EXCEEDED` | 同左 | 同じ参照 |
| setSkipped | `AGENDA_NOT_STARTED` | まだのステップだけ。いま・済みは `STEP_NOT_SKIPPABLE`、無い ID は `STEP_NOT_FOUND` | 同左 | `AGENDA_FINISHED` |
| reset | 同じ参照 | idle へ | idle へ | idle へ |

- 「次へ」で終えたステップの `spentMs` は `now - stepStartedAt`（**一時停止を含む**・J5）。次の飛ばしていないステップへ移り、無ければ `finished`（`finishedAtMs = now - startedAt`）
- 一時停止は `accumulatedMs += now - runningSince`・`runningSince = null`。再開は `runningSince = now`

- [ ] **Step 1: 赤いテスト**（時計は数値で渡す）
  - 表の各マスを 1 本ずつ（拒むものはコード、同じ参照のものは `toBe` で）
  - **2 回目の `next` を同じ `stepId` で送ると、1 回目の後のステップのまま（同じ参照）**〈m430〉
  - **ID 違いの `extend` は何も変えない**〈m434〉
  - **paused で `next` → 次のステップの `runningSince === now`・phase は running**〈m435〉
  - **running 中の `replaceScenario` は `AGENDA_IN_PROGRESS`**〈m437〉
  - 残りをすべて飛ばした後の `next` で finished
  - 同じ `stepId` への `extend` 3 分を 2 回 → `extensionSec === 360`（両方足す・J7）
  - 持ち時間が 14400 秒を超える `extend` は `STEP_BUDGET_EXCEEDED`（ちょうど 14400 は通る）
  - 飛ばしたステップの `spentMs` は、そのステップを通り過ぎた時点で 0 になる
- [ ] **Step 2:** 赤を見る → 実装 → 緑
- [ ] **Step 3:** コミット

### Task 1.5: 見込み・期限・自動で次へ・wire の写し

**Files:** Create `src/projection.ts`・`tests/projection.test.ts`・`tests/agenda-invariant.test.ts`。Modify `src/agenda.ts`

**Interfaces（Produces）:**
- `agenda.ts`: `deadlineOf(s): number | null`（running で、いまのステップの計時が持ち時間に達する単調時計の時刻。paused・idle・finished は null）・`advanceIfDue(s, now): AgendaState`（いまのステップが `advance` で `deadlineOf(s) <= now` なら、**期限ちょうど**で前を確定して次へ。次も期限を過ぎていれば繰り返す。`wait` なら同じ参照）・`toView(s, now): AgendaView`
- `projection.ts`（`AgendaView` だけを読む純粋関数。画面とテストが使う）: `advanceView(v, deltaMs): AgendaView`（running なら 3 つの経過すべて、paused なら `runElapsedMs`・`stepSpentMs` だけを進める。idle・finished は同じ値）・`budgetMs(step)`・`remainingMs(v)`・`overrunMs(v)`・`projectedEndMs(v)`・`driftMs(v)`（= `projectedEndMs − 予定の合計`）・`plannedTotalMs(v)`・`summaryOf(v): { rows: { id, name, plannedMs, extensionMs, spentMs, diffMs, skipped }[]; driftMs: number }`

式は設計 §4.1 のとおり。終了の行の `diffMs = spentMs − plannedMs`（飛ばした行は `−plannedMs`）。

- [ ] **Step 1: 赤いテスト** `tests/projection.test.ts`（KPT で値を具体的に書く）
  - P の途中（開始から 600 秒・P の計時 300 秒）で +3 分 → `driftMs === 180_000`
  - Try を飛ばすと `driftMs === −2_400_000`（2400 秒の巻き）〈m432〉
  - 投票（60 秒）で計時 90 秒 → `remainingMs === −30_000`・`overrunMs === 30_000`
  - 一時停止の 600 秒の間に `advanceView` すると `remainingMs` は変わらず `driftMs` が 600 秒増える
- [ ] **Step 2: 赤いテスト** `tests/agenda.test.ts` に追記
  - `advance` のステップで、期限から 900ms 遅れて `advanceIfDue` → 次のステップの `stepStartedAt === 期限`（発火時刻ではない）〈m433〉
  - `wait` のステップでは期限を過ぎても同じ参照
  - `toView` の経過が `now` から計算され、単調時計の値（`startedAt` など）を出力に**持たない**（`Object.keys` で見る）
- [ ] **Step 3: 赤いテスト** `tests/agenda-invariant.test.ts`（性質テスト。乱数は種つきの自前の LCG で 500 通り。依存を足さない）
  - 任意の操作の列（next・pause・resume・extend・setSkipped・時計を進める）の後で、**終えたステップの `spentMs` の合計 ＋ いまの `stepSpentMs` ＝ `runElapsedMs`**〈m431〉
  - 終了後、`summaryOf(v).rows` の `diffMs` の合計 ＝ `summaryOf(v).driftMs`
  - オラクルは `projection.ts` を使わず、操作の列からテストの中で足し上げる
- [ ] **Step 4:** 赤を見る → 実装 → 緑。`index.ts` に公開記号を列挙する（`export *` を書かない）
- [ ] **Step 5:** コミット

### Task 1.6: 検査の登録

**Files:** Modify `scripts/audit-dependency-direction.mjs`（`ALLOWED` に `"packages/agenda-core": []`）ほか、**実行して赤になったもの**（ルーレットの PR 1 では `audit-structure.mjs` と自己テスト・`audit-domain-side-effects.mjs`・`audit-domain-error-shape.mjs`・`audit-log-hygiene.mjs`）

- [ ] **Step 1:** 足す前に流して赤を見る:
  ```bash
  bash -c 'set -euo pipefail; targets="$(node scripts/list-scan-targets.mjs script-tests)"; node --test $targets'
  for s in audit-structure audit-dependency-direction audit-domain-side-effects audit-domain-error-shape audit-log-hygiene audit-assembly-wiring audit-public-surface; do node scripts/$s.mjs || echo "RED $s"; done
  ```
- [ ] **Step 2:** 赤になったものだけ足す → 同じコマンドで全部緑
- [ ] **Step 3:** コミット

### Task 1.7: 変異 m430〜m437

- [ ] **Step 1:** §6 の表の m430〜m437 のパッチを書き、宣言を足す。1 本ずつ当てて赤・戻して緑を見る（取り決めの手順）
- [ ] **Step 2:** コミット

### Task 1.8: ADR 0027 と分類

**Files:** Create `docs/adr/0027-agenda-timer.md`（`docs/adr/template.md` の形。ADR 0026 の構成を型にする）。Modify `docs/adr/README.md`・`docs/adr/0017-bounded-contexts-and-packages.md`（末尾に追記節「文脈を 6 つにする」）・`docs/adr/0011-threat-model-and-data-classification.md`（決定 1 の「個人に紐づく」の行に「進行タイマーのステップの名前・会の名前（#429）」を足し、**末尾**に #429 の追記節: S3・S7 の範囲に agenda のコマンドが入ること・頻度の上限を設けないこと〔J16〕）

- ADR 0027 の決定: ①独立の文脈と `?tool=agenda`（J1）②自動で次へ移す判断はサーバー・期限は専用の予約と単調時計（設計 §5.2）③経過を配る（J9）④区切りの ID で操作を指し、ID 違いは何もしない（設計 §4.6）⑤長さを秒で持つ・定義と展開を分ける（設計 §5.1）⑥一時停止を所要に含める（J5）⑦直接遷移関数 ＋ `Result`（`docs/adr/0016` 決定 1 の記録）⑧agenda のコマンドは agenda の接続だけ（ADR 0026 決定 7 と同じ）⑨お題を agenda の接続にも配る（ADR 0021 決定 2）
- 退けた案: timer のモード／timer の `Scheduler` の共有／`WallClock` の期限／絶対時刻（`endsAt`）を配る／位置（添字）で操作を指す／延長を予備から自動で削る（J17）
- **完了形を書くのは PR 1 が入れた範囲だけ**（core と wire）。サーバー・画面は「PR 2・3 で入れる」と書く

- [ ] **Step 1:** 書く → `node scripts/check-links.mjs`
- [ ] **Step 2: PR 1 の終わり**: `pnpm test`・`pnpm typecheck`・`pnpm lint`・scripts の自己テストと全 audit。統括へ変異の全件と PR の作成を依頼

---

## PR 2 — 同期サーバーの経路（変異 m438〜m443）

### Task 2.1: ツール ID・接続の振り分け・送り口

**Files:** Modify `apps/tasuki-sync/package.json`（`@tasuki/agenda-core` を足す。**足したら統括に lockfile を依頼して止まる**）・`src/application/tool-id.ts`（`TOOL_AGENDA = "agenda"`）・`src/adapters/ws/connection-gate.ts`（`?tool=agenda` を振り分ける）・`src/adapters/ws/tool-channel.ts`（agenda の受け口。**`notifiesConnect` を false にしない**）・`src/adapters/ws-adapter.ts`（`options.agenda`・`sendAgenda(connId, msg)`・`broadcastAgenda(connIds, msg)`）・`src/application/log/vocabulary.ts`（`PROTOCOL_LOG_NAMES.agenda`）・`src/ports/agenda-server-msg.ts`（`roulette-server-msg.ts` を写す: `AgendaServerMsg = { type: "agenda"; state: AgendaView } | { type: "error"; code: AgendaErrorCode; message: string }` と `AgendaOwnFrame`）・`test/support/{test-ws-adapter,live-sync-server}.ts`

- [ ] **Step 1: 赤いテスト** `test/ws-adapter-tool-query.test.ts` に「`?tool=agenda` は agenda の層へ届く（timer・ハブ・ルーレットの層へ届かない）」。`test/ws-adapter.message.test.ts` に「agenda の層のサイズ超過は `MESSAGE_TOO_LARGE`」「agenda のハンドラが同期 throw しても接続もプロセスも落ちず `INTERNAL_ERROR`」（ルーレットの同名テストを写す）
- [ ] **Step 2:** 赤を見る → 実装 → `pnpm --filter @tasuki/sync test -- test/ws-adapter-tool-query.test.ts test/ws-adapter.message.test.ts`
- [ ] **Step 3:** コミット

### Task 2.2: 保管と期限の予約と破棄

**Files:** Create `src/ports/agenda-store.ts`・`src/adapters/in-memory-agenda-store.ts`（roulette-store を写す: `get`・`put`・`delete`）・`src/application/agenda-deadlines.ts`・`test/in-memory-agenda-store.test.ts`・`test/agenda-deadlines.test.ts`。Modify `src/application/destroy-room.ts`・`test/destroy-room.test.ts`・`test/support/{room-builder,spy-destroyer}.ts`

**Interfaces（Produces）:**
```ts
// agenda-deadlines.ts
export interface TimerPort { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void }
export interface AgendaDeadlines {
  arm(roomCode: string, atMs: number, onDue: (roomCode: string) => void): void; // 前の予約は上書き
  clear(roomCode: string): void;
  clearAll(): void;
}
export function makeAgendaDeadlines(deps: { clock: MonotonicClock; timer: TimerPort }): AgendaDeadlines;
```
- `Scheduler`（`schedule.ts`）の「最大 1000ms 刻みで待ち、毎回残りを計算し直す」を写す。**`WallClock` を受けない**
- `RoomDestroyerDeps` に `agendas: Pick<AgendaStore, "delete">` と `agendaDeadlines: Pick<AgendaDeadlines, "clear">` を**必須**で足す（`rounds` などと同じ「optional にしてはならない」の注記を付ける）

- [ ] **Step 1: 赤いテスト** `test/agenda-deadlines.test.ts`（偽の時計と偽の `TimerPort`）—— 期限ちょうどに 1 回だけ呼ぶ・上書きで前の予約が呼ばれない・`clear` 後は呼ばれない・偽の時計を 2500ms 進めても 1000ms 刻みで計算し直して期限に呼ぶ・**同じルームコードで timer の `Scheduler` に予約しても agenda の予約が消えない**（別インスタンスであること）
- [ ] **Step 2: 赤いテスト** `test/destroy-room.test.ts` に「破棄の後に agenda の状態が無く、agenda の予約が消えている」〈m439〉
- [ ] **Step 3:** 赤を見る → 実装 → 緑 → コミット

### Task 2.3: 配信

**Files:** Create `src/application/agenda-broadcast.ts`（`roulette-broadcast.ts` を写す）

**Interfaces（Produces）:** `makeAgendaBroadcaster(deps: { store: Pick<RoomStore,"get">; agendas: AgendaStore; clock: MonotonicClock; send(connIds: string[], msg: AgendaServerMsg): void }): AgendaBroadcaster`・`AgendaBroadcaster { publish(roomCode): void; sendCurrent(connId, roomCode): void }`。`toView(state, clock.now())` で**送る時点で**経過を計る

- [ ] **Step 1:** 赤いテストは Task 2.4 の `agenda-handlers.test.ts` が兼ねる（ルーレットと同じ）。型が通ること
- [ ] **Step 2:** コミット

### Task 2.4: メッセージ層

**Files:** Create `src/application/agenda-handlers.ts`・`test/agenda-handlers.test.ts`（`roulette-handlers.test.ts` の作りを写す。偽の時計・偽の予約・偽の送信・偽のロガー）

**Interfaces（Produces）:** `makeAgendaHandlers(deps: AgendaHandlerDeps): { handleMessage(connId, raw): Promise<void>; onDue(roomCode): void }`。`AgendaHandlerDeps extends JoinRoomDeps, SaveRosterDeps` に `agendas`・`broadcaster`・`send`・`monotonicClock`・`deadlines`・`logger`

組み立て（`roulette-handlers.ts` と同じ骨）:
- 受ける言葉は `v.union([HubCommandSchema, AgendaCommandSchema])`。`room.join` は `joinToolRoom(…, tool: TOOL_AGENDA, afterJoin: sendCurrent)`。`room.create`・`room.check` は拒む
- ルームは `findRoomByToolConnection(store, connId, TOOL_AGENDA)`。無ければ `NOT_IN_ROOM`
- 遷移の結果が `Err` → 送り主へエラー。同じ参照 → **送り主にだけ `sendCurrent`**。変わった → `commit`（保管 → `publish`）→ **`rearm(roomCode)`**
- `rearm`: `deadlineOf(state)` があり、いまのステップが `advance` なら `deadlines.arm(roomCode, at, onDue)`、それ以外は `clear`
- `onDue(roomCode)`: `advanceIfDue(state, monotonicClock.now())`。変わったら `commit` と `rearm`
- `agenda.sync` は `sendCurrent` だけ
- ハンドラはログを書かない

- [ ] **Step 1: 赤いテスト**
  - 参加すると本人に `agenda` フレームが 1 通（状態が無ければ既定を置く）
  - **途中参加（偽の時計を 125_000ms 進めた後）に届く `runElapsedMs` が 125_000**〈m443〉
  - `advance` のステップで開始 → 偽の予約に期限が張られる。`extend` で期限が 60_000ms 後ろへ張り直される → `onDue` を元の期限で呼んでも進まず、新しい期限で呼ぶと進む〈m440〉
  - pause で予約が消え、resume で張り直される
  - ID 違いの `agenda.next` は全員へは配らず、送り主にだけ 1 通
  - ハブとして在席している接続の `agenda.start` は `NOT_IN_ROOM`
  - ステップの名前を入れて一通り操作した後、偽のロガーの記録が空
- [ ] **Step 2:** 赤を見る → 実装 → `pnpm --filter @tasuki/sync test -- test/agenda-handlers.test.ts`
- [ ] **Step 3:** コミット

### Task 2.5: 合成ルートの配線と実 WS の検査

**Files:** Modify `src/create-sync-server.ts`（ストア・期限の予約〔`setTimeout` / `clearTimeout` を包んだ `TimerPort`〕・ブロードキャスタ・ハンドラ・`options.agenda`・破棄の依存・終了時の `agendaDeadlines.clearAll()`）・`src/application/topic-broadcast.ts`（`TOPIC_RECIPIENT_TOOLS` に `TOOL_AGENDA`）。Create `test/live-ws.agenda.test.ts`（`live-ws.roulette.test.ts` を型にする）

名簿の配信先（`rosterRecipientsOf`）には**足さない**【計画の判断】（第 1 段の画面は名簿を使わない。設計 §10 で実装者に任された点）

- [ ] **Step 1: 赤いテスト** `test/live-ws.agenda.test.ts`
  - agenda の接続 2 本が同じルームに参加し、片方の `agenda.scenario.set` → `agenda.start` が両方に同じ `currentId` で届く。ハブ・timer・poker・お題・ルーレットの接続には `agenda` フレームが届かない
  - **2 本からほぼ同時に同じ `stepId` の `agenda.next` を送ると、`currentId` は 1 つだけ進む**〈m430 の配線側〉
  - **ハブ・timer・poker・お題・ルーレットの接続から送った `agenda.start` は拒まれ、agenda の状態が idle のまま**〈m438。5 種すべて〉
  - お題ツールで `topic.set` すると agenda の接続にも `topic` が届く〈m441〉
  - agenda の接続で誤った合言葉の `room.join` を続け、**接続を張り直しても**枠が続く〈m442〉
- [ ] **Step 2:** 赤を見る → 実装 → `pnpm --filter @tasuki/sync test`（全件）・`node scripts/audit-assembly-wiring.mjs`・`node scripts/audit-log-hygiene.mjs`
- [ ] **Step 3:** 変異 m438〜m443 を足して 1 本ずつ赤を見る。触ったファイルの既存パッチが当たるかを確かめる（§6 の後半）
- [ ] **Step 4:** ADR 0027 の「PR 2 で入れる」を完了形に直す（入れた範囲だけ）→ コミット。統括へ変異の全件と PR の作成を依頼

---

## PR 3 — 画面 `apps/agenda-web`（変異 m444〜m448・m450）

### Task 3.0: 盤のモックと利用者の確認（統括）

- 統括が `scratchpad/agenda-mock/index.html` に静的なモックを作る。設計 §7.2 の盤の文法・§7.4 の色と形・§7.6 の文言で、次の 6 つの盤を並べる: 開始前・P の途中で予定どおり・一時停止中・Try で +3 分延長して押し・予備を飛ばして巻き・1 周を超えてオーバー。加えて手元 375px と映す表示 1920px、**案 A（フェルトの盤）と案 B（象牙のエナメル盤）**
- Fraunces の自己ホストのサブセットに `tnum` が残っているかをモックで実測する（設計 §7.3）
- **利用者に見せて決める**: 案 A／B、字の段の値、針の形。決まった値を設計正本 §7 の末尾に追記する（**追記は末尾へ**）
- **ここで決まるまで Task 3.3 の盤の部品に入らない。** Task 3.1・3.2・3.4・3.5 は先に進めてよい

### Task 3.1: アプリの骨組み

**Files:** roulette-web から写す（ファイルの地図の「骨組み」）。`vite.config.ts` は `base: '/agenda/'`・`port: 5178`。`index.css` の先頭は `@import '@tasuki/ui';`（Tailwind は使わない）。`package.json` の依存は roulette-web から `@tasuki/roulette-core` を `@tasuki/agenda-core` に替える。**足したら統括に lockfile を依頼して止まる**

- [ ] **Step 1: 赤いテスト** `tests/router.test.ts`（`/agenda/?room=X` → room・それ以外 → 玄関）・`tests/server-message.test.ts`（`topic` → `agenda` → ハブの順に見分け、どれでもなければ `null`。**`topic` を先に見分ける**: ADR 0021 決定 2 の MUST）
- [ ] **Step 2:** 赤を見る → 写す → `pnpm --filter @tasuki/agenda-web test`・`typecheck`
- [ ] **Step 3:** コミット

### Task 3.2: 同期フックと手元の時計

**Files:** Create `src/hooks/use-agenda-sync.ts`（`use-roulette-sync.ts` を写す。`useToolRoomSync` を使う）・`src/hooks/use-local-clock.ts`・`tests/use-agenda-sync.test.tsx`・`tests/use-local-clock.test.tsx`

**Interfaces（Produces）:**
- `useAgendaSync(): AgendaSync`。`AgendaSync` はルーレットの `RouletteSync` の接続まわりの項目 ＋ `agenda: AgendaView | null`・`receivedAt: number`（**`agenda` フレームを受けるたびに** `performance.now()`）・`topic: TopicState | null`・操作 `setScenario(input)`・`start()`・`next(stepId)`・`pause()`・`resume()`・`extend(stepId, minutes)`・`setSkipped(stepId, skipped)`・`reset()`
- `useLocalClock(view: AgendaView | null, receivedAt: number, reducedMotion: boolean): AgendaView | null` —— `advanceView(view, performance.now() − receivedAt)` を返す。動きを減らす設定では 1 秒ごと、それ以外は rAF で描き直す。アンマウントで止める

- [ ] **Step 1: 赤いテスト**
  - `use-agenda-sync`: 参加・告知・抜けたら玄関へ（写し）。**`visibilitychange` で `document.visibilityState === 'visible'` に戻ったとき `agenda.sync` を 1 通送る**（`hidden` のときは送らない）〈m448〉
  - `use-local-clock`: 偽の `performance.now()` を 5000ms 進めると running の `stepTimerMs` が 5000 増え、paused では増えずに `runElapsedMs` だけ増える
- [ ] **Step 2:** 赤を見る → 実装 → 緑 → コミット

### Task 3.3: 盤の幾何と見え方（純粋関数）と盤の部品

**Files:** Create `src/dial-geometry.ts`・`src/agenda-view.ts`・`src/timeout-signal.ts`・`src/components/Dial.tsx`・`tests/{dial-geometry,agenda-view,timeout-signal,dial}.test.ts(x)`

**Interfaces（Produces）:**
- `dial-geometry.ts`: `angleOfMs(ms, plannedTotalMs): number`（0° = 12 時・時計回り・度）・`outerSegments(v): { id, startDeg, endDeg, skipped }[]`（開始時の長さで割る。延長・飛ばしで変えない）・`innerSegments(v): { id, startDeg, endDeg, extensionStartDeg: number | null }[]`（所要で伸びる。1 周で頭打ち）・`needleDeg(v)`（`runElapsedMs` の角度。1 周で頭打ち）・`projectedMarkerDeg(v)`・`overrunTrackDeg(v): number`（12 時を超えた分。0〜360）
- `agenda-view.ts`: `centerLines(v): { primary: string; isOverrun: boolean; name: string; drift: string }`（`+m:ss`・`予定より +3 分`／`予定より −2 分`／`予定どおり`）・`footerLine(v, wallNow: Date): string`（次のステップの名前と「15:02 に終了見込み」）・`stepRows(v)`（進行表の行: いま・済み・スキップ・まだ）・`summaryText(v)`（読み上げの要約）
- `timeout-signal.ts`: `crossedZero(prev: AgendaView | null, next: AgendaView): boolean` —— **同じステップで `remainingMs` が正から 0 以下へ移ったときだけ** true。`prev` が null（最初の描画・再接続）なら false。ステップが変わった直後も false（自動で次へ移ったときの合図は、前のステップで 0 をまたいだ側で出す）
- `Dial.tsx`: SVG・`aria-hidden`・`focusable="false"`。外の環・内の環・針・竜頭・終了見込みの印・オーバーの軌道・6 時のスモールセコンド。値は `dial-geometry` からだけ取る。見た目の値は Task 3.0 で決まったもの

- [ ] **Step 1: 赤いテスト**
  - `dial-geometry`: **任意の操作の列（Task 1.5 の性質テストの生成器を写す）の後で、`needleDeg` と内の環の最後の区画の `endDeg` が一致する**（1 周以内のとき）〈m447〉。延長しても `outerSegments` が変わらない。飛ばしたステップの区画は `skipped: true` で残る。実時間が予定の合計の 1.25 倍なら `overrunTrackDeg === 90`
  - `agenda-view`: オーバー中の `primary` が `+0:30` で始まり `isOverrun`〈m446〉・`drift` の 3 通り・名前が 40 字でもそのまま返す（切り詰めは CSS の 2 行）
  - `timeout-signal`: 最初の描画（prev が null）で残り −5 秒でも false〈m444〉・正 → 0 で true・延長で正に戻ってから再び 0 で true（J20）・ステップが変わった直後は false
  - `dial`: 動きを減らす設定でも針の要素が描かれる〈m450〉
- [ ] **Step 2:** 赤を見る → 実装 → 緑 → `node scripts/audit-ui-components.mjs`・`pnpm --filter @tasuki/ui test`
- [ ] **Step 3:** コミット

### Task 3.4: 端末の保存とサンプル

**Files:** Create `src/storage/saved-scenarios.ts`・`src/sample-scenarios.ts`・`tests/saved-scenarios.test.ts`

**Interfaces（Produces）:**
- 鍵は `tasuki.agenda.scenarios`。中身は `{ version: 1, items: { name: string; savedAt: number; scenario: ScenarioInput }[] }`（`savedAt` は表示の並びにだけ使う）
- `loadSaved(storage: Storage): SavedScenario[]`・`saveScenario(storage, name, scenario): SavedScenario[]`（同じ名前は上書き）・`deleteSaved(storage, name)`
- 読むときは版ごとのスキーマ（第 1 段は `version: 1` だけ）で検証し、`migrations: Record<number, (raw: unknown) => unknown>` で最新の形へ移す。**どの版のスキーマにも合わない項目だけを読み飛ばす**。JSON が壊れていたら空の一覧（落ちない）
- `SAMPLE_SCENARIOS: readonly { label: string; scenario: ScenarioInput }[]` —— 1 件「KPT のふりかえり」: K を出す 300・P を出す 420・投票 60・Try の議論 2400・予備 420、全部 `wait`（J3）

- [ ] **Step 1: 赤いテスト**
  - 保存して読み直すと同じ。同じ名前は上書き
  - **`version: 0` の形（テスト用に `ScenarioInput` の `durationSec` を `durationMin` で持つ偽の旧版を作り、`migrations[0]` を差し込む）を読むと新しい形に移って返る（消えない）**〈m445〉
  - 項目の 1 つが壊れていても他は読める。JSON が壊れていたら空
  - サンプルが `ScenarioInputSchema` を通り、合計が 3600 秒
- [ ] **Step 2:** 赤を見る → 実装 → 緑 → コミット

### Task 3.5: 組む画面

**Files:** Create `src/components/{ScenarioBuilder,StepEditorRow,SavedScenarioList}.tsx`・`tests/scenario-builder.test.tsx`

振る舞い（設計 §4.2）:
- 下書きは画面の状態。**ルームのシナリオが変わっても下書きを上書きしない**。下書きとルームのシナリオが違うときだけ「ルームに読み込む」が押せる。他の人の置き換えを受けたら「シナリオが変わりました」を `role="status"` で出す
- ルームのシナリオが空で下書きも空なら、サンプルの札を一番上に大きく出す（1 回で下書きに読み込む）
- 行: 名前・分（−／＋ のボタン 44px 以上と数字の欄）・「押すまで待つ／自動で次へ」・上へ／下へ・削除。行の追加
- プレビュー: 合計の分数と「hh:mm に終了見込み」を大きく出す（`Dial` の開始前の姿を使う）
- 入力の検証は `ScenarioInputSchema` で行い、通らなければ「ルームに読み込む」を押させず理由を出す
- 保存済みの一覧: 名前・合計の分数・ステップ数を 1 行。選ぶと下書きに読み込む。保存は名前を付けて

- [ ] **Step 1: 赤いテスト**
  - **下書きを編集中に別の `agenda` フレームでシナリオが変わっても、下書きの名前が残り、「シナリオが変わりました」が出る**
  - 名前に改行を貼り付けると「ルームに読み込む」が押せない・空白だけも同じ・41 字目は入らない
  - サンプルを押すと 5 行・合計 60 分
  - 「ルームに読み込む」で `agenda.scenario.set` が 1 通、入力どおりの秒で送られる
- [ ] **Step 2:** 赤を見る → 実装 → 緑 → コミット

### Task 3.6: 進める画面・映す表示・終了の一覧・音

**Files:** Create `src/screens/AgendaRoom.tsx`（phase で組む画面／進める画面／終了の一覧を出し分ける）・`src/components/{RunControls,StepList,SummaryTable,ProjectionView,SoundToggle}.tsx`・`src/platform/sound.ts`・`src/hooks/use-reduced-motion.ts`（roulette-web を写す）・`tests/{agenda-room,projection-view,summary-table}.test.tsx`

- `platform/sound.ts`: timer-web の `installAudioUnlock`・`scheduleTones` と時打ちの音 1 つだけを写す（`playStrike()`）。**共通化しない**（原則 X。ファイルの冒頭に「timer-web の写し。3 つ目の利用者が来たら共通化を検討」と書く）
- `SoundToggle`: 「音あり／音なし」。既定は音なし。押すと解錠して音ありにする。端末の localStorage `tasuki.agenda.sound` に覚える（J14）
- 合図: `crossedZero` が true のときだけ、音ありなら `playStrike()`、画面は時打ちのクラスを 600ms 付ける（動きを減らす設定では付けない）
- `RunControls`（手元の固定帯）: 「次へ」（主・大）・一時停止／再開・群の見出し「このステップに」と +1 / +3 / +5 分。「スキップ」は `StepList` のまだのステップの行にだけ置く。「最初から」は危険の役割で確認「最初からやり直しますか」
- `ProjectionView`: 設計 §7.5 の残すもの・落とすもの。キーボード Space・→・Esc。マウスを動かしたときだけ操作帯を 3 秒
- `aria-live="polite"` の領域に流すのは 4 種だけ（設計 §7.7）。盤の要約は `summaryText` を視覚的に隠した文で持つ
- 終了: `SummaryTable` に `summaryOf` の行（予定・延長・かかった時間・差）と合計の押し巻き

- [ ] **Step 1: 赤いテスト**
  - 進行中に「次へ」を押すと、いまの `currentId` を載せた `agenda.next` が送られる（古い ID を送らない）
  - 「このステップに +3 分」で `agenda.extend` の `minutes: 3`
  - 「スキップ」はまだのステップの行にだけあり、いまの行・済みの行に無い
  - **再接続で受けた最初のフレームが残り −5 秒でも音を鳴らさない**（`playStrike` の偽物が呼ばれない）・正から 0 へ移ったときに 1 回
  - 映す表示で `ArrowRight` を押すと `agenda.next`・`Space` で一時停止
  - `aria-live` の領域の文が、残りの毎秒の更新では変わらない
  - 終了の表の差の合計の行が `summaryOf(v).driftMs` と同じ表記
- [ ] **Step 2:** 赤を見る → 実装 → 緑 → `tests/copy-fits-font-base.test.ts`・`tests/rendered-text-fits-font-base.test.tsx`・`tests/screens-do-not-import-sync-client.test.ts`・`node scripts/audit-ui-components.mjs`・`node scripts/audit-web-sync-boundary.mjs`
- [ ] **Step 3:** 変異 m444〜m448・m450 を足して 1 本ずつ赤を見る → コミット
- [ ] **Step 4: PR 3 の終わり**: `pnpm test`・`pnpm typecheck`・`pnpm lint`・全 audit・`pnpm --filter @tasuki/ui test`。統括へ変異の全件と PR の作成を依頼

---

## PR 4 — 玄関・配備・E2E・文書（変異 m449）

### Task 4.1: 玄関の 5 枚目の札と dev の中継

**Files:** Modify `apps/landing/src/tools.ts`（`id` に `"agenda"`・pip は base 層の 2〜3 字で実測して決める〔候補「進行」〕・名前「Agenda Timer」・一行「ステップを順に計って進める」〔base 層で実測〕・`href: "/agenda/"`・`mark: "watch"`）・`src/ToolMark.tsx`（`watch`: 円・12 時の竜頭・2 本の針。線の太さ 2.5）・`src/index.css`（5 枚で崩れる箇所だけ）・`vite.config.ts`・`packages/dev-hub-redirect/{src/index.ts,README.md}`

- [ ] **Step 1: 赤いテスト** `tests/tool-public-paths.test.ts`（`/agenda/` も突き合わせる。`deploy/agenda` が無いので赤）・`room-choice-layout.test.tsx` に「agenda に居る人は Agenda Timer と出る」〈m449〉・`dev-hub-redirect-wiring.test.ts`
- [ ] **Step 2:** 赤を見る → 実装 → `pnpm --filter @tasuki/landing test` → コミット

### Task 4.2: 配備資材と検査の登録

**Files:** Create `deploy/agenda/{app.env,NOTES.md,caddy/60-agenda.conf}`（`deploy/roulette` を写す。`NOTES.md` に「配布前の本番へ `e2e:prod` の `@core` を当てると落ちる」）。Modify `deploy/README.md`・`deploy/caddy/{README.md,tasuki.conf}`・`deploy/deploy.sh`（ルーレットが触った箇所）・`scripts/audit-dependency-direction.mjs`（`apps/agenda-web` の欄）・`scripts/audit-web-sync-boundary.mjs` と自己テスト・`turbo.json`・`e2e/harness/paths.ts`・`e2e/package.json`・`e2e/tests/{workspace,fragment-sources}.test.ts`

- [ ] **Step 1:** scripts の自己テスト＋全 audit（Task 1.6 のコマンド）・`pnpm --filter @tasuki/e2e test`（ハーネスの単体。ブラウザは起動しない）で赤を見る → 足す → 緑 → コミット

### Task 4.3: E2E —— 新しいルームは 1 つだけ

**Files:** Create `e2e/support/agenda.ts`（`openAgendaTool(page, name)`・`joinAgendaTool(page, url, name)`。`support/roulette.ts` を写す）・`e2e/specs/agenda.spec.ts`。Modify `e2e/specs/{routing,landing,landing-design,buttons}.spec.ts`

- `agenda.spec.ts`: `test.describe('@core 進行タイマーは全員の画面で同じステップを進める')` の 1 本・**ルーム 1 つ**
  - A がルームを作って agenda を開き、サンプルを読み込んで「ルームに読み込む」→ 開始。B が招待 URL で参加して agenda を開く
  - A と B の盤の中央の名前が「K を出す」で一致。B が「次へ」→ A も「P を出す」
  - **A と B がほぼ同時に「次へ」を押しても、両方「投票」で止まる（「Try の議論」へ飛ばない）**
  - A が「このステップに +3 分」→ B の「予定より」が `+` になる
  - A が予備を「スキップ」→ B の進行表で予備がスキップの印
  - コンソールのエラーが 0
  - **時間切れ（1 分）は待たない**（実時間の待ちは Task 2.5 の偽の時計の検査が持つ）
- `routing.spec.ts` の `@smoke` に `/agenda/` の配信と `/agenda` → `/agenda/` の転送。`landing.spec.ts` の札の遷移に 5 枚目（既存のテストの中で）。`landing-design.spec.ts` の札の枚数 4 → 5
- `buttons.spec.ts` の既存のルームの中で agenda を開き、`expectScreenAcrossWidths(page, '進行タイマー（組む）', …)`・進行中・映す表示を 320・768・1280・1920 で（**ルームの増分 0**）。止まった画面に `scanContrast`・`expectReadable`・`expectFocusVisibleOnTab`
- **ルームの増分は +1**。`@core` は describe の先頭（`e2e/tests/spec-tags.test.ts`）
- [ ] **Step 1:** `pnpm --filter @tasuki/e2e test`（タグと配線の単体）→ コミット。**E2E の実行は統括**

### Task 4.4: 実画面検証（統括と利用者）

- 統括が流す: 2 つのブラウザで同じルーム・KPT のサンプルを 1 分単位に縮めたシナリオで「押すまで待つ」と「自動で次へ」の時間切れを実時間で見る・同時に「次へ」・一時停止 5 分・タブを隠して戻す・映す表示 1920px・手元 375px・動きを減らす設定
- **利用者に見せる**: 撮影とモック（Task 3.0）との差。直しは同じ PR の中で（Issue を増やさない）

### Task 4.5: 文書の残り

**Files:** Modify `README.md`（ツールの一覧）・`docs/guides/{architecture,development}.md`（ポート 5178・`/agenda/`）・`packages/ui/README.md`（利用側の表）・設計正本の末尾に「実装で実測して外したこと」・ADR 0027 の残りを完了形に。Create `docs/retrospectives/2026-10-XX-issue-429-agenda-timer.md`

- [ ] **Step 1:** `node scripts/check-links.mjs`・`pnpm test`・`pnpm typecheck`・`pnpm lint`・全 audit → コミット。統括へ変異の全件・E2E の全件・`/code-review <番号>`

---

## 5. 文言（書体の base 層で実測済み・2026-10-20）

画面の固定文言はこの表から取る。足す・変えるときは `apps/roulette-web/tests/support/font-base.ts` の `outsideBase` で実測してから。

| 場所 | 文言 |
|---|---|
| ツールの名前 | 進行タイマー |
| 主の操作 | 開始・次へ・一時停止・再開・最初から |
| 延長 | このステップに・+1 分・+3 分・+5 分 |
| 飛ばす | スキップ・戻す |
| 時間切れの振る舞い | 押すまで待つ・自動で次へ |
| 盤 | オーバー・予定より +3 分・予定より −2 分・予定どおり・一時停止中・15:02 に終了見込み |
| 組む画面 | ステップを追加・上へ・下へ・分・サンプル：KPT のふりかえり・この端末に保存・ルームに読み込む・シナリオが変わりました |
| 確認 | 最初からやり直しますか |
| 終了 | かかった時間・予定 |
| 音 | 音あり・音なし |
| エラー（`agendaErrorMessageFor`） | 実装役が base 層で組み、Task 1.3 のテストで守る |

**この表の文言も、実装役が `outsideBase` に 1 度当ててから使う**（計画を書いた時点の実測は単語ごと。組み合わせた文で新しい字が入らないことを確かめる）。

## 6. 変異の割り当て

**ID の帯は 430〜450**（着手時に台帳で空きを確かめる）。

| ID | 名前（パッチのファイル名の後半） | 足すタスク | パッケージ | 赤になるテスト |
|---|---|---|---|---|
| m430 | next-ignores-step-id | 1.4（2.5 でも赤） | agenda-core | `tests/agenda.test.ts` |
| m431 | spent-excludes-pause | 1.5 | agenda-core | `tests/agenda-invariant.test.ts` |
| m432 | projection-counts-skipped | 1.5 | agenda-core | `tests/projection.test.ts` |
| m433 | auto-advance-starts-at-fire-time | 1.5 | agenda-core | `tests/agenda.test.ts` |
| m434 | extend-ignores-step-id | 1.4 | agenda-core | `tests/agenda.test.ts` |
| m435 | next-while-paused-stays-paused | 1.4 | agenda-core | `tests/agenda.test.ts` |
| m436 | command-schema-loosened | 1.3 | agenda-core | `tests/schemas.test.ts` |
| m437 | replace-allowed-while-running | 1.4 | agenda-core | `tests/agenda.test.ts` |
| m438 | hub-message-reaches-agenda | 2.5 | tasuki-sync | `test/live-ws.agenda.test.ts` |
| m439 | destroy-keeps-agenda | 2.2 | tasuki-sync | `test/destroy-room.test.ts` |
| m440 | extend-does-not-rearm | 2.4 | tasuki-sync | `test/agenda-handlers.test.ts` |
| m441 | topic-excludes-agenda | 2.5 | tasuki-sync | `test/live-ws.agenda.test.ts` |
| m442 | agenda-skips-on-connect | 2.5 | tasuki-sync | `test/live-ws.agenda.test.ts` |
| m443 | elapsed-sent-as-zero-on-join | 2.4 | tasuki-sync | `test/agenda-handlers.test.ts` |
| m444 | signal-on-first-view | 3.3（3.6 でも赤） | agenda-web | `tests/timeout-signal.test.ts` |
| m445 | old-saved-version-dropped | 3.4 | agenda-web | `tests/saved-scenarios.test.ts` |
| m446 | overrun-without-plus | 3.3 | agenda-web | `tests/agenda-view.test.ts` |
| m447 | needle-ignores-pause | 3.3 | agenda-web | `tests/dial-geometry.test.ts` |
| m448 | visibility-does-not-resync | 3.2 | agenda-web | `tests/use-agenda-sync.test.tsx` |
| m449 | hub-tool-id-mismatch-agenda | 4.1 | landing | `tests/room-choice-layout.test.tsx` |
| m450 | reduced-motion-hides-needle | 3.3 | agenda-web | `tests/dial.test.tsx` |

**既存の変異が当たらなくなる恐れ**: 触るファイルに当たる既存のパッチを、**着手時に** `grep -l '<ファイルのパス>' scripts/mutations/*.patch` で洗い、触ったタスクの終わりに `git apply --check` で 1 本ずつ当たることを確かめる（当たらなければ文脈を直す。番号は変えない）。少なくとも `ws-adapter.ts`・`adapters/ws/*.ts`・`create-sync-server.ts`・`topic-broadcast.ts`・`destroy-room.ts`・`apps/landing/src/**` は既存のパッチが当たっている（ルーレットの計画 §5 の表）。

## 7. 利用者の決定と、統括が判断すること

**利用者の決定**は設計 §11.1（U1〜U9）。設計者の判断は §11.2（J1〜J21）。**この計画で足した判断**:

- 名簿の配信先に agenda を足さない（Task 2.5）
- 時間切れの合図は、前のステップで 0 をまたいだ側で出す（自動で次へ移った直後に二重に鳴らさない・Task 3.3）
- 音の実装は写して共通化しない（Task 3.6）
- 玄関の札の名前は「Agenda Timer」・印は懐中時計（Task 4.1。文言は実測して決める）
- 「何もしない」操作は送り主にだけ 1 通返す（設計 §4.6 を同じ趣旨で直した）

統括が判断すること:

- Task 3.0 のモックを利用者に見せる時機（PR 2 の作業中に並行して作ってよい）
- PR 3 の段で画面を 1 度撮って利用者に見せるか
