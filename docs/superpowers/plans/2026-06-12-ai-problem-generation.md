# AI お題生成 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 合言葉で解錠したルームに対し、サーバ常駐の `claude -p` 子プロセス（運営者サブスクの Agent SDK クレジット）で AI お題を生成し、失敗時は既存の定型バンクへ必ず縮退する。

**Architecture:** 既存の `problemMode==="ai"` 経路・`ProblemDelegator`・`validateProblem`/`pickFallback` の縮退レールに、サーバサイド生成器（port `ServerProblemProvider` + adapter `ClaudeCliProblemProvider`）を最優先候補として合流させる。解錠はルームパスフレーズ（R4-2）と同型の「平文はサーバ専用・snapshot は boolean のみ」パターン。

**Tech Stack:** TypeScript / Bun（sync 実行）/ vitest（テスト・Node 実行）/ Valibot（境界検証）/ neverthrow / `node:child_process`（Bun でも動作・vitest でもテスト可能なため `Bun.spawn` は使わない）

**スペック（正本）:** `docs/superpowers/specs/2026-06-12-ai-problem-generation-design.md`

**前提・環境メモ:**
- リポジトリ: `local/Tasuki`（claym とは独立）。作業ブランチ: `feature/ai-problem-generation`（作成済み・スペックコミット済み）
- pnpm は `~/.local/bin/pnpm`。全体テストは リポジトリの `tdd-mob-pro-timer/` で `PATH="$HOME/.local/bin:$PATH" pnpm test:unit`
- 個別パッケージのテストは各 package ディレクトリで `npx vitest run <file>` が速い
- コメント・テスト名は日本語（既存規約）。`any` 禁止・`const` 優先

---

### Task 1: core — `Room.aiUnlocked` フラグと `ai.unlock` コマンドスキーマ

**Files:**
- Modify: `packages/core/src/aggregate.ts`（`Room` 型と定数）
- Modify: `packages/core/src/schemas.ts`（コマンド union と RoomSchema）
- Test: `packages/core/test/ai-unlock.test.ts`（新規）

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/test/ai-unlock.test.ts` を新規作成:

```typescript
import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { CommandSchema, RoomSchema } from "../src/schemas.js";
import { MAX_AI_UNLOCK_KEY } from "../src/aggregate.js";

describe("ai.unlock コマンドスキーマ", () => {
  it("正しい ai.unlock コマンドを受理する", () => {
    const result = v.safeParse(CommandSchema, {
      command: "ai.unlock",
      key: "open-sesame",
    });
    expect(result.success).toBe(true);
  });

  it("key が上限を超えると拒否する", () => {
    const result = v.safeParse(CommandSchema, {
      command: "ai.unlock",
      key: "x".repeat(MAX_AI_UNLOCK_KEY + 1),
    });
    expect(result.success).toBe(false);
  });

  it("key 欠落は拒否する", () => {
    const result = v.safeParse(CommandSchema, { command: "ai.unlock" });
    expect(result.success).toBe(false);
  });
});

describe("Room.aiUnlocked", () => {
  it("MAX_AI_UNLOCK_KEY は 64", () => {
    expect(MAX_AI_UNLOCK_KEY).toBe(64);
  });

  it("RoomSchema が aiUnlocked(boolean, 任意) を受理する", () => {
    // 既存の最小 Room を組み立てるのは重いので、エントリの存在を直接検証する
    const entries = (RoomSchema as v.ObjectSchema<v.ObjectEntries, undefined>).entries;
    expect(entries["aiUnlocked"]).toBeDefined();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer/packages/core && npx vitest run test/ai-unlock.test.ts`
Expected: FAIL（`MAX_AI_UNLOCK_KEY` が未定義 / スキーマ不在）

- [ ] **Step 3: 実装する**

`packages/core/src/aggregate.ts`:
1. `Room` インターフェースの `passphraseProtected?: boolean;`（121 行付近）の直後に追加:

```typescript
  /** AI お題生成の解錠状態（合言葉照合済み・平文はサーバ専用 = snapshot 非混入）。 */
  aiUnlocked?: boolean;
```

2. `export const MAX_PASSPHRASE = 128;`（272 行付近）の直後に追加:

```typescript
/** AI 解錠合言葉の最大長 */
export const MAX_AI_UNLOCK_KEY = 64;
```

`packages/core/src/schemas.ts`:
1. import に `MAX_AI_UNLOCK_KEY` を追加（既存の `MAX_PASSPHRASE` と同じ import 文）
2. `RoomPassphraseSetCommand`（214 行付近）の直後に追加:

```typescript
const AiUnlockCommand = v.object({
  command: v.literal("ai.unlock"),
  key: v.pipe(v.string(), v.maxLength(MAX_AI_UNLOCK_KEY)),
});
```

3. `CommandSchema` の variant 配列の `RoomPassphraseSetCommand,` の直後に `AiUnlockCommand,` を追加
4. `RoomSchema` 内の `passphraseProtected: v.optional(v.boolean()),`（336 行付近）の直後に追加:

```typescript
  aiUnlocked: v.optional(v.boolean()),
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer/packages/core && npx vitest run`
Expected: 全 PASS（既存テストの回帰なし）

- [ ] **Step 5: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add tdd-mob-pro-timer/packages/core
git commit -m "feat(core): ai.unlock コマンドスキーマと Room.aiUnlocked フラグを追加"
```

---

### Task 2: sync config — AI 関連の環境変数 5 種

**Files:**
- Modify: `apps/sync/src/config.ts`
- Test: `apps/sync/test/config-ai.test.ts`（新規）

- [ ] **Step 1: 失敗するテストを書く**

`apps/sync/test/config-ai.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { loadSyncConfig } from "../src/config.js";

describe("AI お題生成の設定", () => {
  it("未設定なら aiUnlockKey/claudeOauthToken は undefined・他は既定値", () => {
    const c = loadSyncConfig({});
    expect(c.aiUnlockKey).toBeUndefined();
    expect(c.claudeOauthToken).toBeUndefined();
    expect(c.aiProblemModel).toBe("sonnet");
    expect(c.aiGenerationTimeoutMs).toBe(60_000);
    expect(c.aiDailyLimit).toBe(100);
  });

  it("空白のみの AI_UNLOCK_KEY は未設定扱い", () => {
    const c = loadSyncConfig({ AI_UNLOCK_KEY: "   " });
    expect(c.aiUnlockKey).toBeUndefined();
  });

  it("設定値が反映される（trim 込み）", () => {
    const c = loadSyncConfig({
      AI_UNLOCK_KEY: " himitsu ",
      CLAUDE_CODE_OAUTH_TOKEN: " sk-ant-oat01-xxx ",
      AI_PROBLEM_MODEL: "haiku",
      AI_GENERATION_TIMEOUT_MS: "30000",
      AI_DAILY_LIMIT: "5",
    });
    expect(c.aiUnlockKey).toBe("himitsu");
    expect(c.claudeOauthToken).toBe("sk-ant-oat01-xxx");
    expect(c.aiProblemModel).toBe("haiku");
    expect(c.aiGenerationTimeoutMs).toBe(30_000);
    expect(c.aiDailyLimit).toBe(5);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer/apps/sync && npx vitest run test/config-ai.test.ts`
Expected: FAIL（プロパティ不在で型エラー or undefined 比較失敗）

- [ ] **Step 3: 実装する**

`apps/sync/src/config.ts` の `SyncConfig` に追加（`adminToken` の後）:

```typescript
  /** AI お題生成の解錠合言葉。未設定なら AI 機能は無効（解錠は常に失敗＝存在秘匿）。 */
  aiUnlockKey: string | undefined;
  /** Claude サブスクの OAuth トークン（claude setup-token）。子プロセスの env にのみ渡す。 */
  claudeOauthToken: string | undefined;
  /** claude -p --model に渡すモデル名 */
  aiProblemModel: string;
  /** AI 生成のタイムアウト（ms） */
  aiGenerationTimeoutMs: number;
  /** AI 生成の日次回数上限（グローバル・揮発カウント） */
  aiDailyLimit: number;
```

`loadSyncConfig` の return に追加:

```typescript
    aiUnlockKey: (env["AI_UNLOCK_KEY"] ?? "").trim() || undefined,
    claudeOauthToken: (env["CLAUDE_CODE_OAUTH_TOKEN"] ?? "").trim() || undefined,
    aiProblemModel: (env["AI_PROBLEM_MODEL"] ?? "").trim() || "sonnet",
    aiGenerationTimeoutMs: intEnv(env["AI_GENERATION_TIMEOUT_MS"], 60_000),
    aiDailyLimit: intEnv(env["AI_DAILY_LIMIT"], 100),
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer/apps/sync && npx vitest run test/config-ai.test.ts test/config.test.ts 2>/dev/null || npx vitest run test/config-ai.test.ts`
Expected: PASS（既存 config テストがあればそれも緑）

- [ ] **Step 5: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add tdd-mob-pro-timer/apps/sync
git commit -m "feat(sync): AI お題生成の環境変数設定を追加"
```

---

### Task 3: sync — 定数時間比較ヘルパーの抽出（admin.ts リファクタ）

**Files:**
- Create: `apps/sync/src/application/secure-compare.ts`
- Modify: `apps/sync/src/application/admin.ts:9-15`（`tokenMatches` の実装を差し替え）
- Test: `apps/sync/test/secure-compare.test.ts`（新規）

- [ ] **Step 1: 失敗するテストを書く**

`apps/sync/test/secure-compare.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { constantTimeEqual } from "../src/application/secure-compare.js";

describe("constantTimeEqual", () => {
  it("一致する文字列は true", () => {
    expect(constantTimeEqual("abc123", "abc123")).toBe(true);
  });
  it("不一致は false", () => {
    expect(constantTimeEqual("abc123", "abc124")).toBe(false);
  });
  it("長さ不一致は false（例外を投げない）", () => {
    expect(constantTimeEqual("short", "longer-string")).toBe(false);
  });
  it("マルチバイト（日本語）も比較できる", () => {
    expect(constantTimeEqual("ひらけごま", "ひらけごま")).toBe(true);
    expect(constantTimeEqual("ひらけごま", "ひらけまめ")).toBe(false);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer/apps/sync && npx vitest run test/secure-compare.test.ts`
Expected: FAIL（モジュール不在）

- [ ] **Step 3: 実装する**

`apps/sync/src/application/secure-compare.ts`:

```typescript
/**
 * 秘密値の定数時間比較（タイミングサイドチャネル緩和）。
 * 管理トークン（admin.ts）と AI 解錠合言葉（handlers.ts）で共用する。
 */
import { timingSafeEqual } from "node:crypto";

/** 定数時間で文字列を比較する。長さ不一致は即 false（timingSafeEqual は長さ違いで throw するため）。 */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
```

`apps/sync/src/application/admin.ts`: 冒頭の `import { timingSafeEqual } from "node:crypto";` を削除し、`tokenMatches` を差し替え:

```typescript
import { constantTimeEqual } from "./secure-compare.js";

/** 管理トークンを定数時間で比較する（タイミングサイドチャネル緩和）。長さ不一致は即 false。 */
function tokenMatches(provided: string, expected: string): boolean {
  return constantTimeEqual(provided, expected);
}
```

- [ ] **Step 4: テストが通ることを確認（admin の既存テスト含む）**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer/apps/sync && npx vitest run test/secure-compare.test.ts test/admin.test.ts`
Expected: 全 PASS

- [ ] **Step 5: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add tdd-mob-pro-timer/apps/sync
git commit -m "refactor(sync): 定数時間比較を secure-compare に抽出（admin と AI 解錠で共用）"
```

---

### Task 4: sync — `AiLimiter`（クールダウン・同時実行・日次上限）

**Files:**
- Create: `apps/sync/src/application/ai-limits.ts`
- Test: `apps/sync/test/ai-limits.test.ts`（新規）

- [ ] **Step 1: 失敗するテストを書く**

`apps/sync/test/ai-limits.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { AiLimiter } from "../src/application/ai-limits.js";
import type { Clock } from "../src/ports/clock.js";

/** テスト用の可変クロック */
function makeClock(start: number): Clock & { advance: (ms: number) => void } {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("AiLimiter", () => {
  it("初回は取得でき、release 前の同一ルーム再取得は concurrent で拒否", () => {
    const clock = makeClock(1_000_000);
    const limiter = new AiLimiter({ clock, dailyLimit: 10 });
    const a = limiter.tryAcquire("R1");
    expect(a.ok).toBe(true);
    const b = limiter.tryAcquire("R2");
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe("concurrent");
  });

  it("release 後でもクールダウン中は同一ルームを cooldown で拒否、別ルームは取得可", () => {
    const clock = makeClock(1_000_000);
    const limiter = new AiLimiter({ clock, dailyLimit: 10, cooldownMs: 10_000 });
    const a = limiter.tryAcquire("R1");
    expect(a.ok).toBe(true);
    if (a.ok) a.release();
    const again = limiter.tryAcquire("R1");
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe("cooldown");
    const other = limiter.tryAcquire("R2");
    expect(other.ok).toBe(true);
  });

  it("クールダウン経過後は同一ルームでも再取得できる", () => {
    const clock = makeClock(1_000_000);
    const limiter = new AiLimiter({ clock, dailyLimit: 10, cooldownMs: 10_000 });
    const a = limiter.tryAcquire("R1");
    if (a.ok) a.release();
    clock.advance(10_001);
    expect(limiter.tryAcquire("R1").ok).toBe(true);
  });

  it("日次上限に達すると daily で拒否し、日付が変わるとリセットされる", () => {
    const clock = makeClock(Date.UTC(2026, 5, 12, 23, 50));
    const limiter = new AiLimiter({ clock, dailyLimit: 2, cooldownMs: 0 });
    for (const room of ["R1", "R2"]) {
      const r = limiter.tryAcquire(room);
      expect(r.ok).toBe(true);
      if (r.ok) r.release();
    }
    const over = limiter.tryAcquire("R3");
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reason).toBe("daily");
    // UTC 日付が変わるとリセット
    clock.advance(11 * 60 * 1000);
    expect(limiter.tryAcquire("R3").ok).toBe(true);
  });

  it("todayCount / totalCount が取得成功数を数える", () => {
    const clock = makeClock(1_000_000);
    const limiter = new AiLimiter({ clock, dailyLimit: 10, cooldownMs: 0 });
    const a = limiter.tryAcquire("R1");
    if (a.ok) a.release();
    const b = limiter.tryAcquire("R1");
    if (b.ok) b.release();
    expect(limiter.todayCount).toBe(2);
    expect(limiter.totalCount).toBe(2);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer/apps/sync && npx vitest run test/ai-limits.test.ts`
Expected: FAIL（モジュール不在）

- [ ] **Step 3: 実装する**

`apps/sync/src/application/ai-limits.ts`:

```typescript
/**
 * AI お題生成の濫用抑制（純粋ロジック・clock 注入）。
 * - グローバル同時実行 1（VPS 1GB RAM の実測に基づく直列化。spec「VPS リソース実測」参照）
 * - ルームごとクールダウン（既定 10 秒）
 * - 日次回数上限（UTC 日付・揮発カウントで可＝再起動でリセットは許容）
 * 超過は呼び出し側で「エラーにせず定型へ縮退」する。
 */
import type { Clock } from "../ports/clock.js";

export interface AiLimiterOptions {
  clock: Clock;
  /** 日次生成回数上限（グローバル） */
  dailyLimit: number;
  /** ルームごとのクールダウン ms（既定 10 秒） */
  cooldownMs?: number;
  /** グローバル同時実行数（既定 1） */
  maxConcurrent?: number;
}

export type AcquireResult =
  | { ok: true; release: () => void }
  | { ok: false; reason: "concurrent" | "cooldown" | "daily" };

const DEFAULT_COOLDOWN_MS = 10_000;

export class AiLimiter {
  private readonly clock: Clock;
  private readonly dailyLimit: number;
  private readonly cooldownMs: number;
  private readonly maxConcurrent: number;

  private running = 0;
  /** roomCode → 直近の生成開始時刻（epoch ms） */
  private readonly lastStartByRoom = new Map<string, number>();
  private dayKey = "";
  private dayCount = 0;
  private total = 0;

  constructor(opts: AiLimiterOptions) {
    this.clock = opts.clock;
    this.dailyLimit = opts.dailyLimit;
    this.cooldownMs = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.maxConcurrent = opts.maxConcurrent ?? 1;
  }

  /** 生成枠を取得する。ok の場合は完了/失敗時に必ず release() を呼ぶこと。 */
  tryAcquire(roomCode: string): AcquireResult {
    const now = this.clock.now();
    this.rolloverIfNeeded(now);

    if (this.running >= this.maxConcurrent) return { ok: false, reason: "concurrent" };

    const last = this.lastStartByRoom.get(roomCode);
    if (last !== undefined && now - last < this.cooldownMs) {
      return { ok: false, reason: "cooldown" };
    }

    if (this.dayCount >= this.dailyLimit) return { ok: false, reason: "daily" };

    this.running++;
    this.dayCount++;
    this.total++;
    this.lastStartByRoom.set(roomCode, now);

    let released = false;
    return {
      ok: true,
      release: () => {
        if (released) return; // 二重 release を無害化
        released = true;
        this.running--;
      },
    };
  }

  /** 当日（UTC）の生成回数 */
  get todayCount(): number {
    this.rolloverIfNeeded(this.clock.now());
    return this.dayCount;
  }

  /** 累計生成回数（プロセス生存中） */
  get totalCount(): number {
    return this.total;
  }

  /** UTC 日付が変わっていたら日次カウントをリセットする */
  private rolloverIfNeeded(now: number): void {
    const key = new Date(now).toISOString().slice(0, 10);
    if (key !== this.dayKey) {
      this.dayKey = key;
      this.dayCount = 0;
    }
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer/apps/sync && npx vitest run test/ai-limits.test.ts`
Expected: 全 PASS

- [ ] **Step 5: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add tdd-mob-pro-timer/apps/sync
git commit -m "feat(sync): AI 生成の濫用抑制 AiLimiter を追加（同時1・クールダウン・日次上限）"
```

---

### Task 5: sync — `ServerProblemProvider` port と `ClaudeCliProblemProvider` adapter

**Files:**
- Create: `apps/sync/src/ports/server-problem-provider.ts`
- Create: `apps/sync/src/adapters/claude-cli-problem-provider.ts`
- Test: `apps/sync/test/claude-cli-problem-provider.test.ts`（新規）

- [ ] **Step 1: 失敗するテストを書く**

`apps/sync/test/claude-cli-problem-provider.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  ClaudeCliProblemProvider,
  extractJsonObject,
  type SpawnFn,
  type SpawnedProcess,
} from "../src/adapters/claude-cli-problem-provider.js";

/** spawn の戻り値を模す最小フェイク */
function makeFakeChild() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const child = new EventEmitter() as EventEmitter & SpawnedProcess;
  const written: string[] = [];
  Object.assign(child, {
    stdout,
    stderr,
    stdin: {
      write: (s: string) => {
        written.push(s);
        return true;
      },
      end: () => {},
    },
    kill: vi.fn(),
  });
  return { child: child as unknown as SpawnedProcess, stdout, stderr, written };
}

const PROBLEM_JSON = {
  title: "FizzBuzz",
  description: "desc",
  requirements: ["a", "b", "c"],
  exampleTest: "test()",
  hints: ["h1"],
};

describe("extractJsonObject", () => {
  it("前後に説明文があっても最初の { から最後の } を抽出して parse する", () => {
    const text = `Here is the kata:\n${JSON.stringify(PROBLEM_JSON)}\nEnjoy!`;
    expect(extractJsonObject(text)).toEqual(PROBLEM_JSON);
  });
  it("JSON が無ければ throw する", () => {
    expect(() => extractJsonObject("no json here")).toThrow();
  });
});

describe("ClaudeCliProblemProvider", () => {
  function makeProvider(fake: ReturnType<typeof makeFakeChild>) {
    const spawnFn: SpawnFn = vi.fn(() => fake.child);
    const provider = new ClaudeCliProblemProvider({
      token: "sk-ant-oat01-test",
      model: "sonnet",
      spawnFn,
    });
    return { provider, spawnFn };
  }

  it("claude -p を正しい引数で起動しプロンプトを stdin で渡す", async () => {
    const fake = makeFakeChild();
    const { provider, spawnFn } = makeProvider(fake);
    const p = provider.generate("TypeScript", "easy", new AbortController().signal);
    // claude -p の --output-format json は {"result": "..."} を返す
    fake.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ result: JSON.stringify(PROBLEM_JSON) })),
    );
    (fake.child as unknown as EventEmitter).emit("close", 0);
    await expect(p).resolves.toEqual(PROBLEM_JSON);

    const call = (spawnFn as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[0]).toBe("claude");
    const args = call[1] as string[];
    expect(args).toContain("-p");
    expect(args).toContain("--output-format");
    expect(args).toContain("--strict-mcp-config");
    expect(args).toContain("sonnet");
    // OAuth トークンは子プロセスの env にのみ渡る
    const opts = call[2] as { env: Record<string, string> };
    expect(opts.env["CLAUDE_CODE_OAUTH_TOKEN"]).toBe("sk-ant-oat01-test");
    // プロンプトは stdin 渡し（argv に乗せない）
    expect(fake.written.join("")).toContain("TypeScript");
  });

  it("非ゼロ exit は reject する", async () => {
    const fake = makeFakeChild();
    const { provider } = makeProvider(fake);
    const p = provider.generate("TypeScript", "easy", new AbortController().signal);
    fake.stderr.emit("data", Buffer.from("auth error"));
    (fake.child as unknown as EventEmitter).emit("close", 1);
    await expect(p).rejects.toThrow(/exit 1/);
  });

  it("abort で子プロセスを kill して reject する", async () => {
    const fake = makeFakeChild();
    const { provider } = makeProvider(fake);
    const ac = new AbortController();
    const p = provider.generate("TypeScript", "easy", ac.signal);
    ac.abort();
    await expect(p).rejects.toThrow(/abort/i);
    expect(fake.child.kill).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer/apps/sync && npx vitest run test/claude-cli-problem-provider.test.ts`
Expected: FAIL（モジュール不在）

- [ ] **Step 3: port を実装する**

`apps/sync/src/ports/server-problem-provider.ts`:

```typescript
/**
 * サーバサイド AI お題生成の port。
 * 戻り値は「未検証の AI 出力」(unknown)。呼び出し側（ProblemDelegator）が
 * validateProblem で検証し、失敗は定型バンクへ縮退する（FR-023/024）。
 */
export interface ServerProblemProvider {
  generate(language: string, difficulty: string, signal: AbortSignal): Promise<unknown>;
}
```

- [ ] **Step 4: adapter を実装する**

`apps/sync/src/adapters/claude-cli-problem-provider.ts`:

```typescript
/**
 * claude -p 子プロセスでお題を生成する adapter。
 * - スタンドアロンの claude バイナリを node:child_process で起動（Bun でも動作・vitest でもテスト可能）
 * - プロンプトは stdin 渡し（argv 長・エスケープ問題の回避）
 * - --strict-mcp-config 等でユーザー設定を読み込ませない（メモリ実測 726MB→355MB。spec 参照）
 * - OAuth トークンは子プロセスの env にのみ渡す（ログ・snapshot 非混入）
 */
import { spawn } from "node:child_process";
import { buildProblemPrompt } from "@tdd-mob/core";
import type { ServerProblemProvider } from "../ports/server-problem-provider.js";

/** spawn 互換の最小インターフェース（テストで差し替える） */
export interface SpawnedProcess {
  stdout: { on(event: "data", cb: (chunk: Buffer) => void): unknown } | null;
  stderr: { on(event: "data", cb: (chunk: Buffer) => void): unknown } | null;
  stdin: { write(data: string): boolean; end(): void } | null;
  on(event: "close", cb: (code: number | null) => void): unknown;
  on(event: "error", cb: (err: Error) => void): unknown;
  kill(signal?: NodeJS.Signals): boolean;
}

export type SpawnFn = (
  command: string,
  args: string[],
  options: { env: Record<string, string | undefined>; stdio: ["pipe", "pipe", "pipe"] },
) => SpawnedProcess;

export interface ClaudeCliProblemProviderOptions {
  /** CLAUDE_CODE_OAUTH_TOKEN（sk-ant-oat01-...） */
  token: string;
  /** claude -p --model に渡す値 */
  model: string;
  /** テスト用の spawn 差し替え */
  spawnFn?: SpawnFn;
}

/** AI 応答テキストから最初の { 〜 最後の } を JSON として取り出す。 */
export function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("AI 応答に JSON オブジェクトが見つかりません");
  }
  return JSON.parse(text.slice(start, end + 1));
}

export class ClaudeCliProblemProvider implements ServerProblemProvider {
  private readonly token: string;
  private readonly model: string;
  private readonly spawnFn: SpawnFn;

  constructor(opts: ClaudeCliProblemProviderOptions) {
    this.token = opts.token;
    this.model = opts.model;
    this.spawnFn = opts.spawnFn ?? (spawn as unknown as SpawnFn);
  }

  generate(language: string, difficulty: string, signal: AbortSignal): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error("aborted before start"));
        return;
      }

      const args = [
        "-p",
        "--output-format",
        "json",
        "--model",
        this.model,
        // ユーザー設定・MCP を読み込ませない（メモリ削減＋挙動の固定）
        "--strict-mcp-config",
        "--mcp-config",
        '{"mcpServers":{}}',
        "--settings",
        "{}",
      ];

      const child = this.spawnFn("claude", args, {
        env: {
          // PATH/HOME は必要（バイナリ解決・内部キャッシュ）。トークンはここだけに渡す。
          PATH: process.env["PATH"],
          HOME: process.env["HOME"],
          CLAUDE_CODE_OAUTH_TOKEN: this.token,
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        fn();
      };

      const onAbort = () => {
        child.kill("SIGKILL");
        settle(() => reject(new Error("aborted (timeout/cancel)")));
      };
      signal.addEventListener("abort", onAbort);

      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (err) => settle(() => reject(err)));
      child.on("close", (code) => {
        if (code !== 0) {
          settle(() =>
            reject(new Error(`claude -p exit ${code}: ${stderr.slice(0, 200)}`)),
          );
          return;
        }
        settle(() => {
          try {
            // --output-format json の外殻 { result: "...", ... } から本文を取り出す
            const outer = JSON.parse(stdout) as { result?: unknown };
            const body = typeof outer.result === "string" ? outer.result : stdout;
            resolve(extractJsonObject(body));
          } catch (e) {
            reject(new Error(`AI 応答の解析に失敗: ${(e as Error).message}`));
          }
        });
      });

      // プロンプトは stdin 渡し
      child.stdin?.write(buildProblemPrompt(language, difficulty));
      child.stdin?.end();
    });
  }
}
```

注: `buildProblemPrompt` が `@tdd-mob/core` のルートから export されていない場合は `@tdd-mob/core/problem` から import する（`NoAiProvider` が `pickFallback` をそうしているのと同様）。

- [ ] **Step 5: テストが通ることを確認**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer/apps/sync && npx vitest run test/claude-cli-problem-provider.test.ts`
Expected: 全 PASS

- [ ] **Step 6: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add tdd-mob-pro-timer/apps/sync
git commit -m "feat(sync): claude -p 子プロセスによるサーバサイドお題生成 adapter を追加"
```

---

### Task 6: sync — `handleAiUnlock`（合言葉解錠）

**Files:**
- Modify: `apps/sync/src/application/handlers.ts`（deps・dispatch switch・HOST_ONLY_COMMANDS・新ハンドラ）
- Test: `apps/sync/test/handlers.ai-unlock.test.ts`（新規）

- [ ] **Step 1: 失敗するテストを書く**

`apps/sync/test/handlers.ai-unlock.test.ts`（フェイク類は既存 `apps/sync/test/handlers.problem.test.ts` のセットアップを踏襲する。以下は自己完結の最小形）:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import type { ServerMsg } from "@tdd-mob/core";

function makeFakes() {
  const store = new InMemoryRoomStore();
  const sent: Array<{ connId: string; msg: ServerMsg }> = [];
  const broadcaster = {
    broadcastSnapshot: () => {},
    sendTo: (connId: string, msg: ServerMsg) => {
      sent.push({ connId, msg });
    },
    broadcastSignal: () => {},
  };
  let t = 1_000_000;
  const clock = { now: () => t, advance: (ms: number) => (t += ms) };
  const codeGen = {
    generate: () => "ROOM1",
    generateParticipantId: (() => {
      let i = 0;
      return () => `p-${i++}`;
    })(),
    generateResumeToken: (() => {
      let i = 0;
      return () => `tok-${i++}`;
    })(),
  };
  return { store, broadcaster, clock, codeGen, sent };
}

/** host としてルームを作成し connId を返す */
async function createRoom(handlers: ReturnType<typeof makeHandlers>) {
  await handlers.handleCommand("conn-host", {
    command: "room.create",
    displayName: "Alice",
  });
  return "conn-host";
}

describe("ai.unlock", () => {
  let fakes: ReturnType<typeof makeFakes>;
  beforeEach(() => {
    fakes = makeFakes();
  });

  it("合言葉一致で aiUnlocked=true・problemMode=ai になり snapshot 配信される", async () => {
    const handlers = makeHandlers({ ...fakes, aiUnlockKey: "himitsu" });
    const connId = await createRoom(handlers);
    const result = await handlers.handleCommand(connId, {
      command: "ai.unlock",
      key: "himitsu",
    });
    expect(result.isOk()).toBe(true);
    const room = fakes.store.get("ROOM1")!;
    expect(room.aiUnlocked).toBe(true);
    expect(room.problemMode).toBe("ai");
  });

  it("合言葉不一致は AI_UNLOCK_FAILED", async () => {
    const handlers = makeHandlers({ ...fakes, aiUnlockKey: "himitsu" });
    const connId = await createRoom(handlers);
    const result = await handlers.handleCommand(connId, {
      command: "ai.unlock",
      key: "wrong",
    });
    expect(result.isErr()).toBe(true);
    const lastErr = fakes.sent.findLast((s) => s.msg.type === "error");
    expect(lastErr?.msg).toMatchObject({ code: "AI_UNLOCK_FAILED" });
    expect(fakes.store.get("ROOM1")!.aiUnlocked).toBeUndefined();
  });

  it("aiUnlockKey 未設定（機能無効）では正しい合言葉でも AI_UNLOCK_FAILED（存在秘匿）", async () => {
    const handlers = makeHandlers({ ...fakes }); // aiUnlockKey なし
    const connId = await createRoom(handlers);
    const result = await handlers.handleCommand(connId, {
      command: "ai.unlock",
      key: "himitsu",
    });
    expect(result.isErr()).toBe(true);
    const lastErr = fakes.sent.findLast((s) => s.msg.type === "error");
    expect(lastErr?.msg).toMatchObject({ code: "AI_UNLOCK_FAILED" });
  });

  it("host 以外は UNAUTHORIZED", async () => {
    const handlers = makeHandlers({ ...fakes, aiUnlockKey: "himitsu" });
    await createRoom(handlers);
    await handlers.handleCommand("conn-bob", {
      command: "room.join",
      code: "ROOM1",
      displayName: "Bob",
      hasAiKey: false,
    });
    const result = await handlers.handleCommand("conn-bob", {
      command: "ai.unlock",
      key: "himitsu",
    });
    expect(result.isErr()).toBe(true);
    const lastErr = fakes.sent.findLast((s) => s.msg.type === "error");
    expect(lastErr?.msg).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("連続失敗はレート制限される（30 回/10 秒の既存窓を共用）", async () => {
    const handlers = makeHandlers({ ...fakes, aiUnlockKey: "himitsu" });
    const connId = await createRoom(handlers);
    for (let i = 0; i < 30; i++) {
      await handlers.handleCommand(connId, { command: "ai.unlock", key: `bad-${i}` });
    }
    await handlers.handleCommand(connId, { command: "ai.unlock", key: "himitsu" });
    const lastErr = fakes.sent.findLast((s) => s.msg.type === "error");
    expect(lastErr?.msg).toMatchObject({ code: "RATE_LIMITED" });
  });
});
```

注: `room.join` の最低人数や `findLast` の型など、既存テスト（`handlers.v2.test.ts` / `handlers.problem.test.ts`）のセットアップと食い違う場合はそちらの流儀に合わせて調整する。意図（5 ケースの振る舞い）は変えない。

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer/apps/sync && npx vitest run test/handlers.ai-unlock.test.ts`
Expected: FAIL（`aiUnlockKey` プロパティ不在の型エラー / unknown command）

- [ ] **Step 3: 実装する**

`apps/sync/src/application/handlers.ts`:

1. import に追加: `import { constantTimeEqual } from "./secure-compare.js";`
2. `HandlerDeps` に追加（`maxRooms` の後）:

```typescript
  /** AI 解錠合言葉。undefined なら AI 機能は無効（解錠は常に失敗＝存在秘匿）。
   *  server.ts はトークン未設定時にもここを undefined にする。 */
  aiUnlockKey?: string;
```

3. `makeHandlers` 冒頭の分割代入に `aiUnlockKey` を追加: `const { store, clock, broadcaster, codeGen, scheduler, delegator } = deps;` の下に `const aiUnlockKey = deps.aiUnlockKey;`
4. `HOST_ONLY_COMMANDS` の Set に `"ai.unlock",` を追加（`"room.passphrase.set",` の隣）
5. `handleCommand` の switch に case を追加（`case "room.passphrase.set":` の直後）:

```typescript
      case "ai.unlock":
        return handleAiUnlock(
          connId,
          cmd as { command: "ai.unlock"; key: string },
        );
```

6. `handleRoomPassphraseSet` の直後に新ハンドラを追加:

```typescript
  /** AI お題生成を合言葉で解錠する（host 限定）。
   *  合言葉はサーバ env（AI_UNLOCK_KEY）のみに存在し、Room には aiUnlocked(boolean) だけ反映。
   *  未設定（機能無効）でも不一致と同じ AI_UNLOCK_FAILED を返し、機能の存在を秘匿する。
   *  失敗は join と同じレート制限窓（joinFailures）に積算する（総当たり対策）。 */
  async function handleAiUnlock(
    connId: string,
    cmd: { command: "ai.unlock"; key: string },
  ): Promise<Result<CreateResult, string>> {
    const room = findRoomByConnId(connId);
    if (!room) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "NOT_IN_ROOM",
        message: "ルームに参加していません",
      });
      return err("NOT_IN_ROOM");
    }
    const actor = room.participants.find((p) => p.connId === connId);
    if (!actor || actor.role !== "host") {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "UNAUTHORIZED",
        message: "AI 生成の解錠はホストのみ実行できます",
      });
      return err("UNAUTHORIZED");
    }

    // 連続失敗のレート制限（join と同じ窓・閾値を共用）
    const now = clock.now();
    if (recentJoinFailures(connId, now).length >= JOIN_FAIL_MAX) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "RATE_LIMITED",
        message: "試行が多すぎます。しばらく待ってから再試行してください",
      });
      return err("RATE_LIMITED");
    }

    const provided = cmd.key.trim();
    const matched =
      aiUnlockKey !== undefined &&
      provided !== "" &&
      constantTimeEqual(provided, aiUnlockKey);
    if (!matched) {
      joinFailures.set(connId, [...(joinFailures.get(connId) ?? []), now]);
      broadcaster.sendTo(connId, {
        type: "error",
        code: "AI_UNLOCK_FAILED",
        message: "合言葉が違います",
      });
      return err("AI_UNLOCK_FAILED");
    }

    const updatedRoom: Room = { ...room, aiUnlocked: true, problemMode: "ai" };
    store.put(updatedRoom);
    broadcaster.broadcastSnapshot(updatedRoom.code, updatedRoom);

    return ok({
      code: updatedRoom.code,
      participantId: actor.participantId,
      hostToken: "",
      resumeToken: "",
    });
  }
```

- [ ] **Step 4: テストが通ることを確認（既存ハンドラテストの回帰込み）**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer/apps/sync && npx vitest run`
Expected: 全 PASS

- [ ] **Step 5: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add tdd-mob-pro-timer/apps/sync
git commit -m "feat(sync): ai.unlock ハンドラを追加（合言葉解錠・定数時間比較・レート制限・存在秘匿）"
```

---

### Task 7: sync — `ProblemDelegator` にサーバ生成を合流

**Files:**
- Modify: `apps/sync/src/application/problem-delegation.ts`
- Test: `apps/sync/test/problem-delegation.ai.test.ts`（新規）

- [ ] **Step 1: 失敗するテストを書く**

`apps/sync/test/problem-delegation.ai.test.ts`（Room フィクスチャ・フェイク store/broadcaster は既存 `apps/sync/test/problem-delegation.test.ts` のものをコピーして使う。以下の `makeRoom` は最小形）:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProblemDelegator } from "../src/application/problem-delegation.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { AiLimiter } from "../src/application/ai-limits.js";
import type { Room, ServerMsg } from "@tdd-mob/core";
import type { ServerProblemProvider } from "../src/ports/server-problem-provider.js";

const VALID_PROBLEM = {
  title: "Generated Kata",
  description: "AI が生成した説明",
  requirements: ["r1", "r2", "r3"],
  exampleTest: "test('x', () => {})",
  hints: ["h1"],
};

function makeRoom(over: Partial<Room> = {}): Room {
  return {
    code: "ROOM1",
    problemMode: "ai",
    aiUnlocked: true,
    problem: null,
    config: { language: "TypeScript", difficulty: "easy" },
    participants: [],
    session: { rotation: [], currentIndex: 0, totalSwitches: 0 },
    clock: { running: false },
    phase: "setup",
    hostParticipantId: "p-0",
    createdAt: 0,
    ...over,
  } as unknown as Room;
}

describe("ProblemDelegator サーバ生成", () => {
  let store: InMemoryRoomStore;
  let snapshots: Room[];
  let broadcaster: {
    broadcastSnapshot: (code: string, room: Room) => void;
    sendTo: (connId: string, msg: ServerMsg) => void;
    broadcastSignal: (code: string, msg: ServerMsg) => void;
  };
  const clock = { now: () => Date.now() };

  beforeEach(() => {
    vi.useFakeTimers();
    store = new InMemoryRoomStore();
    snapshots = [];
    broadcaster = {
      broadcastSnapshot: (_code, room) => snapshots.push(room),
      sendTo: () => {},
      broadcastSignal: () => {},
    };
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function makeDelegator(provider: ServerProblemProvider) {
    const limiter = new AiLimiter({ clock, dailyLimit: 100, cooldownMs: 0 });
    return new ProblemDelegator({
      store,
      clock,
      broadcaster,
      serverProvider: provider,
      aiLimiter: limiter,
      aiTimeoutMs: 60_000,
    });
  }

  it("生成成功で source:'ai' のお題が確定し snapshot 配信される", async () => {
    store.put(makeRoom());
    const provider: ServerProblemProvider = {
      generate: vi.fn(async () => VALID_PROBLEM),
    };
    const delegator = makeDelegator(provider);
    delegator.request("ROOM1", "req-1");
    await vi.runAllTimersAsync();
    const room = store.get("ROOM1")!;
    expect(room.problem?.title).toBe("Generated Kata");
    expect(room.problem?.source).toBe("ai");
    expect(snapshots.length).toBeGreaterThan(0);
  });

  it("生成 reject は定型バンクへ縮退する", async () => {
    store.put(makeRoom());
    const provider: ServerProblemProvider = {
      generate: vi.fn(async () => {
        throw new Error("boom");
      }),
    };
    const delegator = makeDelegator(provider);
    delegator.request("ROOM1", "req-1");
    await vi.runAllTimersAsync();
    const room = store.get("ROOM1")!;
    expect(room.problem).not.toBeNull();
    expect(room.problem?.source).not.toBe("ai");
  });

  it("検証失敗（不正 JSON 構造）も定型へ縮退する", async () => {
    store.put(makeRoom());
    const provider: ServerProblemProvider = {
      generate: vi.fn(async () => ({ totally: "wrong shape" })),
    };
    const delegator = makeDelegator(provider);
    delegator.request("ROOM1", "req-1");
    await vi.runAllTimersAsync();
    const room = store.get("ROOM1")!;
    expect(room.problem).not.toBeNull();
    expect(room.problem?.source).not.toBe("ai");
  });

  it("タイムアウトで abort され定型へ縮退する", async () => {
    store.put(makeRoom());
    let aborted = false;
    const provider: ServerProblemProvider = {
      generate: (_l, _d, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("aborted"));
          });
        }),
    };
    const delegator = makeDelegator(provider);
    delegator.request("ROOM1", "req-1");
    await vi.advanceTimersByTimeAsync(60_001);
    expect(aborted).toBe(true);
    expect(store.get("ROOM1")!.problem).not.toBeNull();
  });

  it("リロール（新 request）で旧生成は破棄される（stale 防御）", async () => {
    store.put(makeRoom());
    let resolveFirst!: (v: unknown) => void;
    const results: unknown[] = [VALID_PROBLEM, { ...VALID_PROBLEM, title: "Second" }];
    let call = 0;
    const provider: ServerProblemProvider = {
      generate: () =>
        call++ === 0
          ? new Promise((res) => {
              resolveFirst = res;
            })
          : Promise.resolve(results[1]),
    };
    const limiter = new AiLimiter({ clock, dailyLimit: 100, cooldownMs: 0, maxConcurrent: 2 });
    const delegator = new ProblemDelegator({
      store,
      clock,
      broadcaster,
      serverProvider: provider,
      aiLimiter: limiter,
      aiTimeoutMs: 60_000,
    });
    delegator.request("ROOM1", "req-1");
    delegator.request("ROOM1", "req-2"); // リロール（req-1 をキャンセル）
    resolveFirst(VALID_PROBLEM); // 旧生成が遅れて完了
    await vi.runAllTimersAsync();
    expect(store.get("ROOM1")!.problem?.title).toBe("Second");
  });

  it("aiUnlocked=false のルームでは provider を呼ばず定型確定", async () => {
    store.put(makeRoom({ aiUnlocked: false } as Partial<Room>));
    const generate = vi.fn(async () => VALID_PROBLEM);
    const delegator = makeDelegator({ generate });
    delegator.request("ROOM1", "req-1");
    await vi.runAllTimersAsync();
    expect(generate).not.toHaveBeenCalled();
    expect(store.get("ROOM1")!.problem).not.toBeNull();
  });

  it("limiter が拒否したら provider を呼ばず定型確定", async () => {
    store.put(makeRoom());
    const generate = vi.fn(async () => VALID_PROBLEM);
    const limiter = new AiLimiter({ clock, dailyLimit: 0 }); // 日次 0 = 常に拒否
    const delegator = new ProblemDelegator({
      store,
      clock,
      broadcaster,
      serverProvider: { generate },
      aiLimiter: limiter,
      aiTimeoutMs: 60_000,
    });
    delegator.request("ROOM1", "req-1");
    await vi.runAllTimersAsync();
    expect(generate).not.toHaveBeenCalled();
    expect(store.get("ROOM1")!.problem).not.toBeNull();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer/apps/sync && npx vitest run test/problem-delegation.ai.test.ts`
Expected: FAIL（`serverProvider` 等のプロパティ不在）

- [ ] **Step 3: 実装する**

`apps/sync/src/application/problem-delegation.ts` を拡張:

1. import 追加:

```typescript
import type { ServerProblemProvider } from "../ports/server-problem-provider.js";
import type { AiLimiter } from "./ai-limits.js";
```

2. `ProblemDelegatorDeps` に追加:

```typescript
  /** サーバサイド AI 生成（省略時はクライアント委譲のみ＝従来挙動） */
  serverProvider?: ServerProblemProvider;
  /** AI 生成の濫用抑制。serverProvider とセットで渡す */
  aiLimiter?: AiLimiter;
  /** AI 生成のタイムアウト ms（既定 60 秒） */
  aiTimeoutMs?: number;
```

3. クラスにフィールドと状態を追加:

```typescript
  private readonly serverProvider: ServerProblemProvider | undefined;
  private readonly aiLimiter: AiLimiter | undefined;
  private readonly aiTimeoutMs: number;
  /** roomCode → 進行中のサーバ生成（リロール/cancel で abort する） */
  private readonly activeServer = new Map<
    string,
    { requestId: string; abort: AbortController; timer: ReturnType<typeof setTimeout>; release: () => void }
  >();
```

constructor に: `this.serverProvider = deps.serverProvider; this.aiLimiter = deps.aiLimiter; this.aiTimeoutMs = deps.aiTimeoutMs ?? 60_000;`

4. `request()` を再構成（fallback 早期 return は既存のまま）:

```typescript
  request(roomCode: string, requestId: string): void {
    this.cancel(roomCode);

    const room = this.store.get(roomCode);
    if (!room) return;

    // problemMode=fallback の場合は AI 候補へ委譲せず即座に定型で確定する（FR-037/043）
    if (room.problemMode === "fallback") {
      const fb = pickFallback(room.config.language, room.config.difficulty);
      this.finalize(roomCode, { ...fb.problem, source: "fallback" });
      return;
    }

    // 合言葉解錠済み＋サーバ provider 構成済みならサーバ生成を最優先で試す。
    // 取得できない（同時実行/クールダウン/日次上限）ときはエラーにせず従来経路＝定型へ。
    if (room.aiUnlocked && this.serverProvider && this.aiLimiter) {
      const acquired = this.aiLimiter.tryAcquire(roomCode);
      if (acquired.ok) {
        this.startServerGeneration(roomCode, requestId, room, acquired.release);
        return;
      }
      console.warn(`AI 生成スキップ (${roomCode}): ${acquired.reason} — 定型へ縮退`);
    }

    this.startClientDelegation(roomCode, requestId, room);
  }

  /** 従来のクライアント代表委譲（候補が空なら即・定型確定） */
  private startClientDelegation(roomCode: string, requestId: string, room: Room): void {
    const candidates = buildCandidates(room);
    this.active.set(roomCode, { requestId, candidates, index: 0, timer: null });
    this.offerToCurrent(roomCode);
  }

  /** サーバサイド AI 生成。成功で source:"ai" 確定、失敗は従来経路へ縮退する。 */
  private startServerGeneration(
    roomCode: string,
    requestId: string,
    room: Room,
    release: () => void,
  ): void {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), this.aiTimeoutMs);
    this.activeServer.set(roomCode, { requestId, abort, timer, release });

    this.serverProvider!
      .generate(room.config.language, room.config.difficulty, abort.signal)
      .then((raw) => {
        if (!this.isCurrentServerRequest(roomCode, requestId)) return; // リロール済み＝破棄
        const validated = validateProblem(raw);
        if (validated.isOk()) {
          this.clearServer(roomCode);
          this.finalize(roomCode, { ...validated.value, source: "ai" });
        } else {
          this.failoverFromServer(roomCode, requestId, "検証失敗（FR-023）");
        }
      })
      .catch((e: unknown) => {
        this.failoverFromServer(roomCode, requestId, String(e));
      });
  }

  /** 進行中サーバ生成が requestId と一致するか（stale 防御） */
  private isCurrentServerRequest(roomCode: string, requestId: string): boolean {
    return this.activeServer.get(roomCode)?.requestId === requestId;
  }

  /** サーバ生成の状態を破棄する（タイマー解除・枠返却） */
  private clearServer(roomCode: string): void {
    const st = this.activeServer.get(roomCode);
    if (!st) return;
    clearTimeout(st.timer);
    st.release();
    this.activeServer.delete(roomCode);
  }

  /** サーバ生成失敗 → 従来のクライアント委譲（実質・定型確定）へ縮退する */
  private failoverFromServer(roomCode: string, requestId: string, reason: string): void {
    if (!this.isCurrentServerRequest(roomCode, requestId)) return;
    this.clearServer(roomCode);
    console.warn(`AI 生成失敗 (${roomCode}): ${reason} — 定型へ縮退`);
    const room = this.store.get(roomCode);
    if (!room) return;
    this.startClientDelegation(roomCode, requestId, room);
  }
```

5. `cancel()` にサーバ生成の中断を追加:

```typescript
  cancel(roomCode: string): void {
    const state = this.active.get(roomCode);
    if (state?.timer) clearTimeout(state.timer);
    this.active.delete(roomCode);
    // 進行中のサーバ生成があれば中断する（子プロセスも provider 側で kill される）
    const server = this.activeServer.get(roomCode);
    if (server) {
      server.abort.abort();
      this.clearServer(roomCode);
    }
  }
```

（`cancelAll()` は `cancel` 経由なので変更不要。ただし `cancelAll` のループ対象に `activeServer` のキーも含める: `for (const code of new Set([...this.active.keys(), ...this.activeServer.keys()]))`）

- [ ] **Step 4: テストが通ることを確認（既存 delegator テストの回帰込み）**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer/apps/sync && npx vitest run test/problem-delegation.ai.test.ts test/problem-delegation.test.ts`
Expected: 全 PASS

- [ ] **Step 5: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add tdd-mob-pro-timer/apps/sync
git commit -m "feat(sync): ProblemDelegator にサーバサイド AI 生成を合流（失敗は定型へ縮退）"
```

---

### Task 8: sync — server.ts 配線と管理レポート拡張

**Files:**
- Modify: `apps/sync/src/server.ts`
- Modify: `apps/sync/src/application/admin.ts`（`AdminReport` に AI カウンタ）
- Test: `apps/sync/test/admin.test.ts`（既存に追記）

- [ ] **Step 1: admin の失敗するテストを書く**

`apps/sync/test/admin.test.ts` に追記:

```typescript
describe("AI 生成カウンタ", () => {
  it("aiGeneration が渡されればレポートに含まれ、未指定なら省略される", () => {
    const withAi = buildAdminReport([], 0, { today: 3, total: 42 });
    expect(withAi.aiGeneration).toEqual({ today: 3, total: 42 });
    const without = buildAdminReport([], 0);
    expect(without.aiGeneration).toBeUndefined();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer/apps/sync && npx vitest run test/admin.test.ts`
Expected: FAIL（引数 3 つ目を受けない）

- [ ] **Step 3: admin.ts を実装する**

`AdminReport` に追加:

```typescript
  /** AI お題生成の回数（有効時のみ） */
  aiGeneration?: { today: number; total: number };
```

`buildAdminReport` のシグネチャと実装:

```typescript
export function buildAdminReport(
  rooms: Room[],
  reclaimedCount: number,
  aiGeneration?: { today: number; total: number },
): AdminReport {
  return {
    activeRooms: rooms.length,
    totalReclaimed: reclaimedCount,
    ...(aiGeneration ? { aiGeneration } : {}),
    rooms: rooms.map((r) => ({
      code: r.code,
      participants: r.participants.length,
      online: r.participants.filter((p) => p.presence === "online").length,
      hasDriver: r.session.rotation.length > 0,
      createdAt: r.createdAt,
    })),
  };
}
```

- [ ] **Step 4: server.ts を配線する**

`apps/sync/src/server.ts`:

1. import 追加:

```typescript
import { AiLimiter } from "./application/ai-limits.js";
import { ClaudeCliProblemProvider } from "./adapters/claude-cli-problem-provider.js";
```

2. `const delegator = new ProblemDelegator({...})` の直前に AI 構成を組み立て、delegator/handlers に渡す:

```typescript
// AI お題生成（トークンと合言葉が両方あるときだけ有効。spec 2026-06-12 参照）
const aiReady = Boolean(config.claudeOauthToken && config.aiUnlockKey);
const aiLimiter = aiReady
  ? new AiLimiter({ clock, dailyLimit: config.aiDailyLimit })
  : undefined;
const serverProvider = aiReady
  ? new ClaudeCliProblemProvider({
      token: config.claudeOauthToken!,
      model: config.aiProblemModel,
    })
  : undefined;

const delegator = new ProblemDelegator({
  store,
  clock,
  broadcaster,
  serverProvider,
  aiLimiter,
  aiTimeoutMs: config.aiGenerationTimeoutMs,
});
const handlers = makeHandlers({
  store,
  clock,
  broadcaster,
  codeGen,
  scheduler,
  delegator,
  maxRooms: config.maxRooms,
  // トークン未設定なら合言葉も渡さない＝解錠は常に失敗（存在秘匿）
  aiUnlockKey: aiReady ? config.aiUnlockKey : undefined,
});
```

3. `httpHandler` の `getReport` を更新:

```typescript
      getReport: () =>
        buildAdminReport(
          store.list(),
          reclaimer.reclaimedCount,
          aiLimiter ? { today: aiLimiter.todayCount, total: aiLimiter.totalCount } : undefined,
        ),
```

4. 起動ログに 1 行追加（管理エンドポイントのログの隣）:

```typescript
console.log(`AI お題生成: ${aiReady ? `有効 (model=${config.aiProblemModel})` : "無効 (トークン/合言葉 未設定)"}`);
```

- [ ] **Step 5: 全テスト・型・ビルドを確認**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer && PATH="$HOME/.local/bin:$PATH" pnpm typecheck && PATH="$HOME/.local/bin:$PATH" pnpm --filter @tdd-mob/sync test:unit`
Expected: 全 PASS

- [ ] **Step 6: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add tdd-mob-pro-timer/apps/sync
git commit -m "feat(sync): AI お題生成を server.ts に配線し /status に生成カウンタを追加"
```

---

### Task 9: web — 解錠 UI・AI バッジ・エラーメッセージ

**Files:**
- Create: `apps/web/src/ui/components/AiUnlockPanel.tsx`
- Modify: `apps/web/src/ui/Lobby.tsx`（「お題・設定」タブに配置）
- Modify: `apps/web/src/ui/components/ProblemEditor.tsx`（AI バッジ）
- Modify: `apps/web/src/App.tsx`（送信ハンドラ・ERROR_MESSAGES）
- Test: `apps/web/test/ui/AiUnlockPanel.test.tsx`（新規）

- [ ] **Step 1: 失敗するテストを書く**

`apps/web/test/ui/AiUnlockPanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AiUnlockPanel } from "../../src/ui/components/AiUnlockPanel.js";

describe("AiUnlockPanel", () => {
  it("未解錠時は合言葉入力と解錠ボタンを表示し、入力値で onUnlock を呼ぶ", () => {
    const onUnlock = vi.fn();
    render(<AiUnlockPanel unlocked={false} aiMode={false} onUnlock={onUnlock} onModeSet={vi.fn()} />);
    const input = screen.getByLabelText("AI 生成の合言葉");
    fireEvent.change(input, { target: { value: "himitsu" } });
    fireEvent.click(screen.getByRole("button", { name: "解錠" }));
    expect(onUnlock).toHaveBeenCalledWith("himitsu");
    // 送信後は平文を画面状態に残さない
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("解錠済み・AI モード時は有効表示と OFF トグルを出す", () => {
    const onModeSet = vi.fn();
    render(<AiUnlockPanel unlocked={true} aiMode={true} onUnlock={vi.fn()} onModeSet={onModeSet} />);
    expect(screen.getByText(/AI 生成: 有効/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "定型に戻す" }));
    expect(onModeSet).toHaveBeenCalledWith("fallback");
  });

  it("解錠済み・定型モード時は AI に切替するトグルを出す", () => {
    const onModeSet = vi.fn();
    render(<AiUnlockPanel unlocked={true} aiMode={false} onUnlock={vi.fn()} onModeSet={onModeSet} />);
    fireEvent.click(screen.getByRole("button", { name: "AI 生成を使う" }));
    expect(onModeSet).toHaveBeenCalledWith("ai");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer/apps/web && npx vitest run test/ui/AiUnlockPanel.test.tsx`
Expected: FAIL（コンポーネント不在）

- [ ] **Step 3: AiUnlockPanel を実装する**

`apps/web/src/ui/components/AiUnlockPanel.tsx`（`PassphrasePanel.tsx` と同型）:

```tsx
/**
 * ホスト用: AI お題生成の解錠パネル。
 * 合言葉（サーバ env の AI_UNLOCK_KEY）を知るホストだけが解錠できる。
 * 入力欄は常時表示する（クライアントはサーバの設定状態を知らない。未設定サーバでは失敗するだけ）。
 * 平文は保持・表示しない（snapshot の aiUnlocked だけで状態を表す）。
 */
import React, { useState } from "react";
import { Sparkles } from "lucide-react";
import { MAX_AI_UNLOCK_KEY } from "@tdd-mob/core/aggregate";
import { PrimaryButton, GhostButton, SectionHeader } from "../primitives.js";

interface AiUnlockPanelProps {
  /** 解錠済みか（snapshot の aiUnlocked） */
  unlocked: boolean;
  /** 現在 AI モードか（snapshot の problemMode === "ai"） */
  aiMode: boolean;
  /** 合言葉で解錠を試みる */
  onUnlock: (key: string) => void;
  /** AI ⇔ 定型の切替（problem.mode.set） */
  onModeSet: (mode: "ai" | "fallback") => void;
}

export function AiUnlockPanel({ unlocked, aiMode, onUnlock, onModeSet }: AiUnlockPanelProps) {
  const [value, setValue] = useState("");
  const submit = () => {
    if (!value) return;
    onUnlock(value);
    setValue(""); // 確定後は平文を画面状態に残さない
  };
  return (
    <div className="w-full">
      <SectionHeader icon={Sparkles} color="text-[var(--signal)]" title="AI お題生成" />
      {unlocked ? (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-[var(--bone-muted)]">
            {aiMode ? "AI 生成: 有効（お題を AI が作成します）" : "AI 生成: 解錠済み（定型を使用中）"}
          </span>
          {aiMode ? (
            <GhostButton onClick={() => onModeSet("fallback")} className="text-sm">
              定型に戻す
            </GhostButton>
          ) : (
            <GhostButton onClick={() => onModeSet("ai")} className="text-sm">
              AI 生成を使う
            </GhostButton>
          )}
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            aria-label="AI 生成の合言葉"
            maxLength={MAX_AI_UNLOCK_KEY}
            placeholder="合言葉を知っている場合のみ"
            className="flex-1 rounded-md border border-[var(--hairline-strong)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--bone)] outline-none focus:border-[var(--signal)] focus-visible:ring-2 focus-visible:ring-[var(--signal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]"
          />
          <PrimaryButton onClick={submit} disabled={!value} className="px-4 py-2 text-sm">
            解錠
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer/apps/web && npx vitest run test/ui/AiUnlockPanel.test.tsx`
Expected: 全 PASS

- [ ] **Step 5: Lobby / App / ProblemEditor を配線する**

`apps/web/src/App.tsx`:
1. `ERROR_MESSAGES` に追加:

```typescript
  // AI お題生成の解錠（合言葉不一致・未設定サーバ共通）。
  AI_UNLOCK_FAILED: "合言葉が違います。",
```

2. `handleSetPassphrase`（276 行付近）の直後にハンドラを追加:

```typescript
  const handleAiUnlock = (key: string) => {
    client?.send({ command: "ai.unlock", key });
  };
  const handleProblemModeSet = (mode: "ai" | "fallback") => {
    client?.send({ command: "problem.mode.set", mode });
  };
```

3. `<Lobby ...>` の props（`onSetPassphrase` を渡している箇所）に追加: `onAiUnlock={handleAiUnlock}` `onProblemModeSet={handleProblemModeSet}`

`apps/web/src/ui/Lobby.tsx`:
1. import: `import { AiUnlockPanel } from "./components/AiUnlockPanel.js";`
2. Props に追加: `onAiUnlock?: (key: string) => void; onProblemModeSet?: (mode: "ai" | "fallback") => void;`
3. 「お題・設定」タブ（`id: "options"`、247 行付近）の `<ConfigPanel ...>` を含む Card の直後に追加:

```tsx
              {/* AI お題生成の解錠（host 限定・合言葉方式）。入力欄は常時表示する。 */}
              {isHost && onAiUnlock && onProblemModeSet && (
                <Card>
                  <AiUnlockPanel
                    unlocked={!!room.aiUnlocked}
                    aiMode={room.problemMode === "ai"}
                    onUnlock={onAiUnlock}
                    onModeSet={onProblemModeSet}
                  />
                </Card>
              )}
```

4. 「お題を準備中です…」（278 行付近）を AI 時の文言に分岐:

```tsx
                      <p>
                        {room.aiUnlocked && room.problemMode === "ai"
                          ? "AI がお題を作成中です…（最大 1 分）"
                          : "お題を準備中です…"}
                      </p>
```

`apps/web/src/ui/components/ProblemEditor.tsx` の `Badges`（59 行付近、`source === "custom"` バッジの隣）に追加:

```tsx
      {source === "ai" && (
        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide bg-[var(--panel-2)] border border-[var(--hairline-strong)] text-[var(--signal)]">
          AI
        </span>
      )}
```

（`source === "custom"` バッジの既存クラス名に合わせて調整する。意図は「小さな AI バッジ」）

- [ ] **Step 6: web 全テスト・型を確認**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer && PATH="$HOME/.local/bin:$PATH" pnpm --filter @tdd-mob/web test:unit && PATH="$HOME/.local/bin:$PATH" pnpm typecheck`
Expected: 全 PASS

- [ ] **Step 7: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add tdd-mob-pro-timer/apps/web
git commit -m "feat(web): AI お題生成の解錠パネル・AI バッジ・生成中表示を追加"
```

---

### Task 10: 全体検証とローカル実機 E2E

**Files:** なし（検証のみ。修正が出たら該当タスクの流儀で直してコミット）

- [ ] **Step 1: 全テスト・型・ビルド**

Run:
```bash
cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer
PATH="$HOME/.local/bin:$PATH" pnpm test:unit && PATH="$HOME/.local/bin:$PATH" pnpm typecheck && PATH="$HOME/.local/bin:$PATH" pnpm build
```
Expected: 全タスク緑（既存 616+ テスト + 本機能の追加分）

- [ ] **Step 2: adapter の実 claude スモークテスト（自動テスト外・1 回だけ）**

devcontainer には claude がインストール済み。実際の `claude -p` で JSON が抽出できることを単発確認:

```bash
cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer
cat > /tmp/ai_smoke.ts <<'EOF'
import { ClaudeCliProblemProvider } from "./apps/sync/src/adapters/claude-cli-problem-provider.js";
import { validateProblem } from "@tdd-mob/core";
const provider = new ClaudeCliProblemProvider({
  token: process.env["CLAUDE_CODE_OAUTH_TOKEN"] ?? "",
  model: "haiku",
});
const ac = new AbortController();
setTimeout(() => ac.abort(), 90_000);
const raw = await provider.generate("TypeScript", "easy", ac.signal);
const v = validateProblem(raw);
console.log(v.isOk() ? `OK: ${(v as { value: { title: string } }).value.title}` : `NG: ${JSON.stringify(raw).slice(0, 300)}`);
EOF
# 注: devcontainer はサブスクログイン済みのため token 空でも claude が認証を解決できる場合がある。
# 失敗する場合は `claude setup-token` で発行したトークンを env に渡して再実行する。
bun run /tmp/ai_smoke.ts
```
Expected: `OK: <生成されたお題タイトル>`（validateProblem 通過）

- [ ] **Step 3: ブラウザ実機 E2E**

```bash
# 旧プロセスを必ず掃除してから単一起動（WSL の HMR 取りこぼし対策・既知の罠）
for p in $(lsof -ti tcp:5173 tcp:8787); do kill -9 $p; done
cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer
AI_UNLOCK_KEY=test-himitsu CLAUDE_CODE_OAUTH_TOKEN=<setup-token の値> PATH="$HOME/.local/bin:$PATH" pnpm dev
```

ブラウザ（http://localhost:5173/）で確認:
1. ルーム作成 → ロビー「お題・設定」タブに「AI お題生成」パネルが出る（host のみ）
2. 誤った合言葉 → 「合言葉が違います。」バナー
3. `test-himitsu` で解錠 → 「AI 生成: 有効」表示・snapshot 反映
4. 「別のお題」リロール → 「AI がお題を作成中です…（最大 1 分）」→ AI バッジ付きお題が確定
5. 「定型に戻す」→ 即・定型バンクのお題に切替
6. sync を `AI_UNLOCK_KEY` なしで再起動 → 解錠が常に失敗（存在秘匿）し従来動作

- [ ] **Step 4: 実機で確認できたらチェックボックスを埋めてコミット（修正があればここまでに済ませる）**

```bash
cd /workspaces/claym/local/Tasuki
git add -A tdd-mob-pro-timer
git status --short  # package.json に workspaces が混入していたら checkout で戻す（bun の既知の副作用）
git commit -m "test: AI お題生成の実機 E2E 確認（必要な修正があればここに含める）" --allow-empty
```

---

### Task 11: デプロイ資材の更新（コードのみ・実デプロイはユーザー判断で別途）

**Files:**
- Modify: `deploy/tasuki-sync.env.example`
- Modify: `deploy/README.md`

- [ ] **Step 1: env.example に追記**

`deploy/tasuki-sync.env.example` の末尾に追加:

```bash
# ─── AI お題生成（任意・両方設定したときのみ有効） ───
# Claude サブスクの OAuth トークン（ローカルで `claude setup-token` を実行して発行）
#CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
# 解錠の合言葉（これを知るルームの host だけが AI 生成を使える）
#AI_UNLOCK_KEY=
# 生成モデル / タイムアウト / 日次上限（既定: sonnet / 60000 / 100）
#AI_PROBLEM_MODEL=sonnet
#AI_GENERATION_TIMEOUT_MS=60000
#AI_DAILY_LIMIT=100
```

- [ ] **Step 2: deploy/README.md に運用手順を追記**

「運用可視化」セクションの後に新セクションを追加:

```markdown
## AI お題生成（任意機能）

設計: `docs/superpowers/specs/2026-06-12-ai-problem-generation-design.md`

### 初回セットアップ（VPS）

1. claude スタンドアロンバイナリを導入（Node 不要・約 240MB）:
   `curl -fsSL https://claude.ai/install.sh | bash`
   → `~/.local/bin/claude` に入る。`claude --version` で確認。
2. systemd unit が claude を解決できるよう、`tasuki-sync.service` の `[Service]` に
   `Environment=PATH=/home/deploy/.local/bin:/usr/local/bin:/usr/bin:/bin` を追加
   （既に PATH 指定がある場合は claude のパスを追記）。
3. ローカルマシンで `claude setup-token` を実行しトークンを発行。
4. `/opt/tasuki/tasuki-sync.env` に `CLAUDE_CODE_OAUTH_TOKEN` と `AI_UNLOCK_KEY` を追記
   （パーミッション 600 を維持）。
5. `sudo systemctl restart tasuki-sync` → 起動ログに「AI お題生成: 有効」が出れば OK。

### 運用

- 消費の確認: `/status` の `aiGeneration: { today, total }`（127.0.0.1 限定・ADMIN_TOKEN 必須）。
- トークン失効時: 生成は定型バンクへ自動縮退（サービス無停止）。`claude setup-token` で
  再発行し env を更新 → restart。
- 全面無効化（ロールバック）: env の `CLAUDE_CODE_OAUTH_TOKEN`・`AI_UNLOCK_KEY` を消して restart。
- メモリ: `claude -p` は約 355MB（実測）。同時実行はアプリ側で 1 に直列化済み
  （VPS 1GB RAM・swap 2GB 前提）。
```

- [ ] **Step 3: コミット**

```bash
cd /workspaces/claym/local/Tasuki
git add tdd-mob-pro-timer/deploy
git commit -m "docs(deploy): AI お題生成の VPS セットアップ・運用手順を追記"
```

---

## スペック対応表（セルフレビュー用）

| スペック項目 | タスク |
|--------------|--------|
| `Room.aiUnlocked` / `ai.unlock` スキーマ / `MAX_AI_UNLOCK_KEY` | Task 1 |
| env 5 種・どちらか欠けると無効 | Task 2, 8 |
| 定数時間比較（admin と共用） | Task 3 |
| 同時 1・クールダウン 10s・日次上限（超過は縮退） | Task 4, 7 |
| `ServerProblemProvider` port / `claude -p` adapter / stdin 渡し / 設定非読込フラグ | Task 5 |
| `handleAiUnlock`（host 限定・レート制限・存在秘匿・`problemMode="ai"` 自動設定） | Task 6 |
| 委譲合流・stale 防御・リロール kill・縮退レール | Task 7 |
| server.ts 配線・起動ログ・`/status` カウンタ | Task 8 |
| 解錠 UI（常時表示）・OFF トグル・AI バッジ・生成中文言・`AI_UNLOCK_FAILED` | Task 9 |
| 全テスト緑・実 claude スモーク・ブラウザ E2E | Task 10 |
| VPS バイナリ導入・env 追記・README・ロールバック手順 | Task 11 |
