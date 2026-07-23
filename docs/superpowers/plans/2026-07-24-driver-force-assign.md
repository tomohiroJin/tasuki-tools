# ドライバー強制指名（Issue #13）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ホストが RosterPanel から任意の rotation メンバーを現ドライバーに即指名して交代できるようにする。

**Architecture:** 既存ドメインイベント `DriverSwitched { nextIndex }` を任意 index で再利用し（`evolve` 無変更）、core `decide` に index ベースの `driver.assign` コマンドを追加する。wire コマンドは participantId ベース（`driver.skip` と同形）で、サーバが participantId → 表示名 → rotation index を解決して decide へ橋渡しする。UI 配線は生きているサーバ同期経路（RosterPanel → Session → App）のみに行う。

**Tech Stack:** TypeScript / pnpm モノレポ（packages/core・apps/sync・apps/web）/ vitest / neverthrow（Result 型）/ valibot（wire スキーマ）/ React + Testing Library。

## Global Constraints

- コメント・テスト名は日本語（プロジェクト規約）。
- 純粋関数の戻り値は `neverthrow` の `Result`（`ok` / `err`）。
- **`packages/core/src/evolve.ts` は変更しない**（既存 `evolveDriverSwitched` を再利用）。
- **decide コマンド = `{ command: "driver.assign"; index: number }`（index ベース）／wire コマンド = `{ command: "driver.assign"; participantId }`（participantId ベース）**。両者の橋渡しはサーバ `handleRoomCommand` が担う。
- 現ドライバー自身の指名は **no-op（空イベント `ok([])`）**。エラーにしない。
- 指名は **rotation 内・稼働中（`clock.running`）のみ**。非稼働は `PhaseConflict`、rotation 外/未検出はサーバで `PARTICIPANT_NOT_FOUND`。
- 権限は **host 限定**（`HOST_ONLY_COMMANDS` に追加）。
- 指名先が一時離脱中（`driverEligible === false`）なら **`DriverResumed` を適用して自動復帰**させてから指名を確定する。
- ソロ（`LocalEngine`）の UI 配線は行わない（デッドコードのため）。`onAssignDriver` prop の truthy ガードにより、prop 未指定のコンシューマにはボタンが出ない。
- import の各ステップ後にコミットする（TDD・頻繁なコミット）。作業ブランチは `feature/driver-force-assign`。
- テスト実行は各パッケージのルートで `pnpm test`（内部で `vitest run`）。個別ファイルは `pnpm vitest run <path>`。

---

### Task 1: core `decide.ts` に `driver.assign` コマンドを追加

**Files:**
- Modify: `packages/core/src/decide.ts`（`DecideCommand` ユニオン・`decide` の switch・新規 `decideDriverAssign`）
- Test: `packages/core/test/decide.test.ts`（新規 describe ブロックを追記）

**Interfaces:**
- Consumes: 既存 `Aggregate`（`agg.clock.running` / `agg.session.rotation` / `agg.session.currentIndex`）、`DomainEvent`（`DriverSwitched { type; nextIndex; now }`）、`DomainError`（`PhaseConflict { currentPhase; requiredPhase }` / `InvalidIndex { index; max }`）。
- Produces: `decide` が `{ command: "driver.assign"; index: number }` を受理し、`ok([{ type: "DriverSwitched", nextIndex: index, now }])`（有効時）／`ok([])`（自己指名）／`err(PhaseConflict)`（非稼働）／`err(InvalidIndex)`（範囲外）を返す。後続の Task 3 はこの index ベース decide コマンドを呼ぶ。

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/test/decide.test.ts` の末尾（最後の `describe` の後）に追記する:

```ts
// ─── driver.assign（Issue #13 強制指名） ──────────────────────────────────────

describe("decide: driver.assign（任意メンバー強制指名）", () => {
  // baseAgg は members [Alice, Bob, Charlie]・currentIndex 0。
  const runningAgg = {
    ...baseAgg,
    clock: { ...baseAgg.clock, running: true },
  };

  it("稼働中に有効 index を指名すると DriverSwitched を発行する", () => {
    const result = decide({ command: "driver.assign", index: 2 }, runningAgg, NOW);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(1);
      const switched = result.value[0];
      expect(switched?.type).toBe("DriverSwitched");
      if (switched?.type === "DriverSwitched") {
        expect(switched.nextIndex).toBe(2);
      }
    }
  });

  it("現ドライバー自身の指名は no-op（空イベント）を返す", () => {
    const result = decide({ command: "driver.assign", index: 0 }, runningAgg, NOW);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(0);
    }
  });

  it("rotation 範囲外の index は InvalidIndex を返す", () => {
    const result = decide({ command: "driver.assign", index: 5 }, runningAgg, NOW);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("InvalidIndex");
    }
  });

  it("非稼働中の指名は PhaseConflict を返す", () => {
    const result = decide({ command: "driver.assign", index: 1 }, baseAgg, NOW);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("PhaseConflict");
    }
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd packages/core && pnpm vitest run test/decide.test.ts`
Expected: FAIL（型エラー: `{ command: "driver.assign"; index: number }` は `DecideCommand` に代入不可、または実行時に該当 case が無く switch を素通り）

- [ ] **Step 3: `DecideCommand` ユニオンに追加する**

`packages/core/src/decide.ts` の `DecideCommand` 型定義内、`| { command: "driver.resume"; participantId: string }` の直後に追加する:

```ts
  | { command: "driver.assign"; index: number }
```

- [ ] **Step 4: `decide` の switch に case を追加する**

`packages/core/src/decide.ts` の `decide` 関数内、`case "driver.resume":` のブロック（`return ok([{ type: "DriverResumed", ... }]);`）の直後に追加する:

```ts
    case "driver.assign":
      return decideDriverAssign(cmd.index, agg, now);
```

- [ ] **Step 5: `decideDriverAssign` を実装する**

`packages/core/src/decide.ts` の `decideSessionAct` 関数の直後（`// ─── メンバー管理 ───` コメントの直前）に追加する:

```ts
/**
 * 任意メンバーへドライバーを強制指名する（Issue #13）。
 * 既存 DriverSwitched を任意 index で発行し、evolve の担当回数加算・満タン再アンカーを流用する。
 * 稼働中のみ・rotation 範囲内のみ許可し、現ドライバー自身の指名は no-op（空イベント）とする。
 */
function decideDriverAssign(
  index: number,
  agg: Aggregate,
  now: number,
): Result<DomainEvent[], DomainError> {
  const { clock, session } = agg;

  // 稼働中でなければ指名しない（SWITCH と同じガード）。
  if (!clock.running) {
    return err({
      type: "PhaseConflict",
      currentPhase: "stopped",
      requiredPhase: "session",
    });
  }
  // rotation 範囲外は不正。
  if (index < 0 || index >= session.rotation.length) {
    return err({ type: "InvalidIndex", index, max: session.rotation.length - 1 });
  }
  // 現ドライバー自身の指名は no-op（イベント無し）。
  if (index === session.currentIndex) {
    return ok([]);
  }
  return ok([{ type: "DriverSwitched", nextIndex: index, now }]);
}
```

- [ ] **Step 6: テストが通ることを確認する**

Run: `cd packages/core && pnpm vitest run test/decide.test.ts`
Expected: PASS（4 件の新規テストを含む）

- [ ] **Step 7: core 全テスト＋型チェックを流す**

Run: `cd packages/core && pnpm test && pnpm exec tsc --noEmit`
Expected: PASS（既存 evolve/DriverSwitched テストも緑のまま）

- [ ] **Step 8: コミット**

```bash
git add packages/core/src/decide.ts packages/core/test/decide.test.ts
git commit -m "feat(core): driver.assign コマンドで任意 index への強制指名を追加

- decide に driver.assign{index} を追加（稼働中/範囲/自己指名no-opを検証）
- 既存 DriverSwitched を再利用し evolve は無変更
- Issue #13"
```

---

### Task 2: wire スキーマに `DriverAssignCommand` を追加

**Files:**
- Modify: `packages/core/src/schemas.ts`（`DriverAssignCommand` 定義・`CommandSchema` variant リスト）
- Test: `packages/core/test/driver-assign-schema.test.ts`（新規）

**Interfaces:**
- Consumes: 既存 valibot `v`、`participantId`（`= nonEmptyString`）。
- Produces: `CommandSchema` が `{ command: "driver.assign", participantId: string }` を受理する。Task 3 のサーバがこの wire コマンドを受け取る。

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/test/driver-assign-schema.test.ts` を新規作成する:

```ts
/**
 * driver.assign wire コマンドのスキーマ検証（Issue #13）
 */
import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { CommandSchema } from "../src/schemas.js";

describe("CommandSchema: driver.assign", () => {
  it("participantId 付きの driver.assign を受理する", () => {
    const result = v.safeParse(CommandSchema, {
      command: "driver.assign",
      participantId: "pid-123",
    });
    expect(result.success).toBe(true);
  });

  it("participantId が無い driver.assign を拒否する", () => {
    const result = v.safeParse(CommandSchema, { command: "driver.assign" });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd packages/core && pnpm vitest run test/driver-assign-schema.test.ts`
Expected: FAIL（`command: "driver.assign"` が variant に無く parse 失敗）

- [ ] **Step 3: `DriverAssignCommand` を定義する**

`packages/core/src/schemas.ts` の `DriverResumeCommand` 定義の直後に追加する:

```ts
const DriverAssignCommand = v.object({
  command: v.literal("driver.assign"),
  participantId,
});
```

- [ ] **Step 4: `CommandSchema` の variant リストへ追加する**

`packages/core/src/schemas.ts` の `CommandSchema = v.variant("command", [ ... ])` 配列内、`DriverResumeCommand,` の直後に追加する:

```ts
  DriverAssignCommand,
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `cd packages/core && pnpm vitest run test/driver-assign-schema.test.ts`
Expected: PASS

- [ ] **Step 6: core 全テスト＋型チェックを流す**

Run: `cd packages/core && pnpm test && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add packages/core/src/schemas.ts packages/core/test/driver-assign-schema.test.ts
git commit -m "feat(core): driver.assign の wire スキーマを追加

- participantId ベース（driver.skip と同形）
- Issue #13"
```

---

### Task 3: サーバ `handlers.ts` で指名を処理する（権限・index 解決・自動復帰）

**Files:**
- Modify: `apps/sync/src/application/handlers.ts`（`HOST_ONLY_COMMANDS`・`buildDomainCommand`・`handleRoomCommand` の解決ブロックと自動復帰ブロック）
- Test: `apps/sync/test/driver-assign.test.ts`（新規）

**Interfaces:**
- Consumes: Task 1 の `decide({ command: "driver.assign"; index }, agg, now)`、Task 2 の wire スキーマ、既存 `applyRoomLevelEvent`（`DriverResumed` で `driverEligible=true`）、`evolve`、`reconcileSchedule`、`findRoomByConnId`、`authorize`。
- Produces: WS コマンド `{ command: "driver.assign", participantId }` を host が送ると、対象の rotation index へ `currentIndex` が移動し、離脱中なら `driverEligible` が復帰する。非 host は `UNAUTHORIZED`、対象不在/rotation 外は `PARTICIPANT_NOT_FOUND`。

- [ ] **Step 1: 失敗するテストを書く**

`apps/sync/test/driver-assign.test.ts` を新規作成する（ハーネスは `manual-skip-eligible.test.ts` に準拠）:

```ts
/**
 * driver.assign（Issue #13 任意メンバー強制指名）のサーバ挙動。
 * host 限定・participantId→index 解決・離脱中の自動復帰・現ドライバー指名 no-op を検証する。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { RoomCodeGen } from "../src/ports/code-gen.js";
import type { Broadcaster } from "../src/ports/broadcaster.js";
import type { ServerMsg, SessionConfig, Room } from "@tdd-mob/core";

class FakeCodeGen implements RoomCodeGen {
  private _c = 0;
  generate(): string { return `LC${String(++this._c).padStart(2, "0")}`; }
  generateParticipantId(): string { return `pid-${++this._c}`; }
  generateResumeToken(): string { return `rt-${++this._c}`; }
}
class SpyBroadcaster implements Broadcaster {
  readonly sent: Array<{ connId: string; msg: ServerMsg }> = [];
  broadcastSnapshot(): void {}
  sendTo(connId: string, msg: ServerMsg): void { this.sent.push({ connId, msg }); }
  broadcastSignal(): void {}
}
const config: SessionConfig = { language: "TypeScript", difficulty: "easy", members: ["A"], intervalMinutes: 5 };

/** host A（rotation[0]）を作り、rotation [A,B,C] を稼働中にして B の eligibility を上書きした room を置く。
 *  B=pid-b/conn-b（editor）・C=pid-c/conn-c（editor）。 */
async function setup(
  handlers: ReturnType<typeof makeHandlers>,
  store: InMemoryRoomStore,
  bOverrides: Partial<Room["participants"][number]>,
): Promise<string> {
  const create = await handlers.handleCommand("conn-a", {
    command: "room.create", displayName: "A", config: { ...config, members: ["A"] },
  });
  if (!create.isOk()) throw new Error("create failed");
  const code = create.value.code;
  const room = store.get(code)!;
  const host = room.participants[0]!;
  const mk = (id: string, name: string, conn: string, ov: Partial<Room["participants"][number]> = {}): Room["participants"][number] =>
    ({ ...host, participantId: id, connId: conn, displayName: name, role: "editor", presence: "online", driverEligible: true, ...ov });
  store.put({
    ...room,
    participants: [host, mk("pid-b", "B", "conn-b", bOverrides), mk("pid-c", "C", "conn-c")],
    session: { ...room.session, rotation: ["A", "B", "C"], driverCounts: [0, 0, 0], currentIndex: 0 },
    clock: { ...room.clock, running: true },
  });
  return code;
}

describe("driver.assign（Issue #13 強制指名）", () => {
  let store: InMemoryRoomStore;
  let handlers: ReturnType<typeof makeHandlers>;
  beforeEach(() => {
    store = new InMemoryRoomStore();
    handlers = makeHandlers({ store, clock: new FakeClock(1_000_000), broadcaster: new SpyBroadcaster(), codeGen: new FakeCodeGen() });
  });

  it("host が任意メンバーを指名すると currentIndex がそのメンバーになる", async () => {
    const code = await setup(handlers, store, {});
    await handlers.handleCommand("conn-a", { command: "driver.assign", participantId: "pid-c" });
    expect(store.get(code)!.session.currentIndex).toBe(2); // C
  });

  it("指名交代で totalSwitches が加算される（通常交代と同じカウント）", async () => {
    const code = await setup(handlers, store, {});
    await handlers.handleCommand("conn-a", { command: "driver.assign", participantId: "pid-c" });
    expect(store.get(code)!.session.totalSwitches).toBe(1);
  });

  it("一時離脱中のメンバーを指名すると自動復帰する", async () => {
    const code = await setup(handlers, store, { driverEligible: false }); // B 離脱中
    await handlers.handleCommand("conn-a", { command: "driver.assign", participantId: "pid-b" });
    const room = store.get(code)!;
    expect(room.session.currentIndex).toBe(1); // B
    const b = room.participants.find((p) => p.participantId === "pid-b")!;
    expect(b.driverEligible).toBe(true); // 自動復帰
  });

  it("現ドライバー自身の指名は状態を変えない（no-op）", async () => {
    const code = await setup(handlers, store, {});
    const hostPid = store.get(code)!.participants[0]!.participantId; // A（rotation[0]・currentIndex 0）
    await handlers.handleCommand("conn-a", { command: "driver.assign", participantId: hostPid });
    expect(store.get(code)!.session.currentIndex).toBe(0);
  });

  it("host 以外（editor）の指名は拒否され状態が変わらない", async () => {
    const code = await setup(handlers, store, {});
    const result = await handlers.handleCommand("conn-b", { command: "driver.assign", participantId: "pid-c" });
    expect(result.isErr()).toBe(true);
    expect(store.get(code)!.session.currentIndex).toBe(0);
  });

  it("rotation 外（未検出 participantId）の指名は拒否される", async () => {
    const code = await setup(handlers, store, {});
    const result = await handlers.handleCommand("conn-a", { command: "driver.assign", participantId: "pid-unknown" });
    expect(result.isErr()).toBe(true);
    expect(store.get(code)!.session.currentIndex).toBe(0);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd apps/sync && pnpm vitest run test/driver-assign.test.ts`
Expected: FAIL（`driver.assign` が buildDomainCommand で未対応 → `UNKNOWN_COMMAND`、currentIndex が動かない）

- [ ] **Step 3: `HOST_ONLY_COMMANDS` に追加する**

`apps/sync/src/application/handlers.ts` の `HOST_ONLY_COMMANDS` Set 定義内、`"member.shuffle",` の直後（`]);` の直前）に追加する:

```ts
  // 任意メンバーへのドライバー強制指名は host 専用（Issue #13）。
  "driver.assign",
```

- [ ] **Step 4: `buildDomainCommand` に case を追加する**

`apps/sync/src/application/handlers.ts` の `buildDomainCommand` 関数内、`case "driver.resume":` ブロックの直後に追加する:

```ts
    case "driver.assign":
      if (typeof cmd.participantId !== "string") return null;
      // index は handleRoomCommand が participantId から解決して埋める（-1 はプレースホルダ）。
      return { command: "driver.assign" as const, index: -1 };
```

- [ ] **Step 5: `handleRoomCommand` に index 解決ブロックを追加する**

`apps/sync/src/application/handlers.ts` の `handleRoomCommand` 内、`participant.rename` の解決ブロック（`domainCmd.currentDisplayName = target.displayName;` を含む `if` の閉じ `}`）の直後に追加する:

```ts
    // 指名は participantId → 表示名 → rotation index を解決して decide へ渡す（Issue #13）。
    // 集約は participantId→名前の対応を持たないため、rotation 内の位置をここで確定する。
    if (domainCmd && domainCmd.command === "driver.assign") {
      const targetPid = typeof cmd.participantId === "string" ? cmd.participantId : "";
      const target = targetRoom.participants.find((p) => p.participantId === targetPid);
      const index = target
        ? targetRoom.session.rotation.indexOf(target.displayName)
        : -1;
      // 対象不在 or rotation 外（見学者）は指名できない。
      if (index < 0) {
        broadcaster.sendTo(connId, {
          type: "error",
          code: "PARTICIPANT_NOT_FOUND",
          message: "指名対象が見つからないか、ローテーション外です",
        });
        return err("PARTICIPANT_NOT_FOUND");
      }
      domainCmd.index = index;
    }
```

- [ ] **Step 6: `handleRoomCommand` に自動復帰ブロックを追加する**

`apps/sync/src/application/handlers.ts` の `handleRoomCommand` 内、`driver.skip` 後処理ブロック（`if (domainCmd.command === "driver.skip" && targetRoom.clock.running) { ... }` の閉じ `}`）の直後に追加する:

```ts
    // 指名先が一時離脱中なら離脱フラグを解除して自動復帰させる（Issue #13）。
    // DriverSwitched は正確な index で評価済みのため advanceDriver 差し替えはしない。
    if (domainCmd.command === "driver.assign") {
      const targetPid = typeof cmd.participantId === "string" ? cmd.participantId : "";
      const target = targetRoom.participants.find((p) => p.participantId === targetPid);
      if (target?.driverEligible === false) {
        targetRoom = applyRoomLevelEvent(
          targetRoom,
          { type: "DriverResumed", participantId: targetPid, now },
          now,
        );
      }
    }
```

- [ ] **Step 7: テストが通ることを確認する**

Run: `cd apps/sync && pnpm vitest run test/driver-assign.test.ts`
Expected: PASS（6 件すべて緑）

- [ ] **Step 8: sync 全テスト＋型チェックを流す**

Run: `cd apps/sync && pnpm test && pnpm exec tsc --noEmit`
Expected: PASS（既存 manual-skip / authorize / driver-advance テストも緑のまま）

- [ ] **Step 9: コミット**

```bash
git add apps/sync/src/application/handlers.ts apps/sync/test/driver-assign.test.ts
git commit -m "feat(sync): driver.assign を host 限定で処理し離脱中は自動復帰

- HOST_ONLY 権限・participantId→rotation index 解決
- 指名先が離脱中なら DriverResumed で自動復帰
- Issue #13"
```

---

### Task 4: `RosterPanel` に「ドライバーにする」アクションを追加

**Files:**
- Modify: `apps/web/src/ui/components/RosterPanel.tsx`（`RosterPanelProps` に `onAssignDriver?`・`renderRow` にボタン）
- Test: `apps/web/test/ui/RosterPanel.test.tsx`（新規 describe を追記）

**Interfaces:**
- Consumes: 既存の `MiniButton`、`renderRow` 内のローカル変数 `canHostAction`・`inRotation`（`= rotationIndex >= 0`）・`isCurrentDriver`・`p.participantId`。
- Produces: `RosterPanel` が任意プロップ `onAssignDriver?: (participantId: string) => void` を受け取り、**host かつ rotation 内かつ現ドライバーでない**行に「ドライバーにする」ボタンを描画する。押下で `onAssignDriver(p.participantId)` を発火。Task 5 の Session がこのプロップを渡す。

- [ ] **Step 1: 失敗するテストを書く**

`apps/web/test/ui/RosterPanel.test.tsx` の末尾に追記する（既存の `mk` ヘルパを再利用する）:

```ts
describe("RosterPanel ドライバー指名（Issue #13）", () => {
  const onAssignDriver = vi.fn();
  const hostProps = {
    myParticipantId: "x",
    canHostAction: true,
    onRename: vi.fn(), onSkip: vi.fn(), onResume: vi.fn(), onAddProxy: vi.fn(),
    onAssignDriver,
  };
  beforeEach(() => onAssignDriver.mockClear());

  it("host は現ドライバー以外の rotation 行に「ドライバーにする」を表示する", () => {
    render(
      <RosterPanel
        {...hostProps}
        participants={[mk("a", "Alice"), mk("b", "Bob")]}
        currentDriverName="Alice"
        rotation={["Alice", "Bob"]}
      />,
    );
    const list = screen.getByRole("list", { name: "ドライバー一覧" });
    const bobItem = within(list).getByText("Bob").closest("li") as HTMLElement;
    expect(within(bobItem).queryByRole("button", { name: /ドライバーにする/ })).toBeTruthy();
  });

  it("現ドライバー行には「ドライバーにする」を表示しない", () => {
    render(
      <RosterPanel
        {...hostProps}
        participants={[mk("a", "Alice"), mk("b", "Bob")]}
        currentDriverName="Alice"
        rotation={["Alice", "Bob"]}
      />,
    );
    const list = screen.getByRole("list", { name: "ドライバー一覧" });
    const aliceItem = within(list).getByText("Alice").closest("li") as HTMLElement;
    expect(within(aliceItem).queryByRole("button", { name: /ドライバーにする/ })).toBeNull();
  });

  it("非 host には「ドライバーにする」を表示しない", () => {
    render(
      <RosterPanel
        {...hostProps}
        canHostAction={false}
        participants={[mk("a", "Alice"), mk("b", "Bob")]}
        currentDriverName="Alice"
        rotation={["Alice", "Bob"]}
      />,
    );
    const list = screen.getByRole("list", { name: "ドライバー一覧" });
    const bobItem = within(list).getByText("Bob").closest("li") as HTMLElement;
    expect(within(bobItem).queryByRole("button", { name: /ドライバーにする/ })).toBeNull();
  });

  it("見学者（rotation 外）には「ドライバーにする」を表示しない", () => {
    render(
      <RosterPanel
        {...hostProps}
        participants={[mk("a", "Alice"), mk("w", "Watcher")]}
        currentDriverName="Alice"
        rotation={["Alice"]}
      />,
    );
    const watchList = screen.getByRole("list", { name: "見学一覧" });
    const wItem = within(watchList).getByText("Watcher").closest("li") as HTMLElement;
    expect(within(wItem).queryByRole("button", { name: /ドライバーにする/ })).toBeNull();
  });

  it("押下で onAssignDriver を participantId 付きで発火する", () => {
    render(
      <RosterPanel
        {...hostProps}
        participants={[mk("a", "Alice"), mk("b", "Bob")]}
        currentDriverName="Alice"
        rotation={["Alice", "Bob"]}
      />,
    );
    const list = screen.getByRole("list", { name: "ドライバー一覧" });
    const bobItem = within(list).getByText("Bob").closest("li") as HTMLElement;
    fireEvent.click(within(bobItem).getByRole("button", { name: /ドライバーにする/ }));
    expect(onAssignDriver).toHaveBeenCalledWith("b");
  });
});
```

`beforeEach` を使うため、ファイル冒頭の `import { describe, it, expect, vi } from "vitest";` に `beforeEach` を追加する（未 import の場合）:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd apps/web && pnpm vitest run test/ui/RosterPanel.test.tsx`
Expected: FAIL（`onAssignDriver` prop 未対応でボタンが描画されない）

- [ ] **Step 3: `RosterPanelProps` にプロップを追加する**

`apps/web/src/ui/components/RosterPanel.tsx` の `interface RosterPanelProps` 内、`selfHasExternalToggle?: boolean;` の直後に追加する:

```ts
  /** ホストが任意メンバーを現ドライバーに指名する（Issue #13・host 限定）。
   *  未指定なら指名ボタンを描画しない（ソロ等の非対応コンシューマ向け）。 */
  onAssignDriver?: (participantId: string) => void;
```

- [ ] **Step 4: 関数引数で分割代入する**

`apps/web/src/ui/components/RosterPanel.tsx` の `export function RosterPanel({ ... })` の分割代入リスト内、`scrollable = false,` の直前に追加する:

```ts
  onAssignDriver,
```

- [ ] **Step 5: `renderRow` にボタンを追加する**

`apps/web/src/ui/components/RosterPanel.tsx` の `renderRow` 内、一時離脱/復帰の `MiniButton` ブロック（`{p.role !== "viewer" && (isMine ? ... : ...)}` の閉じ `)}`）の直後、`canMove` ブロックの直前に追加する:

```tsx
                {/* ホストは現ドライバー以外の rotation メンバーを即ドライバーに指名できる（Issue #13）。 */}
                {canHostAction && onAssignDriver && inRotation && !isCurrentDriver && (
                  <MiniButton
                    onClick={() => onAssignDriver(p.participantId)}
                    aria-label={`${p.displayName} をドライバーにする`}
                    title="ドライバーにする"
                  >
                    ドライバーにする
                  </MiniButton>
                )}
```

- [ ] **Step 6: テストが通ることを確認する**

Run: `cd apps/web && pnpm vitest run test/ui/RosterPanel.test.tsx`
Expected: PASS（新規 5 件を含む。既存の RosterPanel テストも緑）

- [ ] **Step 7: コミット**

```bash
git add apps/web/src/ui/components/RosterPanel.tsx apps/web/test/ui/RosterPanel.test.tsx
git commit -m "feat(web): RosterPanel に host 限定「ドライバーにする」アクションを追加

- 現ドライバー以外の rotation 行に表示・押下で onAssignDriver 発火
- onAssignDriver 未指定なら非表示（ソロ非対応）
- Issue #13"
```

---

### Task 5: `Session` と `App` に指名ハンドラを配線する

**Files:**
- Modify: `apps/web/src/ui/Session.tsx`（props `onDriverAssign`・3 箇所の `<RosterPanel>` へ配線）
- Modify: `apps/web/src/App.tsx`（`rosterAssign` 送信関数・`<Session onDriverAssign=...>`）
- Test: `apps/web/test/ui/Session.roster.test.tsx`（`baseHandlers` に `onDriverAssign` 追加・新規テスト）

**Interfaces:**
- Consumes: Task 4 の `RosterPanel` プロップ `onAssignDriver`。既存の `client?.send(...)`（App）。
- Produces: `Session` が `onDriverAssign: (participantId: string) => void` を受け取り 3 箇所の `RosterPanel` へ `onAssignDriver` として渡す。`App` が `driver.assign` WS コマンドを送信する。

- [ ] **Step 1: 失敗するテストを書く**

`apps/web/test/ui/Session.roster.test.tsx` の `baseHandlers()` の戻り値へ `onDriverAssign: vi.fn(),` を追加する（`onAddProxy: noop,` の直後）:

```ts
    onAddProxy: noop,
    onDriverAssign: vi.fn(),
```

続けて、`describe("Session × RosterPanel 結合（T057）", () => { ... })` 内に新規テストを追記する:

```ts
  it("RosterPanel の指名操作が driver.assign ハンドラを participantId 付きで発火する（Issue #13）", () => {
    const handlers = baseHandlers();
    render(<Session room={makeRoom()} participantId="host-1" {...handlers} />);
    // 現ドライバーは Carol（currentIndex=1）。Alice（host-1・rotation[0]）は現ドライバーでない
    // → ドライバー一覧の Alice 行に「ドライバーにする」が出る。
    const driverList = screen.getByRole("list", { name: "ドライバー一覧" });
    const aliceItem = within(driverList).getByText("Alice").closest("li") as HTMLElement;
    fireEvent.click(within(aliceItem).getByRole("button", { name: /ドライバーにする/ }));
    expect(handlers.onDriverAssign).toHaveBeenCalledWith("host-1");
  });
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `cd apps/web && pnpm vitest run test/ui/Session.roster.test.tsx`
Expected: FAIL（Session が `onDriverAssign` を RosterPanel へ渡していないためボタン無し）

- [ ] **Step 3: `Session` の props 型に追加する**

`apps/web/src/ui/Session.tsx` の props インターフェース内、`onDriverResume: (participantId: string) => void;` の直後に追加する:

```ts
  /** ホストが任意メンバーを現ドライバーに指名する（Issue #13）。 */
  onDriverAssign: (participantId: string) => void;
```

- [ ] **Step 4: `Session` 関数の分割代入に追加する**

`apps/web/src/ui/Session.tsx` の `export function Session({ ... })` の分割代入リスト内、`onDriverResume,` の直後に追加する:

```ts
  onDriverAssign,
```

- [ ] **Step 5: 3 箇所の `<RosterPanel>` に配線する**

`apps/web/src/ui/Session.tsx` 内で `onResume={onDriverResume}` を渡している **3 箇所すべて**の直後に、`onAssignDriver={onDriverAssign}` を追加する:

```tsx
            onSkip={onDriverSkip}
            onResume={onDriverResume}
            onAssignDriver={onDriverAssign}
```

（`onResume={onDriverResume}` が 3 箇所ある。いずれも同様に追記する。）

- [ ] **Step 6: テストが通ることを確認する**

Run: `cd apps/web && pnpm vitest run test/ui/Session.roster.test.tsx`
Expected: PASS

- [ ] **Step 7: `App` に送信関数を追加し `Session` へ渡す**

`apps/web/src/App.tsx` の `rosterResume` 関数定義の直後に追加する:

```ts
  const rosterAssign = (pid: string) => {
    client?.send({ command: "driver.assign", participantId: pid });
  };
```

続けて `<Session ... />` の props で `onDriverResume={rosterResume}` の直後に追加する:

```tsx
          onDriverResume={rosterResume}
          onDriverAssign={rosterAssign}
```

- [ ] **Step 8: web 全テスト＋型チェック＋ビルドを流す**

Run: `cd apps/web && pnpm test && pnpm exec tsc --noEmit`
Expected: PASS（App.tsx の型エラーが無いこと＝`onDriverAssign` 必須プロップが供給されていること）

- [ ] **Step 9: コミット**

```bash
git add apps/web/src/ui/Session.tsx apps/web/src/App.tsx apps/web/test/ui/Session.roster.test.tsx
git commit -m "feat(web): Session/App に driver.assign 指名ハンドラを配線

- Session が onDriverAssign を 3 箇所の RosterPanel へ配線
- App が driver.assign WS コマンドを送信
- Issue #13"
```

---

### Task 6: 全体結合検証（全テスト＋実画面目視）

**Files:**
- なし（検証のみ。必要なら軽微な修正を該当 Task へ戻して対応）

**Interfaces:**
- Consumes: Task 1〜5 の全成果物。
- Produces: 受け入れ基準を満たすことの確認。

- [ ] **Step 1: モノレポ全テストを流す**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer && pnpm -r test`
Expected: PASS（core / sync / web すべて緑）

- [ ] **Step 2: 型チェックを流す**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer && pnpm -r exec tsc --noEmit`
Expected: PASS（全パッケージでエラー 0）

- [ ] **Step 3: dev サーバを起動して実画面で目視確認する**

Run: `cd /workspaces/claym/local/Tasuki/tdd-mob-pro-timer && pnpm dev`
（sync + web が起動する。ポートは既存の dev スクリプトに従う。）

以下を host として確認する（受け入れ基準）:
- [ ] RosterPanel の現ドライバー以外の rotation 行に「ドライバーにする」が出る
- [ ] 指名すると `currentIndex` がそのメンバーになり、タイマーが満タンから再走行する
- [ ] 現ドライバー自身の行にはボタンが出ない（no-op 対象が UI に出ない）
- [ ] host 以外（editor/viewer で参加）にはボタンが出ない
- [ ] 「離脱中」バッジの付いたメンバーを指名すると、指名されてバッジが消える（自動復帰）

- [ ] **Step 4: dev サーバを停止する**

`pnpm dev` を Ctrl-C で停止する。

- [ ] **Step 5: 目視結果を記録する（コミット不要）**

問題があれば該当 Task のステップに戻って修正し、当該 Task のテストを追加してから再検証する。問題なければ完了。

---

## Self-Review

**1. Spec coverage（spec の各要件 → タスク対応）:**
- ホストが RosterPanel から任意メンバーを指名 → Task 4（ボタン）+ Task 5（配線）
- currentIndex 移動・満タン再走行 → Task 1（DriverSwitched 発行）+ Task 3（evolve 適用）+ Task 6 目視
- 現ドライバー自身は no-op → Task 1（`ok([])`）+ Task 3 テスト + Task 4（ボタン非表示）
- host 以外は UI 非表示＋権限ガード → Task 3（HOST_ONLY）+ Task 4（非表示テスト）
- 一時離脱中は自動復帰 → Task 3（DriverResumed 適用）+ テスト
- rotation 内・稼働中のみ → Task 1（範囲/PhaseConflict）+ Task 3（index 解決で rotation 外拒否）
- 交代としてカウント → Task 1（DriverSwitched 再利用）+ Task 3（totalSwitches テスト）
- core decide/evolve ユニット + 実画面 → Task 1/Task 6
- wire スキーマ → Task 2
- ソロは core のみ・UI 非配線 → `onAssignDriver` optional（Task 4）で自然に満たす
ギャップなし。

**2. Placeholder scan:** 各コード step は実コードを含む。`index: -1` はプレースホルダ値だが Task 3 Step 5 で必ず解決され、未解決時（rotation 外）は `PARTICIPANT_NOT_FOUND` で早期 return するため decide に -1 が渡ることはない。TBD/TODO なし。

**3. Type consistency:**
- decide コマンド名 `driver.assign` / フィールド `index: number` は Task 1/3 で一致。
- wire コマンド `driver.assign` / `participantId` は Task 2/3/5 で一致。
- prop 名 `onAssignDriver`（RosterPanel）と `onDriverAssign`（Session/App）を意図的に区別（RosterPanel は既存の `onSkip`/`onResume` に合わせた短縮名、Session/App は `onDriver*` 系に合わせた名）。Task 5 Step 5 で `onAssignDriver={onDriverAssign}` と明示ブリッジ済み。
- `DriverResumed { type; participantId; now }` は既存 `applyRoomLevelEvent` の受理形と一致。
不整合なし。
