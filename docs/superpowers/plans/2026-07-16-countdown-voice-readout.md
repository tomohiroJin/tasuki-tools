# 音声によるカウントダウン読み上げ（Issue #5）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交代前カウントダウン中に、トーン音の代わりに選択した話者（男声/女声）で「10、9、8…」と数字を読み上げる方式を個人設定で選べるようにする。

**Architecture:** 数字ごとの読み上げ音声（1〜15、男声/女声）を AivisSpeech で事前生成して `public/sounds/countdown/` に mp3 として同梱する。再生は `platform/sound.ts` の新規関数 `playCountdownVoice` が担い、再生失敗時は既存の `playCountdownTick`（トーン音）へランタイムでフォールバックする。`NotifyPreferences` に方式（`countdownMode`）と話者（`countdownVoiceId`）を追加し、`useCountdownTick` フックが方式に応じて呼び分ける。UI は既存の `NotifySettingsPanel` に追記する。

**Tech Stack:** TypeScript, React, Vitest, @testing-library/react, AivisSpeech（ローカルエンジン 127.0.0.1:10101）, bash + curl + ffmpeg（音声生成スクリプト）

## Global Constraints

- 対象話者は男声（fumifumi, speaker id `606865152`）・女声（morioki, speaker id `497929760`）のみ。にせ・まいは対象外。
- 数字範囲は 1〜15（`countdownSeconds` の UI 上限 `max={15}` と一致）。
- 音声読み上げモードでは Issue #3 の音程3段階変化は適用しない（平坦なまま）。
- 再生失敗時は必ず `playCountdownTick`（トーン音）にフォールバックし、無音にならないようにする。
- 既存ユーザーの挙動は変えない：`countdownMode` の既定値は `"tone"`。
- `CHIMES` 配列・`registerFileChimes`（交代チャイム選択用）には変更を加えない。
- テストコマンド: `apps/web` ディレクトリで `pnpm test`（= `vitest run`）。ワークスペースルートからは `pnpm test`（= `turbo run test`）。

---

### Task 1: NotifyPreferences に countdownMode/countdownVoiceId を追加

**Files:**
- Modify: `apps/web/src/prefs/local-prefs.ts:71-124`
- Test: `apps/web/test/prefs/local-prefs.test.ts`

**Interfaces:**
- Consumes: なし（データモデルのみのタスク）
- Produces:
  - `NotifyPreferences.countdownMode: "tone" | "voice"`
  - `NotifyPreferences.countdownVoiceId: "voice-male" | "voice-female"`
  - `DEFAULT_NOTIFY_PREFERENCES.countdownMode === "tone"`
  - `DEFAULT_NOTIFY_PREFERENCES.countdownVoiceId === "voice-male"`
  - `loadNotifyPreferences()` は破損・未保存時にこの2フィールドを既定値で補完する

- [ ] **Step 1: 失敗するテストを書く**

`apps/web/test/prefs/local-prefs.test.ts` の末尾（`randomLanguagePool` の `describe` の後）に追記:

```typescript
describe("NotifyPreferences の countdownMode/countdownVoiceId（Issue #5）", () => {
  beforeEach(() => localStorage.clear());

  it("既定値は countdownMode: tone / countdownVoiceId: voice-male", () => {
    const prefs = loadNotifyPreferences();
    expect(prefs.countdownMode).toBe("tone");
    expect(prefs.countdownVoiceId).toBe("voice-male");
  });

  it("保存した countdownMode/countdownVoiceId を読み戻せる", () => {
    saveNotifyPreferences({ ...DEFAULT_NOTIFY_PREFERENCES, countdownMode: "voice", countdownVoiceId: "voice-female" });
    const prefs = loadNotifyPreferences();
    expect(prefs.countdownMode).toBe("voice");
    expect(prefs.countdownVoiceId).toBe("voice-female");
  });

  it("破損した保存値は countdownMode/countdownVoiceId とも既定値にフォールバックする", () => {
    localStorage.setItem("tdd-mob:notify:v1", JSON.stringify({ countdownMode: 123, countdownVoiceId: null }));
    const prefs = loadNotifyPreferences();
    expect(prefs.countdownMode).toBe("tone");
    expect(prefs.countdownVoiceId).toBe("voice-male");
  });
});
```

このテストが使う `loadNotifyPreferences`・`saveNotifyPreferences`・`DEFAULT_NOTIFY_PREFERENCES` は既にファイル冒頭で import 済み（Step 2 で import 行に追記する）。

`apps/web/test/prefs/local-prefs.test.ts` の import 文（1-14行目）を以下に置き換える:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  savePreferences,
  loadPreferences,
  clearPreferences,
  loadRandomLanguagePool,
  saveRandomLanguagePool,
  DEFAULT_RANDOM_LANGUAGE_POOL,
  loadNotifyPreferences,
  saveNotifyPreferences,
  DEFAULT_NOTIFY_PREFERENCES,
} from "../../src/prefs/local-prefs.js";
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd apps/web && pnpm exec vitest run test/prefs/local-prefs.test.ts`
Expected: FAIL（`countdownMode`/`countdownVoiceId` が `undefined` であるため、または型エラー）

- [ ] **Step 3: 最小限の実装を書く**

`apps/web/src/prefs/local-prefs.ts` の `NotifyPreferences` インターフェース（71-84行目）を以下に置き換える:

```typescript
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
  /** 交代前カウントダウンの方式。既定 "tone"（Issue #5）。 */
  countdownMode: "tone" | "voice";
  /** 音声読み上げ選択時に使う話者。既定 "voice-male"（Issue #5）。 */
  countdownVoiceId: "voice-male" | "voice-female";
}
```

`DEFAULT_NOTIFY_PREFERENCES`（86-93行目）を以下に置き換える:

```typescript
export const DEFAULT_NOTIFY_PREFERENCES: NotifyPreferences = {
  enabled: false,
  soundId: "department",
  osNotify: true,
  volume: 0.6,
  countdownEnabled: false,
  countdownSeconds: 15,
  countdownMode: "tone",
  countdownVoiceId: "voice-male",
};
```

`loadNotifyPreferences` 内の `parsed` からの復元オブジェクト（113-120行目）を以下に置き換える:

```typescript
    const parsed = JSON.parse(raw) as Partial<NotifyPreferences>;
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_NOTIFY_PREFERENCES.enabled,
      soundId: typeof parsed.soundId === "string" ? parsed.soundId : DEFAULT_NOTIFY_PREFERENCES.soundId,
      osNotify: typeof parsed.osNotify === "boolean" ? parsed.osNotify : DEFAULT_NOTIFY_PREFERENCES.osNotify,
      volume: typeof parsed.volume === "number" ? parsed.volume : DEFAULT_NOTIFY_PREFERENCES.volume,
      countdownEnabled: typeof parsed.countdownEnabled === "boolean" ? parsed.countdownEnabled : DEFAULT_NOTIFY_PREFERENCES.countdownEnabled,
      countdownSeconds: typeof parsed.countdownSeconds === "number" ? parsed.countdownSeconds : DEFAULT_NOTIFY_PREFERENCES.countdownSeconds,
      countdownMode: parsed.countdownMode === "tone" || parsed.countdownMode === "voice" ? parsed.countdownMode : DEFAULT_NOTIFY_PREFERENCES.countdownMode,
      countdownVoiceId: parsed.countdownVoiceId === "voice-male" || parsed.countdownVoiceId === "voice-female" ? parsed.countdownVoiceId : DEFAULT_NOTIFY_PREFERENCES.countdownVoiceId,
    };
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd apps/web && pnpm exec vitest run test/prefs/local-prefs.test.ts`
Expected: PASS（全テスト緑）

- [ ] **Step 5: コミット**

```bash
git add apps/web/src/prefs/local-prefs.ts apps/web/test/prefs/local-prefs.test.ts
git commit -m "feat(web): NotifyPreferences に countdownMode/countdownVoiceId を追加（Issue #5）"
```

---

### Task 2: playCountdownVoice を sound.ts に追加

**Files:**
- Modify: `apps/web/src/platform/sound.ts:96-115`
- Test: `apps/web/test/platform/sound.test.ts`

**Interfaces:**
- Consumes:
  - `playCountdownTick(volume: number, stage?: 1 | 2 | 3): void`（既存、フォールバック先）
- Produces:
  - `playCountdownVoice(n: number, voiceId: "voice-male" | "voice-female", volume: number): void`
  - 内部の `countdownVoiceUrl` は export しない（テストは URL 文字列を直接検証しない。`Audio` のコンストラクタ呼び出し引数を検証する）

- [ ] **Step 1: 失敗するテストを書く**

`apps/web/test/platform/sound.test.ts` の末尾に追記:

```typescript
describe("playCountdownVoice（音声によるカウントダウン読み上げ・Issue #5）", () => {
  it("正しいURL（sounds/countdown/count-{speaker}-{n}.mp3）で Audio を生成し play する", () => {
    const created: string[] = [];
    const playCalls: string[] = [];
    class FakeAudio {
      src: string;
      volume = 1;
      constructor(src: string) { this.src = src; created.push(src); }
      addEventListener() {}
      play() { playCalls.push(this.src); return Promise.resolve(); }
    }
    const original = globalThis.Audio;
    (globalThis as unknown as { Audio: typeof Audio }).Audio = FakeAudio as unknown as typeof Audio;

    playCountdownVoice(10, "voice-male", 0.6);

    expect(created).toHaveLength(1);
    expect(created[0]).toContain("sounds/countdown/count-male-10.mp3");

    (globalThis as unknown as { Audio: typeof Audio }).Audio = original;
  });

  it("voice-female を渡すと count-female-{n}.mp3 を再生する", () => {
    const created: string[] = [];
    class FakeAudio {
      src: string;
      volume = 1;
      constructor(src: string) { this.src = src; created.push(src); }
      addEventListener() {}
      play() { return Promise.resolve(); }
    }
    const original = globalThis.Audio;
    (globalThis as unknown as { Audio: typeof Audio }).Audio = FakeAudio as unknown as typeof Audio;

    playCountdownVoice(3, "voice-female", 0.6);

    expect(created[0]).toContain("sounds/countdown/count-female-3.mp3");

    (globalThis as unknown as { Audio: typeof Audio }).Audio = original;
  });

  it("Audio の error イベントで playCountdownTick にフォールバックする", () => {
    let errorHandler: (() => void) | undefined;
    class FakeAudio {
      volume = 1;
      constructor(_src: string) {}
      addEventListener(event: string, handler: () => void) {
        if (event === "error") errorHandler = handler;
      }
      play() { return Promise.resolve(); }
    }
    const original = globalThis.Audio;
    (globalThis as unknown as { Audio: typeof Audio }).Audio = FakeAudio as unknown as typeof Audio;

    expect(() => {
      playCountdownVoice(5, "voice-male", 0.6);
      errorHandler?.();
    }).not.toThrow();

    (globalThis as unknown as { Audio: typeof Audio }).Audio = original;
  });

  it("play() が reject してもフォールバックして例外を投げない", async () => {
    class FakeAudio {
      volume = 1;
      constructor(_src: string) {}
      addEventListener() {}
      play() { return Promise.reject(new Error("blocked")); }
    }
    const original = globalThis.Audio;
    (globalThis as unknown as { Audio: typeof Audio }).Audio = FakeAudio as unknown as typeof Audio;

    expect(() => playCountdownVoice(1, "voice-male", 0.6)).not.toThrow();

    (globalThis as unknown as { Audio: typeof Audio }).Audio = original;
  });

  it("Audio が未定義の環境でも例外を投げない（playCountdownTick 相当にフォールバック）", () => {
    const original = globalThis.Audio;
    (globalThis as unknown as { Audio: undefined }).Audio = undefined;

    expect(() => playCountdownVoice(7, "voice-male", 0.6)).not.toThrow();

    (globalThis as unknown as { Audio: typeof Audio }).Audio = original;
  });
});
```

`apps/web/test/platform/sound.test.ts` の import 文（1-4行目）に `playCountdownVoice` を追加:

```typescript
import {
  CHIMES, playChime, installAudioUnlock, DEFAULT_VOLUME, scheduleTones,
  playCountdownTick, computeCountdownStage, COUNTDOWN_STAGE_FREQS,
  playCountdownVoice,
} from "../../src/platform/sound.js";
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd apps/web && pnpm exec vitest run test/platform/sound.test.ts`
Expected: FAIL（`playCountdownVoice` が存在しない）

- [ ] **Step 3: 最小限の実装を書く**

`apps/web/src/platform/sound.ts` の `playCountdownTick` 関数（110-115行目）の直後に追記:

```typescript
/** 同梱カウントダウン読み上げ音声の URL（vite の base path に追従）。 */
const countdownVoiceUrl = (voiceId: "voice-male" | "voice-female", n: number): string => {
  const speaker = voiceId === "voice-male" ? "male" : "female";
  return `${import.meta.env.BASE_URL}sounds/countdown/count-${speaker}-${n}.mp3`;
};

/**
 * カウントダウン中の数字読み上げ（fire-and-forget、Issue #5）。
 * 再生失敗（ファイル欠損・再生エラー）時はその回のみ playCountdownTick（トーン音）にフォールバックする。
 */
export function playCountdownVoice(
  n: number,
  voiceId: "voice-male" | "voice-female",
  volume: number,
): void {
  if (typeof Audio === "undefined") {
    playCountdownTick(volume);
    return;
  }
  try {
    const a = new Audio(countdownVoiceUrl(voiceId, n));
    a.volume = Math.min(1, Math.max(0, volume));
    a.addEventListener("error", () => playCountdownTick(volume), { once: true });
    void a.play().catch(() => playCountdownTick(volume));
  } catch {
    playCountdownTick(volume);
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd apps/web && pnpm exec vitest run test/platform/sound.test.ts`
Expected: PASS（全テスト緑）

- [ ] **Step 5: コミット**

```bash
git add apps/web/src/platform/sound.ts apps/web/test/platform/sound.test.ts
git commit -m "feat(web): カウントダウン読み上げ再生関数 playCountdownVoice を追加（Issue #5）"
```

---

### Task 3: useCountdownTick に mode/voiceId 分岐を追加

**Files:**
- Modify: `apps/web/src/ui/use-countdown-tick.ts`
- Test: `apps/web/test/ui/use-countdown-tick.test.ts`

**Interfaces:**
- Consumes:
  - `playCountdownVoice(n: number, voiceId: "voice-male" | "voice-female", volume: number): void`（Task 2 で追加）
  - `playCountdownTick(volume: number, stage?: 1 | 2 | 3): void`（既存）
  - `computeCountdownStage(currentSeconds: number, thresholdSeconds: number): 1 | 2 | 3`（既存）
- Produces:
  - `CountdownTickOptions.mode: "tone" | "voice"`
  - `CountdownTickOptions.voiceId: "voice-male" | "voice-female"`
  - `useCountdownTick(secondsLeft, running, opts)` は `opts.mode === "voice"` のとき `playCountdownVoice(current, opts.voiceId, opts.volume)` を、それ以外は従来どおり `playCountdownTick(opts.volume, stage)` を呼ぶ

- [ ] **Step 1: 失敗するテストを書く**

`apps/web/test/ui/use-countdown-tick.test.ts` の `vi.mock` ブロック（4-7行目）を以下に置き換える:

```typescript
vi.mock("../../src/platform/sound.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/platform/sound.js")>();
  return { ...actual, playCountdownTick: vi.fn(), playCountdownVoice: vi.fn() };
});
```

import 文（9行目）を以下に置き換える:

```typescript
import { playCountdownTick, playCountdownVoice } from "../../src/platform/sound.js";
```

`const opts = ...`（12行目）を以下に置き換える:

```typescript
const opts = { enabled: true, thresholdSeconds: 15, volume: 0.6, mode: "tone" as const, voiceId: "voice-male" as const };
```

ファイル末尾（81行目の `});` の直前、最後の `it` の後）に追記:

```typescript

describe("useCountdownTick の mode 分岐（Issue #5）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mode: voice のとき playCountdownVoice を数字・voiceId・volume 付きで呼ぶ", () => {
    renderHook(() => useCountdownTick(10, true, { ...opts, mode: "voice", voiceId: "voice-female" }));
    expect(playCountdownVoice).toHaveBeenCalledWith(10, "voice-female", 0.6);
    expect(playCountdownTick).not.toHaveBeenCalled();
  });

  it("mode: tone（既定）のときは従来どおり playCountdownTick を呼び、playCountdownVoice は呼ばない", () => {
    renderHook(() => useCountdownTick(10, true, opts));
    expect(playCountdownTick).toHaveBeenCalledWith(0.6, 2);
    expect(playCountdownVoice).not.toHaveBeenCalled();
  });

  it("mode: voice でも整数秒が変わるたびに1回だけ発火する", () => {
    const { rerender } = renderHook(
      ({ s }) => useCountdownTick(s, true, { ...opts, mode: "voice" as const }),
      { initialProps: { s: 15 } },
    );
    expect(playCountdownVoice).toHaveBeenCalledTimes(1);
    rerender({ s: 14.9 });
    expect(playCountdownVoice).toHaveBeenCalledTimes(1);
    rerender({ s: 14 });
    expect(playCountdownVoice).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd apps/web && pnpm exec vitest run test/ui/use-countdown-tick.test.ts`
Expected: FAIL（`CountdownTickOptions` に `mode`/`voiceId` が無い、または `playCountdownVoice` が呼ばれない）

- [ ] **Step 3: 最小限の実装を書く**

`apps/web/src/ui/use-countdown-tick.ts` を以下の内容に置き換える:

```typescript
/**
 * 交代前カウントダウン予告音のフック（Issue #2）。
 *
 * 残り秒数(secondsLeft)が個人設定の予告秒数(thresholdSeconds)以下になったら、
 * 整数秒が変わるたびに 1 回だけ、方式(mode)に応じてトーン音または音声読み上げを鳴らす（Issue #5）。
 *
 * running=false（room.clock.running）のときは何もしない。一時停止（evolveSessionPaused）は
 * 必ず freezeRunningClock で running を false にし、休憩(onBreak)は v2.10 で UI/コマンドが
 * 撤去済みの dormant フィールドで実質常に false のため、running 単独で
 * 「一時停止中でも休憩中でもなく走行中」を過不足なく判定できる。
 */

import { useEffect, useRef } from "react";
import { playCountdownTick, playCountdownVoice, computeCountdownStage } from "../platform/sound.js";

export interface CountdownTickOptions {
  /** 個人設定: カウントダウン予告音を鳴らすか。 */
  enabled: boolean;
  /** 予告を開始する残り秒数のしきい値。 */
  thresholdSeconds: number;
  /** 再生音量(0–1)。 */
  volume: number;
  /** カウントダウンの方式。"tone"=トーン音（既定・Issue #3の3段階変化）、"voice"=数字読み上げ（Issue #5）。 */
  mode: "tone" | "voice";
  /** mode: "voice" のときに使う話者。 */
  voiceId: "voice-male" | "voice-female";
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
      if (opts.mode === "voice") {
        playCountdownVoice(current, opts.voiceId, opts.volume);
      } else {
        const stage = computeCountdownStage(current, opts.thresholdSeconds);
        playCountdownTick(opts.volume, stage);
      }
    }
  }, [secondsLeft, running, opts.enabled, opts.thresholdSeconds, opts.volume, opts.mode, opts.voiceId]);
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd apps/web && pnpm exec vitest run test/ui/use-countdown-tick.test.ts`
Expected: PASS（全テスト緑）

- [ ] **Step 5: 呼び出し元（Session.tsx）を配線する**

`apps/web/src/ui/Session.tsx:192-196` を以下に置き換える:

```typescript
  useCountdownTick(displayRemaining, running, {
    enabled: notifyPrefs.countdownEnabled,
    thresholdSeconds: notifyPrefs.countdownSeconds,
    volume: notifyPrefs.volume,
    mode: notifyPrefs.countdownMode,
    voiceId: notifyPrefs.countdownVoiceId,
  });
```

- [ ] **Step 6: 型チェックと既存テストの回帰確認**

Run: `cd apps/web && pnpm exec tsc --noEmit && pnpm exec vitest run test/ui/use-countdown-tick.test.ts`
Expected: 型エラーなし、全テスト PASS

- [ ] **Step 7: コミット**

```bash
git add apps/web/src/ui/use-countdown-tick.ts apps/web/test/ui/use-countdown-tick.test.ts apps/web/src/ui/Session.tsx
git commit -m "feat(web): useCountdownTick が mode/voiceId に応じてトーン音/音声読み上げを分岐（Issue #5）"
```

---

### Task 4: NotifySettingsPanel に方式切替UIを追加

**Files:**
- Modify: `apps/web/src/ui/components/NotifySettingsPanel.tsx:118-134`
- Test: `apps/web/test/ui/NotifySettingsPanel.test.tsx`

**Interfaces:**
- Consumes:
  - `NotifyPreferences.countdownMode`・`NotifyPreferences.countdownVoiceId`（Task 1 で追加）
  - 既存 Props: `prefs: NotifyPreferences`, `onChange: (patch: Partial<NotifyPreferences>) => void`
- Produces: なし（末端UIコンポーネント）

- [ ] **Step 1: 失敗するテストを書く**

`apps/web/test/ui/NotifySettingsPanel.test.tsx` の `prefs` 定義（6行目）を以下に置き換える:

```typescript
const prefs = {
  enabled: true, soundId: "department", osNotify: true, volume: 0.6,
  countdownEnabled: true, countdownSeconds: 15,
  countdownMode: "tone" as const, countdownVoiceId: "voice-male" as const,
};
```

（`countdownEnabled: true` に変更するのは、方式切替UIが `countdownEnabled` 時のみ表示される設計のため、既存の他テストが期待するUI要素の可視性に影響しないかを Step 4 で確認する。）

ファイル末尾（70行目の直前、最後の `it` の後）に追記:

```typescript

  it("カウントダウン方式ラジオボタンが表示され、トーン音が既定で選択されている", () => {
    render(<NotifySettingsPanel prefs={prefs} onChange={vi.fn()} onPreview={vi.fn()} />);
    const toneRadio = screen.getByRole("radio", { name: "トーン音" }) as HTMLInputElement;
    const voiceRadio = screen.getByRole("radio", { name: "音声読み上げ" }) as HTMLInputElement;
    expect(toneRadio.checked).toBe(true);
    expect(voiceRadio.checked).toBe(false);
  });

  it("「音声読み上げ」選択で onChange({countdownMode: 'voice'}) を呼ぶ", () => {
    const onChange = vi.fn();
    render(<NotifySettingsPanel prefs={prefs} onChange={onChange} onPreview={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: "音声読み上げ" }));
    expect(onChange).toHaveBeenCalledWith({ countdownMode: "voice" });
  });

  it("countdownMode が voice のときのみ話者セレクトを表示する", () => {
    const { rerender } = render(<NotifySettingsPanel prefs={prefs} onChange={vi.fn()} onPreview={vi.fn()} />);
    expect(screen.queryByRole("combobox", { name: "読み上げ話者" })).toBeNull();

    rerender(<NotifySettingsPanel prefs={{ ...prefs, countdownMode: "voice" }} onChange={vi.fn()} onPreview={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "読み上げ話者" })).toBeTruthy();
  });

  it("話者セレクト変更で onChange({countdownVoiceId}) を呼ぶ", () => {
    const onChange = vi.fn();
    render(<NotifySettingsPanel prefs={{ ...prefs, countdownMode: "voice" }} onChange={onChange} onPreview={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox", { name: "読み上げ話者" }), { target: { value: "voice-female" } });
    expect(onChange).toHaveBeenCalledWith({ countdownVoiceId: "voice-female" });
  });

  it("countdownEnabled が false のとき方式ラジオボタンを表示しない", () => {
    render(<NotifySettingsPanel prefs={{ ...prefs, countdownEnabled: false }} onChange={vi.fn()} onPreview={vi.fn()} />);
    expect(screen.queryByRole("radio", { name: "トーン音" })).toBeNull();
  });
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd apps/web && pnpm exec vitest run test/ui/NotifySettingsPanel.test.tsx`
Expected: FAIL（ラジオボタン・話者セレクトが存在しない）

- [ ] **Step 3: 最小限の実装を書く**

`apps/web/src/ui/components/NotifySettingsPanel.tsx` の冒頭で `fieldId` 派生の3行（21-23行目）を以下に置き換える:

```typescript
  const soundFieldId = `${fieldId}-sound`;
  const volumeFieldId = `${fieldId}-volume`;
  const countdownSecondsFieldId = `${fieldId}-countdown-seconds`;
  const countdownModeToneId = `${fieldId}-countdown-mode-tone`;
  const countdownModeVoiceId = `${fieldId}-countdown-mode-voice`;
  const countdownVoiceFieldId = `${fieldId}-countdown-voice`;
```

「カウントダウン予告秒数スライダー」の `</div>` の直後（118-134行目のブロックの直後、「OS 通知トグル」の直前）に追記:

```tsx
      {/* カウントダウン方式（トーン音/音声読み上げ）・countdownEnabled 時のみ表示（Issue #5） */}
      {prefs.countdownEnabled && (
        <div className="mt-3">
          <p className="instrument-label">カウントダウン方式</p>
          <div className="mt-1 flex gap-4">
            <label htmlFor={countdownModeToneId} className="flex items-center gap-1.5">
              <input
                type="radio"
                id={countdownModeToneId}
                name={`${fieldId}-countdown-mode`}
                aria-label="トーン音"
                checked={prefs.countdownMode === "tone"}
                onChange={() => onChange({ countdownMode: "tone" })}
              />
              トーン音
            </label>
            <label htmlFor={countdownModeVoiceId} className="flex items-center gap-1.5">
              <input
                type="radio"
                id={countdownModeVoiceId}
                name={`${fieldId}-countdown-mode`}
                aria-label="音声読み上げ"
                checked={prefs.countdownMode === "voice"}
                onChange={() => onChange({ countdownMode: "voice" })}
              />
              音声読み上げ
            </label>
          </div>
          {prefs.countdownMode === "voice" && (
            <div className="mt-2">
              <label htmlFor={countdownVoiceFieldId} className="instrument-label">
                読み上げ話者
              </label>
              <select
                id={countdownVoiceFieldId}
                aria-label="読み上げ話者"
                value={prefs.countdownVoiceId}
                onChange={(e) => onChange({ countdownVoiceId: e.target.value as "voice-male" | "voice-female" })}
                className="mt-1 w-full rounded-md border border-[var(--hairline-strong)] bg-[var(--panel-2)] px-2 py-1.5 text-sm text-[var(--bone)]"
              >
                <option value="voice-male">男声</option>
                <option value="voice-female">女声</option>
              </select>
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd apps/web && pnpm exec vitest run test/ui/NotifySettingsPanel.test.tsx`
Expected: PASS（全テスト緑。既存テストも `countdownEnabled: true` への変更で壊れていないことを確認する）

- [ ] **Step 5: コミット**

```bash
git add apps/web/src/ui/components/NotifySettingsPanel.tsx apps/web/test/ui/NotifySettingsPanel.test.tsx
git commit -m "feat(web): 通知設定パネルにカウントダウン方式（トーン/音声読み上げ）切替UIを追加（Issue #5）"
```

---

### Task 5: 数字読み上げ音声を生成するスクリプトを追加し実行する

**Files:**
- Create: `scripts/gen-countdown-voices.sh`
- Create（生成物・コミット対象）: `apps/web/public/sounds/countdown/count-male-1.mp3` 〜 `count-male-15.mp3`、`count-female-1.mp3` 〜 `count-female-15.mp3`（計30ファイル）

**Interfaces:**
- Consumes: なし（独立したビルドスクリプト）
- Produces: `apps/web/public/sounds/countdown/count-{male,female}-{1..15}.mp3`（Task 2 の `playCountdownVoice` が参照するファイル名規約と一致させる）

- [ ] **Step 1: スクリプトを作成する**

`scripts/gen-countdown-voices.sh` を新規作成:

```bash
#!/usr/bin/env bash
# カウントダウン読み上げ用の数字音声(1〜15)を男声/女声で AivisSpeech 合成し mp3 同梱する（生成物はコミット、Issue #5）。
set -euo pipefail
OUT="$(dirname "$0")/../apps/web/public/sounds/countdown"
ENGINE="http://127.0.0.1:10101"
MALE_ID=606865152    # fumifumi（男声・gen-voices.sh と同一話者）
FEMALE_ID=497929760  # morioki（女声・gen-voices.sh と同一話者）
mkdir -p "$OUT"
curl -s -m 5 "$ENGINE/version" >/dev/null || { echo "AivisSpeech が $ENGINE で応答しません。起動後に再実行してください（既存 mp3 は保持）。" >&2; exit 1; }
gen() {
  local sid="$1" name="$2" text="$3"
  local q; q=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$text")
  curl -s -m 20 -f -X POST "$ENGINE/audio_query?text=$q&speaker=$sid" -o /tmp/_aq.json
  curl -s -m 60 -f -X POST "$ENGINE/synthesis?speaker=$sid" -H "Content-Type: application/json" -d @/tmp/_aq.json -o /tmp/_av.wav
  ffmpeg -y -i /tmp/_av.wav -ar 44100 -b:a 96k "$OUT/$name.mp3" 2>/dev/null
  echo "generated: $OUT/$name.mp3"
}
for n in $(seq 1 15); do
  gen "$MALE_ID" "count-male-$n" "$n"
  gen "$FEMALE_ID" "count-female-$n" "$n"
done
```

- [ ] **Step 2: 実行権限を付与する**

Run: `chmod +x scripts/gen-countdown-voices.sh`

- [ ] **Step 3: AivisSpeech 起動確認**

Run: `curl -s -m 5 http://127.0.0.1:10101/version`
Expected: バージョン情報の JSON が返る（起動していなければ `verify` 手順に従い起動する）

- [ ] **Step 4: スクリプトを実行し30ファイルを生成する**

Run: `bash scripts/gen-countdown-voices.sh`
Expected: `generated: .../count-male-1.mp3` 〜 `generated: .../count-female-15.mp3` の30行が出力される

- [ ] **Step 5: 生成ファイル数を確認する**

Run: `ls apps/web/public/sounds/countdown/ | wc -l`
Expected: `30`

- [ ] **Step 6: コミット**

```bash
git add scripts/gen-countdown-voices.sh apps/web/public/sounds/countdown/
git commit -m "feat(web): カウントダウン読み上げ用の数字音声(1〜15・男声/女声)を生成・同梱（Issue #5）"
```

---

### Task 6: 実機聴取確認

**Files:**
- なし（コード変更なし、動作確認のみ）

**Interfaces:**
- Consumes: Task 1〜5 の全成果物
- Produces: なし

- [ ] **Step 1: 開発サーバーを起動する**

Run（ポート占有プロセスを先に掃除、既知の落とし穴）:
```bash
for p in $(lsof -ti tcp:5173 tcp:8787 2>/dev/null); do kill -9 "$p"; done
```

sync サーバーを起動:
```bash
cd apps/sync && bun run src/server.ts &
```

web を起動:
```bash
cd apps/web && pnpm dev
```

Expected: `Local:` に表示された URL（5173系）をブラウザで開く

- [ ] **Step 2: 個人設定でカウントダウン方式を「音声読み上げ」に切り替える**

ロビーまたはセッション画面の通知設定パネルを開き、「交代前にカウントダウン音を鳴らす」をON、「カウントダウン方式」を「音声読み上げ」に切り替え、話者を「男声」に設定する。

- [ ] **Step 3: カウントダウン中に毎秒読み上げられることを確認する**

セッションを開始し、交代までの残り秒数が `countdownSeconds`（既定15秒）以下になったタイミングで、「15、14、13…」のように毎秒その話者の数字読み上げが再生されることを実際に聴いて確認する。

- [ ] **Step 4: 話者を「女声」に切り替えて再確認する**

話者セレクトを「女声」に切り替え、再度カウントダウンを発生させて女声の数字読み上げが再生されることを確認する。

- [ ] **Step 5: トーン音への切替が破綻しないことを確認する**

カウントダウン方式を「トーン音」に戻し、従来どおり3段階音程変化のビープ音が鳴ることを確認する（回帰確認）。

- [ ] **Step 6: 全体テストスイートを実行する**

Run: `cd apps/web && pnpm test`
Expected: 全テスト PASS（既存テスト含め回帰なし）

- [ ] **Step 7: サーバーを停止する**

Run:
```bash
for p in $(lsof -ti tcp:5173 tcp:8787 2>/dev/null); do kill -9 "$p"; done
```
