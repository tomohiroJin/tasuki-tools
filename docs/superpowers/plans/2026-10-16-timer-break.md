# timer の休憩（#402）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** timer に、稼働時間か周回を条件にした休憩を足す。条件「なし」のルームは今とまったく同じに動く。

**Architecture:** 休憩の状態（`session.break`）と判定（`isBreakDue`）を timer-core に置く。同期サーバーは「交代が実際に起きたコミット」すべての後で判定する。画面は snapshot の `session.break` から覆い・帯・知らせを導く。v2.10 に残した `BreakStarted` / `BreakEnded` / `break.start` / `break.end` を使い、`breakEveryRotations`・`suggest-break`・ルームの `onBreak` は置き換えるか消す。

**Tech Stack:** TypeScript（strict・`exactOptionalPropertyTypes`）、neverthrow、valibot、React 19、vitest（timer-core・timer-web）、bun test（tasuki-sync）、Playwright（e2e）

**Spec:** [`docs/superpowers/specs/2026-10-16-timer-break-design.md`](../specs/2026-10-16-timer-break-design.md)（以下「設計」）。実装者は設計と本計画の両方を読むこと。

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md)）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | 各タスクは失敗するテストから始め、赤を見てから実装する |
| II. 技術選定は ADR を通す | 該当なし | 新しい技術・依存を足さない（休憩の復活は timer の ADR 0011 として記録する。Task 12） |
| III. 揮発インメモリと単純運用 | 通過 | 状態はメモリの集約に 1 項目足すだけ。回収（`room-reclaimer.ts`）は変えず、休憩中に全員が閉じるとルームが消える制約を受け入れて画面で伝える（設計 D10） |
| IV. 境界の型安全 | 通過 | 休憩の設定は `SessionConfigSchema` で組み合わせごとに検証する（room.create も通る）。wire の `session.break` は任意項目で検証する |
| V. 実画面検証 | 通過 | Task 11 で dev の 2 タブを並べて確かめる |
| VI. 依存は内向き | 通過 | 判定は timer-core の純粋関数。適格な席の数（名簿の在席）はアプリ層が数えて渡す |
| VII. 検査は壊して確かめる | 通過 | 変異 m260〜m266 を足す（Task 12）。既存の変異（m06 ほか evolve の休憩まわり）のパッチが当たるかを確かめる |
| VIII. 記録が正本 | 通過 | 設計正本・ADR 0011・ARCHITECTURE・DTO の台帳・Issue #402 の EARS を更新する |
| IX. 小さく回す | 通過 | PR 1 本・タスクごとにコミット。配布は利用者の指示待ち |
| X. 抽象は実需で | 通過 | 新しい抽象は `isBreakDue` と `maybeBreakAfterSwitch` の 2 つ。どちらも呼び手が 2 か所以上ある |
| XI. 秘密と個人情報を持ち込まない | 該当なし | 新しく持つのは時刻と回数だけ。ログに新しい出力を足さない |

## Global Constraints

- 休憩の条件の選択肢: 経過時間 = 30・45・60・90 分（既定 60）、周回 = 1・2・3・4 周（既定 2）。入り方 = `auto`（既定）／`suggest`。設定が無ければ `trigger: "none"` と同じ
- 休憩の文言は「休憩」を使う。base 層外の字は「休」「憩」だけに抑える（「促」「目」「安」「誰」「区」「小」「気」は使わない）
- 条件が「なし」のルームでは、画面のどこにも「休」「憩」を描かない（ロビーの折りたたんだ「詳細設定」の中を除く。Task 9 の注意）
- wire に足す項目はすべて任意（`deploy.sh timer` は web を先に配る）。wire の `Room.onBreak` は残す（古い画面の `RoomSchema` が必須で読む）
- 権限の判定は足さない。休憩の開始・終了は誰でもできる
- 作業は本体（`/workspaces/claym/local/Tasuki`）のブランチ `feature/402-timer-break` で行う。**サブエージェントは push・merge をしない**
- 手元の変異検査は `node scripts/mutation-check.mjs --changed`（全件は CI）
- dev サーバーを起動したら、使い終わったら止める（`ss -tlnp` で確認）。dev の入口は <http://localhost:5175/> だけ

## Review Focus

- 休憩中の端末が再接続した・途中で参加した → 覆いがすぐ出て、経過が休憩の開始から数えられている（Task 10 の「再接続相当」テスト）
- 一時停止中に「休憩する」を押した → 一時停止が解け、休憩明けに走り出す（Task 2 の evolve テスト）
- 休憩中に運転者が一時離脱・切断した → 休憩明けに次の適格な人が運転者になる（Task 8 のテスト）
- 完成したあとロビーへ戻って放置した → 自動交代も休憩も起きない（Task 2・Task 8 のテスト）
- 共有メモに入力中に休憩が始まった → Enter を押しても休憩は終わらない（Task 10 のフォーカスのテスト）

## 検証の実行時間の見積もり

| 検証 | 見積もり | いつ |
|---|---|---|
| timer-core の vitest | 約 30 秒 | Task 1〜5 の各ステップ |
| tasuki-sync の bun test（全件） | 約 1〜2 分 | Task 6〜8 |
| timer-web の vitest（全件） | 約 1 分 | Task 9〜10 |
| `pnpm -r typecheck` | 約 1 分 | 各タスクの終わり |
| `node scripts/mutation-check.mjs --changed` | 約 5〜10 分 | Task 12 |
| timer の E2E（`timer-break.spec.ts`＋`timer-a11y.spec.ts`＋`timer.spec.ts`） | 約 5 分 | Task 11 |
| 検査系（audit-structure・log-hygiene・check-links・scripts の自己テスト） | 約 2 分 | Task 12 |

全体を 1 巡すると約 15〜20 分。**実測が 2 倍を超えたら統括へ報告する。**

---

## ファイルの地図

**timer-core（`packages/timer-core`）**
- Create `src/break-policy.ts` — 休憩の設定の選択肢・検証・判定（`isBreakDue`）。純粋関数だけ
- Modify `src/aggregate.ts` — `BreakState` 型・`SessionState.break`・初期値、`TimerConfig.break`（`breakEveryRotations` を消す）、`TimerState.onBreak` を消す
- Modify `src/events.ts` — `BreakSuggested` を足す
- Modify `src/evolve.ts` — 休憩の 3 イベント・完成と中断で時計を止める・開始とリセットで初期化
- Modify `src/decide.ts` — 休憩中の拒否・`break.end` の拒否・`decideConfigSet` に `break`
- Modify `src/errors.ts`・`src/error-messages.ts` — `OnBreak`・`NotOnBreak`、同期サーバーの `NOT_IN_SESSION`・`CONFIG_LOCKED_IN_SESSION`
- Modify `src/schemas.ts`・`src/wire.ts` — 設定の検証、snapshot の `session.break`、`suggest-break` を消す、notice に 2 つ足す
- Modify `src/index.ts` — 公開する記号を足す

**同期サーバー（`apps/tasuki-sync/src/application`）**
- Create `break-after-switch.ts` — `maybeBreakAfterSwitch`
- Modify `handlers.ts`・`scheduler-sync.ts` — 判定を呼ぶ・notice の表
- Modify `room-commands/preconditions.ts` — phase の事前条件
- Modify `room-commands/after-effects.ts` — 休憩明けの繰り上げ
- Modify `build-domain-command.ts`・`apply-room-level-event.ts`・`initial-timer-state.ts`・`timer-snapshot-dto.ts`

**画面（`apps/timer-web/src`）**
- Create `ui/break-view.ts` — 休憩の表示の純粋関数と文言
- Create `ui/components/BreakOverlay.tsx`・`ui/components/BreakSettings.tsx`
- Create `ui/use-break-alert.ts`・`ui/use-last-one-guard.ts`
- Modify `ui/Session.tsx`・`ui/announce.ts`・`ui/use-discrete-announcement.ts`・`ui/use-now-tick.ts`・`ui/use-switch-alert.ts`・`ui/components/SessionConfigPanel.tsx`・`ui/Lobby.tsx`・`sync/commands.ts`・`sync/notice-message.ts`・`App.tsx`・`platform/notify.ts`
- Create `styles/break.css`（`app.css` から読み込む）

**E2E・文書・検査**
- Create `e2e/specs/timer-break.spec.ts`
- Create `docs/timer/adr/0011-timer-break-in-aggregate.md`
- Modify `docs/timer/ARCHITECTURE.md`・`docs/timer/adr/0009-test-conventions.md`・`scripts/lib/mutation-declarations.mjs`、Create `scripts/mutations/m260〜m266-*.patch`

---

### Task 1: 休憩の設定（timer-core）

**Files:**
- Create: `packages/timer-core/src/break-policy.ts`
- Modify: `packages/timer-core/src/aggregate.ts`（`TimerConfig`）
- Modify: `packages/timer-core/src/schemas.ts:60-66`（`SessionConfigSchema`）
- Modify: `packages/timer-core/src/decide.ts:399-410`（`decideConfigSet`）
- Modify: `packages/timer-core/src/index.ts`
- Test: `packages/timer-core/test/break-policy.test.ts`（新規）、`packages/timer-core/test/decide-v3.test.ts:72-106`（書き換え）、`packages/timer-core/test/schemas.test.ts`

**Interfaces:**
- Produces:
  - `BREAK_TRIGGERS = ["none","elapsed","rounds"] as const`、`type BreakTrigger`
  - `BREAK_MODES = ["auto","suggest"] as const`、`type BreakMode`
  - `BREAK_ELAPSED_MINUTES = [30,45,60,90] as const`、`BREAK_ROUNDS = [1,2,3,4] as const`
  - `interface BreakPolicy { trigger: BreakTrigger; every: number; mode: BreakMode }`
  - `DEFAULT_BREAK_EVERY: { elapsed: 60; rounds: 2 }`
  - `isValidBreakPolicy(p: BreakPolicy): boolean`
  - `breakPolicyOf(config: TimerConfig): BreakPolicy`（無ければ `{ trigger: "none", every: 0, mode: "auto" }`）
  - `TimerConfig.break?: BreakPolicy`

- [ ] **Step 1: 失敗するテストを書く**（`test/break-policy.test.ts`）

```ts
import { describe, it, expect } from "vitest";
import { isValidBreakPolicy, breakPolicyOf, type BreakPolicy } from "../src/break-policy.js";

describe("isValidBreakPolicy", () => {
  it.each<[BreakPolicy, boolean]>([
    [{ trigger: "none", every: 0, mode: "auto" }, true],
    [{ trigger: "elapsed", every: 60, mode: "auto" }, true],
    [{ trigger: "elapsed", every: 90, mode: "suggest" }, true],
    [{ trigger: "elapsed", every: 2, mode: "auto" }, false],   // 周回の値を経過時間に使う
    [{ trigger: "elapsed", every: 61, mode: "auto" }, false],
    [{ trigger: "rounds", every: 4, mode: "auto" }, true],
    [{ trigger: "rounds", every: 60, mode: "auto" }, false],   // 経過時間の値を周回に使う
    [{ trigger: "rounds", every: 0, mode: "auto" }, false],
  ])("Given %j / When 検証する / Then %s", (policy, expected) => {
    expect(isValidBreakPolicy(policy)).toBe(expected);
  });
});

describe("breakPolicyOf", () => {
  it("Given 休憩の設定が無い / When 引く / Then なしと同じ", () => {
    expect(breakPolicyOf({ intervalMinutes: 5 }).trigger).toBe("none");
  });
  it("Given 休憩の設定がある / When 引く / Then そのまま返す", () => {
    const policy: BreakPolicy = { trigger: "rounds", every: 2, mode: "suggest" };
    expect(breakPolicyOf({ intervalMinutes: 5, break: policy })).toEqual(policy);
  });
});
```

`decide-v3.test.ts:72-106` の `breakEveryRotations` を使う 2 つのテストを、`break` に置き換える（`config: { navigatorEnabled: true, assertiveSwitch: true, break: { trigger: "elapsed", every: 60, mode: "auto" } }` を渡し、イベントの `config.break` に載ることを見る）。`expect(event.config).not.toHaveProperty("breakEveryRotations")` の行は、「古い画面の `breakEveryRotations` は落ちる」の意図なので、そのまま残す。

`schemas.test.ts` に足す（既存の `SessionConfigSchema` を通すテストの近くへ。スキーマは `CommandSchema` の `config.set` 経由で測る）:

```ts
it("Given 経過時間に周回の値 / When config.set を検証する / Then 落ちる", () => {
  const r = v.safeParse(CommandSchema, { command: "config.set", config: { intervalMinutes: 5, break: { trigger: "elapsed", every: 2, mode: "auto" } } });
  expect(r.success).toBe(false);
});
it("Given 正しい休憩の設定 / When room.create を検証する / Then 通る", () => {
  const r = v.safeParse(CommandSchema, { command: "room.create", displayName: "a", config: { intervalMinutes: 5, break: { trigger: "rounds", every: 2, mode: "auto" } } });
  expect(r.success).toBe(true);
});
```

（`config.set` の `config` が部分設定を受けるスキーマかどうかは `schemas.ts` の `ConfigSetCommand` を読んで合わせる。`intervalMinutes` が必須でなければ省いてよい）

- [ ] **Step 2: 赤を確かめる**

Run: `pnpm --filter @tasuki/timer-core exec vitest run test/break-policy.test.ts test/decide-v3.test.ts test/schemas.test.ts`
Expected: FAIL（`break-policy.js` が無い）

- [ ] **Step 3: 実装する**

`src/break-policy.ts`:

```ts
/**
 * 休憩の設定と判定（#402）。純粋関数だけを置く。
 *
 * 設定はルームの設定（`TimerConfig.break`）にある。無ければ「なし」と同じ。
 */
import type { TimerConfig } from "./aggregate.js";

export const BREAK_TRIGGERS = ["none", "elapsed", "rounds"] as const;
export type BreakTrigger = (typeof BREAK_TRIGGERS)[number];
export const BREAK_MODES = ["auto", "suggest"] as const;
export type BreakMode = (typeof BREAK_MODES)[number];
/** 経過時間の条件の選択肢（分） */
export const BREAK_ELAPSED_MINUTES = [30, 45, 60, 90] as const;
/** 周回の条件の選択肢（周） */
export const BREAK_ROUNDS = [1, 2, 3, 4] as const;
/** 条件を選んだときの既定の間隔 */
export const DEFAULT_BREAK_EVERY = { elapsed: 60, rounds: 2 } as const;

export interface BreakPolicy {
  trigger: BreakTrigger;
  /** elapsed なら分、rounds なら周。none では読まない */
  every: number;
  mode: BreakMode;
}

const NO_BREAK: BreakPolicy = { trigger: "none", every: 0, mode: "auto" };

/** `every` が条件ごとの選択肢に入っているか。none は `every` を問わない */
export function isValidBreakPolicy(p: BreakPolicy): boolean {
  switch (p.trigger) {
    case "none":
      return true;
    case "elapsed":
      return (BREAK_ELAPSED_MINUTES as readonly number[]).includes(p.every);
    case "rounds":
      return (BREAK_ROUNDS as readonly number[]).includes(p.every);
  }
}

export function breakPolicyOf(config: TimerConfig): BreakPolicy {
  return config.break ?? NO_BREAK;
}
```

`aggregate.ts` の `TimerConfig` から `breakEveryRotations` を消し、`break?: BreakPolicy;`（`import type { BreakPolicy } from "./break-policy.js"`）を足す。注記は「何ローテーションごとに休憩を提案するか」を消し、「休憩の条件（#402）。無ければ『なし』」と書く。

`schemas.ts` の `SessionConfigSchema` から `breakEveryRotations` の行とその注記を消し、次を足す:

```ts
// 休憩の条件（#402）。`every` の許される値は条件ごとに違うので、組み合わせで検証する。
// room.create は decide を通らない（`initial-timer-state.ts` が設定をそのまま持つ）ので、検証はここに置く。
const BreakPolicySchema = v.pipe(
  v.object({
    trigger: v.picklist(BREAK_TRIGGERS),
    every: v.pipe(v.number(), v.integer()),
    mode: v.picklist(BREAK_MODES),
  }),
  v.check(isValidBreakPolicy),
);
```

`SessionConfigSchema` に `break: v.optional(BreakPolicySchema),` を足す。

`decide.ts` の `decideConfigSet` の白リストで、`breakEveryRotations` の行を `...(partial.break !== undefined && { break: partial.break }),` に置き換える。

`index.ts` に `export { BREAK_TRIGGERS, BREAK_MODES, BREAK_ELAPSED_MINUTES, BREAK_ROUNDS, DEFAULT_BREAK_EVERY, breakPolicyOf, type BreakPolicy, type BreakTrigger, type BreakMode } from "./break-policy.js";` を足す（`isValidBreakPolicy` はパッケージの外で使わないので出さない。SC-039③）。

- [ ] **Step 4: 緑を確かめる**

Run: `pnpm --filter @tasuki/timer-core exec vitest run && pnpm --filter @tasuki/timer-core typecheck`
Expected: PASS。typecheck が `breakEveryRotations` で赤になる箇所が他パッケージにあれば、このタスクでは timer-core の中だけを直し、他は Task 6・9 で直す（`pnpm -r typecheck` はこの時点では赤でよい。**赤の箇所を報告に列挙する**）

- [ ] **Step 5: コミット**

```bash
git add packages/timer-core
git commit -m "feat(timer-core): 休憩の条件の設定を足し、breakEveryRotations を置き換える（#402）"
```

---

### Task 2: 集約の休憩の状態と evolve（timer-core）

**Files:**
- Modify: `packages/timer-core/src/aggregate.ts`（`SessionState`・`initialAggregateInSeconds`・`TimerState`）
- Modify: `packages/timer-core/src/events.ts`（`BreakSuggested`）
- Modify: `packages/timer-core/src/evolve.ts`
- Test: `packages/timer-core/test/break-freeze.test.ts`（書き換え・追記）、`packages/timer-core/test/evolve.test.ts`、`packages/timer-core/test/properties.test.ts:316`、造作（`evolve.test.ts`・`records.test.ts`・`reset-restart.test.ts` の `previousDriverId:` を持つリテラル）

**Interfaces:**
- Consumes: なし
- Produces:
  - `interface BreakMark { elapsedMs: number; switches: number }`
  - `interface BreakState { since: number | null; baseline: BreakMark; suggestedAt: BreakMark | null }`
  - `SessionState.break: BreakState`（必須）
  - `INITIAL_BREAK_STATE: BreakState`（`{ since: null, baseline: { elapsedMs: 0, switches: 0 }, suggestedAt: null }`）
  - `isOnBreak(session: Pick<SessionState, "break">): boolean`
  - イベント `{ type: "BreakSuggested"; now: number }`
  - `TimerState.onBreak` は**消す**

- [ ] **Step 1: 失敗するテストを書く**

`break-freeze.test.ts` の「一時停止中に休憩→休憩終了しても走行再開せず一時停止を維持する」（98 行付近）を、新しい規則に書き換える:

```ts
it("Given 一時停止中 / When 休憩に入り、休憩を終える / Then 一時停止は解け、凍結した残りから走り出す（設計 §3.3）", () => {
  // Given（一時停止で残 240 に凍結）
  const started = startedAgg();
  const pauseTime = NOW + 180_000;
  const paused = evolve(started, { type: "SessionPaused", now: pauseTime }, pauseTime);
  // When
  const onBreak = evolve(paused, { type: "BreakStarted", now: pauseTime + 10_000 }, pauseTime + 10_000);
  const ended = evolve(onBreak, { type: "BreakEnded", now: pauseTime + 60_000 }, pauseTime + 60_000);
  // Then
  expect(onBreak.session.isPaused).toBe(false);
  expect(onBreak.session.break.since).toBe(pauseTime + 10_000);
  expect(ended.clock.running).toBe(true);
  expect(ended.session.break.since).toBeNull();
  expect(secondsLeft(ended.clock, pauseTime + 60_000)).toBeCloseTo(240, 0);
});
```

同じファイルに足す:

```ts
it("Given 走行中 / When 休憩に入る / Then 基準を今の稼働時間と交代回数で書き直し、知らせの印を消す", () => {
  const started = startedAgg();
  const withSuggestion = evolve(started, { type: "BreakSuggested", now: NOW + 60_000 }, NOW + 60_000);
  const onBreak = evolve(withSuggestion, { type: "BreakStarted", now: NOW + 120_000 }, NOW + 120_000);
  expect(onBreak.session.break.baseline).toEqual({ elapsedMs: 120_000, switches: started.session.totalSwitches });
  expect(onBreak.session.break.suggestedAt).toBeNull();
});

it("Given 走行中 / When 知らせる / Then 知らせた時点の値を残し、時計は止めない", () => {
  const started = startedAgg();
  const next = evolve(started, { type: "BreakSuggested", now: NOW + 60_000 }, NOW + 60_000);
  expect(next.session.break.suggestedAt).toEqual({ elapsedMs: 60_000, switches: started.session.totalSwitches });
  expect(next.clock.running).toBe(true);
});

it("Given 走行中（休憩していない） / When BreakEnded / Then 何も変えない", () => {
  const started = startedAgg();
  expect(evolve(started, { type: "BreakEnded", now: NOW + 1000 }, NOW + 1000)).toEqual(started);
});
```

（`startedAgg()` がこのファイルの既存の補助で、`NOW` に `SessionStarted` を当てた集約を返すことを、読んで確かめてから使う。`startedAgg` の `accumulatedElapsedMs` が 0 でなければ、期待値の `elapsedMs` を `started.clock.accumulatedElapsedMs + 120_000` に直す）

`evolve.test.ts` に足す（完成・中断・開始・リセット）:

```ts
describe("完成・中断は時計を止め、休憩を畳む（#402 設計 §3.5）", () => {
  it.each(["SessionCompleted", "SessionAborted"] as const)(
    "Given 休憩中の走っていた集約 / When %s / Then 時計は止まり、休憩の状態は初期値に戻る",
    (type) => {
      let agg = evolve(twoSeatAgg(), { type: "SessionStarted", now: NOW }, NOW);
      agg = evolve(agg, { type: "BreakStarted", now: NOW + 1000 }, NOW + 1000);
      agg = evolve(agg, { type: "BreakEnded", now: NOW + 2000 }, NOW + 2000);
      const event = type === "SessionCompleted"
        ? { type, now: NOW + 3000, topicTitle: null }
        : { type, now: NOW + 3000 };
      const next = evolve(agg, event, NOW + 3000);
      expect(next.clock.running).toBe(false);
      expect(next.clock.accumulatedElapsedMs).toBe(2000);
      expect(next.session.break).toEqual(INITIAL_BREAK_STATE);
    },
  );
});

it("Given 休憩の印が残る集約 / When SessionStarted / Then 休憩の状態は初期値", () => {
  const dirty = { ...twoSeatAgg(), session: { ...twoSeatAgg().session, break: { since: null, baseline: { elapsedMs: 5, switches: 5 }, suggestedAt: { elapsedMs: 5, switches: 5 } } } };
  expect(evolve(dirty, { type: "SessionStarted", now: NOW }, NOW).session.break).toEqual(INITIAL_BREAK_STATE);
});
```

（`twoSeatAgg` は仮名。`evolve.test.ts` に既にある「2 席の集約を作る補助」を読んで使う。無ければ `initialAggregate({ intervalMinutes: 5 }, [seat("a"), seat("b")])` で作る）

`properties.test.ts:316` の `SESSION_EVENTS` に `"BreakSuggested"` を足し、同じ性質テストの中で次の 2 つの不変条件を確かめる行を足す（既存の性質テストが各イベント列の後に集約を検査している箇所へ）:

```ts
// #402: 走っている時計は休憩中ではない／休憩中は一時停止ではない
expect(agg.clock.running && agg.session.break.since !== null).toBe(false);
expect(agg.session.break.since !== null && agg.session.isPaused).toBe(false);
```

`evolve.test.ts:518-541` の「休憩中の 1 人の輪」2 本は、`since` も見るように 1 行ずつ足す（`expect(agg.session.break.since).toBeNull()` を BreakEnded の後に）。

- [ ] **Step 2: 赤を確かめる**

Run: `pnpm --filter @tasuki/timer-core exec vitest run`
Expected: FAIL（`session.break` が無い・`BreakSuggested` が無い）

- [ ] **Step 3: 実装する**

`aggregate.ts`:
- `SessionState` に `break: BreakState;` を足す（注記: 「休憩の状態（#402）。時計と同じ evolve で変わるので、表示と時計が食い違わない。v2.10 は休憩をルームの `onBreak` に持ち、時計を止めずに食い違った」）
- `BreakMark`・`BreakState`・`INITIAL_BREAK_STATE`・`isOnBreak` を足して export する
- `initialAggregateInSeconds` の `session` に `break: INITIAL_BREAK_STATE` を足す（`SessionReset` はこれを通るので初期化される）
- `TimerState` から `onBreak: boolean;` を消す

`events.ts`: `/** 休憩の知らせ（#402。「知らせるだけ」の入り方で、条件に達した交代のあとに当てる） */ interface BreakSuggested { type: "BreakSuggested"; now: number }` を足し、`DomainEvent` に加える。

`evolve.ts`:

```ts
/** いまの稼働時間と交代回数（休憩の基準・知らせの印に使う）。 */
function markOf(agg: Aggregate): BreakMark {
  return { elapsedMs: agg.clock.accumulatedElapsedMs, switches: agg.session.totalSwitches };
}

function evolveBreakStarted(agg: Aggregate, now: number): Aggregate {
  // 時計を凍結してから基準を取る（凍結で稼働区間が accumulatedElapsedMs に確定する）。
  // 一時停止は解く。止まっている状態を 2 つ重ねると、休憩明けに走り出さない（#402 設計 §3.3）。
  const clock = freezeRunningClock(agg.clock, now);
  const frozen = { ...agg, clock };
  return {
    session: { ...agg.session, isPaused: false, break: { since: now, baseline: markOf(frozen), suggestedAt: null } },
    clock,
  };
}

function evolveBreakEnded(agg: Aggregate, now: number): Aggregate {
  // 休憩の印は、どの経路でも必ず消す（早期 return でも残さない）。
  const cleared: Aggregate = { ...agg, session: { ...agg.session, break: { ...agg.session.break, since: null } } };
  if (agg.session.break.since === null) return agg;
  if (cleared.clock.running) return cleared;
  if (cleared.session.isPaused) return cleared;
  return { ...cleared, clock: { ...cleared.clock, running: true, anchorServerTime: now, runningSince: now } };
}

function evolveBreakSuggested(agg: Aggregate): Aggregate {
  return { ...agg, session: { ...agg.session, break: { ...agg.session.break, suggestedAt: markOf(agg) } } };
}

/** 完成・中断（#402 設計 §3.5）。時計を止め、休憩を畳む。それまでは完成後のロビーでも時計が走り、自動交代が予約されていた */
function evolveSessionEnded(agg: Aggregate, now: number): Aggregate {
  return { session: { ...agg.session, break: INITIAL_BREAK_STATE }, clock: freezeRunningClock(agg.clock, now) };
}
```

`evolveByType` で:
- `case "BreakSuggested": return evolveBreakSuggested(agg);`
- `case "SessionCompleted": case "SessionAborted": return evolveSessionEnded(agg, event.now);`（既存の「扱わない」の case 群から 2 つを外す）
- `evolveSessionStarted` の `session` に `break: INITIAL_BREAK_STATE` を足す

`markOf` は走行中の稼働区間を含めない。`BreakSuggested` は交代の直後（`DriverSwitched` が `accumulatedElapsedMs` を確定した直後）に当てるので、確定した値で足りる。この理由を `markOf` の注記に 1 行書く。

`stopWithoutDriver` の注記（61〜66 行）を書き換える:「休憩は isPaused を使わずに時計を止める（`evolveBreakStarted`）。休憩中かどうかは集約の `session.break.since` が持つ。止まっている時計に触らないので、休憩中や開始前に輪が空になっても一時停止は立たず、席を足し直せば `BreakEnded`・`START` で走り出せる」

`sessionHasStarted`（377 行付近）を `agg.clock.running || agg.session.isPaused || agg.session.break.since !== null || agg.clock.accumulatedElapsedMs > 0` にする。注記の「休憩中」を「休憩中（`break.since`）」に。

造作: `previousDriverId:` を持つ `SessionState` のリテラルを持つテスト（`evolve.test.ts`・`records.test.ts`・`reset-restart.test.ts`）に `break: INITIAL_BREAK_STATE` を足す。`pnpm --filter @tasuki/timer-core typecheck` で赤になる箇所を全部直す。

- [ ] **Step 4: 緑を確かめる**

Run: `pnpm --filter @tasuki/timer-core exec vitest run && pnpm --filter @tasuki/timer-core typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add packages/timer-core
git commit -m "feat(timer-core): 休憩の状態を集約に置き、完成・中断で時計を止める（#402）"
```

---

### Task 3: 休憩中の拒否（timer-core の decide と文言）

**Files:**
- Modify: `packages/timer-core/src/decide.ts`
- Modify: `packages/timer-core/src/errors.ts`
- Modify: `packages/timer-core/src/error-messages.ts`
- Test: `packages/timer-core/test/decide-v3.test.ts:32-70`、`packages/timer-core/test/error-messages.test.ts`

**Interfaces:**
- Consumes: Task 2 の `isOnBreak`
- Produces: `DomainError` に `{ type: "OnBreak" }`・`{ type: "NotOnBreak" }`。文言 `ERROR_MESSAGES.OnBreak = "休憩中はこの操作はできません。"`・`ERROR_MESSAGES.NotOnBreak = "いまは休憩中ではありません。"`

- [ ] **Step 1: 失敗するテストを書く**（`decide-v3.test.ts` の `describe("decide: break.start / break.end（§9.1）")` を差し替える）

```ts
describe("decide: 休憩（#402 設計 §3.4）", () => {
  const onBreakAgg = () => evolve(startedAgg(), { type: "BreakStarted", now: NOW + 1000 }, NOW + 1000);

  it("Given 休憩中でない / When break.start / Then BreakStarted", () => {
    expect(decide({ command: "break.start" }, startedAgg(), NOW)._unsafeUnwrap()[0]?.type).toBe("BreakStarted");
  });
  it("Given 休憩中 / When break.start / Then OnBreak で拒む", () => {
    expect(decide({ command: "break.start" }, onBreakAgg(), NOW)._unsafeUnwrapErr().type).toBe("OnBreak");
  });
  it("Given 休憩中 / When break.end / Then BreakEnded", () => {
    expect(decide({ command: "break.end" }, onBreakAgg(), NOW)._unsafeUnwrap()[0]?.type).toBe("BreakEnded");
  });
  it("Given 休憩中でない / When break.end / Then NotOnBreak で拒む", () => {
    expect(decide({ command: "break.end" }, startedAgg(), NOW)._unsafeUnwrapErr().type).toBe("NotOnBreak");
  });
  // 一覧ではなく規則で拒む。SESSION_ACTIONS が増えても、このテストが新しい操作を拾う。
  it.each(SESSION_ACTIONS)("Given 休憩中 / When session.act %s / Then OnBreak で拒む", (action) => {
    expect(decide({ command: "session.act", action }, onBreakAgg(), NOW)._unsafeUnwrapErr().type).toBe("OnBreak");
  });
  it("Given 休憩中 / When driver.assign / Then OnBreak で拒む", () => {
    expect(decide({ command: "driver.assign", index: 1 }, onBreakAgg(), NOW)._unsafeUnwrapErr().type).toBe("OnBreak");
  });
  it.each([
    { command: "session.complete", topicTitle: null },
    { command: "session.abort" },
    { command: "handoff.note.set", text: "x" },
    { command: "member.move", fromIndex: 0, toIndex: 1 },
  ] as const)("Given 休憩中 / When %j / Then 通す", (cmd) => {
    expect(decide(cmd, onBreakAgg(), NOW).isOk()).toBe(true);
  });
});
```

（`startedAgg` はこのファイルの既存の補助を使う。2 席以上の集約であることを確かめる。`SESSION_ACTIONS` は `../src/aggregate.js` から import する）

`error-messages.test.ts` の `CODES_SHOWN_TO_USER` に `"OnBreak"`・`"NotOnBreak"` を足す（表の固定テストが先に赤になる）。

- [ ] **Step 2: 赤を確かめる**

Run: `pnpm --filter @tasuki/timer-core exec vitest run test/decide-v3.test.ts test/error-messages.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

`errors.ts`:

```ts
/** 休憩中（#402）。休憩中は時計を動かす操作（session.act の全種・driver.assign）と break.start を拒む */
export interface OnBreak {
  type: "OnBreak";
}

/** 休憩中ではない（#402）。break.end を拒む */
export interface NotOnBreak {
  type: "NotOnBreak";
}
```

を足し、`DomainError` に加える。

`decide.ts` の `decide` の先頭（`switch` の前）に置く:

```ts
  // 休憩中は時計を動かす操作をすべて拒む（#402 設計 §3.4）。一覧ではなく規則で書く ——
  // 時計を動かすのは session.act と driver.assign で、休憩を終えるのは break.end だけである。
  if (isOnBreak(agg.session) && (cmd.command === "session.act" || cmd.command === "driver.assign" || cmd.command === "break.start")) {
    return err({ type: "OnBreak" });
  }
  if (!isOnBreak(agg.session) && cmd.command === "break.end") {
    return err({ type: "NotOnBreak" });
  }
```

`decideSessionAct` の空の輪の判定より先に休憩の判定が来ることを、注記に 1 行書く（空の輪で休憩中なら OnBreak が先に返る）。

`error-messages.ts` の `ERROR_MESSAGES` に足す:

```ts
  // 休憩（#402）。「休」「憩」は書体の base 層に無いが、休憩を使うルームでしか届かない（設計 D9）。
  OnBreak: "休憩中はこの操作はできません。",
  NotOnBreak: "いまは休憩中ではありません。",
```

- [ ] **Step 4: 緑を確かめる**

Run: `pnpm --filter @tasuki/timer-core exec vitest run && pnpm --filter @tasuki/timer-core typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add packages/timer-core
git commit -m "feat(timer-core): 休憩中は時計を動かす操作を拒む（#402）"
```

---

### Task 4: 休憩の判定 `isBreakDue`（timer-core）

**Files:**
- Modify: `packages/timer-core/src/break-policy.ts`
- Modify: `packages/timer-core/src/index.ts`
- Test: `packages/timer-core/test/break-policy.test.ts`

**Interfaces:**
- Consumes: Task 1 の `BreakPolicy`、Task 2 の `BreakState`
- Produces: `isBreakDue(agg: Aggregate, policy: BreakPolicy, eligibleSeats: number): boolean`

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { initialAggregate, INITIAL_BREAK_STATE, type Aggregate, type BreakState } from "../src/aggregate.js";
import { isBreakDue } from "../src/break-policy.js";

/** 稼働時間・交代回数・休憩の状態だけを決めた集約（判定はこの 3 つしか読まない） */
function aggWith(elapsedMs: number, switches: number, brk: Partial<BreakState> = {}): Aggregate {
  const base = initialAggregate({ intervalMinutes: 5 }, []);
  return {
    session: { ...base.session, totalSwitches: switches, break: { ...INITIAL_BREAK_STATE, ...brk } },
    clock: { ...base.clock, accumulatedElapsedMs: elapsedMs },
  };
}
const MIN = 60_000;

describe("isBreakDue", () => {
  it("Given なし / When どれだけ経っても / Then 偽", () => {
    expect(isBreakDue(aggWith(999 * MIN, 999), { trigger: "none", every: 0, mode: "auto" }, 4)).toBe(false);
  });
  it.each([
    [59 * MIN, false],
    [60 * MIN, true],
  ])("Given 経過 60 分・基準 0 / When 稼働 %i ms / Then %s", (elapsed, expected) => {
    expect(isBreakDue(aggWith(elapsed, 0), { trigger: "elapsed", every: 60, mode: "auto" }, 4)).toBe(expected);
  });
  it("Given 経過 60 分・前の休憩が稼働 30 分の時点 / When 稼働 89 分 / Then 偽（休憩のたびに数え直す）", () => {
    const agg = aggWith(89 * MIN, 0, { baseline: { elapsedMs: 30 * MIN, switches: 0 } });
    expect(isBreakDue(agg, { trigger: "elapsed", every: 60, mode: "auto" }, 4)).toBe(false);
  });
  it.each([
    [7, false],
    [8, true],
  ])("Given 周回 2・適格 4 席 / When 交代 %i 回 / Then %s", (switches, expected) => {
    expect(isBreakDue(aggWith(0, switches), { trigger: "rounds", every: 2, mode: "auto" }, 4)).toBe(expected);
  });
  it("Given 周回 1・適格 2 席（4 席中 2 人が一時離脱） / When 交代 2 回 / Then 真（分母は適格な席の数）", () => {
    expect(isBreakDue(aggWith(0, 2), { trigger: "rounds", every: 1, mode: "auto" }, 2)).toBe(true);
  });
  it.each([0, 1])("Given 周回・適格 %i 席 / When 交代が何回でも / Then 偽（輪が 1 人だと交代回数が増えない）", (seats) => {
    expect(isBreakDue(aggWith(0, 100), { trigger: "rounds", every: 1, mode: "auto" }, seats)).toBe(false);
  });
  it("Given 知らせるだけ・稼働 60 分で知らせ済み / When 稼働 119 分 / Then 偽（次の間隔まで知らせ直さない）", () => {
    const agg = aggWith(119 * MIN, 0, { suggestedAt: { elapsedMs: 60 * MIN, switches: 0 } });
    expect(isBreakDue(agg, { trigger: "elapsed", every: 60, mode: "suggest" }, 4)).toBe(false);
  });
  it("Given 知らせるだけ・稼働 60 分で知らせ済み / When 稼働 120 分 / Then 真", () => {
    const agg = aggWith(120 * MIN, 0, { suggestedAt: { elapsedMs: 60 * MIN, switches: 0 } });
    expect(isBreakDue(agg, { trigger: "elapsed", every: 60, mode: "suggest" }, 4)).toBe(true);
  });
  it("Given 自動・知らせの印が残る / When 判定する / Then 印は見ない（基準は baseline）", () => {
    const agg = aggWith(60 * MIN, 0, { suggestedAt: { elapsedMs: 60 * MIN, switches: 0 } });
    expect(isBreakDue(agg, { trigger: "elapsed", every: 60, mode: "auto" }, 4)).toBe(true);
  });
  it("Given 休憩中 / When 判定する / Then 偽", () => {
    const agg = aggWith(999 * MIN, 999, { since: 1 });
    expect(isBreakDue(agg, { trigger: "elapsed", every: 30, mode: "auto" }, 4)).toBe(false);
  });
});
```

- [ ] **Step 2: 赤を確かめる**

Run: `pnpm --filter @tasuki/timer-core exec vitest run test/break-policy.test.ts`
Expected: FAIL（`isBreakDue` が無い）

- [ ] **Step 3: 実装する**（`break-policy.ts` に足す）

```ts
const MS_PER_MINUTE = 60_000;

/**
 * 休憩に入る（自動）／知らせる（知らせるだけ）条件に達したか（#402 設計 §3.2）。
 *
 * - 経過時間: 前の基準からの稼働時間（一時停止中は数えない）が `every` 分に達したら
 * - 周回: 前の基準からの交代回数が「適格な席の数 × every」に達したら。適格な席が 1 つ以下なら偽
 *   （輪が 1 人だと交代回数が増えない。`evolveDriverSwitched` の現状維持）
 * - 知らせるだけのときの基準は、最後に知らせた時点（無ければ前の休憩）。知らせても休まなければ
 *   次の間隔ぶん経ってからもう一度知らせる（交代のたびには知らせない）
 *
 * `eligibleSeats` は呼ぶ側が名簿の在席から数えて渡す（集約は在席を知らない）。
 */
export function isBreakDue(agg: Aggregate, policy: BreakPolicy, eligibleSeats: number): boolean {
  const brk = agg.session.break;
  if (brk.since !== null) return false;
  const base = policy.mode === "suggest" ? (brk.suggestedAt ?? brk.baseline) : brk.baseline;
  switch (policy.trigger) {
    case "none":
      return false;
    case "elapsed":
      return agg.clock.accumulatedElapsedMs - base.elapsedMs >= policy.every * MS_PER_MINUTE;
    case "rounds":
      if (eligibleSeats <= 1) return false;
      return agg.session.totalSwitches - base.switches >= eligibleSeats * policy.every;
  }
}
```

（`import type { Aggregate } from "./aggregate.js";` を足す）

`index.ts` の break-policy の export に `isBreakDue` を足す。

- [ ] **Step 4: 緑を確かめる**

Run: `pnpm --filter @tasuki/timer-core exec vitest run && pnpm --filter @tasuki/timer-core typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add packages/timer-core
git commit -m "feat(timer-core): 休憩の条件に達したかを判定する isBreakDue を足す（#402）"
```

---

### Task 5: wire（timer-core の schemas・wire）

**Files:**
- Modify: `packages/timer-core/src/schemas.ts`（`SessionStateSchema`・`SignalSuggestBreakMsg` を消す・`SignalNoticeMsg.action`）
- Modify: `packages/timer-core/src/wire.ts`（`Room.session.break`・`Room.onBreak` の注記）
- Test: `packages/timer-core/test/schemas.test.ts`

**Interfaces:**
- Produces:
  - wire `Room.session.break?: { since: number | null; suggestedAtSwitches: number | null }`
  - notice の `action` に `"break-started"`・`"break-ended"`
  - `signal: "suggest-break"` は消える

- [ ] **Step 1: 失敗するテストを書く**（`schemas.test.ts` の snapshot を通す既存テストの近くへ。60 行・334 行付近の room の造作を使う）

```ts
it("Given session.break が無い snapshot（古いサーバー） / When 検証する / Then 通る", () => {
  expect(v.safeParse(ServerMsgSchema, { type: "snapshot", room: validRoom() }).success).toBe(true);
});
it("Given 休憩中の snapshot / When 検証する / Then 通る", () => {
  const room = validRoom();
  const r = v.safeParse(ServerMsgSchema, { type: "snapshot", room: { ...room, session: { ...room.session, break: { since: 1000, suggestedAtSwitches: null } } } });
  expect(r.success).toBe(true);
});
it("Given 休憩の開始の notice / When 検証する / Then 通る", () => {
  const r = v.safeParse(ServerMsgSchema, { type: "signal", signal: "notice", action: "break-started", actorName: "a", actorParticipantId: "p1" });
  expect(r.success).toBe(true);
});
it("Given suggest-break シグナル / When 検証する / Then 落ちる（#402 で wire から消した）", () => {
  expect(v.safeParse(ServerMsgSchema, { type: "signal", signal: "suggest-break", rounds: 1 }).success).toBe(false);
});
```

（`validRoom()` は仮名。このファイルにある、有効な room を作る造作の名前を読んで使う。`actorParticipantId` の形の制約（`participantId` スキーマ）に合う値を、既存の notice のテストから写す）

- [ ] **Step 2: 赤を確かめる**

Run: `pnpm --filter @tasuki/timer-core exec vitest run test/schemas.test.ts`
Expected: FAIL（休憩中の snapshot は通る可能性がある —— `v.object` は未知のキーを捨てる。その場合でも notice と suggest-break の 2 本が赤になることを確かめる）

- [ ] **Step 3: 実装する**

`schemas.ts` の `SessionStateSchema` に足す:

```ts
  // #402: 休憩の状態。**任意にする**（`previousDriverIndex` と同じ判断。画面が先に配られる窓で
  // 旧サーバーの snapshot を捨てない）。無ければ画面は休憩中でないとみなす。
  // `suggestedAtSwitches` は「知らせるだけ」で知らせた交代の回数。帯はこれが totalSwitches と
  // 一致する間だけ出る（設計 §5.5）。基準（baseline）は画面が使わないので載せない。
  break: v.optional(
    v.object({
      since: v.nullable(v.number()),
      suggestedAtSwitches: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
    }),
  ),
```

`SignalSuggestBreakMsg` とそれを合併に入れている行を消す。`SignalNoticeMsg.action` の picklist に `"break-started"`・`"break-ended"` を足し、注記に「休憩の開始・終了（#402）。誰でも押せて全員の画面が変わるので、誰が押したかを伝える。古い画面はこの notice を契約違反として捨てるが、signal なので画面は古くならない（`stale-frame.ts`）」と書く。

`RoomSchema.onBreak` の上に注記を足す:「#402 で状態は集約の `session.break` へ移った。この項目は `session.break.since !== null` から導いて載せる。古い画面の `RoomSchema` が必須で読むので、wire からは消さない」

`wire.ts` の `Room.session` に `break?: { since: number | null; suggestedAtSwitches: number | null };` を足し、`previousDriverIndex` と同じ形式の注記を書く。`Room.onBreak` の注記も同じ内容に書き換える。

- [ ] **Step 4: 緑を確かめる**

Run: `pnpm --filter @tasuki/timer-core exec vitest run && pnpm --filter @tasuki/timer-core typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add packages/timer-core
git commit -m "feat(timer-core): wire に休憩の状態と notice を足し、suggest-break を消す（#402）"
```

---

### Task 6: 同期サーバーの片付けと投影

**Files:**
- Modify: `apps/tasuki-sync/src/application/apply-room-level-event.ts:131-145`
- Modify: `apps/tasuki-sync/src/application/initial-timer-state.ts:72`
- Modify: `apps/tasuki-sync/src/application/timer-snapshot-dto.ts:347-370`
- Modify: `apps/tasuki-sync/src/application/build-domain-command.ts:78-82`
- Modify: `apps/tasuki-sync/src/application/scheduler-sync.ts:36-46`・`handlers.ts:80` 付近の注記
- Test: `apps/tasuki-sync/test/timer-snapshot-dto.test.ts`、`apps/tasuki-sync/test/build-domain-command.test.ts:70-71`、`apps/tasuki-sync/test/live-ws.errors.test.ts:130-150`、造作（`admin.test.ts`・`driver-absence.test.ts`・`save-roster.timer-seat.test.ts`・`timer-snapshot-dto.test.ts`・`support/room-view.ts`）

**Interfaces:**
- Consumes: Task 2 の `session.break`・`TimerState` に `onBreak` が無いこと、Task 5 の wire
- Produces: snapshot の `session.break` と `onBreak` が集約から導かれる

- [ ] **Step 1: 失敗するテストを書く**

`timer-snapshot-dto.test.ts` に足す（既存の DTO を組むテストの造作を使う）:

```ts
it("Given 休憩中の集約 / When snapshot を組む / Then session.break と onBreak が集約から導かれる", () => {
  const timer = { ...runningTimer(), session: { ...runningTimer().session, break: { since: 5000, baseline: { elapsedMs: 0, switches: 0 }, suggestedAt: { elapsedMs: 0, switches: 3 } } } };
  const room = buildRoomDto(membership(), timer);
  expect(room.session.break).toEqual({ since: 5000, suggestedAtSwitches: 3 });
  expect(room.onBreak).toBe(true);
});
```

（`runningTimer`・`membership`・`buildRoomDto` は仮名。このファイルの既存の造作と、DTO を組む関数の実名を読んで使う）

`build-domain-command.test.ts:70-71` を `"break.start": [{ input: { command: "break.start" }, expected: { command: "break.start" } }]`、`"break.end"` も同様に書き換える。

`live-ws.errors.test.ts:130` の「wire スキーマに残るが処理されないコマンド（break.start）は UNKNOWN_COMMAND になる」を、「Given ロビー（phase が setup） / When break.start / Then NOT_IN_SESSION」に書き換える（期待コードは Task 7 で足す。ここでは赤のままでよいので、Task 7 の Step 2 で緑になることを確かめる。**このテストだけは Task 7 で緑にする**と報告に書く）。

- [ ] **Step 2: 赤を確かめる**

Run: `pnpm --filter @tasuki/sync typecheck; pnpm --filter @tasuki/sync test`
Expected: typecheck が `onBreak`・`breakEveryRotations`・`session.break` の欠落で赤。テストも赤

- [ ] **Step 3: 実装する**

- `apply-room-level-event.ts`: `SessionReset` の `{ ...room, onBreak: false }` を `room` に戻す（注記の「休憩フラグのみ解除する」を消す。休憩の状態は evolve が初期化する）。`BreakStarted`・`BreakEnded` の case を消す。`BreakSuggested` は集約だけを変えるので、既存の「扱わないイベント」の書き方に合わせて追加する（switch が網羅を型で強いていれば、そこへ並べる）
- `initial-timer-state.ts`: `onBreak: false` を消す
- `timer-snapshot-dto.ts` の `session` の明示列挙に足す:

```ts
      // #402: 休憩の状態。画面が要る分だけを載せる（基準は載せない）。
      break: {
        since: timer.session.break.since,
        suggestedAtSwitches: timer.session.break.suggestedAt?.switches ?? null,
      },
```

  `onBreak: timer.onBreak` を `onBreak: timer.session.break.since !== null` にし、注記を「古い画面の `RoomSchema` が必須で読むので残す（#402）」にする。この DTO の台帳（ファイル冒頭の項目の一覧）に、`session.break` の項目を足す（既存の項目の書き方に合わせる。配布の窓 = 任意項目なので落ちない）
- `build-domain-command.ts`: `case "break.start": return { command: "break.start" as const };`・`case "break.end": return { command: "break.end" as const };` を足し、`default` の注記から「break.start・break.end は wire に残るが処理しない」を消す
- `scheduler-sync.ts:36-46` の `!room.onBreak` の経緯の注記を、「休憩中は時計が止まる（`evolveBreakStarted`）ので、`running` を見るだけで休憩中の予約は外れる（#402）」に書き換える。`handlers.ts:80` 付近の「`break.start`/`break.end` の2個は wire スキーマ上は残っているが」の注記も、受理するようになったことに合わせて直す
- 造作: `onBreak: false` を `TimerState` のリテラルから消し、`SessionState` のリテラルに `break: INITIAL_BREAK_STATE` を足す。`support/room-view.ts:159` の `onBreak: room.onBreak` は、room-view が wire の形を組むなら `room.session.break.since !== null` に直す

- [ ] **Step 4: 緑を確かめる**

Run: `pnpm --filter @tasuki/sync typecheck && pnpm --filter @tasuki/sync test`
Expected: PASS（`live-ws.errors.test.ts` の書き換えた 1 本と `break-suggestion.test.ts` は赤でよい。`break-suggestion.test.ts` は Task 8 で置き換える）

- [ ] **Step 5: コミット**

```bash
git add apps/tasuki-sync
git commit -m "refactor(sync): 休憩の状態を集約から投影し、ルームの onBreak を消す（#402）"
```

---

### Task 7: phase の事前条件（同期サーバー）

**Files:**
- Modify: `apps/tasuki-sync/src/application/room-commands/preconditions.ts`
- Modify: `apps/tasuki-sync/src/application/handlers.ts:485`（`prepareDomainCommand` が渡す文脈）
- Modify: `packages/timer-core/src/errors.ts`（`SYNC_ERROR_CODES`）・`packages/timer-core/src/error-messages.ts`
- Test: `apps/tasuki-sync/test/break.preconditions.test.ts`（新規）、`apps/tasuki-sync/test/live-ws.errors.test.ts`（Task 6 で書き換えた 1 本）、`apps/tasuki-sync/test/error-code-coverage.test.ts`、`packages/timer-core/test/error-messages.test.ts`

**Interfaces:**
- Consumes: Task 6
- Produces:
  - `PreconditionFailure` に `"NOT_IN_SESSION"`・`"CONFIG_LOCKED_IN_SESSION"`
  - `PreconditionContext.phase: RoomPhase`

- [ ] **Step 1: 失敗するテストを書く**（`break.preconditions.test.ts`。`handlers.lifecycle.test.ts` の `setupRoom` と同じ組み立てを写す）

```ts
describe("休憩と設定の phase の事前条件（#402 設計 §4.4）", () => {
  it("Given ロビー / When break.start / Then NOT_IN_SESSION で拒む", async () => {
    const { handlers } = await setupLobby();
    const r = await handlers.handleCommand("host-conn", { command: "break.start" });
    expect(r._unsafeUnwrapErr()).toBe("NOT_IN_SESSION");
  });
  it("Given セッション中 / When config.set / Then CONFIG_LOCKED_IN_SESSION で拒み、設定は変わらない", async () => {
    const { handlers, store, timers, code } = await setupRunning();
    const r = await handlers.handleCommand("host-conn", { command: "config.set", config: { intervalMinutes: 10 } });
    expect(r._unsafeUnwrapErr()).toBe("CONFIG_LOCKED_IN_SESSION");
    expect(roomViewOf(store, timers, code).config.intervalMinutes).toBe(5);
  });
  it("Given セッション中 / When break.start / Then 全員の snapshot が休憩中になる", async () => {
    const { handlers, store, timers, code } = await setupRunning();
    const r = await handlers.handleCommand("host-conn", { command: "break.start" });
    expect(r.isOk()).toBe(true);
    expect(roomViewOf(store, timers, code).onBreak).toBe(true);
  });
});
```

`setupLobby` は `room.create`（`intervalMinutes: 5`）と 2 人目の参加・`member.add` まで。`setupRunning` はそれに `{ command: "phase.set", phase: "session" }` と `{ command: "session.act", action: "START" }` を足す（画面の `startSession` と同じ順。`apps/timer-web/src/sync/timer-actions.ts:64`）。`roomViewOf` の戻り値に `onBreak` が無ければ、`timers.get(code)!.session.break.since` を見る形に直す。

`error-messages.test.ts` の `CODES_SHOWN_TO_USER` に 2 つを足す。

- [ ] **Step 2: 赤を確かめる**

Run: `pnpm --filter @tasuki/sync exec bun test test/break.preconditions.test.ts test/live-ws.errors.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

`preconditions.ts`:
- `PreconditionFailure` に 2 つを足す
- `PreconditionContext` に `/** ルームの段階。休憩と設定の変更の可否に使う（集約は phase を持たない・#402） */ phase: RoomPhase;` を足す
- `checkPreconditions` の switch に足す:

```ts
    case "break.start":
    case "break.end":
      // 休憩はセッション中だけ（#402）。集約は phase を持たないので decide では判定できない。
      return ctx.phase === "session" ? ok(draft) : err("NOT_IN_SESSION");
    case "config.set":
      // 設定はロビーで変える（#402 設計 D7）。セッション中に間隔を変えると、凍結した残り時間が満タンで
      // 上書きされる（`evolveConfigSet`）。画面はセッション中に config.set を送らない。
      return ctx.phase === "session" ? err("CONFIG_LOCKED_IN_SESSION") : ok(draft);
```

`handlers.ts` の `prepareDomainCommand` の `ctx` に `phase: state.timer.phase` を足す。

`errors.ts` の `SYNC_ERROR_CODES` に、`// ─── 休憩と設定（#402） ───` の見出しで `"NOT_IN_SESSION"`・`"CONFIG_LOCKED_IN_SESSION"` を足す。

`error-messages.ts` の `ERROR_MESSAGES` に足す（どちらも base 層に収まる字だけ。Task 10 の書体の検査が測る）:

```ts
  NOT_IN_SESSION: "セッション中だけの操作です。",
  CONFIG_LOCKED_IN_SESSION: "設定はセッションの開始前に変えてください。",
```

（`error-code-coverage.test.ts` がソースのリテラルを走査する仕組みを読み、`err("NOT_IN_SESSION")` が走査に載ることを確かめる。載らなければ `EMITTED_VIA_VARIABLE` 側へ足す）

- [ ] **Step 4: 緑を確かめる**

Run: `pnpm --filter @tasuki/sync test && pnpm --filter @tasuki/timer-core exec vitest run`
Expected: PASS（`break-suggestion.test.ts` は Task 8 まで赤でよい）

- [ ] **Step 5: コミット**

```bash
git add apps/tasuki-sync packages/timer-core
git commit -m "feat(sync): 休憩はセッション中だけ、設定の変更はロビーだけにする（#402）"
```

---

### Task 8: 交代のあとの判定・休憩明けの繰り上げ・notice（同期サーバー）

**Files:**
- Create: `apps/tasuki-sync/src/application/break-after-switch.ts`
- Modify: `apps/tasuki-sync/src/application/handlers.ts:463-475`（`handleRoomCommand`）・`609` 付近（`SESSION_NOTICE_ACTIONS`）
- Modify: `apps/tasuki-sync/src/application/scheduler-sync.ts:57-72`（`autoSwitch`）
- Modify: `apps/tasuki-sync/src/application/room-commands/after-effects.ts`
- Test: `apps/tasuki-sync/test/break-suggestion.test.ts` を削除し、`apps/tasuki-sync/test/break-after-switch.test.ts`（新規）に置き換える

**Interfaces:**
- Consumes: Task 4 の `isBreakDue`、Task 1 の `breakPolicyOf`
- Produces: `maybeBreakAfterSwitch(before: TimerState, after: RoomState, now: number): RoomState`

- [ ] **Step 1: 失敗するテストを書く**（`break-after-switch.test.ts`。組み立ては `break-suggestion.test.ts:31-71` の `FakeClock`・`Scheduler`・`jest.useFakeTimers` と、`handlers.lifecycle.test.ts` の 3 人の `setupRoom` を合わせる）

```ts
const ROUNDS_1: BreakPolicy = { trigger: "rounds", every: 1, mode: "auto" };

/** 3 人（Alice・Bob・Charlie）が輪に居て、セッション中で走っているルーム */
async function setupRunning(policy: BreakPolicy) { /* room.create（config に break: policy）→ 2 人の join と member.add → phase.set session → START */ }

describe("交代が起きたら休憩の条件を判定する（#402 設計 §4.1）", () => {
  // 交代の経路を名指しせずに覆うことを、経路ごとに確かめる。
  it.each([
    ["自動交代", async (h: Ctx) => { for (let i = 0; i < 3; i++) advanceOneSwitch(h); }],
    ["手での交代", async (h: Ctx) => { for (let i = 0; i < 3; i++) await h.handlers.handleCommand("host-conn", { command: "session.act", action: "SWITCH" }); }],
    ["強制指名", async (h: Ctx) => { for (const name of ["Bob", "Charlie", "Alice"]) await h.handlers.handleCommand("host-conn", { command: "driver.assign", participantId: idOf(h, name) }); }],
  ] as const)("Given 周回 1・自動・3 人 / When %s で 3 回交代 / Then 休憩に入り、時計は満タンで止まる", async (_label, act) => {
    const h = await setupRunning(ROUNDS_1);
    await act(h);
    const timer = h.timers.get(h.code)!;
    expect(timer.session.break.since).not.toBeNull();
    expect(timer.clock.running).toBe(false);
    expect(timer.clock.secondsLeftAtAnchor).toBe(timer.clock.intervalSeconds);
  });

  it("Given 周回 1・自動 / When 2 回交代 / Then まだ休憩に入らない", async () => {
    const h = await setupRunning(ROUNDS_1);
    advanceOneSwitch(h);
    advanceOneSwitch(h);
    expect(h.timers.get(h.code)!.session.break.since).toBeNull();
  });

  it("Given 周回 1・知らせるだけ / When 3 回交代 / Then 時計は走ったまま、知らせの印が付く", async () => {
    const h = await setupRunning({ ...ROUNDS_1, mode: "suggest" });
    for (let i = 0; i < 3; i++) advanceOneSwitch(h);
    const timer = h.timers.get(h.code)!;
    expect(timer.clock.running).toBe(true);
    expect(timer.session.break.suggestedAt?.switches).toBe(3);
  });

  it("Given 条件なし / When 何回交代しても / Then 休憩にも知らせにもならない", async () => {
    const h = await setupRunning({ trigger: "none", every: 0, mode: "auto" });
    for (let i = 0; i < 9; i++) advanceOneSwitch(h);
    expect(h.timers.get(h.code)!.session.break).toEqual(INITIAL_BREAK_STATE);
  });

  it("Given 休憩中 / When 時間が経つ / Then 自動交代は予約されていない", async () => {
    const h = await setupRunning(ROUNDS_1);
    for (let i = 0; i < 3; i++) advanceOneSwitch(h);
    const before = h.timers.get(h.code)!.session.totalSwitches;
    advanceOneSwitch(h);
    expect(h.timers.get(h.code)!.session.totalSwitches).toBe(before);
  });

  it("Given 完成したルーム / When ロビーへ戻って時間が経つ / Then 自動交代も休憩も起きない（設計 §3.5）", async () => {
    const h = await setupRunning(ROUNDS_1);
    await h.handlers.handleCommand("host-conn", { command: "session.complete" });
    await h.handlers.handleCommand("host-conn", { command: "phase.set", phase: "setup" });
    const before = h.timers.get(h.code)!;
    for (let i = 0; i < 3; i++) advanceOneSwitch(h);
    const after = h.timers.get(h.code)!;
    expect(after.clock.running).toBe(false);
    expect(after.session.totalSwitches).toBe(before.session.totalSwitches);
    expect(after.session.break.since).toBeNull();
  });
});

describe("休憩明けの繰り上げ（#402 設計 §4.2）", () => {
  it("Given 休憩中に運転者が一時離脱した / When 休憩を終える / Then 次の適格な人が運転者になり、時計が走る", async () => {
    const h = await setupRunning({ trigger: "none", every: 0, mode: "auto" });
    await h.handlers.handleCommand("host-conn", { command: "break.start" });
    const driver = currentDriverId(h);
    await h.handlers.handleCommand(connOf(h, driver), { command: "driver.skip", participantId: driver });
    await h.handlers.handleCommand("bob-conn", { command: "break.end" });
    const timer = h.timers.get(h.code)!;
    expect(currentDriverId(h)).not.toBe(driver);
    expect(timer.clock.running).toBe(true);
  });
});

describe("休憩の開始・終了を全員に伝える（#402 設計 §4.3）", () => {
  it("Given セッション中 / When Bob が休憩を始めて終える / Then notice が 2 本配られる", async () => {
    const h = await setupRunning({ trigger: "none", every: 0, mode: "auto" });
    await h.handlers.handleCommand("bob-conn", { command: "break.start" });
    await h.handlers.handleCommand("bob-conn", { command: "break.end" });
    const actions = h.broadcaster.signals.map((s) => (s.msg as { action?: string }).action).filter(Boolean);
    expect(actions).toEqual(["break-started", "break-ended"]);
  });
});
```

（`Ctx`・`idOf`・`connOf`・`currentDriverId`・`advanceOneSwitch(h)` はこのファイルに書く小さな補助。`currentDriverId` は `rotationEntryId(timer.session.rotation[timer.session.currentIndex])`。不在の繰り上げ（presence の不在タイマー）は `autoSwitch` を共有するので、自動交代の経路で覆われる）

- [ ] **Step 2: 赤を確かめる**

Run: `pnpm --filter @tasuki/sync exec bun test test/break-after-switch.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

`break-after-switch.ts`:

```ts
/**
 * 交代が実際に起きたコミットのあとで、休憩の条件を判定する（#402 設計 §4.1）。
 *
 * **交代の経路を数え上げない。** 手での交代・強制指名・スキップの繰り上げ・自動交代・不在の繰り上げを、
 * 「`totalSwitches` が増えたか」という 1 つの事実で覆う。並べ替え・名簿の出入り・現状維持の交代
 * （輪が 1 人・全員が不適格）では回数が増えないので、判定は走らない。
 */
import { breakPolicyOf, evolve, isBreakDue, type TimerState } from "@tasuki/timer-core";
import type { RoomState } from "./apply-room-level-event.js";
import { computeIneligibleIndices } from "./timer-snapshot-dto.js";

export function maybeBreakAfterSwitch(before: TimerState, after: RoomState, now: number): RoomState {
  const { timer, membership } = after;
  if (timer.session.totalSwitches <= before.session.totalSwitches) return after;
  if (timer.phase !== "session" || !timer.clock.running) return after;
  const policy = breakPolicyOf(timer.config);
  const eligibleSeats = timer.session.rotation.length - computeIneligibleIndices(membership, timer).size;
  const agg = { session: timer.session, clock: timer.clock };
  if (!isBreakDue(agg, policy, eligibleSeats)) return after;
  const event = policy.mode === "auto" ? ({ type: "BreakStarted", now } as const) : ({ type: "BreakSuggested", now } as const);
  const next = evolve(agg, event, now);
  return { membership, timer: { ...timer, session: next.session, clock: next.clock } };
}
```

（`evolve`・`isBreakDue`・`breakPolicyOf` が `@tasuki/timer-core` の入口から出ていることを確かめる。`computeIneligibleIndices` の戻り値が `Set<number>` であることを確かめる）

`handlers.ts` の `handleRoomCommand`:

```ts
    const next = maybeBreakAfterSwitch(
      state.timer,
      applyAfterEffects(applyEvents(state, evolved, result.value, nextRecordId), { /* 既存のまま */ }),
      now,
    );
```

`SESSION_NOTICE_ACTIONS` の型と表に `"break.start": "break-started"`・`"break.end": "break-ended"` を足す。表の上の注記に「休憩の開始・終了も、誰でも押せて全員の画面が変わるので伝える（#402）」を足す。自動で入った休憩には実行者が居ないので notice は出ない（`announceSessionNotice` はコマンドからしか呼ばれない）。

`scheduler-sync.ts` の `autoSwitch`:

```ts
    const switched: TimerState = { ...timer, session: newAgg.session, clock: newAgg.clock };
    const updated = maybeBreakAfterSwitch(timer, { membership, timer: switched }, now).timer;
    commit({ membership, timer: updated });
```

（以降の `broadcastSignal` と `reconcileSchedule(updated)` はそのまま。休憩に入れば `running` が偽なので、`reconcileSchedule` が予約を解除する）

`after-effects.ts` の `applyAfterEffects` に足す（`driver.skip` の分岐と同じ形）:

```ts
  // 休憩明けに、席を外していた運転者を繰り上げる（#402 設計 §4.2）。休憩中は時計が止まっているので、
  // driver.skip の繰り上げも不在の繰り上げ（presence）も動かない。明けた時点で 1 回だけ見直す。
  if (command.command === "break.end" && state.timer.clock.running) {
    const ineligible = computeIneligibleIndices(state.membership, state.timer);
    if (ineligible.has(state.timer.session.currentIndex)) {
      const advanced = advanceDriver({ session: state.timer.session, clock: state.timer.clock }, ineligible, now);
      return applyEvents(state, advanced, [], nextRecordId);
    }
    return state;
  }
```

`break-suggestion.test.ts` を削除する（撤去を確かめていたテスト。新しい振る舞いは `break-after-switch.test.ts` が持つ）。

- [ ] **Step 4: 緑を確かめる**

Run: `pnpm --filter @tasuki/sync test && pnpm --filter @tasuki/sync typecheck`
Expected: PASS（`@tasuki/sync` の `live-ws.multi-connection.test.ts` の既知のフレーキー 1 本が落ちたら、単独で 2 回流して緑になることを確かめ、報告に書く）

- [ ] **Step 5: コミット**

```bash
git add apps/tasuki-sync
git commit -m "feat(sync): 交代のあとに休憩の条件を判定し、休憩明けに運転者を見直す（#402）"
```

---

### Task 9: 画面のコマンドとロビーの設定

**Files:**
- Modify: `apps/timer-web/src/sync/commands.ts`
- Create: `apps/timer-web/src/ui/break-view.ts`
- Create: `apps/timer-web/src/ui/components/BreakSettings.tsx`
- Modify: `apps/timer-web/src/ui/components/SessionConfigPanel.tsx`
- Modify: `apps/timer-web/src/ui/Lobby.tsx:144-147`
- Create: `apps/timer-web/src/styles/break.css`（`app.css` から `@import`。既存の `session-config-panel.css` の読み込み方に合わせる）
- Test: `apps/timer-web/test/ui/break-view.test.ts`（新規）、`apps/timer-web/test/ui/BreakSettings.test.tsx`（新規）、`apps/timer-web/test/sync/commands.test.ts`（あれば）

**Interfaces:**
- Consumes: Task 1 の `BREAK_*`・`DEFAULT_BREAK_EVERY`・`BreakPolicy`、Task 5 の wire
- Produces:
  - `TimerCommands.startBreak(): void`・`TimerCommands.endBreak(): void`
  - `break-view.ts`: `BREAK_TEXT`（全文言の定数オブジェクト）、`isBreakEnabled(config: SessionConfig): boolean`、`isOnBreakRoom(room: Room): boolean`、`breakElapsedMs(since: number, now: number, clockOffset: number): number`、`isSuggestBandVisible(room: Room): boolean`、`roundsEstimateMinutes(intervalMinutes: number, eligibleSeats: number, rounds: number): number`

- [ ] **Step 1: 失敗するテストを書く**

`break-view.test.ts`:

```ts
describe("break-view", () => {
  it("Given 休憩の設定が無い / When 有効か見る / Then 偽", () => {
    expect(isBreakEnabled({ intervalMinutes: 5 })).toBe(false);
  });
  it("Given 経過時間の設定 / When 有効か見る / Then 真", () => {
    expect(isBreakEnabled({ intervalMinutes: 5, break: { trigger: "elapsed", every: 60, mode: "auto" } })).toBe(true);
  });
  it("Given session.break が無い snapshot（古いサーバー） / When 休憩中か見る / Then 偽", () => {
    expect(isOnBreakRoom(roomWith({}))).toBe(false);
  });
  it("Given 休憩の開始 1000・端末の補正 +200 / When 端末の今が 61_000 / Then 経過 60_200", () => {
    expect(breakElapsedMs(1000, 61_000, 200)).toBe(60_200);
  });
  it.each([
    [{ since: null, suggestedAtSwitches: 3 }, 3, true],
    [{ since: null, suggestedAtSwitches: 3 }, 4, false],   // 次の交代で消える
    [{ since: 1, suggestedAtSwitches: 3 }, 3, false],      // 休憩中は出さない
    [{ since: null, suggestedAtSwitches: null }, 3, false],
  ])("Given break=%j・交代 %i 回 / When 帯を出すか / Then %s", (brk, switches, expected) => {
    expect(isSuggestBandVisible(roomWith({ break: brk, totalSwitches: switches }))).toBe(expected);
  });
  it("Given 3 分交代・2 人・1 周 / When 目安を出す / Then 約 6 分", () => {
    expect(roundsEstimateMinutes(3, 2, 1)).toBe(6);
  });
});
```

（`roomWith` は `test/support/room-view.ts` の既存の造作で `Room` を作り、`session` を上書きする小さな補助。造作の関数名を読んで使う）

`BreakSettings.test.tsx`（Testing Library。既存の `SessionConfigPanel` のテストがあれば書き方を合わせる）:

```tsx
it("Given 条件なし / When 経過時間を選ぶ / Then 既定の 60 分・自動で onChange する", async () => {
  const onChange = vi.fn();
  render(<BreakSettings policy={undefined} intervalMinutes={5} eligibleSeats={3} onChange={onChange} />);
  await userEvent.click(screen.getByRole("button", { name: "経過時間" }));
  expect(onChange).toHaveBeenCalledWith({ trigger: "elapsed", every: 60, mode: "auto" });
});
it("Given 周回 1 周・3 分交代・2 人 / When 描く / Then 約 6 分ごとの目安が出る", () => {
  render(<BreakSettings policy={{ trigger: "rounds", every: 1, mode: "auto" }} intervalMinutes={3} eligibleSeats={2} onChange={() => {}} />);
  expect(screen.getByText(/約 6 分ごと/)).toBeInTheDocument();
});
it("Given 条件なし / When 描く / Then 間隔と入り方は出ない", () => {
  render(<BreakSettings policy={undefined} intervalMinutes={5} eligibleSeats={3} onChange={() => {}} />);
  expect(screen.queryByRole("group", { name: "休憩の間隔" })).toBeNull();
});
```

- [ ] **Step 2: 赤を確かめる**

Run: `pnpm --filter @tasuki/timer-web exec vitest run test/ui/break-view.test.ts test/ui/BreakSettings.test.tsx`
Expected: FAIL

- [ ] **Step 3: 実装する**

`commands.ts` の `TimerCommands` に `startBreak(): void; endBreak(): void;` を足し、`startBreak: () => send({ command: "break.start" })`・`endBreak: () => send({ command: "break.end" })` を足す。

`break-view.ts`:

```ts
/**
 * 休憩の表示の純粋関数と文言（#402）。
 *
 * **文言はここにだけ置く。** 「休」「憩」は書体の base 層に無いので、条件「なし」のルームでは描かない
 * （設計 D9）。それ以外の字は base 層に収める（`test/ui/break-copy-fits-font-base.test.ts` が測る）。
 */
import { breakPolicyOf, type Room, type SessionConfig } from "@tasuki/timer-core";

export const BREAK_TEXT = {
  settingsLabel: "休憩の条件",
  triggerNone: "なし",
  triggerElapsed: "経過時間",
  triggerRounds: "周回",
  everyLabel: "休憩の間隔",
  modeLabel: "入り方",
  modeAuto: "自動で休憩に入る",
  modeSuggest: "知らせるだけ",
  startButton: "休憩する",
  startHint: "次の休憩までを数え直します",
  overlayHeading: "休憩中",
  endButton: "休憩を終える",
  nextDriver: (name: string) => `休憩明けは${name}さん`,
  reclaimWarning: "全員がこの画面を閉じると、しばらくしてルームは消えます。",
  reclaimWarningLast: "あなたが最後の一人です。この画面を閉じると、しばらくしてルームは消えます。",
  suggestBand: "休憩の時間です",
  announceStarted: (name: string) => `休憩に入りました。休憩明けは${name}さんです`,
  announceEnded: "休憩が終わりました",
  osNotifyTitle: "休憩の時間です",
  roundsEstimate: (minutes: number) => `約 ${minutes} 分ごと`,
  minutes: (n: number) => `${n}分`,
  rounds: (n: number) => `${n}周`,
} as const;

export function isBreakEnabled(config: SessionConfig): boolean {
  return breakPolicyOf(config).trigger !== "none";
}

/** 休憩中か。`session.break` が無い snapshot（古いサーバー）は休憩中でないとみなす */
export function isOnBreakRoom(room: Room): boolean {
  return (room.session.break?.since ?? null) !== null;
}

export function breakElapsedMs(since: number, now: number, clockOffset: number): number {
  return Math.max(0, now + clockOffset - since);
}

/** 「知らせるだけ」の帯。いまの交代で知らせたときだけ出し、次の交代で消える（設計 §5.5） */
export function isSuggestBandVisible(room: Room): boolean {
  const brk = room.session.break;
  if (brk === undefined || brk.since !== null || brk.suggestedAtSwitches === null) return false;
  return brk.suggestedAtSwitches === room.session.totalSwitches;
}

export function roundsEstimateMinutes(intervalMinutes: number, eligibleSeats: number, rounds: number): number {
  return intervalMinutes * eligibleSeats * rounds;
}
```

（`breakPolicyOf` と `SessionConfig` が `@tasuki/timer-core` の入口から出ていることを確かめる。`SessionConfig` は `TimerConfig` の別名）

`BreakSettings.tsx`: 交代間隔のボタン群（`SessionConfigPanel.tsx:26-43`）と同じ `aria-pressed` のボタンの形で 3 段を描く。

```tsx
interface BreakSettingsProps {
  policy: BreakPolicy | undefined;
  intervalMinutes: number;
  /** 適格な席の数（周回の目安に使う） */
  eligibleSeats: number;
  onChange: (policy: BreakPolicy) => void;
}
```

- 1 段目「休憩の条件」（`role="group"`・`aria-label={BREAK_TEXT.settingsLabel}`）: なし／経過時間／周回。経過時間・周回を選んだら `every` は `DEFAULT_BREAK_EVERY` の値、`mode` はいまの値（無ければ `"auto"`）。なしを選んだら `{ trigger: "none", every: 0, mode }`
- 2 段目「休憩の間隔」（なし以外のときだけ）: 経過時間なら `BREAK_ELAPSED_MINUTES` を `BREAK_TEXT.minutes`、周回なら `BREAK_ROUNDS` を `BREAK_TEXT.rounds` で。周回のときは下に `BREAK_TEXT.roundsEstimate(roundsEstimateMinutes(...))` を `session-config-hint` で添える
- 3 段目「入り方」（なし以外のときだけ）: 自動で休憩に入る／知らせるだけ
- クラス名は `session-config-*` の既存のものを使い、足りない分だけ `break.css` に `break-settings-*` で書く。色は既存のトークン（`var(--…)`）だけ

`SessionConfigPanel.tsx`: props に `eligibleSeats: number` を足し、`<details>` の `session-config-toggles` の後ろに `<BreakSettings policy={config.break} intervalMinutes={config.intervalMinutes} eligibleSeats={eligibleSeats} onChange={(p) => onChange({ break: p })} />` を置く。冒頭の注記の「詳細設定（オプション2点・既定 OFF）」を「オプション 2 点と休憩の条件」に直す。

`Lobby.tsx`: `eligibleSeats={room.session.seats.filter((s) => s.skipReason === null).length}` を渡す（`seats` の `skipReason` が「番が回らない理由」で、null なら適格であることを `schemas.ts` の `SeatSchema` で確かめる）。

**注意（書体）**: 「休憩の条件」はロビーの折りたたんだ `<details>` の中に描く。閉じた `<details>` の中身は描画されないので、ブラウザは書体を取りに行かない（推測）。Task 11 の E2E「書体は常用の層だけを取る」がロビーを通るので、そこで実測する。赤になったら、1 段目の見出しだけを base 層の語（例:「ブレイクの条件」）にする案を統括へ報告して判断を仰ぐ（自分で決めない）。

- [ ] **Step 4: 緑を確かめる**

Run: `pnpm --filter @tasuki/timer-web exec vitest run && pnpm --filter @tasuki/timer-web typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add apps/timer-web
git commit -m "feat(timer-web): ロビーの詳細設定で休憩の条件を選べるようにする（#402）"
```

---

### Task 10: 休憩の覆い・帯・知らせ（画面）

**Files:**
- Create: `apps/timer-web/src/ui/components/BreakOverlay.tsx`
- Create: `apps/timer-web/src/ui/use-break-alert.ts`
- Create: `apps/timer-web/src/ui/use-last-one-guard.ts`
- Modify: `apps/timer-web/src/ui/Session.tsx`
- Modify: `apps/timer-web/src/ui/use-now-tick.ts`
- Modify: `apps/timer-web/src/ui/use-switch-alert.ts`
- Modify: `apps/timer-web/src/ui/announce.ts`・`apps/timer-web/src/ui/use-discrete-announcement.ts`
- Modify: `apps/timer-web/src/platform/notify.ts`
- Modify: `apps/timer-web/src/sync/notice-message.ts`
- Modify: `apps/timer-web/src/App.tsx:141-168`
- Modify: `apps/timer-web/src/styles/break.css`
- Test: `apps/timer-web/test/ui/Session.break.test.tsx`（書き換え・追記）、`apps/timer-web/test/ui/announce.test.ts`（あれば追記・無ければ新規）、`apps/timer-web/test/ui/use-switch-alert.test.ts`（あれば追記）、`apps/timer-web/test/ui/break-copy-fits-font-base.test.ts`（新規）、`apps/timer-web/test/sync/notice-message.test.ts`（あれば追記）

**Interfaces:**
- Consumes: Task 9 の `break-view.ts`・`startBreak`・`endBreak`
- Produces:
  - `SessionProps.onStartBreak: () => void`・`SessionProps.onEndBreak: () => void`
  - `useNowTick(ticking: boolean, anchor: number): number`（第 1 引数の意味を「走っているか」から「時刻を進めるか」へ広げる。呼び手は Session だけであることを grep で確かめる）
  - `useSwitchAlert(..., opts: SwitchAlertOptions & { suppressed: boolean })`
  - `AnnounceState.onBreak: boolean`
  - `notifyBreak(title: string): void`（`platform/notify.ts`）

- [ ] **Step 1: 失敗するテストを書く**

`Session.break.test.tsx` を書き換える。冒頭の注記（v2.10 の撤去）を「#402 で休憩を作り直した。条件『なし』のルームは v2.10 の撤去後と同じく、休憩の操作も表示も無い」に直し、既存の「onBreak=true でも『休憩中』バナーが表示されない」は「条件なしのルームでは」に読み替えて残す。足すテスト:

```tsx
describe("休憩（#402）", () => {
  it("Given 条件なしのルーム / When 描く / Then 画面に「休」「憩」が無い（書体の拡張の層を取らない）", () => {
    render(<Session {...props(roomWithConfig({ intervalMinutes: 5 }))} />);
    expect(document.body.textContent).not.toMatch(/[休憩]/);
  });
  it("Given 条件ありのルーム / When 描く / Then 「休憩する」と添え書きがある", () => {
    render(<Session {...props(roomWithConfig(ELAPSED))} />);
    expect(screen.getByRole("button", { name: /休憩する/ })).toBeInTheDocument();
    expect(screen.getByText("次の休憩までを数え直します")).toBeInTheDocument();
  });
  it("Given 休憩中のルーム / When 描く / Then 覆いが出て、残り時間の円は無い", () => {
    render(<Session {...props(onBreakRoom({ since: 1000 }))} />);
    expect(screen.getByRole("dialog", { name: "休憩中" })).toBeInTheDocument();
    expect(screen.queryByRole("timer")).toBeNull();
  });
  it("Given 休憩中（再接続直後に初めて描く） / When 描く / Then 経過は休憩の開始から数える", () => {
    vi.setSystemTime(61_000);
    render(<Session {...props(onBreakRoom({ since: 1000 }))} clockOffset={0} />);
    expect(screen.getByText("1:00")).toBeInTheDocument();
  });
  it("Given 休憩中 / When 覆いが開く / Then フォーカスは見出しにあり、Enter でも Esc でも休憩は終わらない", async () => {
    const onEndBreak = vi.fn();
    render(<Session {...props(onBreakRoom({ since: 1000 }))} onEndBreak={onEndBreak} />);
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "休憩中" }));
    await userEvent.keyboard("{Enter}{Escape}");
    expect(onEndBreak).not.toHaveBeenCalled();
  });
  it("Given 休憩中 / When 「休憩を終える」を押す / Then onEndBreak", async () => {
    const onEndBreak = vi.fn();
    render(<Session {...props(onBreakRoom({ since: 1000 }))} onEndBreak={onEndBreak} />);
    await userEvent.click(screen.getByRole("button", { name: "休憩を終える" }));
    expect(onEndBreak).toHaveBeenCalledTimes(1);
  });
  it("Given 休憩中で自分以外が全員 offline / When 描く / Then 最後の一人の警告", () => {
    render(<Session {...props(onBreakRoom({ since: 1000 }, { othersOffline: true }))} />);
    expect(screen.getByText(/あなたが最後の一人です/)).toBeInTheDocument();
  });
  it("Given 知らせるだけで、いまの交代で知らせた / When 描く / Then 帯が出る", () => {
    render(<Session {...props(suggestedRoom())} />);
    expect(screen.getByText("休憩の時間です")).toBeInTheDocument();
  });
  it("Given 走行中 / When 交代と同時に休憩に入った snapshot が届く / Then 交代の全画面の知らせは出ない", () => {
    const { rerender } = render(<Session {...props(runningRoom({ assertiveSwitch: true }))} />);
    rerender(<Session {...props(switchedIntoBreakRoom({ assertiveSwitch: true }))} />);
    expect(screen.queryByRole("alertdialog", { name: "ドライバー交代通知" })).toBeNull();
  });
});
```

（`props`・`roomWithConfig`・`onBreakRoom`・`suggestedRoom`・`runningRoom`・`switchedIntoBreakRoom` はこのテストファイルに書く補助。`test/support/room-view.ts` の造作を土台にし、`session.break`・`config.break`・`participants[].presence`・`currentIndex` を上書きする。`ELAPSED = { intervalMinutes: 5, break: { trigger: "elapsed", every: 60, mode: "auto" } }`。経過の表記が `format-time.ts` の `formatElapsed` で `1:00` になることを確かめ、違えば期待値をその表記に合わせる）

`announce.test.ts`（既存があればそこへ）:

```ts
it("Given 走行中 / When 交代と同時に休憩に入る / Then 休憩の文が交代の文より優先する", () => {
  const prev = { running: true, isPaused: false, currentIndex: 0, isUrgent: false, driverName: "A", onBreak: false };
  const next = { running: false, isPaused: false, currentIndex: 1, isUrgent: false, driverName: "B", onBreak: true };
  expect(deriveAnnouncement(prev, next)).toBe("休憩に入りました。休憩明けはBさんです");
});
it("Given 休憩中 / When 休憩が終わる / Then 休憩が終わりました", () => {
  const prev = { running: false, isPaused: false, currentIndex: 1, isUrgent: false, driverName: "B", onBreak: true };
  expect(deriveAnnouncement(prev, { ...prev, running: true, onBreak: false })).toBe("休憩が終わりました");
});
```

`break-copy-fits-font-base.test.ts`（`topic-copy-fits-font-base.test.ts` の形を写す）:

```ts
import { BREAK_TEXT } from "../../src/ui/break-view.js";
import { errorMessageFor } from "@tasuki/timer-core";

/** 休憩の文言に許す base 層外の字（設計 D9）。これ以外が混ざったら赤 */
const ALLOWED_OUTSIDE = new Set(["休", "憩"]);

function allBreakTexts(): string[] {
  return Object.values(BREAK_TEXT).map((t) => (typeof t === "function" ? t("名前", 0 as never) : t)).map(String)
    .concat(["OnBreak", "NotOnBreak", "NOT_IN_SESSION", "CONFIG_LOCKED_IN_SESSION"].map(errorMessageFor));
}

it("Given 休憩の文言のすべて / When 常用の層の範囲に当てる / Then 外れる字は休・憩だけ", () => {
  const outside = new Set<string>();
  for (const [, ranges] of baseFaces()) {
    for (const text of allBreakTexts()) {
      for (const ch of text) {
        const cp = ch.codePointAt(0) ?? 0;
        if (cp > 0x7e && !ranges.some(([a, b]) => cp >= a && cp <= b)) outside.add(ch);
      }
    }
  }
  expect([...outside].filter((ch) => !ALLOWED_OUTSIDE.has(ch))).toEqual([]);
});
it("Given エラーの文言 / When 引く / Then 既定の文言に落ちていない（落ちると測っていない）", () => {
  for (const code of ["OnBreak", "NotOnBreak", "NOT_IN_SESSION", "CONFIG_LOCKED_IN_SESSION"]) {
    expect(errorMessageFor(code)).not.toBe(errorMessageFor("__unknown__"));
  }
});
```

（関数の文言は引数の型が混ざるので、`allBreakTexts` の呼び方は型検査が通る形に直してよい。**全部の文言を必ず通す**ことが目的。`BREAK_TEXT` に項目を足すと自動で測られる形を保つ）

`notice-message` のテスト（既存があれば）に、`break-started`・`break-ended` の文が「X さんが休憩を始めました。」「X さんが休憩を終えました。」になることを足す。

- [ ] **Step 2: 赤を確かめる**

Run: `pnpm --filter @tasuki/timer-web exec vitest run test/ui/Session.break.test.tsx test/ui/announce.test.ts test/ui/break-copy-fits-font-base.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

`use-now-tick.ts`: 第 1 引数を `ticking` に改名し、注記に「休憩中は時計が止まっているが、休憩の経過を数え上げるので時刻を進める（#402）」を足す。依存の `anchorServerTime` はそのまま（Session が休憩中は `since` を渡す）。

`use-switch-alert.ts`: `SwitchAlertOptions` に `/** 休憩に入る交代では知らせない（#402。休憩の知らせが代わりに出る） */ suppressed: boolean;` を足す。検知の effect で、ref を更新したあと `if (opts.suppressed) return;` を、交代の判定（`prevIndex === currentIndex || ...`）の直後・知らせを出す前に置く。依存配列に `suppressed` を足す。

`announce.ts`: `AnnounceState` に `onBreak: boolean` を足し、`deriveAnnouncement` の先頭に:

```ts
  // 休憩（#402）。交代と同じ snapshot で入るので、交代の文より先に見る。
  if (!prev.onBreak && next.onBreak) return BREAK_TEXT.announceStarted(next.driverName);
  if (prev.onBreak && !next.onBreak) return BREAK_TEXT.announceEnded;
```

`use-discrete-announcement.ts` の依存配列に `state.onBreak` を足す。

`platform/notify.ts` に `notifyDriverChange` と同じ形で:

```ts
/** 休憩の知らせ（#402）。背面タブ時のみ出す。 */
export function notifyBreak(title: string): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  if (typeof document === "undefined" || document.hidden !== true) return;
  try {
    new Notification(title, { icon: "/icon.png" });
  } catch {
    /* 無視 */
  }
}
```

`use-break-alert.ts`（`use-switch-alert.ts` の検知の形を写す）:

```ts
/**
 * 休憩の知らせ（#402 設計 §5.6）。snapshot の休憩の状態の変化から、チャイム・振動・OS 通知を出す。
 * 入った・終わった・（知らせるだけで）知らせた、の 3 つ。個人設定 `notify.enabled` で止まる。
 */
export function useBreakAlert(since: number | null, suggestedNow: boolean, notify: NotifyPreferences): void {
  const prevSinceRef = useRef(since);
  const prevSuggestedRef = useRef(suggestedNow);
  useEffect(() => {
    const started = prevSinceRef.current === null && since !== null;
    const ended = prevSinceRef.current !== null && since === null;
    const suggested = !prevSuggestedRef.current && suggestedNow;
    prevSinceRef.current = since;
    prevSuggestedRef.current = suggestedNow;
    if (!(started || ended || suggested) || !notify.enabled) return;
    playChime(notify.soundId, notify.volume);
    vibrateSwitch();
    if (notify.osNotify && (started || suggested)) notifyBreak(BREAK_TEXT.osNotifyTitle);
  }, [since, suggestedNow, notify.enabled, notify.soundId, notify.osNotify, notify.volume]);
}
```

`use-last-one-guard.ts`:

```ts
/**
 * 休憩中に自分が最後の一人なら、閉じる前にブラウザの確認を出す（#402 設計 §5.4）。
 * 文言はブラウザ既定のものになる（こちらの文は出せない）。覆いの 1 行が説明を担う。
 */
export function useLastOneGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);
}
```

`BreakOverlay.tsx`:

```tsx
interface BreakOverlayProps {
  elapsedMs: number;
  nextDriverName: string;
  isLastOne: boolean;
  onEnd: () => void;
  onComplete: () => void;
  /** 自分の一時離脱（輪に居るときだけ渡す） */
  onStandDown?: (() => void) | undefined;
}

export function BreakOverlay({ elapsedMs, nextDriverName, isLastOne, onEnd, onComplete, onStandDown }: BreakOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // 初期フォーカスは見出し。入力中の Enter が「休憩を終える」を押さないように（設計 §5.3）。
  // Esc では閉じない —— 覆いはサーバーの状態から出ているので、手元では閉じられない。
  useFocusTrap({ open: true, containerRef, onClose: () => {}, initialFocusRef: headingRef, modal: true });
  return (
    <div ref={containerRef} role="dialog" aria-modal="true" aria-labelledby="break-overlay-heading" className="break-overlay">
      <h2 id="break-overlay-heading" ref={headingRef} tabIndex={-1} className="break-overlay-heading">{BREAK_TEXT.overlayHeading}</h2>
      <p className="break-overlay-elapsed tabular" aria-live="off">{formatElapsed(elapsedMs)}</p>
      <p className="break-overlay-next">{BREAK_TEXT.nextDriver(nextDriverName)}</p>
      <button type="button" className="ui-button" onClick={onEnd}>{BREAK_TEXT.endButton}</button>
      <p className="break-overlay-warning">{isLastOne ? BREAK_TEXT.reclaimWarningLast : BREAK_TEXT.reclaimWarning}</p>
      <div className="break-overlay-secondary">
        {onStandDown && <button type="button" className="ui-button ui-button--quiet ui-button--sm" onClick={onStandDown}>{/* SelfDriverToggle の一時離脱のボタンと同じ文言を import して使う */}</button>}
        <button type="button" className="ui-button ui-button--quiet ui-button--sm" onClick={onComplete}>{/* EndSessionZone の完成のボタンと同じ文言・同じ確認の導線を使う */}</button>
      </div>
    </div>
  );
}
```

（`useFocusTrap` の `initialFocusRef` が `tabIndex={-1}` の見出しを受け付けるか、`useFocusTrap.ts` を読んで確かめる。完成は確認つきの操作（FR-074b）なので、`EndSessionZone` の確認ダイアログを経由する形を読んで合わせる。直に `onComplete` を呼ばない。一時離脱と完成の文言は既存の部品から引き、ここで新しく書かない）

`break.css`: `.break-overlay` は `position: fixed; inset: 0;` で全画面。色・余白・字の大きさは `switch-alert.css` と `packages/ui` のトークンだけで書く（生の色は禁止。`design-system-invariants`）。`.break-suggest-band` は画面上部の帯。

`Session.tsx`:
- props に `onStartBreak: () => void;`・`onEndBreak: () => void;` を足す
- `const onBreak = isOnBreakRoom(room); const breakSince = room.session.break?.since ?? null;`
- `useNowTick(room.clock.running || onBreak, breakSince ?? room.clock.anchorServerTime)`
- `useSwitchAlert(..., { assertiveSwitch: ..., notify: notifyPrefs, suppressed: onBreak })`
- `useDiscreteAnnouncement({ ..., onBreak })`
- `useBreakAlert(breakSince, isSuggestBandVisible(room), notifyPrefs)`
- 自分以外が全員 offline か: `const othersOffline = room.participants.filter((p) => p.participantId !== participantId && !p.isPlaceholder).every((p) => p.presence === "offline");`。`useLastOneGuard(onBreak && othersOffline)`
- 操作帯（`session-actions`）の「一時停止」の前に、`isBreakEnabled(room.config)` のときだけ「休憩する」ボタンを置く。`title={BREAK_TEXT.startHint}` に加えて、ボタンの下に添え書きを `session-config-hint` 相当で出す（テストが `getByText` で見る）
- 帯: `isSuggestBandVisible(room)` のとき、`session-panel` の先頭（`NotifyHint` の後）に `<div className="break-suggest-band" role="status">{BREAK_TEXT.suggestBand}<button …>{BREAK_TEXT.startButton}</button></div>`
- 覆い: `onBreak && breakSince !== null` のとき、`SwitchAlert` の隣に `<BreakOverlay elapsedMs={breakElapsedMs(breakSince, now, clockOffset)} nextDriverName={currentDriverName} isLastOne={othersOffline} onEnd={onEndBreak} onComplete={…} onStandDown={…} />`。覆いの下の `CircularProgress`（`role="timer"`）は、休憩中は描かない（`{!onBreak && (...)}` で `session-orbit` を包む）

Session.tsx は 480 行ある。足すのは配線だけにし、判定は `break-view.ts`、描画は `BreakOverlay.tsx` に置く。

`notice-message.ts`: `NoticeSignal.action` の型に `"break-started" | "break-ended"` を足し、`buildNoticeMessage` に `case "break-started": return \`${actor}が休憩を始めました。\`;`・`case "break-ended": return \`${actor}が休憩を終えました。\`;` を足す（文言は `BREAK_TEXT` に置くかは実装者の判断でよいが、書体の検査が測れる場所に置くこと）。

`App.tsx` の `<Session>` に `onStartBreak={commands.startBreak}`・`onEndBreak={commands.endBreak}` を足す（`commands` が手元にある変数名を読んで合わせる）。

- [ ] **Step 4: 緑を確かめる**

Run: `pnpm --filter @tasuki/timer-web exec vitest run && pnpm --filter @tasuki/timer-web typecheck && pnpm -r typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add apps/timer-web
git commit -m "feat(timer-web): 休憩の覆い・知らせるだけの帯・休憩の知らせを足す（#402）"
```

---

### Task 11: E2E と実画面

**Files:**
- Create: `e2e/specs/timer-break.spec.ts`
- Modify: `e2e/specs/timer-a11y.spec.ts`（コントラストの走査に休憩中の画面を足す）
- Modify: `e2e/support/timer.ts`（補助が要れば）

**Interfaces:**
- Consumes: Task 1〜10 のすべて

- [ ] **Step 1: E2E を書く**（`timer.spec.ts:41-80` の作り・`screens`・`createRoom`・`joinAsDriver`・`openPeer` を写す。**新しいタグは足さない**）

```ts
test.describe('timer の休憩は全員の画面で時計を止め、元の残りから再開する', () => {
  test('Given 経過時間の休憩を設定した 2 人のセッション / When 一人が休憩して終える / Then 両方が覆われ、残りが減らず、元の残りから走り出す', async ({ page, openPeer }) => {
    // Given
    const code = await createRoom(page, HOST);
    const guest = await openPeer('timer-guest');
    await joinAsDriver(guest.page, code, GUEST);
    await expect(lobbyRotationRow(page, GUEST, 2)).toHaveCount(1);
    await page.getByText('詳細設定').click();
    await page.getByRole('group', { name: '休憩の条件' }).getByRole('button', { name: '経過時間' }).click();
    await expect(guest.page.getByRole('group', { name: '休憩の条件' }).getByRole('button', { name: '経過時間' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'セッションを開始' }).click();

    // When: 休憩する
    const before = await page.getByRole('timer').getAttribute('aria-label');
    await page.getByRole('button', { name: /休憩する/ }).click();

    // Then その1: 両方の画面が覆われる
    for (const [label, target] of screens(page, guest.page)) {
      await expect(target.getByRole('dialog', { name: '休憩中' }), `${label}の画面`).toBeVisible();
    }
    // Then その2: 3 秒待って、休憩を終える。残りは休憩に入る前と 1 秒以内で一致する
    await page.waitForTimeout(3000);
    await guest.page.getByRole('button', { name: '休憩を終える' }).click();
    for (const [label, target] of screens(page, guest.page)) {
      await expect(target.getByRole('dialog', { name: '休憩中' }), `${label}の画面`).toHaveCount(0);
    }
    const after = await page.getByRole('timer').getAttribute('aria-label');
    expect(secondsOf(after) - secondsOf(before)).toBeGreaterThanOrEqual(-1);
  });
});
```

（`secondsOf` は `aria-label` の「残り時間 m:ss」を秒にする小さな補助。`waitForTimeout` を使うのは、休憩中に時間が経っても残りが減らないことを見るためで、待ちの代わりではない。注記にその理由を書く。`toBeGreaterThanOrEqual(-1)` は「減っていない（休憩の前後の描画の差 1 秒まで）」の意味。残りが 3 秒以上減っていたら赤になる）

`timer-a11y.spec.ts` のコントラストの走査（149 行付近）に、休憩中の画面（上と同じ手順で覆いを出した状態）を 1 件足す。既存の `expectScreenAcrossWidths` の使い方に合わせる。

- [ ] **Step 2: E2E を流す**

Run: `pnpm e2e -- e2e/specs/timer-break.spec.ts e2e/specs/timer-a11y.spec.ts e2e/specs/timer.spec.ts`（E2E は事前ビルドの dist を配信する。先に `pnpm build` が要るかを `docs/guides/development.md` で確かめる）
Expected: PASS。特に `timer-a11y.spec.ts` の「書体は常用の層だけを取る」が緑のままであること（Task 9 の注意）

- [ ] **Step 3: 実画面で確かめる**（憲法 V）

dev を起動し（`docs/guides/development.md` の手順。入口は <http://localhost:5175/>）、2 つのタブで次を目で見る。結果は報告に書く。
1. 条件「なし」のルーム: 操作帯に「休憩する」が無い。見た目が main と同じ
2. 周回 1・自動・2 人・3 分交代: 2 回のスキップで両方のタブが覆われる。交代の全画面の知らせが重ならない
3. 覆いの経過が数え上がる。片方のタブを再読み込みしても、経過が休憩の開始から続く
4. 知らせるだけ: 帯が出て、次のスキップで消える
5. 40rem 未満の幅で操作帯が折り返したとき、帯がボタンを隠さない（`scroll-padding`）
6. 使い終わったら dev を止め、`ss -tlnp` でポートが空いたことを確かめる

- [ ] **Step 4: コミット**

```bash
git add e2e
git commit -m "test(e2e): 休憩が両方の画面で時計を止め、元の残りから再開することを確かめる（#402）"
```

---

### Task 12: 変異検査・文書・検査系

**Files:**
- Modify: `scripts/lib/mutation-declarations.mjs`、Create: `scripts/mutations/m260-*.patch`〜`m266-*.patch`
- Create: `docs/timer/adr/0011-timer-break-in-aggregate.md`（`docs/timer/adr/README.md` の索引にも足す）
- Modify: `docs/timer/ARCHITECTURE.md:258`、`docs/timer/adr/0009-test-conventions.md`（休憩の dormant を書いた箇所。grep `break` で探す）

- [ ] **Step 1: 既存の変異のパッチが当たるかを確かめる**

Run: `node scripts/mutation-check.mjs --changed`
Expected: 宣言済みの変異がすべて「殺された」。パッチが当たらない（evolve.ts・decide.ts の行が動いた）ものがあれば、パッチを今のコードに合わせて書き直す（変異の意図は変えない。m06 の `tests` から `break-freeze.test.ts` が外れていないことも確かめる）

- [ ] **Step 2: 新しい変異を足す**（宣言は既存の書き方に合わせる。ID は m260 から）

| ID | 壊し方 | 殺すテスト |
|---|---|---|
| m260 | `isBreakDue` の周回で `eligibleSeats <= 1` の判定を外す | `break-policy.test.ts` の「適格 0/1 席」 |
| m261 | `isBreakDue` の知らせるだけの基準を常に `baseline` にする | `break-policy.test.ts` の「次の間隔まで知らせ直さない」 |
| m262 | `decide` の休憩中の拒否から `driver.assign` を外す | `decide-v3.test.ts` の driver.assign |
| m263 | `evolveSessionEnded` の `freezeRunningClock` を外す（時計を走らせたまま） | `evolve.test.ts` の完成・中断 |
| m264 | `maybeBreakAfterSwitch` の `totalSwitches` の比較を外す（交代が無くても判定する） | `break-after-switch.test.ts`（「条件なし」以外で、交代の無いコミットのあとに休憩に入らないことを見るテストが要る。無ければ Task 8 のテストに 1 本足す: 周回 1・3 人で 3 回交代して休憩→終える→`handoff.note.set` を送っても休憩に入らない） |
| m265 | `applyAfterEffects` の `break.end` の繰り上げを外す | `break-after-switch.test.ts` の休憩明けの繰り上げ |
| m266 | `useSwitchAlert` の `suppressed` の早期 return を外す | `Session.break.test.tsx` の「交代の全画面の知らせは出ない」 |

各変異について、パッチを当てると対象のテストが赤になり、戻すと緑になることを `node scripts/mutation-check.mjs --id 260,261,262,263,264,265,266` で確かめる。

- [ ] **Step 3: 文書を書く**

- `docs/timer/adr/0011-timer-break-in-aggregate.md`（`docs/adr/template.md` の形）: 文脈（v2.10 の撤去の理由 2 つ）、決定（休憩の状態を集約に置く・交代の切れ目で入る・ボタンは条件を設定したルームだけ）、理由（時計と休憩が同じ evolve で変わる）、帰結（回収の制約・書体の ext 層を休憩を使うルームだけが取る）。設計正本へリンクする
- `docs/timer/ARCHITECTURE.md:258` の「`break.start|end`（**dormant**: …受理されない）」を、受理すること・セッション中だけであることに書き換える。ほかに `onBreak`・`breakEveryRotations`・`suggest-break` を名指しする文を `grep -rn 'onBreak\|breakEveryRotations\|suggest-break' docs --include='*.md'` で探し、現況を述べている文だけ直す（過去の設計書・計画書は当時の記録なので直さない）
- `docs/timer/adr/0009-test-conventions.md` の休憩の記述を同様に直す

- [ ] **Step 4: 検査系を流す**

Run（並べて）:
- `node scripts/audit-structure.mjs`
- `node scripts/audit-log-hygiene.mjs`
- `node scripts/audit-assembly-wiring.mjs`
- `node scripts/audit-domain-error-shape.mjs`
- `node scripts/audit-domain-side-effects.mjs`
- `node scripts/check-links.mjs`
- `bash -c 'set -euo pipefail; targets="$(node scripts/list-scan-targets.mjs script-tests)"; node --test $targets'`
- `pnpm test`

Expected: すべて緑。SC-039③（自分しか使わない公開記号）で `break-policy.ts` や `aggregate.ts` の新しい export が引っかかったら、パッケージの外で使っていない記号の `export` を外す（`index.ts` から出さない）

- [ ] **Step 5: コミット**

```bash
git add scripts docs
git commit -m "docs: 休憩の ADR を足し、変異 m260〜m266 で休憩の判定を守る（#402）"
```

---

## PR の出し方（統括が行う）

1. 統括が `git push` し、PR を作る（タイトル: `feat: timer に休憩を差し込めるようにする（#402）`）。本文には `Closes #402` を地の文で 1 回だけ書く（バッククォートで囲まない）
2. `/code-review <PR 番号>` を流す
3. **Issue #402 の本文（EARS と完了条件）を、設計 §6 に合わせて書き直す文案を利用者に見せ、承認を得てから更新する**
4. 配布は利用者の指示を待つ

## 完了条件（#402 の完了条件をこの計画に合わせて読み替えたもの）

- [ ] ロビーの詳細設定で、休憩の条件を「なし／経過時間／周回」から選べる（Task 9）
- [ ] 条件「なし」のルームは今と同じに動く。既存のテストは、設計 §7.2 の表で「書き換え」とした 5 本を除いてそのまま通る（Task 1〜10）
- [ ] 条件に達した交代で、全員の画面に同じ snapshot で休憩が届く（Task 8・Task 11）
- [ ] 休憩中は残りが減らず、元の残りから再開する（Task 2・Task 11）
- [ ] 一時停止と休憩の違いが画面で分かる（覆い・添え書き。Task 10）。v2.10 への答えは ADR 0011 に書く（Task 12）
- [ ] v2.10 で残した定義はすべて使うか置き換えるか消した（`BreakStarted`/`BreakEnded`/`break.start`/`break.end` を使う、`breakEveryRotations` を置き換える、`suggest-break` とルームの `onBreak` を消す）
- [ ] DoD（`docs/guides/definition-of-done.md`）の各項目を満たす（テスト・変異・E2E・実画面・文書）
