# カウントダウン音の音程3段階変化（Issue #3） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交代前カウントダウン音（Issue #2 で実装済み）を、残り秒数に応じて3段階の周波数（低→高）に変化させる（GitHub Issue #3）。

**Architecture:** `platform/sound.ts` に区間判定の純粋関数 `computeCountdownStage` と周波数定数 `COUNTDOWN_STAGE_FREQS` を追加し、`playCountdownTick` にオプションの `stage` 引数を足す。`useCountdownTick` フックが発火のたびに `computeCountdownStage` で段階を計算し `playCountdownTick` に渡す。`Session.tsx` の配線は変更不要。

**Tech Stack:** React 19 / TypeScript / Vitest + @testing-library/react（Issue #2 と同じ）。

## Global Constraints

- 予告秒数（`thresholdSeconds`）を均等三分割する（`segment = thresholdSeconds / 3`）。固定秒数での区切りにはしない。
- 周波数は 660Hz（段階1・低）/ 880Hz（段階2・中）/ 1108Hz（段階3・高）の3種。
- 残りが少ない（交代に近い）区間ほど高い段階（高音）、残りが多い区間ほど低い段階（低音）。
- 音程変化の個別ON/OFF設定は作らない。Issue #2 のカウントダウン自体のON/OFF（`notify.countdownEnabled`）にそのまま乗る。
- `Session.tsx` の配線・`NotifyPreferences` 型・`NotifySettingsPanel` のUIは変更しない。
- 設計の詳細は spec を正本とする: `docs/superpowers/specs/2026-07-16-countdown-pitch-stages-design.md`

---

### Task 1: `sound.ts` に段階判定関数と3段階周波数を追加

**Files:**
- Modify: `apps/web/src/platform/sound.ts`
- Modify: `apps/web/test/platform/sound.test.ts`

**Interfaces:**
- Produces: `COUNTDOWN_STAGE_FREQS: readonly [number, number, number]`（`[660, 880, 1108]`）、`computeCountdownStage(currentSeconds: number, thresholdSeconds: number): 1 | 2 | 3`、`playCountdownTick(volume: number, stage?: 1 | 2 | 3): void`（`stage` 省略時は `1`）。すべて `apps/web/src/platform/sound.ts` からエクスポート。

- [ ] **Step 1: 失敗するテストを追加**

`apps/web/test/platform/sound.test.ts` の先頭 import を次に置き換える:

```ts
import { describe, it, expect } from "vitest";
import {
  CHIMES, playChime, installAudioUnlock, DEFAULT_VOLUME, scheduleTones,
  playCountdownTick, computeCountdownStage, COUNTDOWN_STAGE_FREQS,
} from "../../src/platform/sound.js";
```

ファイル末尾の `describe("playCountdownTick（カウントダウン予告音・Issue #2）"...)` ブロックを次に置き換える（既存2件は変更なし、新規3件を追加）:

```ts
describe("playCountdownTick（カウントダウン予告音・Issue #2）", () => {
  it("例外を投げず呼び出せる", () => {
    expect(() => playCountdownTick(0.6)).not.toThrow();
  });

  it("音量 0 でも例外を投げない", () => {
    expect(() => playCountdownTick(0)).not.toThrow();
  });

  it("stage 1/2/3 いずれでも例外を投げない", () => {
    expect(() => playCountdownTick(0.6, 1)).not.toThrow();
    expect(() => playCountdownTick(0.6, 2)).not.toThrow();
    expect(() => playCountdownTick(0.6, 3)).not.toThrow();
  });
});

describe("COUNTDOWN_STAGE_FREQS（3段階周波数・Issue #3）", () => {
  it("低→中→高の3値(660/880/1108)を持つ", () => {
    expect(COUNTDOWN_STAGE_FREQS).toEqual([660, 880, 1108]);
  });
});

describe("computeCountdownStage（区間判定・Issue #3）", () => {
  it("threshold=15: 残り1〜5秒は段階3(高)", () => {
    expect(computeCountdownStage(1, 15)).toBe(3);
    expect(computeCountdownStage(5, 15)).toBe(3);
  });

  it("threshold=15: 残り6〜10秒は段階2(中)", () => {
    expect(computeCountdownStage(6, 15)).toBe(2);
    expect(computeCountdownStage(10, 15)).toBe(2);
  });

  it("threshold=15: 残り11〜15秒は段階1(低)", () => {
    expect(computeCountdownStage(11, 15)).toBe(1);
    expect(computeCountdownStage(15, 15)).toBe(1);
  });

  it("threshold=6(均等に3分割できる最小級): 2秒ずつの3区間", () => {
    expect(computeCountdownStage(1, 6)).toBe(3);
    expect(computeCountdownStage(2, 6)).toBe(3);
    expect(computeCountdownStage(3, 6)).toBe(2);
    expect(computeCountdownStage(4, 6)).toBe(2);
    expect(computeCountdownStage(5, 6)).toBe(1);
    expect(computeCountdownStage(6, 6)).toBe(1);
  });

  it("threshold=5(最小値・不均等区間): 段階3が1秒分だけになる", () => {
    expect(computeCountdownStage(1, 5)).toBe(3);
    expect(computeCountdownStage(2, 5)).toBe(2);
    expect(computeCountdownStage(3, 5)).toBe(2);
    expect(computeCountdownStage(4, 5)).toBe(1);
    expect(computeCountdownStage(5, 5)).toBe(1);
  });
});
```

- [ ] **Step 2: テストを実行し失敗を確認**

Run: `cd apps/web && ~/.local/bin/pnpm exec vitest run test/platform/sound.test.ts`
Expected: FAIL（`computeCountdownStage`/`COUNTDOWN_STAGE_FREQS` が `../../src/platform/sound.js` からエクスポートされていない）

- [ ] **Step 3: `sound.ts` を実装**

`apps/web/src/platform/sound.ts` の下記ブロック（`COUNTDOWN_TICK_FREQ` 定数と `playCountdownTick`）を丸ごと次に置き換える:

```ts
/** カウントダウン音の周波数（3段階・低→高、Issue #3）。段階1=交代から遠い/段階3=交代直前。 */
export const COUNTDOWN_STAGE_FREQS: readonly [number, number, number] = [660, 880, 1108];

/**
 * 残り秒数(currentSeconds)と予告秒数(thresholdSeconds)から、カウントダウン音の段階(1〜3)を判定する。
 * thresholdSeconds を3等分し、交代に近い（残りが少ない）区間ほど高い段階を返す（Issue #3）。
 */
export function computeCountdownStage(currentSeconds: number, thresholdSeconds: number): 1 | 2 | 3 {
  const segment = thresholdSeconds / 3;
  if (currentSeconds <= segment) return 3;
  if (currentSeconds <= segment * 2) return 2;
  return 1;
}

/** 交代前カウントダウン中に毎秒鳴らす短いビープ音（fire-and-forget）。stage 省略時は段階1（低）。 */
export function playCountdownTick(volume: number, stage: 1 | 2 | 3 = 1): void {
  playTones([COUNTDOWN_STAGE_FREQS[stage - 1]], volume, { gap: 0.12, gain: 0.35 });
}
```

- [ ] **Step 4: テストを実行し成功を確認**

Run: `cd apps/web && ~/.local/bin/pnpm exec vitest run test/platform/sound.test.ts`
Expected: PASS（全件緑）

- [ ] **Step 5: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add tdd-mob-pro-timer/apps/web/src/platform/sound.ts tdd-mob-pro-timer/apps/web/test/platform/sound.test.ts
git commit -m "feat(web): カウントダウン音の3段階周波数と区間判定 computeCountdownStage を追加（Issue #3）"
```

---

### Task 2: `useCountdownTick` に段階計算を配線

**Files:**
- Modify: `apps/web/src/ui/use-countdown-tick.ts`
- Modify: `apps/web/test/ui/use-countdown-tick.test.ts`

**Interfaces:**
- Consumes: `computeCountdownStage(currentSeconds, thresholdSeconds)`・`playCountdownTick(volume, stage)`（Task 1、`../platform/sound.js`）
- Produces: `useCountdownTick` のシグネチャ自体は変更なし（`secondsLeft, running, opts: CountdownTickOptions`）。挙動のみ変更（発火時に `playCountdownTick` を段階付きで呼ぶ）。

- [ ] **Step 1: 失敗するテストを追加**

`apps/web/test/ui/use-countdown-tick.test.ts` の先頭（`vi.mock` とその直後の import）を次に置き換える。`computeCountdownStage` は実装をそのまま使い、`playCountdownTick` だけをモックする:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("../../src/platform/sound.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/platform/sound.js")>();
  return { ...actual, playCountdownTick: vi.fn() };
});

import { playCountdownTick } from "../../src/platform/sound.js";
import { useCountdownTick } from "../../src/ui/use-countdown-tick.js";
```

既存の `it("しきい値以下に入った瞬間に1回鳴る", ...)` 内の次の行:

```ts
    expect(playCountdownTick).toHaveBeenCalledWith(0.6);
```

を次に置き換える（`opts.thresholdSeconds=15` で `current=15` は `computeCountdownStage(15,15)` → 段階1）:

```ts
    expect(playCountdownTick).toHaveBeenCalledWith(0.6, 1);
```

ファイル末尾（最後の `it("残り0秒（交代の瞬間）では発火しない", ...)` ブロックの後、末尾の `});` の前）に追加:

```ts
  it("threshold=15・残り5秒は段階3(高)で発火する（Issue #3）", () => {
    renderHook(() => useCountdownTick(5, true, opts));
    expect(playCountdownTick).toHaveBeenCalledWith(0.6, 3);
  });

  it("threshold=15・残り10秒は段階2(中)で発火する（Issue #3）", () => {
    renderHook(() => useCountdownTick(10, true, opts));
    expect(playCountdownTick).toHaveBeenCalledWith(0.6, 2);
  });

  it("threshold=15・残り11秒は段階1(低)で発火する（Issue #3）", () => {
    renderHook(() => useCountdownTick(11, true, opts));
    expect(playCountdownTick).toHaveBeenCalledWith(0.6, 1);
  });
```

- [ ] **Step 2: テストを実行し失敗を確認**

Run: `cd apps/web && ~/.local/bin/pnpm exec vitest run test/ui/use-countdown-tick.test.ts`
Expected: FAIL（`toHaveBeenCalledWith(0.6, 1)` 等が実際には `(0.6)` 単独引数で呼ばれ不一致）

- [ ] **Step 3: `use-countdown-tick.ts` を実装**

`apps/web/src/ui/use-countdown-tick.ts` の import 行を次に置き換える:

```ts
import { useEffect, useRef } from "react";
import { playCountdownTick, computeCountdownStage } from "../platform/sound.js";
```

発火ブロック（`useEffect` 内の `if (...) { lastFiredRef.current = current; playCountdownTick(opts.volume); }`）を次に置き換える:

```ts
    if (
      opts.enabled &&
      current > 0 &&
      current <= opts.thresholdSeconds &&
      lastFiredRef.current !== current
    ) {
      lastFiredRef.current = current;
      const stage = computeCountdownStage(current, opts.thresholdSeconds);
      playCountdownTick(opts.volume, stage);
    }
```

- [ ] **Step 4: テストを実行し成功を確認**

Run: `cd apps/web && ~/.local/bin/pnpm exec vitest run test/ui/use-countdown-tick.test.ts`
Expected: PASS（全件緑）

- [ ] **Step 5: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add tdd-mob-pro-timer/apps/web/src/ui/use-countdown-tick.ts tdd-mob-pro-timer/apps/web/test/ui/use-countdown-tick.test.ts
git commit -m "feat(web): useCountdownTick が段階付きで playCountdownTick を呼ぶよう配線（Issue #3）"
```

---

### Task 3: 全体検証（typecheck / test / build / 実機確認）

**Files:** なし（検証のみ）

- [ ] **Step 1: Session 関連の既存テストに回帰がないことを確認**

`Session.tsx` は本 Issue で変更しないが、`useCountdownTick`/`playCountdownTick` の挙動変更が波及していないことを確認する。

Run: `cd apps/web && ~/.local/bin/pnpm exec vitest run test/ui/Session.countdown.test.tsx`
Expected: PASS（全件緑。`Session.countdown.test.tsx` は `useCountdownTick` 自体をモックしているため本 Issue の変更による影響を受けない）

- [ ] **Step 2: 全体 typecheck**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer && ~/.local/bin/pnpm typecheck`
Expected: 4/4 タスク緑

- [ ] **Step 3: 全体テスト**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer && ~/.local/bin/pnpm test`
Expected: core/sync/web すべて緑（既存件数 + 本 Issue で追加した件数）

- [ ] **Step 4: 全体ビルド**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer && ~/.local/bin/pnpm build`
Expected: 3タスク（core/sync/web）すべて緑

- [ ] **Step 5: 実機確認（dev サーバー起動・オシレーター周波数のプロキシ計測）**

自分（実装エージェント）は音声を実際に聴くことができない。「音が正しく鳴った」「音程が高くなるのが聞こえた」という主張はしない。代わりに `AudioContext.prototype.createOscillator`/`.frequency.value` をブラウザ上でフックし、実際に呼ばれた周波数の推移を観測可能な代理指標として確認する。

```bash
for p in $(lsof -ti tcp:5173 tcp:5174 tcp:8787 2>/dev/null); do kill -9 $p 2>/dev/null; done
cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer
bun run apps/sync/src/server.ts &
cd apps/web && ~/.local/bin/pnpm dev
```

dev ログの `Local:` URL をブラウザ自動操作ツール（playwright 等）で開き、ページ読み込み後に次のようなフックを注入してから、通知設定でカウントダウンを ON・予告秒数を短め（例: 6秒、`computeCountdownStage` の境界がちょうど2秒刻みになる値）に設定してセッションを開始し、残り秒数が閾値を切ってから交代までの `window.__freqCalls` を確認する:

```js
window.__freqCalls = [];
const origCreateOsc = window.AudioContext.prototype.createOscillator;
window.AudioContext.prototype.createOscillator = function (...args) {
  const osc = origCreateOsc.apply(this, args);
  const origSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(osc.frequency), "value")?.set;
  Object.defineProperty(osc.frequency, "value", {
    set(v) { window.__freqCalls.push(v); if (origSetter) origSetter.call(this, v); },
    get() { return undefined; },
  });
  return osc;
};
```

予告秒数6秒なら、残り6,5秒で660Hz・残り4,3秒で880Hz・残り2,1秒で1108Hzの順で `window.__freqCalls` に記録されることを確認する（`computeCountdownStage` の Task 1 テストケースと一致）。確認後、起動したサーバーは停止する。

- [ ] **Step 6: Issue #3 のクローズ判断を人間に委ねる**

PR 作成・Issue クローズはユーザー承認後に行う。このタスクでは実施しない。
