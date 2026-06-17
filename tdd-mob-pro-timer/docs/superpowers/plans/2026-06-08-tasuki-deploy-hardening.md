# Tasuki デプロイ堅牢化（M-1 / M-2）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development（タスクごとに新規サブエージェント + 二段レビュー）。各ステップは TDD。

**Goal:** セキュリティレビューの Medium 2 件を解消する。M-1: 本番で `ALLOWED_ORIGINS` 未設定なら起動拒否（fail-closed）。M-2: 公開運用の DoS 余地を塞ぐリソース上限（同時接続数・ルーム数・アイドル回収）を sync サーバーに実装する。

**Architecture:** sync の env を集約する `config.ts` を新設し fail-closed 判定を内蔵。接続数上限は WsAdapter、ルーム数上限は handlers の room.create、アイドル回収は presence に依存しない自己完結 sweep（`RoomReclaimer` がストアを定期観測し、全員 offline が TTL 継続したルームを削除）。すべて env で調整可能。

**Tech Stack:** TypeScript, ws(WebSocketServer), valibot, neverthrow, vitest, Bun。

**正本:** `docs/superpowers/specs/2026-06-07-tasuki-vps-deployment-design.md`（§8 安全策の強化）。

**作業ディレクトリ:** `tdd-mob-pro-timer/`。pnpm は `~/.local/bin/pnpm`、bun は PATH 上。

**env 既定値（すべて上書き可）:** `MAX_CONNECTIONS=200` / `MAX_ROOMS=50` / `ROOM_IDLE_TTL_MS=1800000`(30分) / sweep 間隔は定数 `RECLAIM_SWEEP_MS=60000`。本番 env に `NODE_ENV=production` を置く。

---

## ファイル構成

**作成:**
- `apps/sync/src/config.ts` — env 集約 + fail-closed 判定（M-1）
- `apps/sync/src/application/room-reclaimer.ts` — アイドル回収 sweep（M-2）
- `apps/sync/test/config.test.ts`
- `apps/sync/test/room-reclaimer.test.ts`
- `apps/sync/test/ws-adapter.integration.test.ts`

**変更:**
- `apps/sync/src/adapters/ws-adapter.ts` — `maxConnections` 上限（M-2）
- `apps/sync/src/application/handlers.ts` — `maxRooms` 上限 + `releaseRoom(code)`（M-2）
- `apps/sync/src/application/presence.ts` — `clearRoomTimers(code)` 公開（回収時のタイマー掃除）
- `apps/sync/src/server.ts` — config 利用・上限配線・reclaimer 起動（M-1+M-2 配線）
- `apps/sync/test/handlers.room.test.ts` — ルーム数上限 + releaseRoom のテスト
- `deploy/tasuki-sync.env.example` / `deploy/README.md` — env 追記
- `docs/superpowers/specs/2026-06-07-...md` — §8 強化を追記

---

## Task 1: config.ts（M-1 fail-closed + env 集約）

**Files:** Create `apps/sync/src/config.ts`, `apps/sync/test/config.test.ts`

- [ ] **Step 1: 失敗するテストを書く** — `apps/sync/test/config.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { loadSyncConfig } from "../src/config.js";

describe("loadSyncConfig", () => {
  it("既定値を返す（env 空）", () => {
    const c = loadSyncConfig({});
    expect(c).toEqual({
      port: 8787,
      host: "127.0.0.1",
      allowedOrigins: [],
      maxConnections: 200,
      maxRooms: 50,
      roomIdleTtlMs: 1_800_000,
    });
  });

  it("env を解釈する", () => {
    const c = loadSyncConfig({
      PORT: "9000",
      HOST: "0.0.0.0",
      ALLOWED_ORIGINS: "https://a.example, https://b.example",
      MAX_CONNECTIONS: "10",
      MAX_ROOMS: "3",
      ROOM_IDLE_TTL_MS: "60000",
    });
    expect(c.port).toBe(9000);
    expect(c.host).toBe("0.0.0.0");
    expect(c.allowedOrigins).toEqual(["https://a.example", "https://b.example"]);
    expect(c.maxConnections).toBe(10);
    expect(c.maxRooms).toBe(3);
    expect(c.roomIdleTtlMs).toBe(60000);
  });

  it("本番で ALLOWED_ORIGINS 空なら例外（fail-closed）", () => {
    expect(() => loadSyncConfig({ NODE_ENV: "production" })).toThrow(
      /ALLOWED_ORIGINS/,
    );
  });

  it("本番でも ALLOWED_ORIGINS があれば OK", () => {
    const c = loadSyncConfig({
      NODE_ENV: "production",
      ALLOWED_ORIGINS: "https://tasuki.example.com",
    });
    expect(c.allowedOrigins).toEqual(["https://tasuki.example.com"]);
  });

  it("不正な数値は既定値にフォールバック", () => {
    const c = loadSyncConfig({ MAX_CONNECTIONS: "abc", PORT: "" });
    expect(c.maxConnections).toBe(200);
    expect(c.port).toBe(8787);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `~/.local/bin/pnpm --filter @tdd-mob/sync exec vitest run test/config.test.ts`
Expected: FAIL（`loadSyncConfig` 未定義）

- [ ] **Step 3: 実装** — `apps/sync/src/config.ts`

```typescript
/**
 * sync サーバーの環境変数を集約・検証する。
 * 本番（NODE_ENV=production）で ALLOWED_ORIGINS が空なら fail-closed で起動を拒否する
 * （CSWSH 防止。Origin 検証がサイレントに全許可へ緩むのを防ぐ）。
 */

export interface SyncConfig {
  port: number;
  host: string;
  allowedOrigins: string[];
  maxConnections: number;
  maxRooms: number;
  roomIdleTtlMs: number;
}

/** env 値を整数として解釈し、不正なら既定値を返す。 */
function intEnv(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadSyncConfig(env: Record<string, string | undefined>): SyncConfig {
  const allowedOrigins = (env["ALLOWED_ORIGINS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (env["NODE_ENV"] === "production" && allowedOrigins.length === 0) {
    throw new Error(
      "本番（NODE_ENV=production）では ALLOWED_ORIGINS の設定が必須です。" +
        "全 Origin 許可（CSWSH リスク）を防ぐため起動を中止します。",
    );
  }

  return {
    port: intEnv(env["PORT"], 8787),
    host: env["HOST"] ?? "127.0.0.1",
    allowedOrigins,
    maxConnections: intEnv(env["MAX_CONNECTIONS"], 200),
    maxRooms: intEnv(env["MAX_ROOMS"], 50),
    roomIdleTtlMs: intEnv(env["ROOM_IDLE_TTL_MS"], 1_800_000),
  };
}
```

- [ ] **Step 4: テスト緑を確認**

Run: `~/.local/bin/pnpm --filter @tdd-mob/sync exec vitest run test/config.test.ts`
Expected: PASS（5 件）

- [ ] **Step 5: Commit**

```bash
git add apps/sync/src/config.ts apps/sync/test/config.test.ts
git commit -m "feat(sync): env 集約 config に fail-closed Origin 判定を追加 (M-1)

NODE_ENV=production かつ ALLOWED_ORIGINS 空なら起動拒否。PORT/HOST/
MAX_CONNECTIONS/MAX_ROOMS/ROOM_IDLE_TTL_MS も集約。配線は後続タスク。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 接続数上限（WsAdapter）

**Files:** Modify `apps/sync/src/adapters/ws-adapter.ts`; Create `apps/sync/test/ws-adapter.integration.test.ts`

- [ ] **Step 1: 失敗する統合テストを書く** — `apps/sync/test/ws-adapter.integration.test.ts`

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { WebSocket } from "ws";
import { WsAdapter } from "../src/adapters/ws-adapter.js";

const PORT = 18790; // テスト専用ポート

let adapter: WsAdapter | undefined;
afterEach(async () => {
  await adapter?.close();
  adapter = undefined;
});

/** close イベント（code）を待つ。 */
function waitClose(ws: WebSocket): Promise<number> {
  return new Promise((resolve) => ws.on("close", (code) => resolve(code)));
}
function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.on("open", () => resolve());
    ws.on("error", reject);
  });
}

describe("WsAdapter 接続数上限", () => {
  it("maxConnections を超える接続は 1013 で閉じる", async () => {
    adapter = new WsAdapter({
      port: PORT,
      host: "127.0.0.1",
      allowedOrigins: [],
      maxConnections: 1,
      onMessage: async () => {},
      onDisconnect: () => {},
    });
    const ws1 = new WebSocket(`ws://127.0.0.1:${PORT}`);
    await waitOpen(ws1);
    const ws2 = new WebSocket(`ws://127.0.0.1:${PORT}`);
    const code = await waitClose(ws2);
    expect(code).toBe(1013);
    ws1.close();
  });

  it("Origin 不許可は 1008 で閉じる", async () => {
    adapter = new WsAdapter({
      port: PORT,
      host: "127.0.0.1",
      allowedOrigins: ["https://allowed.example"],
      maxConnections: 100,
      onMessage: async () => {},
      onDisconnect: () => {},
    });
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`, {
      origin: "https://evil.example",
    });
    const code = await waitClose(ws);
    expect(code).toBe(1008);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `~/.local/bin/pnpm --filter @tdd-mob/sync exec vitest run test/ws-adapter.integration.test.ts`
Expected: FAIL（`maxConnections` 未対応で 2 本目も open する）

- [ ] **Step 3: 実装** — `apps/sync/src/adapters/ws-adapter.ts`

`WsAdapterOptions` に追加（`host?` の直後）:

```typescript
  host?: string;
  /** 同時接続数の上限。超過分は 1013 で拒否する。 */
  maxConnections?: number;
```

`handleConnection` の Origin 検証ブロックの直後（`const connId = ...` の前）に追加:

```typescript
    // 同時接続数の上限（DoS 緩和）。超過は 1013（Try Again Later）で閉じる。
    if (
      this.options.maxConnections !== undefined &&
      this.connections.size >= this.options.maxConnections
    ) {
      ws.close(1013, "Server connection limit reached");
      return;
    }
```

- [ ] **Step 4: テスト緑を確認**

Run: `~/.local/bin/pnpm --filter @tdd-mob/sync exec vitest run test/ws-adapter.integration.test.ts`
Expected: PASS（2 件）

- [ ] **Step 5: Commit**

```bash
git add apps/sync/src/adapters/ws-adapter.ts apps/sync/test/ws-adapter.integration.test.ts
git commit -m "feat(sync): WebSocket 同時接続数の上限を追加 (M-2)

maxConnections 超過の接続を 1013 で拒否。Origin 拒否(1008)と併せて
統合テストを新設。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: ルーム数上限 + releaseRoom（handlers）

**Files:** Modify `apps/sync/src/application/handlers.ts`, `apps/sync/test/handlers.room.test.ts`

- [ ] **Step 1: 既存テストの構成を確認してから、失敗するテストを追記**

まず `apps/sync/test/handlers.room.test.ts` の冒頭を読み、`makeHandlers` の生成ヘルパ（deps の組み立て方）と broadcaster スパイの作り方を把握する。その既存パターンに合わせて以下2ケースを追記する（`maxRooms` は `makeHandlers` の deps に渡す。既存ヘルパが deps を作っているなら `maxRooms` を渡せるよう更新する）:

```typescript
  it("ルーム数が上限に達したら room.create を ROOM_LIMIT_EXCEEDED で拒否する", async () => {
    // maxRooms=1 のハンドラを用意（既存のセットアップヘルパに合わせて生成）
    // 1 室作成 → 成功、2 室目 → 失敗
    const h = makeHandlersForTest({ maxRooms: 1 }); // ← 既存ヘルパ名・引数に合わせる
    const r1 = await h.handlers.handleCommand("conn-1", {
      command: "room.create",
      displayName: "Alice",
    });
    expect(r1.isOk()).toBe(true);
    const r2 = await h.handlers.handleCommand("conn-2", {
      command: "room.create",
      displayName: "Bob",
    });
    expect(r2.isErr()).toBe(true);
    expect(r2._unsafeUnwrapErr()).toBe("ROOM_LIMIT_EXCEEDED");
    // クライアントへエラー通知が送られる
    expect(h.sent).toContainEqual(
      expect.objectContaining({ connId: "conn-2", msg: expect.objectContaining({ type: "error", code: "ROOM_LIMIT_EXCEEDED" }) }),
    );
  });

  it("releaseRoom はそのルームのトークンを解放する", async () => {
    const h = makeHandlersForTest({ maxRooms: 50 });
    const r = await h.handlers.handleCommand("conn-1", {
      command: "room.create",
      displayName: "Alice",
    });
    const code = r._unsafeUnwrap().code;
    h.handlers.releaseRoom(code);
    // 解放後、その resumeToken での join 復帰はトークン不明として扱われる（新規参加になる）
    // ＝ releaseRoom 後にトークンマップから消えていることを副作用で確認する
    // （ここでは releaseRoom が例外なく動くこと＋二重呼び出し安全を確認）
    expect(() => h.handlers.releaseRoom(code)).not.toThrow();
  });
```

> 注: 上記の `makeHandlersForTest` / `h.sent` は**既存テストファイルのヘルパ名に置き換える**こと。
> 既存ヘルパが `maxRooms` を受け取らない場合は、ヘルパに `maxRooms`（既定 50）の引数を追加する。

- [ ] **Step 2: 失敗を確認**

Run: `~/.local/bin/pnpm --filter @tdd-mob/sync exec vitest run test/handlers.room.test.ts`
Expected: FAIL（`maxRooms` 未対応 / `releaseRoom` 未定義）

- [ ] **Step 3: 実装** — `apps/sync/src/application/handlers.ts`

(a) `HandlerDeps` インターフェース（`makeHandlers(deps: HandlerDeps)` の型）に `maxRooms` を追加。既定値運用のため optional とし、本体で既定 50 にフォールバック:

```typescript
  // HandlerDeps に追加
  maxRooms?: number;
```

`makeHandlers` 本体の分割代入を更新:

```typescript
  const { store, clock, broadcaster, codeGen, scheduler, delegator } = deps;
  const maxRooms = deps.maxRooms ?? 50;
```

(b) `handleRoomCreate` の先頭（`const now = clock.now();` の直後）にルーム数上限ガードを追加:

```typescript
    // ルーム数上限（DoS 緩和）。上限到達時は作成を拒否する。
    if (store.list().length >= maxRooms) {
      broadcaster.sendTo(connId, {
        type: "error",
        code: "ROOM_LIMIT_EXCEEDED",
        message: "サーバーのルーム数が上限に達しています。時間をおいて再試行してください。",
      });
      return err("ROOM_LIMIT_EXCEEDED");
    }
```

（`err` は neverthrow。ファイル内の既存 import / 使用箇所に合わせる。`ServerMsg` のエラー型が `code` を要求する形は既存の RATE_LIMITED 送出と同じにする。）

(c) `releaseRoom` を実装し return に追加。`handleConnectionClose` の近くに置く:

```typescript
  /** ルーム回収時の後始末。当該ルームのホスト/リジュームトークンを解放する。 */
  function releaseRoom(roomCode: string): void {
    hostTokens.delete(roomCode);
    for (const [token, info] of resumeTokens) {
      if (info.roomCode === roomCode) resumeTokens.delete(token);
    }
  }
```

return 文を更新:

```typescript
  return { handleCommand, handleConnectionClose, releaseRoom };
```

- [ ] **Step 4: テスト緑を確認（room テスト + sync 全体）**

Run: `~/.local/bin/pnpm --filter @tdd-mob/sync exec vitest run test/handlers.room.test.ts`
Expected: PASS
Run: `~/.local/bin/pnpm --filter @tdd-mob/sync test:unit`
Expected: 全件 PASS（既存も回帰なし。`maxRooms` は optional 既定 50 のため既存ヘルパは無改修で動く）

- [ ] **Step 5: Commit**

```bash
git add apps/sync/src/application/handlers.ts apps/sync/test/handlers.room.test.ts
git commit -m "feat(sync): ルーム数上限と releaseRoom を追加 (M-2)

room.create が maxRooms(既定50)到達で ROOM_LIMIT_EXCEEDED を返す。
releaseRoom(code) で回収時にホスト/リジュームトークンを解放。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: アイドル回収（RoomReclaimer）+ presence.clearRoomTimers

**Files:** Create `apps/sync/src/application/room-reclaimer.ts`, `apps/sync/test/room-reclaimer.test.ts`; Modify `apps/sync/src/application/presence.ts`

- [ ] **Step 1: 失敗するテストを書く** — `apps/sync/test/room-reclaimer.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";
import { RoomReclaimer } from "../src/application/room-reclaimer.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import type { Room } from "@tdd-mob/core";

function room(code: string, presences: Array<Room["participants"][number]["presence"]>): Room {
  return {
    code,
    createdAt: 0,
    hostParticipantId: "p0",
    participants: presences.map((presence, i) => ({
      participantId: `p${i}`,
      connId: presence === "offline" ? null : `c${i}`,
      displayName: `u${i}`,
      role: i === 0 ? "host" : "editor",
      presence,
      joinedAt: 0,
    })),
  } as unknown as Room;
}

describe("RoomReclaimer", () => {
  it("全員 offline が TTL 継続したルームを回収する", () => {
    const store = new InMemoryRoomStore();
    store.put(room("AAA", ["offline", "offline"]));
    const onReclaim = vi.fn();
    const r = new RoomReclaimer({ store, idleTtlMs: 1000, onReclaim });

    r.sweep(0);          // 空を初検知（emptySince=0）→ まだ回収しない
    expect(onReclaim).not.toHaveBeenCalled();
    r.sweep(500);        // TTL 未満
    expect(onReclaim).not.toHaveBeenCalled();
    r.sweep(1000);       // TTL 到達 → 回収
    expect(onReclaim).toHaveBeenCalledWith("AAA");
  });

  it("オンライン参加者がいるルームは回収しない", () => {
    const store = new InMemoryRoomStore();
    store.put(room("BBB", ["online", "offline"]));
    const onReclaim = vi.fn();
    const r = new RoomReclaimer({ store, idleTtlMs: 1000, onReclaim });
    r.sweep(0);
    r.sweep(10_000);
    expect(onReclaim).not.toHaveBeenCalled();
  });

  it("空→誰か復帰でカウンタがリセットされる", () => {
    const store = new InMemoryRoomStore();
    store.put(room("CCC", ["offline"]));
    const onReclaim = vi.fn();
    const r = new RoomReclaimer({ store, idleTtlMs: 1000, onReclaim });
    r.sweep(0);                       // empty 初検知
    store.put(room("CCC", ["online"])); // 復帰
    r.sweep(900);                     // online なので emptySince クリア
    store.put(room("CCC", ["offline"])); // 再び空
    r.sweep(950);                     // ここで emptySince=950 に再設定
    r.sweep(1900);                    // 950+1000=1950 未満 → まだ
    expect(onReclaim).not.toHaveBeenCalled();
    r.sweep(1950);
    expect(onReclaim).toHaveBeenCalledWith("CCC");
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `~/.local/bin/pnpm --filter @tdd-mob/sync exec vitest run test/room-reclaimer.test.ts`
Expected: FAIL（`RoomReclaimer` 未定義）

- [ ] **Step 3: 実装** — `apps/sync/src/application/room-reclaimer.ts`

```typescript
/**
 * アイドル回収 — 全参加者が offline のまま TTL を超えたルームを削除する（DoS 緩和・FR M4-lite）。
 * presence にフックせず、ストアを定期 sweep で観測する自己完結方式（結合最小）。
 */

import type { RoomStore } from "../ports/room-store.js";

export interface RoomReclaimerDeps {
  store: RoomStore;
  /** 全員 offline がこの ms 継続したら回収する。 */
  idleTtlMs: number;
  /** 回収時の後始末（store.remove・timer 解放・token 解放など）。 */
  onReclaim: (roomCode: string) => void;
}

export class RoomReclaimer {
  private readonly store: RoomStore;
  private readonly idleTtlMs: number;
  private readonly onReclaim: (roomCode: string) => void;
  /** roomCode → 全員 offline になったと初検知した時刻（epoch ms）。 */
  private readonly emptySince = new Map<string, number>();
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(deps: RoomReclaimerDeps) {
    this.store = deps.store;
    this.idleTtlMs = deps.idleTtlMs;
    this.onReclaim = deps.onReclaim;
  }

  /** 1 周の観測。now はテスト容易性のため引数。 */
  sweep(now: number): void {
    const liveCodes = new Set<string>();
    for (const room of this.store.list()) {
      liveCodes.add(room.code);
      const empty = room.participants.every((p) => p.presence === "offline");
      if (!empty) {
        this.emptySince.delete(room.code);
        continue;
      }
      const since = this.emptySince.get(room.code);
      if (since === undefined) {
        this.emptySince.set(room.code, now);
      } else if (now - since >= this.idleTtlMs) {
        this.onReclaim(room.code);
        this.emptySince.delete(room.code);
      }
    }
    // ストアから消えたルームの追跡情報を掃除（マップのリーク防止）。
    for (const code of this.emptySince.keys()) {
      if (!liveCodes.has(code)) this.emptySince.delete(code);
    }
  }

  /** 定期 sweep を開始する。now 取得は Date.now（テストでは sweep を直接呼ぶ）。 */
  start(sweepIntervalMs: number): void {
    if (this.interval !== null) return;
    this.interval = setInterval(() => this.sweep(Date.now()), sweepIntervalMs);
  }

  stop(): void {
    if (this.interval !== null) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}
```

> 注: `Date.now()` はこのプロジェクトのワークフロー実行環境では使用不可（workflow 用制約）だが、これは**通常実行されるサーバーのランタイムコード**であり制約対象外。テストは `sweep(now)` を直接呼ぶため `Date.now` を踏まない。

- [ ] **Step 4: presence に `clearRoomTimers` を公開** — `apps/sync/src/application/presence.ts`

既存の private `clearHostAbsenceTimer` はそのまま残し、公開ラッパを追加（回収時にホスト不在タイマーを掃除するため）。`handleDisconnect` などの public メソッド群の近くに追加:

```typescript
  /** ルーム回収時に、そのルームのプレゼンス関連タイマーを解放する。 */
  clearRoomTimers(roomCode: string): void {
    this.clearHostAbsenceTimer(roomCode);
  }
```

- [ ] **Step 5: テスト緑を確認**

Run: `~/.local/bin/pnpm --filter @tdd-mob/sync exec vitest run test/room-reclaimer.test.ts`
Expected: PASS（3 件）
Run: `~/.local/bin/pnpm --filter @tdd-mob/sync typecheck`
Expected: エラーなし

- [ ] **Step 6: Commit**

```bash
git add apps/sync/src/application/room-reclaimer.ts apps/sync/test/room-reclaimer.test.ts apps/sync/src/application/presence.ts
git commit -m "feat(sync): アイドルルームの回収機構を追加 (M-2)

全員 offline が TTL 継続したルームを定期 sweep で削除する RoomReclaimer
（ストア観測の自己完結方式）。presence に clearRoomTimers を公開。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: server.ts 配線（config 利用・上限・reclaimer 起動）

**Files:** Modify `apps/sync/src/server.ts`

- [ ] **Step 1: server.ts を config ベースに書き換える**

冒頭の env 直読み（`const PORT = ...` 〜 `ALLOWED_ORIGINS` の定義）を config 呼び出しに置換し、fail-closed を反映:

```typescript
import { loadSyncConfig } from "./config.js";
import { RoomReclaimer } from "./application/room-reclaimer.js";

let config;
try {
  config = loadSyncConfig(process.env);
} catch (e) {
  console.error(`❌ 設定エラー: ${(e as Error).message}`);
  process.exit(1);
}
```

`makeHandlers(...)` に `maxRooms` を渡す:

```typescript
const handlers = makeHandlers({
  store, clock, broadcaster, codeGen, scheduler, delegator,
  maxRooms: config.maxRooms,
});
```

`WsAdapter` 生成に `host` / `maxConnections` を config から渡す（既存の `port`/`host`/`allowedOrigins` を config 参照に変更）:

```typescript
wsAdapter = new WsAdapter({
  port: config.port,
  host: config.host,
  allowedOrigins: config.allowedOrigins,
  maxConnections: config.maxConnections,
  onMessage: async (connId, msg) => { /* 既存のまま */ },
  onDisconnect: (connId) => { /* 既存のまま */ },
});
```

reclaimer を生成・起動（`wsAdapter` 生成後）。回収時の後始末を一括フックする:

```typescript
const RECLAIM_SWEEP_MS = 60_000;
const reclaimer = new RoomReclaimer({
  store,
  idleTtlMs: config.roomIdleTtlMs,
  onReclaim: (code) => {
    scheduler.clear(code);
    delegator.cancel(code);
    presenceManager.clearRoomTimers(code);
    handlers.releaseRoom(code);
    store.remove(code);
  },
});
reclaimer.start(RECLAIM_SWEEP_MS);
```

起動ログを更新し、ALLOWED_ORIGINS 警告は config 経由に合わせる（空でも dev では警告のみ。fail-closed は config 内で済んでいる）:

```typescript
console.log(
  `🚀 同期サーバー起動 host=${config.host} port=${config.port} ` +
    `maxConn=${config.maxConnections} maxRooms=${config.maxRooms}`,
);
if (config.allowedOrigins.length === 0) {
  console.warn(
    "⚠ ALLOWED_ORIGINS 未設定: 全 Origin からの WebSocket 接続を許可します（dev 用）。",
  );
}
```

SIGTERM ハンドラに reclaimer 停止を追加:

```typescript
process.on("SIGTERM", async () => {
  console.log("SIGTERM 受信: シャットダウン中...");
  reclaimer.stop();
  scheduler.clearAll();
  delegator.cancelAll();
  await wsAdapter.close();
  process.exit(0);
});
```

> 既存の `PORT`/`HOST`/`ALLOWED_ORIGINS` ローカル定数を参照している箇所はすべて `config.*` に置換すること。重複定義が残らないよう注意。

- [ ] **Step 2: 型チェック**

Run: `~/.local/bin/pnpm --filter @tdd-mob/sync typecheck`
Expected: エラーなし（`config` が `SyncConfig | undefined` で警告が出る場合は、catch 後に `process.exit` するため、`loadSyncConfig` 呼び出しを関数に括り出すか `config!` ではなく早期 return 構造にする。最も簡潔には `const config = (() => { try { return loadSyncConfig(process.env); } catch (e) { console.error(...); process.exit(1); } })();` とし `process.exit` の戻り `never` で絞り込む。）

- [ ] **Step 3: sync 全体テスト**

Run: `~/.local/bin/pnpm --filter @tdd-mob/sync test:unit`
Expected: 全件 PASS

- [ ] **Step 4: 手動スモーク（dev 相当・起動と 426）**

```bash
for p in $(lsof -ti tcp:8787 2>/dev/null); do kill -9 $p; done; sleep 1
HOST=127.0.0.1 PORT=8787 ALLOWED_ORIGINS=https://tasuki.example.com bun run apps/sync/src/server.ts >/tmp/sync_m2.log 2>&1 &
sleep 1.5
echo "HTTP: $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8787/)"
for p in $(lsof -ti tcp:8787 2>/dev/null); do kill -9 $p; done
cat /tmp/sync_m2.log
```
Expected: HTTP `426`、ログに `maxConn=200 maxRooms=50`。

- [ ] **Step 5: fail-closed スモーク（本番で origins 空なら exit 1）**

```bash
NODE_ENV=production ALLOWED_ORIGINS= bun run apps/sync/src/server.ts; echo "exit=$?"
```
Expected: `❌ 設定エラー: ...ALLOWED_ORIGINS...` を出力し `exit=1`。

- [ ] **Step 6: Commit**

```bash
git add apps/sync/src/server.ts
git commit -m "feat(sync): server を config 駆動にし上限・回収・fail-closed を配線 (M-1/M-2)

loadSyncConfig で fail-closed 起動、WsAdapter に maxConnections、handlers に
maxRooms、RoomReclaimer を 60s 間隔で起動。SIGTERM で reclaimer も停止。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: ドキュメント更新 + 最終検証

**Files:** Modify `deploy/tasuki-sync.env.example`, `deploy/README.md`, `docs/superpowers/specs/2026-06-07-tasuki-vps-deployment-design.md`

- [ ] **Step 1: env テンプレートに新設定を追記** — `deploy/tasuki-sync.env.example` の末尾に追加:

```bash

# 本番フラグ。production のとき ALLOWED_ORIGINS 未設定なら起動を拒否する（fail-closed）。
NODE_ENV=production

# リソース上限（DoS 緩和・公開運用向け。負荷に応じて調整）。
MAX_CONNECTIONS=200
MAX_ROOMS=50
ROOM_IDLE_TTL_MS=1800000   # 全員切断が30分継続したルームを回収
```

- [ ] **Step 2: README に安全策の追記** — `deploy/README.md` の「動作確認」節の後（または前提節）に短く追記:

```markdown
## リソース上限・Origin 保護（公開運用）

- 本番 env に `NODE_ENV=production` を置くと、`ALLOWED_ORIGINS` 未設定時に sync が
  **起動を拒否**する（CSWSH 防止の fail-closed）。
- `MAX_CONNECTIONS`（既定 200）/ `MAX_ROOMS`（既定 50）で同時接続数・ルーム数を制限。
  超過接続は WS 1013、超過 room.create は `ROOM_LIMIT_EXCEEDED` で拒否。
- `ROOM_IDLE_TTL_MS`（既定 30 分）全員切断が継続したルームを定期回収（60 秒間隔）。
  揮発設計のため回収されたルームは復帰不可（再作成すればよい）。
```

- [ ] **Step 3: spec の §8 を強化追記** — `docs/superpowers/specs/2026-06-07-tasuki-vps-deployment-design.md` の §8 安全策に箇条を追加（M-1/M-2 を反映。§9 スコープ外から「M4 リソース上限」の扱いを「最小実装を本ブランチで対応」へ更新）。短く事実を追記すればよい。

- [ ] **Step 4: 最終検証（全体）**

```bash
~/.local/bin/pnpm typecheck
~/.local/bin/pnpm --filter @tdd-mob/sync test:unit
for p in $(lsof -ti tcp:8787 2>/dev/null); do kill -9 $p; done; sleep 1
bun build apps/sync/src/server.ts --target bun --outfile deploy/dist/server.js
NODE_ENV=production HOST=127.0.0.1 PORT=8787 ALLOWED_ORIGINS=https://tasuki.example.com bun deploy/dist/server.js >/tmp/sync_final.log 2>&1 &
sleep 1.5; echo "HTTP: $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8787/)"
for p in $(lsof -ti tcp:8787 2>/dev/null); do kill -9 $p; done; cat /tmp/sync_final.log
```
Expected: typecheck 緑 / sync 全件 PASS / バンドル起動で HTTP `426` / ログに maxConn・maxRooms。

- [ ] **Step 5: Commit**

```bash
git add deploy/tasuki-sync.env.example deploy/README.md docs/superpowers/specs/2026-06-07-tasuki-vps-deployment-design.md
git commit -m "docs: M-1/M-2(fail-closed・リソース上限)の運用設定を文書化

env テンプレートに NODE_ENV/MAX_CONNECTIONS/MAX_ROOMS/ROOM_IDLE_TTL_MS、
README に運用注記、spec §8 を強化。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** M-1（fail-closed）= Task 1+5。M-2 接続数=Task 2+5 / ルーム数=Task 3+5 / アイドル回収=Task 4+5。文書=Task 6。全網羅。

**型整合:** `SyncConfig`(port/host/allowedOrigins/maxConnections/maxRooms/roomIdleTtlMs) ↔ server.ts 参照 ↔ WsAdapterOptions.maxConnections ↔ HandlerDeps.maxRooms ↔ RoomReclaimerDeps.idleTtlMs。`releaseRoom`(handlers) ↔ onReclaim 内呼び出し。`clearRoomTimers`(presence) ↔ onReclaim 内呼び出し。env キー(MAX_CONNECTIONS/MAX_ROOMS/ROOM_IDLE_TTL_MS/NODE_ENV) ↔ config.ts ↔ env.example。すべて一致。

**プレースホルダ:** Task 3 の `makeHandlersForTest`/`h.sent` のみ「既存テストのヘルパ名に合わせる」指示付き（実ファイル確認が必要なため）。それ以外は実コード。
