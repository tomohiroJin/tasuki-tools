/**
 * 拒否箇所が返すエラーコードの検証（Issue #29・H0〜H3）。
 *
 * 当初は同一のコードが複数の操作から返っていた 5 種類（PARTICIPANT_OFFLINE /
 * CANNOT_CHANGE_HOST / PARTICIPANT_NOT_FOUND / LAST_MANAGER / RATE_LIMITED）について、
 * 「どの拒否箇所が今どのコードを返しているか」を固定する H0 として書き起こした。
 * H2/H3 で拒否箇所を操作ごとの新コードへ差し替えたため、現在は各ケースが
 * 差し替え後の新コードを検証する（SC-044・SC-045）。
 *
 * @requirements SC-044
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { Room, SessionConfig } from "@tasuki/timer-core";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

const config: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["Alice", "Bob", "Carol"],
  intervalMinutes: 5,
};

const HOST = "es-host";
const BOB = "es-bob";
const CAROL = "es-carol";

/**
 * @requirements SC-044
 */
describe("拒否箇所が返すコード（現状の記録）", () => {
  describe("host + 2 参加者のルーム", () => {
    let store: InMemoryRoomStore;
    let broadcaster: SpyBroadcaster;
    let handlers: ReturnType<typeof makeHandlers>;
    let code: string;

    const pidOf = (name: string): string =>
      store.get(code)!.participants.find((p) => p.displayName === name)!.participantId;

    const lastError = (connId: string): { code: string; message: string } | undefined => {
      const found = [...broadcaster.sent].reverse().find(
        (s) => s.connId === connId && s.msg.type === "error",
      );
      if (!found || found.msg.type !== "error") return undefined;
      return { code: found.msg.code, message: found.msg.message };
    };

    beforeEach(async () => {
      store = new InMemoryRoomStore();
      broadcaster = new SpyBroadcaster();
      handlers = makeHandlers({
        store, clock: new FakeClock(1_000_000), broadcaster, codeGen: new FakeCodeGen(),
      });
      const created = await handlers.handleCommand(HOST, {
        command: "room.create", displayName: "Alice", config,
      });
      if (!created.isOk()) throw new Error("room.create failed");
      code = broadcaster.createdFor(HOST).code;
      // Bob・Carol は join だけでなく member.add まで行い、輪（rotation）に加わった
      // 進行メンバーにする（⑤の「輪に居ない」ケースだけは join のみに留める別セットアップを使う）。
      await handlers.handleCommand(BOB, { command: "room.join", code, displayName: "Bob", hasAiKey: false });
      await handlers.handleCommand(CAROL, { command: "room.join", code, displayName: "Carol", hasAiKey: false });
      await handlers.handleCommand(BOB, { command: "member.add", participantId: pidOf("Bob") });
      await handlers.handleCommand(CAROL, { command: "member.add", participantId: pidOf("Carol") });
      // 稼働中にする（driver.assign はクロックが running でなければ受理されない）。
      await handlers.handleCommand(HOST, { command: "phase.set", phase: "session" });
      await handlers.handleCommand(HOST, { command: "session.act", action: "START" });
      broadcaster.sent.length = 0;
    });

    it("① オフライン相手への driver.assign は DRIVER_ASSIGN_OFFLINE を返す", async () => {
      // Given（Bob を実在オフラインにする）
      const room = store.get(code)!;
      const bobId = pidOf("Bob");
      const updated: Room = {
        ...room,
        participants: room.participants.map((p) =>
          p.participantId === bobId ? { ...p, presence: "offline" as const } : p,
        ),
      };
      store.put(updated);

      // When
      await handlers.handleCommand(HOST, { command: "driver.assign", participantId: bobId });

      // Then
      expect(lastError(HOST)?.code).toBe("DRIVER_ASSIGN_OFFLINE");
    });

    it("② オフライン相手への host.transfer は HOST_TRANSFER_OFFLINE を返す", async () => {
      // Given（Bob を実在オフラインにする）
      const room = store.get(code)!;
      const bobId = pidOf("Bob");
      const updated: Room = {
        ...room,
        participants: room.participants.map((p) =>
          p.participantId === bobId ? { ...p, presence: "offline" as const } : p,
        ),
      };
      store.put(updated);

      // When
      await handlers.handleCommand(HOST, { command: "host.transfer", participantId: bobId });

      // Then
      expect(lastError(HOST)?.code).toBe("HOST_TRANSFER_OFFLINE");
    });

    it("③ ホストを対象にした role.set は CANNOT_CHANGE_HOST_ROLE を返す", async () => {
      // Given
      const aliceId = pidOf("Alice");

      // When
      const result = await handlers.handleCommand(HOST, {
        command: "role.set", participantId: aliceId, role: "viewer",
      });

      // Then
      expect(result.isErr()).toBe(true);
      expect(lastError(HOST)?.code).toBe("CANNOT_CHANGE_HOST_ROLE");
    });

    it("④ 現ホストを対象にした host.transfer は ALREADY_HOST を返す", async () => {
      // Given
      const aliceId = pidOf("Alice");

      // When
      const result = await handlers.handleCommand(HOST, {
        command: "host.transfer", participantId: aliceId,
      });

      // Then
      expect(result.isErr()).toBe(true);
      expect(lastError(HOST)?.code).toBe("ALREADY_HOST");
    });

    it("④' 編集者（非ホスト）が開始後に現ホストへ host.transfer を送っても ALREADY_HOST を返す（実行者と対象が同一とは限らないことの担保・FR-138）", async () => {
      // Given（Bob は編集者。開始後は editor+ が host.transfer を実行できる・Issue #22）
      const aliceId = pidOf("Alice");

      // When
      const result = await handlers.handleCommand(BOB, {
        command: "host.transfer", participantId: aliceId,
      });

      // Then
      expect(result.isErr()).toBe(true);
      expect(lastError(BOB)?.code).toBe("ALREADY_HOST");
    });

    it("⑥ 進行できる人が残らない participant.remove は LAST_MANAGER_LEAVE を返す", async () => {
      // Given（Bob と Carol を見学者へ降格し、編集者以上を Alice(host) だけにする）
      await handlers.handleCommand(HOST, { command: "role.set", participantId: pidOf("Bob"), role: "viewer" });
      await handlers.handleCommand(HOST, { command: "role.set", participantId: pidOf("Carol"), role: "viewer" });
      broadcaster.sent.length = 0;
      const aliceId = pidOf("Alice");

      // When
      const result = await handlers.handleCommand(HOST, {
        command: "participant.remove", participantId: aliceId,
      });

      // Then
      expect(result.isErr()).toBe(true);
      expect(lastError(HOST)?.code).toBe("LAST_MANAGER_LEAVE");
    });

    it("⑦ 進行できる人が残らない role.set（viewer 化）は LAST_MANAGER_DEMOTE を返す", async () => {
      // Given（ホスト不在・実在の編集者は Bob だけの状態を直接組む。④の CANNOT_CHANGE_HOST_ROLE が
      // 先に効いてしまうため、コマンド経路だけでは到達できない状態を state で作る）
      const seeded = store.get(code)!;
      const bobId = pidOf("Bob");
      const room: Room = {
        ...seeded,
        hostParticipantId: "gone",
        participants: seeded.participants
          .filter((p) => p.displayName !== "Alice")
          .map((p) => (p.displayName === "Carol" ? { ...p, role: "viewer" as const } : p)),
      };
      store.put(room);
      broadcaster.sent.length = 0;

      // When
      const result = await handlers.handleCommand(BOB, {
        command: "role.set", participantId: bobId, role: "viewer",
      });

      // Then
      expect(result.isErr()).toBe(true);
      expect(lastError(BOB)?.code).toBe("LAST_MANAGER_DEMOTE");
    });
  });

  describe("輪に居ない相手・存在しない相手（driver.assign）", () => {
    let store: InMemoryRoomStore;
    let broadcaster: SpyBroadcaster;
    let handlers: ReturnType<typeof makeHandlers>;
    let code: string;

    const pidOf = (name: string): string =>
      store.get(code)!.participants.find((p) => p.displayName === name)!.participantId;

    const lastError = (connId: string): { code: string; message: string } | undefined => {
      const found = [...broadcaster.sent].reverse().find(
        (s) => s.connId === connId && s.msg.type === "error",
      );
      if (!found || found.msg.type !== "error") return undefined;
      return { code: found.msg.code, message: found.msg.message };
    };

    beforeEach(async () => {
      store = new InMemoryRoomStore();
      broadcaster = new SpyBroadcaster();
      handlers = makeHandlers({
        store, clock: new FakeClock(1_000_000), broadcaster, codeGen: new FakeCodeGen(),
      });
      const created = await handlers.handleCommand(HOST, {
        command: "room.create", displayName: "Alice", config,
      });
      if (!created.isOk()) throw new Error("room.create failed");
      code = broadcaster.createdFor(HOST).code;
      // Bob は join のみ（member.add を呼ばない）ため、輪（rotation）には居ない見学者になる。
      await handlers.handleCommand(BOB, { command: "room.join", code, displayName: "Bob", hasAiKey: false });
      await handlers.handleCommand(HOST, { command: "phase.set", phase: "session" });
      await handlers.handleCommand(HOST, { command: "session.act", action: "START" });
      broadcaster.sent.length = 0;
    });

    it("⑤ 輪に居ない相手（見学者）への driver.assign は NOT_IN_ROTATION を返す", async () => {
      // Given
      const bobId = pidOf("Bob");

      // When
      await handlers.handleCommand(HOST, { command: "driver.assign", participantId: bobId });

      // Then
      expect(lastError(HOST)?.code).toBe("NOT_IN_ROTATION");
    });

    it("③' 存在しない相手への driver.assign は PARTICIPANT_NOT_FOUND を返す（⑤の NOT_IN_ROTATION とは異なるコードになる）", async () => {
      // When
      await handlers.handleCommand(HOST, { command: "driver.assign", participantId: "pid-unknown" });

      // Then
      expect(lastError(HOST)?.code).toBe("PARTICIPANT_NOT_FOUND");
    });
  });

  describe("試行過多", () => {
    it("⑧ 試行過多の room.join は JOIN_RATE_LIMITED を返す", async () => {
      // Given
      const broadcaster = new SpyBroadcaster();
      const handlers = makeHandlers({
        store: new InMemoryRoomStore(),
        clock: new FakeClock(1_000_000),
        broadcaster,
        codeGen: new FakeCodeGen(),
      });
      const conn = "rl-join-conn";
      const badJoin = () =>
        handlers.handleCommand(conn, {
          command: "room.join", code: "NOPE99", displayName: "Bob", hasAiKey: false,
        });
      for (let i = 0; i < 30; i++) await badJoin();

      // When
      await badJoin();

      // Then
      expect(broadcaster.errorsTo(conn).at(-1)?.code).toBe("JOIN_RATE_LIMITED");
    });

    it("⑨ 試行過多の ai.unlock は RATE_LIMITED を返す（room.join とは異なり維持する）", async () => {
      // Given
      const broadcaster = new SpyBroadcaster();
      const handlers = makeHandlers({
        store: new InMemoryRoomStore(),
        clock: new FakeClock(1_000_000),
        broadcaster,
        codeGen: new FakeCodeGen(),
        aiUnlockKey: "himitsu",
      });
      const conn = "rl-unlock-conn";
      await handlers.handleCommand(conn, { command: "room.create", displayName: "Alice" });
      for (let i = 0; i < 30; i++) {
        await handlers.handleCommand(conn, { command: "ai.unlock", key: `wrong-${i}` });
      }

      // When（31 回目は正しい合言葉でも RATE_LIMITED になるはず）
      await handlers.handleCommand(conn, { command: "ai.unlock", key: "himitsu" });

      // Then
      expect(broadcaster.errorsTo(conn).at(-1)?.code).toBe("RATE_LIMITED");
    });
  });
});
