/**
 * 開始前の権限は従来どおりであることを固定するテスト（host-spof-relaxation G2・T012）
 *
 * 本 Issue の緩和は「開始後」にのみ効く。開始前（`Room.startedAt === null`）は
 * 準備段階の主催者主導を維持する（FR-066）。T015〜T016b で5層の判定を
 * `checkPermission()` の1層へ置換する際、この特性テストが層①②③⑤の喪失を検出する。
 *
 * 設計: docs/plans/host-spof-relaxation/plan.md「判定の順序」5a/5b
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { SessionConfig } from "@tasuki/timer-core";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

const config: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["Host", "Editor", "Carol"],
  intervalMinutes: 5,
};

const HOST_CONN = "before-host";
const EDITOR_CONN = "before-editor";
const CAROL_CONN = "before-carol";

/**
 * @requirements FR-066, US6
 */
describe("開始前の権限（従来どおり主催者主導）", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let roomCode: string;
  let carolPid: string;
  let editorPid: string;

  beforeEach(async () => {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({
      store,
      clock: new FakeClock(1000000),
      broadcaster,
      codeGen: new FakeCodeGen(),
      aiUnlockKey: "secret",
    });

    const created = await handlers.handleCommand(HOST_CONN, {
      command: "room.create",
      displayName: "Host",
      config,
    });
    if (!created.isOk()) throw new Error("room.create failed");
    // 本番（server.ts）は handleCommand の戻り値を破棄する。値は本番と同じ観測点から取る（FR-100）。
    roomCode = broadcaster.createdFor(HOST_CONN).code;

    // join の既定ロールは editor（UX 再設計）。降格せずそのまま使う。
    // rotation は参加者IDの配列（D6b）。config.members に名前を並べるだけでは輪に入らないため、
    // 本人が自分を輪に加える（自己対象なので開始前でも許可される）。
    for (const [connId, displayName] of [
      [EDITOR_CONN, "Editor"],
      [CAROL_CONN, "Carol"],
    ] as const) {
      const joinResult = await handlers.handleCommand(connId, {
        command: "room.join", code: roomCode, displayName, hasAiKey: false,
      });
      if (!joinResult.isOk()) throw new Error(`room.join failed: ${displayName}`);
      const addResult = await handlers.handleCommand(connId, {
        command: "member.add", participantId: broadcaster.joinedFor(connId).participantId,
      });
      if (!addResult.isOk()) throw new Error(`member.add failed: ${displayName}`);
    }

    const room = store.get(roomCode)!;
    editorPid = room.participants.find((p) => p.displayName === "Editor")!.participantId;
    carolPid = room.participants.find((p) => p.displayName === "Carol")!.participantId;

    broadcaster.sent.length = 0;
  });

  /** 直近に connId 宛へ送られた error メッセージを返す（無ければ undefined）。 */
  function lastError(connId: string): { code: string; message: string } | undefined {
    const found = [...broadcaster.sent].reverse().find(
      (s) => s.connId === connId && s.msg.type === "error",
    );
    if (!found || found.msg.type !== "error") return undefined;
    return { code: found.msg.code, message: found.msg.message };
  }

  describe("ホスト限定コマンド（層①・層⑤）は editor が実行できない", () => {
    // 開始後に緩和される 7 コマンド。T013 と同じ集合を使い、段階による差を対比させる。
    const hostOnlyCases: Array<[string, () => Record<string, unknown>]> = [
      ["driver.assign", () => ({ command: "driver.assign", participantId: carolPid })],
      ["member.shuffle", () => ({ command: "member.shuffle" })],
      ["member.move", () => ({ command: "member.move", fromIndex: 0, toIndex: 2 })],
      ["role.set", () => ({ command: "role.set", participantId: carolPid, role: "viewer" })],
      ["room.passphrase.set", () => ({ command: "room.passphrase.set", passphrase: "pw" })],
      ["ai.unlock", () => ({ command: "ai.unlock", key: "secret" })],
      ["participant.remove", () => ({ command: "participant.remove", participantId: carolPid })],
    ];

    for (const [name, build] of hostOnlyCases) {
      it(`editor は ${name} を実行できない`, async () => {
        // Given（表内の各コマンドを対象にする。差分は hostOnlyCases のエントリそのもの）
        const command = build();
        // When
        const result = await handlers.handleCommand(EDITOR_CONN, command);
        // Then
        expect(result.isErr()).toBe(true);
        expect(lastError(EDITOR_CONN)?.code).toBe("UNAUTHORIZED");
      });
    }
  });

  describe("他人対象の関係コマンド（層②③）は editor が実行できない", () => {
    it("editor は他人を participant.rename できない", async () => {
      // Given
      const command = {
        command: "participant.rename", participantId: carolPid, displayName: "Renamed",
      } as const;

      // When
      const result = await handlers.handleCommand(EDITOR_CONN, command);

      // Then
      expect(result.isErr()).toBe(true);
      expect(lastError(EDITOR_CONN)?.code).toBe("UNAUTHORIZED");
    });

    it("editor は他人の名前を member.add できない（ローテーション所有権）", async () => {
      // Given
      const command = { command: "member.add", participantId: carolPid } as const;

      // When
      const result = await handlers.handleCommand(EDITOR_CONN, command);

      // Then
      expect(result.isErr()).toBe(true);
      expect(lastError(EDITOR_CONN)?.code).toBe("UNAUTHORIZED");
    });

    it("editor は他人の位置を member.remove できない（ローテーション所有権）", async () => {
      // Given（rotation は参加者IDの並び（作成者 → Editor → Carol）。index 2 は Carol）
      const command = { command: "member.remove", index: 2 } as const;

      // When
      const result = await handlers.handleCommand(EDITOR_CONN, command);

      // Then
      expect(result.isErr()).toBe(true);
      expect(lastError(EDITOR_CONN)?.code).toBe("UNAUTHORIZED");
    });

    it("editor は自分の位置なら member.remove できる（自己対象は許可）", async () => {
      // Given（index 1 は Editor 自身）
      const command = { command: "member.remove", index: 1 } as const;

      // When
      const result = await handlers.handleCommand(EDITOR_CONN, command);

      // Then
      result._unsafeUnwrap();
      expect(lastError(EDITOR_CONN)).toBeUndefined();
    });
  });

  /**
   * @requirements FR-070
   */
  describe("在室していない接続", () => {
    it("在室していない接続の操作は NOT_IN_ROOM で拒否される", async () => {
      // Given
      const command = { command: "driver.assign", participantId: editorPid } as const;

      // When
      const result = await handlers.handleCommand("stranger-conn", command);

      // Then
      expect(result.isErr()).toBe(true);
      expect(lastError("stranger-conn")?.code).toBe("NOT_IN_ROOM");
    });

    it("在室していない接続の専用ハンドラ経由の操作も NOT_IN_ROOM で拒否される", async () => {
      // Given
      const command = { command: "room.passphrase.set", passphrase: "pw" } as const;

      // When
      const result = await handlers.handleCommand("stranger-conn", command);

      // Then
      expect(result.isErr()).toBe(true);
      expect(lastError("stranger-conn")?.code).toBe("NOT_IN_ROOM");
    });
  });
});
