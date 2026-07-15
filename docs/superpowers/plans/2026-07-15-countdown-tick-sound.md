# 交代前カウントダウン音（Issue #2） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交代タイマーの残り秒数が個人設定の予告秒数以下になったら、1秒ごとに短いカウントダウン音を鳴らす（GitHub Issue #2）。

**Architecture:** クライアント側で `Session` が既に導出している `secondsLeft`（サーバー権威 `ServerClock` から算出）の整数秒境界をカスタムフックで監視し、閾値内かつ走行中かつ個人設定 ON のときだけ `platform/sound.ts` の新規関数で短いビープ音を再生する。サーバー（sync）側の変更は不要。

**Tech Stack:** React 19 / TypeScript / Vitest + @testing-library/react / Web Audio API（既存 `platform/sound.ts` の `AudioContext` 共有インスタンスを再利用）。

## Global Constraints

- 予告音の on/off・予告秒数は**個人設定**（`NotifyPreferences`、localStorage）で制御する。ルーム設定・サーバー変更は行わない。
- 予告秒数は個人設定でスライダー調整可能。範囲 **5〜15 秒**、既定 **15 秒**。
- カウントダウン音自体の既定値は **OFF**（既存 `notify.enabled` の既定と一致）。
- カウント中に鳴らす音は新規の短い単一トーン（既存チャイムの流用ではない）。
- 交代の瞬間の挙動（`useSwitchAlert` による既存チャイム）は変更しない。
- 設計の詳細は spec を正本とする: `docs/superpowers/specs/2026-07-15-countdown-tick-sound-design.md`

## 実装時に判明した簡略化（spec からの差分）

spec ではフックの引数に `isPaused`/`onBreak` を個別に渡す想定だったが、`packages/core/src/evolve.ts` の `freezeRunningClock` を調査した結果、一時停止（`evolveSessionPaused`）は必ず `clock.running` を `false` にして残量を凍結すること、休憩機能（`onBreak`）は v2.10 で UI/コマンドが撤去済みの dormant フィールドで実質常に `false` であることを確認した。したがって **`room.clock.running` 単独で「走行中かどうか」を過不足なく判定できる**（一時停止中・休憩中はどちらも `running=false` になる）。冗長な引数を渡さず `running: boolean` 1つに絞る。要件（一時停止・休憩中は鳴らさない）は変わらず満たされる。

---

### Task 1: `NotifyPreferences` にカウントダウン設定フィールドを追加

**Files:**
- Modify: `apps/web/src/prefs/local-prefs.ts`
- Modify: `apps/web/test/prefs/notify-prefs.test.ts`
- Modify: `apps/web/test/platform/notify.test.ts`
- Modify: `apps/web/test/ui/use-switch-alert.test.ts`
- Modify: `apps/web/test/ui/use-switch-alert.test.tsx`
- Modify: `apps/web/test/ui/use-notify-preferences.test.tsx`

**Interfaces:**
- Produces: `NotifyPreferences` に `countdownEnabled: boolean`・`countdownSeconds: number` を追加（両方必須フィールド）。`DEFAULT_NOTIFY_PREFERENCES.countdownEnabled = false`・`DEFAULT_NOTIFY_PREFERENCES.countdownSeconds = 15`。`loadNotifyPreferences()` は欠損時にこの既定で補完する。

- [ ] **Step 1: 失敗するテストを `notify-prefs.test.ts` に追加**

`apps/web/test/prefs/notify-prefs.test.ts` の末尾（最後の `it("既定 soundId は department"...)` の後、`});` の前）に追加:

```ts
  it("countdownEnabled の既定は false", () => {
    expect(loadNotifyPreferences().countdownEnabled).toBe(false);
  });

  it("countdownSeconds の既定は 15", () => {
    expect(loadNotifyPreferences().countdownSeconds).toBe(15);
  });

  it("countdownEnabled/countdownSeconds を保存して読み戻せる", () => {
    saveNotifyPreferences({
      enabled: true, soundId: "bell", osNotify: false, volume: 0.5,
      countdownEnabled: true, countdownSeconds: 10,
    });
    const p = loadNotifyPreferences();
    expect(p.countdownEnabled).toBe(true);
    expect(p.countdownSeconds).toBe(10);
  });

  it("欠損フィールド（countdown系）は既定で補完する", () => {
    localStorage.setItem(
      "tdd-mob:notify:v1",
      JSON.stringify({ enabled: true, soundId: "bell", osNotify: true, volume: 0.5 }),
    );
    const p = loadNotifyPreferences();
    expect(p.countdownEnabled).toBe(false);
    expect(p.countdownSeconds).toBe(15);
  });
```

同ファイルの既存の2箇所（`toEqual` で全フィールド比較している「保存して読み戻せる」テスト）を更新する。

`saveNotifyPreferences({ enabled: true, soundId: "bell", osNotify: false, volume: 0.5 });` の行を含む `it("保存して読み戻せる", ...)` を丸ごと次に置き換える:

```ts
  it("保存して読み戻せる", () => {
    saveNotifyPreferences({
      enabled: true, soundId: "bell", osNotify: false, volume: 0.5,
      countdownEnabled: false, countdownSeconds: 15,
    });
    expect(loadNotifyPreferences()).toEqual({
      enabled: true, soundId: "bell", osNotify: false, volume: 0.5,
      countdownEnabled: false, countdownSeconds: 15,
    });
  });
```

`it("volume を保存して読み戻せる", ...)` 内の `saveNotifyPreferences({ enabled: true, soundId: "bell", osNotify: false, volume: 0.3 });` を次に置き換える（型エラー回避のため。アサーション対象は volume のみで変更なし）:

```ts
    saveNotifyPreferences({
      enabled: true, soundId: "bell", osNotify: false, volume: 0.3,
      countdownEnabled: false, countdownSeconds: 15,
    });
```

- [ ] **Step 2: テストを実行し失敗を確認**

Run: `cd apps/web && ~/.local/bin/pnpm exec vitest run test/prefs/notify-prefs.test.ts`
Expected: FAIL（`countdownEnabled`/`countdownSeconds` が `NotifyPreferences` に存在しない旨の型エラー、または `toBe(false)`/`toBe(15)` の代わりに `undefined` で失敗）

- [ ] **Step 3: `local-prefs.ts` を実装**

`apps/web/src/prefs/local-prefs.ts` の `NotifyPreferences` interface を次に置き換える:

```ts
export interface NotifyPreferences {
  /** 通知（音・振動・OS通知）を有効にするか。既定 false。 */
  enabled: boolean;
  /** 選択中のチャイム ID（platform/sound.ts の CHIMES に対応）。 */
  soundId: string;
  /** タブが隠れている時に OS 通知も出すか。enabled 時のみ意味を持つ。 */
  osNotify: boolean;
  /** 通知音の音量（0–1）。既定 0.6。 */
  volume: number;
  /** 交代前カウントダウン予告音を鳴らすか。既定 false（Issue #2）。 */
  countdownEnabled: boolean;
  /** カウントダウンを開始する残り秒数のしきい値（5〜15）。既定 15（Issue #2）。 */
  countdownSeconds: number;
}
```

`DEFAULT_NOTIFY_PREFERENCES` を次に置き換える:

```ts
export const DEFAULT_NOTIFY_PREFERENCES: NotifyPreferences = {
  enabled: false,
  soundId: "department",
  osNotify: true,
  volume: 0.6,
  countdownEnabled: false,
  countdownSeconds: 15,
};
```

`loadNotifyPreferences()` 内の `return` オブジェクトを次に置き換える:

```ts
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_NOTIFY_PREFERENCES.enabled,
      soundId: typeof parsed.soundId === "string" ? parsed.soundId : DEFAULT_NOTIFY_PREFERENCES.soundId,
      osNotify: typeof parsed.osNotify === "boolean" ? parsed.osNotify : DEFAULT_NOTIFY_PREFERENCES.osNotify,
      volume: typeof parsed.volume === "number" ? parsed.volume : DEFAULT_NOTIFY_PREFERENCES.volume,
      countdownEnabled: typeof parsed.countdownEnabled === "boolean" ? parsed.countdownEnabled : DEFAULT_NOTIFY_PREFERENCES.countdownEnabled,
      countdownSeconds: typeof parsed.countdownSeconds === "number" ? parsed.countdownSeconds : DEFAULT_NOTIFY_PREFERENCES.countdownSeconds,
    };
```

- [ ] **Step 4: テストを実行し成功を確認**

Run: `cd apps/web && ~/.local/bin/pnpm exec vitest run test/prefs/notify-prefs.test.ts`
Expected: PASS（全件緑）

- [ ] **Step 5: 型変更の波及を修正（既存フィクスチャの更新）**

`NotifyPreferences` が必須フィールド2つ増えたことで、この型を明示的に使う既存テストの object literal がコンパイルエラーになる。以下を修正する。

`apps/web/test/platform/notify.test.ts` の `basePrefs` を次に置き換える:

```ts
const basePrefs: NotifyPreferences = {
  enabled: false,
  soundId: "chime",
  volume: 0.7,
  osNotify: true,
  countdownEnabled: false,
  countdownSeconds: 15,
};
```

`apps/web/test/ui/use-switch-alert.test.ts` の `const notify = ...` 行を次に置き換える:

```ts
const notify = { enabled: true, soundId: "department", osNotify: false, volume: 0.6, countdownEnabled: false, countdownSeconds: 15 };
```

`apps/web/test/ui/use-switch-alert.test.tsx` の `OFF`/`ON` 定数を次に置き換える:

```ts
const OFF = { enabled: false, soundId: "chime-up", osNotify: true, volume: 0.6, countdownEnabled: false, countdownSeconds: 15 };
const ON = { enabled: true, soundId: "bell", osNotify: true, volume: 0.4, countdownEnabled: false, countdownSeconds: 15 };
```

`apps/web/test/ui/use-notify-preferences.test.tsx` の2箇所の `saveNotifyPreferences(...)` 呼び出しを次に置き換える（1つ目、25行目付近の `it("同一タブで...")` 内）:

```ts
      saveNotifyPreferences({
        enabled: true, soundId: "bell", osNotify: false, volume: 0.6,
        countdownEnabled: false, countdownSeconds: 15,
      });
```

（2つ目、38行目付近の `it("別タブの storage イベントでも追従する")` 冒頭）:

```ts
    saveNotifyPreferences({
      enabled: false, soundId: "chime-up", osNotify: true, volume: 0.6,
      countdownEnabled: false, countdownSeconds: 15,
    });
```

同ファイル46行目付近の `JSON.stringify({ enabled: true, soundId: "soft", osNotify: true })`（欠損フィールドのフォールバック確認テスト）は意図的な部分データなので**変更しない**。

- [ ] **Step 6: 影響範囲のテストを実行し全て成功を確認**

Run: `cd apps/web && ~/.local/bin/pnpm exec vitest run test/prefs/notify-prefs.test.ts test/platform/notify.test.ts test/ui/use-switch-alert.test.ts test/ui/use-switch-alert.test.tsx test/ui/use-notify-preferences.test.tsx`
Expected: PASS（全件緑）

Run: `cd apps/web && ~/.local/bin/pnpm exec tsc --noEmit`
Expected: エラーなし

- [ ] **Step 7: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add tdd-mob-pro-timer/apps/web/src/prefs/local-prefs.ts \
  tdd-mob-pro-timer/apps/web/test/prefs/notify-prefs.test.ts \
  tdd-mob-pro-timer/apps/web/test/platform/notify.test.ts \
  tdd-mob-pro-timer/apps/web/test/ui/use-switch-alert.test.ts \
  tdd-mob-pro-timer/apps/web/test/ui/use-switch-alert.test.tsx \
  tdd-mob-pro-timer/apps/web/test/ui/use-notify-preferences.test.tsx
git commit -m "feat(web): NotifyPreferences にカウントダウン予告設定を追加（Issue #2）"
```

---

### Task 2: `platform/sound.ts` にカウントダウン用ビープ音を追加

**Files:**
- Modify: `apps/web/src/platform/sound.ts`
- Modify: `apps/web/test/platform/sound.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `playCountdownTick(volume: number): void`（`apps/web/src/platform/sound.ts` からエクスポート）

- [ ] **Step 1: 失敗するテストを追加**

`apps/web/test/platform/sound.test.ts` の先頭 import を次に置き換える:

```ts
import { describe, it, expect } from "vitest";
import { CHIMES, playChime, installAudioUnlock, DEFAULT_VOLUME, scheduleTones, playCountdownTick } from "../../src/platform/sound.js";
```

ファイル末尾（`describe("チャイム registry"...)` ブロックの後）に追加:

```ts

describe("playCountdownTick（カウントダウン予告音・Issue #2）", () => {
  it("例外を投げず呼び出せる", () => {
    expect(() => playCountdownTick(0.6)).not.toThrow();
  });

  it("音量 0 でも例外を投げない", () => {
    expect(() => playCountdownTick(0)).not.toThrow();
  });
});
```

- [ ] **Step 2: テストを実行し失敗を確認**

Run: `cd apps/web && ~/.local/bin/pnpm exec vitest run test/platform/sound.test.ts`
Expected: FAIL（`playCountdownTick` が `../../src/platform/sound.js` からエクスポートされていない）

- [ ] **Step 3: `playCountdownTick` を実装**

`apps/web/src/platform/sound.ts` の `/** 選択可能なチャイム。...*/` コメントの直前に追加:

```ts
/** カウントダウン予告音の周波数(Hz)。既存チャイムとは別系統の短いビープ（Issue #2）。 */
const COUNTDOWN_TICK_FREQ = 880;

/** 交代前カウントダウン中に毎秒鳴らす短いビープ音（fire-and-forget）。 */
export function playCountdownTick(volume: number): void {
  playTones([COUNTDOWN_TICK_FREQ], volume, { gap: 0.12, gain: 0.35 });
}

```

- [ ] **Step 4: テストを実行し成功を確認**

Run: `cd apps/web && ~/.local/bin/pnpm exec vitest run test/platform/sound.test.ts`
Expected: PASS（全件緑）

- [ ] **Step 5: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add tdd-mob-pro-timer/apps/web/src/platform/sound.ts tdd-mob-pro-timer/apps/web/test/platform/sound.test.ts
git commit -m "feat(web): カウントダウン予告用ビープ音 playCountdownTick を追加（Issue #2）"
```

---

### Task 3: `useCountdownTick` フックを新規作成

**Files:**
- Create: `apps/web/src/ui/use-countdown-tick.ts`
- Create: `apps/web/test/ui/use-countdown-tick.test.ts`

**Interfaces:**
- Consumes: `playCountdownTick(volume: number): void`（Task 2、`../platform/sound.js`）
- Produces: `useCountdownTick(secondsLeft: number, running: boolean, opts: CountdownTickOptions): void` および `export interface CountdownTickOptions { enabled: boolean; thresholdSeconds: number; volume: number }`（`apps/web/src/ui/use-countdown-tick.ts` からエクスポート）

- [ ] **Step 1: 失敗するテストを新規作成**

`apps/web/test/ui/use-countdown-tick.test.ts` を新規作成:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("../../src/platform/sound.js", () => ({ playCountdownTick: vi.fn() }));

import { playCountdownTick } from "../../src/platform/sound.js";
import { useCountdownTick } from "../../src/ui/use-countdown-tick.js";

const opts = { enabled: true, thresholdSeconds: 15, volume: 0.6 };

describe("useCountdownTick（交代前カウントダウン予告音・Issue #2）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("しきい値以下に入った瞬間に1回鳴る", () => {
    const { rerender } = renderHook(
      ({ s }) => useCountdownTick(s, true, opts),
      { initialProps: { s: 16 } },
    );
    expect(playCountdownTick).not.toHaveBeenCalled();
    rerender({ s: 15 });
    expect(playCountdownTick).toHaveBeenCalledTimes(1);
    expect(playCountdownTick).toHaveBeenCalledWith(0.6);
  });

  it("同じ整数秒内の再レンダーでは多重発火しない", () => {
    const { rerender } = renderHook(
      ({ s }) => useCountdownTick(s, true, opts),
      { initialProps: { s: 15 } },
    );
    expect(playCountdownTick).toHaveBeenCalledTimes(1);
    rerender({ s: 14.8 });
    expect(playCountdownTick).toHaveBeenCalledTimes(1);
  });

  it("秒が進んで別の整数値になったら再度発火する", () => {
    const { rerender } = renderHook(
      ({ s }) => useCountdownTick(s, true, opts),
      { initialProps: { s: 15 } },
    );
    rerender({ s: 14 });
    expect(playCountdownTick).toHaveBeenCalledTimes(2);
  });

  it("しきい値より外側なら発火しない", () => {
    renderHook(() => useCountdownTick(20, true, opts));
    expect(playCountdownTick).not.toHaveBeenCalled();
  });

  it("停止中(running=false)は発火しない（一時停止・休憩の両方をカバー）", () => {
    renderHook(() => useCountdownTick(10, false, opts));
    expect(playCountdownTick).not.toHaveBeenCalled();
  });

  it("個人設定 OFF なら発火しない", () => {
    renderHook(() => useCountdownTick(10, true, { ...opts, enabled: false }));
    expect(playCountdownTick).not.toHaveBeenCalled();
  });

  it("残り0秒（交代の瞬間）では発火しない", () => {
    renderHook(() => useCountdownTick(0, true, opts));
    expect(playCountdownTick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストを実行し失敗を確認**

Run: `cd apps/web && ~/.local/bin/pnpm exec vitest run test/ui/use-countdown-tick.test.ts`
Expected: FAIL（`../../src/ui/use-countdown-tick.js` が存在しない）

- [ ] **Step 3: フックを実装**

`apps/web/src/ui/use-countdown-tick.ts` を新規作成:

```ts
/**
 * 交代前カウントダウン予告音のフック（Issue #2）。
 *
 * 残り秒数(secondsLeft)が個人設定の予告秒数(thresholdSeconds)以下になったら、
 * 整数秒が変わるたびに 1 回だけ playCountdownTick を呼ぶ。
 *
 * running=false（room.clock.running）のときは何もしない。一時停止（evolveSessionPaused）は
 * 必ず freezeRunningClock で running を false にし、休憩(onBreak)は v2.10 で UI/コマンドが
 * 撤去済みの dormant フィールドで実質常に false のため、running 単独で
 * 「一時停止中でも休憩中でもなく走行中」を過不足なく判定できる。
 */

import { useEffect, useRef } from "react";
import { playCountdownTick } from "../platform/sound.js";

export interface CountdownTickOptions {
  /** 個人設定: カウントダウン予告音を鳴らすか。 */
  enabled: boolean;
  /** 予告を開始する残り秒数のしきい値。 */
  thresholdSeconds: number;
  /** 再生音量(0–1)。 */
  volume: number;
}

export function useCountdownTick(
  secondsLeft: number,
  running: boolean,
  opts: CountdownTickOptions,
): void {
  const lastFiredRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) {
      lastFiredRef.current = null;
      return;
    }
    const current = Math.ceil(secondsLeft);
    if (
      opts.enabled &&
      current > 0 &&
      current <= opts.thresholdSeconds &&
      lastFiredRef.current !== current
    ) {
      lastFiredRef.current = current;
      playCountdownTick(opts.volume);
    }
  }, [secondsLeft, running, opts.enabled, opts.thresholdSeconds, opts.volume]);
}
```

- [ ] **Step 4: テストを実行し成功を確認**

Run: `cd apps/web && ~/.local/bin/pnpm exec vitest run test/ui/use-countdown-tick.test.ts`
Expected: PASS（全件緑）

- [ ] **Step 5: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add tdd-mob-pro-timer/apps/web/src/ui/use-countdown-tick.ts tdd-mob-pro-timer/apps/web/test/ui/use-countdown-tick.test.ts
git commit -m "feat(web): 交代前カウントダウン予告音のフック useCountdownTick を追加（Issue #2）"
```

---

### Task 4: `NotifySettingsPanel` にカウントダウン設定 UI を追加

**Files:**
- Modify: `apps/web/src/ui/components/NotifySettingsPanel.tsx`
- Modify: `apps/web/test/ui/NotifySettingsPanel.test.tsx`

**Interfaces:**
- Consumes: `NotifyPreferences.countdownEnabled`/`countdownSeconds`（Task 1）
- Produces: なし（UI コンポーネントの表示・`onChange` 呼び出しのみ。呼び出し側は既存の `patch: Partial<NotifyPreferences>` をそのまま扱える）

- [ ] **Step 1: 失敗するテストを追加**

`apps/web/test/ui/NotifySettingsPanel.test.tsx` の `const prefs = ...` を次に置き換える:

```ts
const prefs = { enabled: true, soundId: "department", osNotify: true, volume: 0.6, countdownEnabled: false, countdownSeconds: 15 };
```

同ファイル末尾（最後の `it("二重描画..."`ブロックの後、末尾の `});` の前）に追加:

```ts
  it("カウントダウン予告トグルで onChange({countdownEnabled}) を呼ぶ", () => {
    const onChange = vi.fn();
    render(<NotifySettingsPanel prefs={prefs} onChange={onChange} onPreview={vi.fn()} />);
    fireEvent.click(screen.getByRole("switch", { name: "交代前にカウントダウン音を鳴らす" }));
    expect(onChange).toHaveBeenCalledWith({ countdownEnabled: true });
  });

  it("カウントダウン予告秒数スライダーで onChange({countdownSeconds}) を呼ぶ", () => {
    const onChange = vi.fn();
    render(<NotifySettingsPanel prefs={prefs} onChange={onChange} onPreview={vi.fn()} />);
    fireEvent.change(screen.getByRole("slider", { name: "カウントダウン予告秒数" }), { target: { value: "10" } });
    expect(onChange).toHaveBeenCalledWith({ countdownSeconds: 10 });
  });

  it("カウントダウン予告秒数の現在値を見出しに表示する", () => {
    render(<NotifySettingsPanel prefs={{ ...prefs, countdownSeconds: 8 }} onChange={vi.fn()} onPreview={vi.fn()} />);
    expect(screen.getByText(/8秒/)).toBeTruthy();
  });
```

- [ ] **Step 2: テストを実行し失敗を確認**

Run: `cd apps/web && ~/.local/bin/pnpm exec vitest run test/ui/NotifySettingsPanel.test.tsx`
Expected: FAIL（`getByRole("switch", { name: "交代前にカウントダウン音を鳴らす" })` 等が見つからない）

- [ ] **Step 3: UI を実装**

`apps/web/src/ui/components/NotifySettingsPanel.tsx` の `const volumeFieldId = ...` の行の直後に追加:

```ts
  const countdownSecondsFieldId = `${fieldId}-countdown-seconds`;
```

`{/* OS 通知トグル */}` ブロックの直前（音量スライダーの `</div>` の後）に追加:

```tsx
      {/* カウントダウン予告音トグル（Issue #2） */}
      <label className="mt-3 flex items-center justify-between gap-2">
        <span>交代前にカウントダウン音を鳴らす</span>
        <button
          type="button"
          role="switch"
          aria-label="交代前にカウントダウン音を鳴らす"
          aria-checked={prefs.countdownEnabled}
          onClick={() => onChange({ countdownEnabled: !prefs.countdownEnabled })}
          className={`h-5 w-9 rounded-full transition-colors ${prefs.countdownEnabled ? "bg-[var(--signal)]" : "bg-[var(--panel-2)]"}`}
        >
          <span
            className={`block h-4 w-4 rounded-full bg-white transition-transform ${prefs.countdownEnabled ? "translate-x-4" : "translate-x-0.5"}`}
          />
        </button>
      </label>

      {/* カウントダウン予告秒数スライダー（5〜15秒・Issue #2） */}
      <div className="mt-3">
        <label htmlFor={countdownSecondsFieldId} className="instrument-label">
          カウントダウン予告秒数: {prefs.countdownSeconds}秒
        </label>
        <input
          id={countdownSecondsFieldId}
          type="range"
          aria-label="カウントダウン予告秒数"
          min={5}
          max={15}
          step={1}
          value={prefs.countdownSeconds}
          onChange={(e) => onChange({ countdownSeconds: Number(e.target.value) })}
          className="mt-1 w-full"
        />
      </div>

```

- [ ] **Step 4: テストを実行し成功を確認**

Run: `cd apps/web && ~/.local/bin/pnpm exec vitest run test/ui/NotifySettingsPanel.test.tsx`
Expected: PASS（全件緑）

- [ ] **Step 5: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add tdd-mob-pro-timer/apps/web/src/ui/components/NotifySettingsPanel.tsx tdd-mob-pro-timer/apps/web/test/ui/NotifySettingsPanel.test.tsx
git commit -m "feat(web): 通知設定パネルにカウントダウン予告のトグル/スライダーを追加（Issue #2）"
```

---

### Task 5: `Session.tsx` に `useCountdownTick` を配線

**Files:**
- Modify: `apps/web/src/ui/Session.tsx`
- Create: `apps/web/test/ui/Session.countdown.test.tsx`

**Interfaces:**
- Consumes: `useCountdownTick(secondsLeft, running, opts)`（Task 3）、`notifyPrefs.countdownEnabled`/`countdownSeconds`（Task 1、既存の `notifyPrefs`（`useNotifyPreferences()`）経由）

> **重要:** [[feedback_ui_wiring_needs_real_screen_check]] の教訓により、単体テストが緑でも「App/Session に実配線されていない」可能性がある。本タスクは配線そのものをテストし、かつ Step 6 で dev サーバーを起動して実画面・実音で確認する。

- [ ] **Step 1: 失敗する配線テストを新規作成**

`apps/web/test/ui/Session.countdown.test.tsx` を新規作成（`Session.assertive.test.tsx` の fixture 構成に準拠）:

```tsx
/**
 * Session × 交代前カウントダウン予告音の配線テスト（Issue #2）
 *
 * useCountdownTick が実際に呼ばれ、タイマー状態と個人設定が正しく渡っていることを確認する。
 * フック自体の挙動（何秒で鳴るか等）は use-countdown-tick.test.ts で検証済みのため、
 * ここでは「Session が正しい引数でフックを呼んでいるか」の配線のみを見る。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import type { Room, Participant, SessionConfig } from "@tdd-mob/core";

vi.mock("../../src/ui/use-countdown-tick.js", () => ({ useCountdownTick: vi.fn() }));

import { useCountdownTick } from "../../src/ui/use-countdown-tick.js";
import { Session } from "../../src/ui/Session.js";

function makeParticipant(overrides: Partial<Participant>): Participant {
  return {
    participantId: "p1", connId: "c1", displayName: "Alice", role: "editor",
    presence: "online", hasAiKey: false, joinedAt: 1000, ...overrides,
  };
}

function makeRoom(running: boolean, isPaused: boolean): Room {
  const config: SessionConfig = {
    language: "TypeScript", difficulty: "easy", members: ["Alice", "Bob"], intervalMinutes: 5,
  };
  return {
    code: "AA0001", createdAt: 0, hostParticipantId: "host-1", config, problem: null,
    session: { rotation: ["Alice", "Bob"], currentIndex: 0, isPaused, driverCounts: [0, 0], totalSwitches: 0 },
    clock: { running, intervalSeconds: 300, anchorServerTime: 0, secondsLeftAtAnchor: 300, accumulatedElapsedMs: 0, runningSince: running ? 0 : null },
    phase: "session",
    participants: [
      makeParticipant({ participantId: "host-1", displayName: "Alice", role: "host" }),
      makeParticipant({ participantId: "edit-1", displayName: "Bob", role: "editor", connId: "c2" }),
    ],
    sessionRecords: [], handoffNote: "", onBreak: false,
  };
}

const noop = () => {};
function handlers() {
  return {
    onSkip: noop, onPause: noop, onResume: noop, onComplete: noop, onAbort: noop,
    onReset: noop, onRenameParticipant: noop,
    onDriverSkip: noop, onDriverResume: noop, onAddProxy: noop, onHandoffNoteSet: noop,
  };
}

describe("Session × カウントダウン予告音の配線（Issue #2）", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { localStorage.clear(); vi.clearAllMocks(); });

  it("個人設定とタイマー走行状態をフックに渡す", () => {
    localStorage.setItem(
      "tdd-mob:notify:v1",
      JSON.stringify({
        enabled: false, soundId: "department", osNotify: true, volume: 0.6,
        countdownEnabled: true, countdownSeconds: 10,
      }),
    );
    render(<Session room={makeRoom(true, false)} participantId="host-1" {...handlers()} />);
    expect(useCountdownTick).toHaveBeenCalledWith(
      expect.any(Number),
      true,
      { enabled: true, thresholdSeconds: 10, volume: 0.6 },
    );
  });

  it("一時停止中(running=false)を渡す", () => {
    render(<Session room={makeRoom(false, true)} participantId="host-1" {...handlers()} />);
    expect(useCountdownTick).toHaveBeenCalledWith(expect.any(Number), false, expect.anything());
  });

  it("個人設定 OFF（既定）のとき enabled=false を渡す", () => {
    render(<Session room={makeRoom(true, false)} participantId="host-1" {...handlers()} />);
    expect(useCountdownTick).toHaveBeenCalledWith(
      expect.any(Number),
      true,
      expect.objectContaining({ enabled: false }),
    );
  });
});
```

- [ ] **Step 2: テストを実行し失敗を確認**

Run: `cd apps/web && ~/.local/bin/pnpm exec vitest run test/ui/Session.countdown.test.tsx`
Expected: FAIL（`useCountdownTick` が呼ばれていない）

- [ ] **Step 3: `Session.tsx` に配線を実装**

import 部分（`import { useSwitchAlert } from "./use-switch-alert.js";` の直後）に追加:

```ts
import { useCountdownTick } from "./use-countdown-tick.js";
```

`const running = room.clock.running;`（既存 187〜188行目付近）の直後に追加:

```ts

  // 交代前カウントダウン予告音（Issue #2）。個人設定でON/OFF・予告秒数を制御。
  useCountdownTick(displayRemaining, running, {
    enabled: notifyPrefs.countdownEnabled,
    thresholdSeconds: notifyPrefs.countdownSeconds,
    volume: notifyPrefs.volume,
  });
```

- [ ] **Step 4: テストを実行し成功を確認**

Run: `cd apps/web && ~/.local/bin/pnpm exec vitest run test/ui/Session.countdown.test.tsx`
Expected: PASS（全件緑）

- [ ] **Step 5: Session 関連の既存テストが壊れていないことを確認**

Run: `cd apps/web && ~/.local/bin/pnpm exec vitest run test/ui/Session.assertive.test.tsx test/ui/Session.break.test.tsx test/ui/Session.handoff.test.tsx test/ui/Session.invite.test.tsx test/ui/Session.problem.test.tsx test/ui/Session.roster.test.tsx test/ui/Session.rotation.test.tsx`
Expected: PASS（全件緑。`useCountdownTick` は本テストファイル群では未モックのため実フックが動くが、`playCountdownTick` は AudioContext 未取得で無音・無例外のため既存テストに影響しない）

- [ ] **Step 6: 実機確認（dev サーバー起動・実画面/実音）**

feedback_ui_wiring_needs_real_screen_check の教訓に従い、テスト緑だけで完了と判断しない。

```bash
# 旧プロセスの掃除（WSL/devcontainer で長寿命 vite/sync が残り旧コードを配信する既知の罠）
for p in $(lsof -ti tcp:5173 tcp:5174 tcp:8787); do kill -9 $p; done

cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer
bun run apps/sync/src/server.ts &
cd apps/web && ~/.local/bin/pnpm dev
```

dev ログの `Local:` URL（5173 が塞がっていれば 5174 等）をブラウザで開き:
1. ロビーの「通知」ポップオーバーで「交代前にカウントダウン音を鳴らす」をON、予告秒数を短め（5秒程度）に設定
2. セッションを開始し、交代間隔を短く（例: 1分）設定しておく
3. 残り5秒を切ったあたりから毎秒ビープ音が聞こえ、交代の瞬間に既存の交代チャイムへ切り替わることを確認
4. カウントダウン設定を OFF に戻すと予告音が鳴らないことを確認
5. 一時停止中はカウントダウン音が鳴らないことを確認

確認後、`kill %1` 等で起動した sync/dev サーバーを停止する。

- [ ] **Step 7: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add tdd-mob-pro-timer/apps/web/src/ui/Session.tsx tdd-mob-pro-timer/apps/web/test/ui/Session.countdown.test.tsx
git commit -m "feat(web): Session にカウントダウン予告音フックを配線（Issue #2、実機確認済み）"
```

---

### Task 6: 全体検証（typecheck / test / build）

**Files:** なし（検証のみ）

- [ ] **Step 1: 全体 typecheck**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer && ~/.local/bin/pnpm typecheck`
Expected: 4/4 タスク緑（core/sync/web/該当パッケージ）

- [ ] **Step 2: 全体テスト**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer && ~/.local/bin/pnpm test`
Expected: core/sync/web すべて緑（既存件数 + 本 Issue で追加した件数）

- [ ] **Step 3: 全体ビルド**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer && ~/.local/bin/pnpm build`
Expected: 3タスク（core/sync/web）すべて緑

- [ ] **Step 4: Issue #2 のクローズ判断を人間に委ねる**

本番デプロイ・Issue クローズはユーザー承認後に行う（[[project_tasuki_vps_deployment]] のデプロイ手順に従う）。このタスクでは実施しない。
