/**
 * 拒否箇所が返すエラーコードの検証（Issue #29・H0〜H3）。
 *
 * 当初は同一のコードが複数の操作から返っていた 5 種類（PARTICIPANT_OFFLINE /
 * CANNOT_CHANGE_HOST / PARTICIPANT_NOT_FOUND / LAST_MANAGER / RATE_LIMITED）について、
 * 「どの拒否箇所が今どのコードを返しているか」を固定する H0 として書き起こした。
 * H2/H3 で拒否箇所を操作ごとの新コードへ差し替えたため、現在は各ケースが
 * 差し替え後の新コードを検証する（SC-044・SC-045）。
 *
 * #95 S3 で役割とホストを廃止したため、CANNOT_CHANGE_HOST 系と LAST_MANAGER 系の
 * 拒否箇所（②③④④'⑥⑦）は**発行元ごと消えた**。それらのコードはもう存在せず、
 * ここで検証する対象も無い（コードは `SYNC_ERROR_CODES` からも外してある）。
 *
 * @requirements SC-044
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { DEFAULT_CAPACITY } from "@tasuki/rate-limit";
import { makeHandlers } from "../src/application/handlers.js";
import { makeTestHandlers } from "./support/room-builder.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryTimerStore } from "../src/adapters/in-memory-timer-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { Room, SessionConfig } from "@tasuki/timer-core";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { roomViewOf, putRoomView } from "./support/room-view.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

const config: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["Alice", "Bob", "Carol"],
  intervalMinutes: 5,
};

const CREATOR = "es-creator";
const BOB = "es-bob";
const CAROL = "es-carol";

/**
 * @requirements SC-044
 */
describe("拒否箇所が返すコード（現状の記録）", () => {
  describe("作成者 + 2 参加者のルーム", () => {
    let store: InMemoryRoomStore;
    let timers: InMemoryTimerStore;
    let broadcaster: SpyBroadcaster;
    let handlers: ReturnType<typeof makeHandlers>;
    let code: string;

    const pidOf = (name: string): string =>
      roomViewOf(store, timers, code).participants.find((p) => p.displayName === name)!.participantId;

    const lastError = (connId: string): { code: string; message: string } | undefined => {
      const found = [...broadcaster.sent].reverse().find(
        (s) => s.connId === connId && s.msg.type === "error",
      );
      if (!found || found.msg.type !== "error") return undefined;
      return { code: found.msg.code, message: found.msg.message };
    };

    beforeEach(async () => {
      store = new InMemoryRoomStore();
      timers = new InMemoryTimerStore();
      broadcaster = new SpyBroadcaster();
      handlers = makeTestHandlers({
        store,
        timers, clock: new FakeClock(1_000_000), broadcaster, codeGen: new FakeCodeGen(),
      });
      const created = await handlers.handleCommand(CREATOR, {
        command: "room.create", displayName: "Alice", config,
      });
      if (!created.isOk()) throw new Error("room.create failed");
      code = broadcaster.createdFor(CREATOR).code;
      // Bob・Carol は join だけでなく member.add まで行い、輪（rotation）に加わった
      // 進行メンバーにする（⑤の「輪に居ない」ケースだけは join のみに留める別セットアップを使う）。
      await handlers.handleCommand(BOB, { command: "room.join", code, displayName: "Bob", hasAiKey: false });
      await handlers.handleCommand(CAROL, { command: "room.join", code, displayName: "Carol", hasAiKey: false });
      await handlers.handleCommand(BOB, { command: "member.add", participantId: pidOf("Bob") });
      await handlers.handleCommand(CAROL, { command: "member.add", participantId: pidOf("Carol") });
      // 稼働中にする（driver.assign はクロックが running でなければ受理されない）。
      await handlers.handleCommand(CREATOR, { command: "phase.set", phase: "session" });
      await handlers.handleCommand(CREATOR, { command: "session.act", action: "START" });
      broadcaster.sent.length = 0;
    });

    it("① オフライン相手への driver.assign は DRIVER_ASSIGN_OFFLINE を返す", async () => {
      // Given（Bob を実在オフラインにする）
      const room = roomViewOf(store, timers, code);
      const bobId = pidOf("Bob");
      const updated: Room = {
        ...room,
        participants: room.participants.map((p) =>
          p.participantId === bobId ? { ...p, presence: "offline" as const } : p,
        ),
      };
      putRoomView(store, timers, updated);

      // When
      await handlers.handleCommand(CREATOR, { command: "driver.assign", participantId: bobId });

      // Then
      expect(lastError(CREATOR)?.code).toBe("DRIVER_ASSIGN_OFFLINE");
    });
  });

  describe("輪に居ない相手・存在しない相手（driver.assign）", () => {
    let store: InMemoryRoomStore;
    let timers: InMemoryTimerStore;
    let broadcaster: SpyBroadcaster;
    let handlers: ReturnType<typeof makeHandlers>;
    let code: string;

    const pidOf = (name: string): string =>
      roomViewOf(store, timers, code).participants.find((p) => p.displayName === name)!.participantId;

    const lastError = (connId: string): { code: string; message: string } | undefined => {
      const found = [...broadcaster.sent].reverse().find(
        (s) => s.connId === connId && s.msg.type === "error",
      );
      if (!found || found.msg.type !== "error") return undefined;
      return { code: found.msg.code, message: found.msg.message };
    };

    beforeEach(async () => {
      store = new InMemoryRoomStore();
      timers = new InMemoryTimerStore();
      broadcaster = new SpyBroadcaster();
      handlers = makeTestHandlers({
        store,
        timers, clock: new FakeClock(1_000_000), broadcaster, codeGen: new FakeCodeGen(),
      });
      const created = await handlers.handleCommand(CREATOR, {
        command: "room.create", displayName: "Alice", config,
      });
      if (!created.isOk()) throw new Error("room.create failed");
      code = broadcaster.createdFor(CREATOR).code;
      // Bob は join のみ（member.add を呼ばない）ため、輪（rotation）には居ない参加者になる。
      await handlers.handleCommand(BOB, { command: "room.join", code, displayName: "Bob", hasAiKey: false });
      await handlers.handleCommand(CREATOR, { command: "phase.set", phase: "session" });
      await handlers.handleCommand(CREATOR, { command: "session.act", action: "START" });
      broadcaster.sent.length = 0;
    });

    it("⑤ 輪に居ない相手への driver.assign は NOT_IN_ROTATION を返す", async () => {
      // Given
      const bobId = pidOf("Bob");

      // When
      await handlers.handleCommand(CREATOR, { command: "driver.assign", participantId: bobId });

      // Then
      expect(lastError(CREATOR)?.code).toBe("NOT_IN_ROTATION");
    });

    it("③' 存在しない相手への driver.assign は PARTICIPANT_NOT_FOUND を返す（⑤の NOT_IN_ROTATION とは異なるコードになる）", async () => {
      // When
      await handlers.handleCommand(CREATOR, { command: "driver.assign", participantId: "pid-unknown" });

      // Then
      expect(lastError(CREATOR)?.code).toBe("PARTICIPANT_NOT_FOUND");
    });
  });

  describe("試行過多", () => {
    it("⑧ 試行過多の room.join は JOIN_RATE_LIMITED を返す", async () => {
      // Given
      const broadcaster = new SpyBroadcaster();
      const handlers = makeTestHandlers({
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
      for (let i = 0; i < DEFAULT_CAPACITY; i++) await badJoin();

      // When
      await badJoin();

      // Then
      expect(broadcaster.errorsTo(conn).at(-1)?.code).toBe("JOIN_RATE_LIMITED");
    });

    it("⑨ 試行過多の ai.unlock は RATE_LIMITED を返す（room.join とは異なり維持する）", async () => {
      // Given
      const broadcaster = new SpyBroadcaster();
      const handlers = makeTestHandlers({
        store: new InMemoryRoomStore(),
        clock: new FakeClock(1_000_000),
        broadcaster,
        codeGen: new FakeCodeGen(),
        aiUnlockKey: "himitsu",
      });
      const conn = "rl-unlock-conn";
      await handlers.handleCommand(conn, { command: "room.create", displayName: "Alice" });
      for (let i = 0; i < DEFAULT_CAPACITY; i++) {
        await handlers.handleCommand(conn, { command: "ai.unlock", key: `wrong-${i}` });
      }

      // When（使い切った次は、正しい合言葉でも RATE_LIMITED になるはず）
      await handlers.handleCommand(conn, { command: "ai.unlock", key: "himitsu" });

      // Then
      expect(broadcaster.errorsTo(conn).at(-1)?.code).toBe("RATE_LIMITED");
    });
  });
});
