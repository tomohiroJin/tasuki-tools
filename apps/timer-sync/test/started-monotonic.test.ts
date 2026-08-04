/**
 * Room.startedAt の記録テスト（host-spof-relaxation D2）
 * 「一度でも開始したか」を表す単調フラグ。phase.set と session.act START の
 * どちらからでも記録され、一度立てたら phase の後戻りでも消えないことを検証する。
 * 設計: docs/plans/host-spof-relaxation/plan.md「D2」「データモデル」
 */

import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { SessionConfig } from "@tasuki/timer-core";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

const config: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["Alice", "Bob", "Charlie"],
  intervalMinutes: 5,
};

describe("Room.startedAt（開始済みの単調フラグ・D2）", () => {
  let store: InMemoryRoomStore;
  let clock: FakeClock;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    clock = new FakeClock(1000000);
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({ store, clock, broadcaster, codeGen: new FakeCodeGen() });
  });

  async function setupRoom(): Promise<string> {
    const create = await handlers.handleCommand("host-conn", {
      command: "room.create",
      displayName: "Alice",
      config,
    });
    if (!create.isOk()) throw new Error("create failed");
    // 本番（server.ts）は handleCommand の戻り値を破棄する。値は本番と同じ観測点から取る（FR-100）。
    return broadcaster.createdFor("host-conn").code;
  }

  it("phase.set で phase: 'session' にすると startedAt が記録される", async () => {
    // Given
    const code = await setupRoom();
    expect(store.get(code)!.startedAt ?? null).toBeNull();

    // When
    await handlers.handleCommand("host-conn", { command: "phase.set", phase: "session" });

    // Then
    expect(store.get(code)!.startedAt).not.toBeNull();
    expect(store.get(code)!.startedAt).toBe(1000000);
  });

  it("phase.set を送らず session.act START だけを送っても startedAt が記録される（迂回路の封鎖）", async () => {
    // Given
    const code = await setupRoom();
    expect(store.get(code)!.startedAt ?? null).toBeNull();

    // When（UI 通常経路＝phase.set → session.act を経ず、session.act だけを直接送る。
    // EDITOR_PLUS_COMMANDS に属するため、プロトコル上これだけを送ることが可能）
    await handlers.handleCommand("host-conn", { command: "session.act", action: "START" });

    // Then
    const after = store.get(code)!;
    expect(after.phase).toBe("setup"); // phase.set を送っていないので phase 自体は変わらない
    expect(after.startedAt).not.toBeNull();
    expect(after.startedAt).toBe(1000000);
  });

  it("phase.set で 'setup' へ後戻りしても startedAt は消えない", async () => {
    // Given
    const code = await setupRoom();
    await handlers.handleCommand("host-conn", { command: "phase.set", phase: "session" });
    expect(store.get(code)!.startedAt).toBe(1000000);

    // When
    await handlers.handleCommand("host-conn", { command: "phase.set", phase: "setup" });

    // Then
    const after = store.get(code)!;
    expect(after.phase).toBe("setup");
    expect(after.startedAt).toBe(1000000);
  });

  it("2 回目の開始で startedAt の値は更新されない（単調性）", async () => {
    // Given
    const code = await setupRoom();
    await handlers.handleCommand("host-conn", { command: "phase.set", phase: "session" });
    expect(store.get(code)!.startedAt).toBe(1000000);

    // When
    clock.advance(60000);
    await handlers.handleCommand("host-conn", { command: "phase.set", phase: "setup" });
    await handlers.handleCommand("host-conn", { command: "phase.set", phase: "session" });

    // Then
    expect(store.get(code)!.startedAt).toBe(1000000);
  });

  it("新規ルームに session.act RESUME を単独で送ると startedAt が記録される（欠陥修正の主目的）", async () => {
    // Given
    const code = await setupRoom();
    expect(store.get(code)!.startedAt ?? null).toBeNull();

    // When（phase.set も session.act START も経ず、RESUME だけを直接送る。
    // RESUME は「走行中でなければ受理」するため新規ルーム＝未開始でも通り、
    // SessionResumed が clock.running を true にする）
    const result = await handlers.handleCommand("host-conn", {
      command: "session.act",
      action: "RESUME",
    });

    // Then
    result._unsafeUnwrap();
    const after = store.get(code)!;
    expect(after.clock.running).toBe(true);
    expect(after.startedAt).not.toBeNull();
    expect(after.startedAt).toBe(1000000);
  });

  it("不変条件: clock.running が true ならば startedAt は null/undefined ではない（コマンド種別に依存せず成立する）", async () => {
    // Given（対象コマンドの一覧そのものが前提。各コマンドを新規ルームへ単独で送る）
    type Cmd = { command: string; [key: string]: unknown };
    const commands: Cmd[] = [
      { command: "session.act", action: "START" },
      { command: "session.act", action: "PAUSE" },
      { command: "session.act", action: "RESUME" },
      { command: "session.act", action: "RESTART" },
      { command: "session.act", action: "SWITCH" },
      { command: "session.reset" },
      { command: "phase.set", phase: "session" },
      { command: "phase.set", phase: "ready" },
      { command: "phase.set", phase: "setup" },
      { command: "phase.set", phase: "celebration" },
      { command: "session.complete" },
      { command: "session.abort" },
    ];

    const results: Array<{ command: string; running: boolean; startedAt: number | null }> = [];

    for (const cmd of commands) {
      // 各コマンドを新規ルームに単独で送る（他コマンドの影響を受けないよう独立させる）。
      const freshStore = new InMemoryRoomStore();
      const freshClock = new FakeClock(1000000);
      const freshBroadcaster = new SpyBroadcaster();
      const freshHandlers = makeHandlers({
        store: freshStore,
        clock: freshClock,
        broadcaster: freshBroadcaster,
        codeGen: new FakeCodeGen(),
      });
      const create = await freshHandlers.handleCommand("host-conn", {
        command: "room.create",
        displayName: "Alice",
        config,
      });
      if (!create.isOk()) throw new Error("create failed");
      const freshCode = freshBroadcaster.createdFor("host-conn").code;

      // When
      await freshHandlers.handleCommand("host-conn", cmd);

      const after = freshStore.get(freshCode)!;
      results.push({
        command: JSON.stringify(cmd),
        running: after.clock.running,
        startedAt: after.startedAt ?? null,
      });
    }

    // どのコマンドで破れたかが分かるよう、違反の有無をコマンドごとに検証する。
    for (const r of results) {
      if (r.running) {
        expect(r.startedAt, `command=${r.command} running=${r.running}`).not.toBeNull();
      }
    }
  });
});
