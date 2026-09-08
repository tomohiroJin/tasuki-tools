/**
 * ルームに居る全員が同格であることを固定するテスト（#95 S3）。
 *
 * S3 で役割（host / editor / viewer）とホストの概念を廃止した。以後、
 * サーバーは「誰が実行したか」で可否を分けない —— `handleCommand` が持つのは
 * 在室確認とアクター解決だけで、可否判定（旧 `rejectIfUnauthorized` →
 * `checkPermission`）はもう存在しない。
 *
 * ⚠ **このファイルは、削除した否定テストの反転として書かれている。**
 * 元は `permissions-before-start.test.ts`（開始前は主催者主導）と
 * `authorize.test.ts`（対象解決と拒否の伝播）が「非ホストは拒否される」を
 * 固定していた。判定を消すと、それらのテストは概念ごと意味を失う。
 * **消すだけにすると「誰でも実行できる」ことは誰も確かめなくなる**ため、
 * 同じコマンド集合について期待を反転させたものをここへ移した。
 * とくに次の 2 点は、旧テストが「拒否される」側で固定していた分岐である:
 *
 *   1. かつてホスト限定だったコマンド（開始前は非ホストが全て拒否された）
 *   2. 他人を対象にする関係コマンド（自己対象でなければ拒否された）
 *
 * 段階（開始前 / 開始後）による差も無くなった。開始前という**最も厳しかった段階**で
 * 通ることを見れば、段階の差が残っていないことも同時に示せる。
 *
 * 在室確認は S3 でも残る性質なので、`permissions-before-start.test.ts` が
 * 持っていた `NOT_IN_ROOM` の 2 件もここへ引き取ってある（同格化と在室確認は別の層）。
 *
 * @requirements #95, FR-070
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { makeHandlers } from "../src/application/handlers.js";
import { makeTestHandlers } from "./support/room-builder.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { SessionConfig } from "@tasuki/timer-core";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";
import type { RoomScopedCommand } from "../src/application/handlers.js";

const config: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["Creator", "Alice", "Bob"],
  intervalMinutes: 5,
};

/** ルームを作った人。かつては host という特別扱いを受けていた。 */
const CREATOR_CONN = "equal-creator";
/** 後から参加した人。かつては editor で、開始前はほとんどの操作を拒否されていた。 */
const ALICE_CONN = "equal-alice";
/** Alice が「他人」として対象にする参加者（輪の中）。 */
const BOB_CONN = "equal-bob";
/** 輪の外に居る参加者（`member.add` の対象にする）。 */
const CAROL_CONN = "equal-carol";

/**
 * @requirements #95
 */
describe("ルームに居る全員が同格である（開始前）", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let roomCode: string;
  let bobPid: string;
  let carolPid: string;

  beforeEach(async () => {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeTestHandlers({
      store,
      clock: new FakeClock(1000000),
      broadcaster,
      codeGen: new FakeCodeGen(),
      aiUnlockKey: "secret",
    });

    const created = await handlers.handleCommand(CREATOR_CONN, {
      command: "room.create",
      displayName: "Creator",
      config,
    });
    if (!created.isOk()) throw new Error("room.create failed");
    // 本番（server.ts）は handleCommand の戻り値を破棄する。値は本番と同じ観測点から取る（FR-100）。
    roomCode = broadcaster.createdFor(CREATOR_CONN).code;

    // Alice と Bob は輪（rotation）に加わる。rotation は参加者IDの配列（D6b）で、
    // config.members に名前を並べるだけでは輪に入らないため、本人が自分を輪に加える。
    for (const [connId, displayName] of [
      [ALICE_CONN, "Alice"],
      [BOB_CONN, "Bob"],
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

    // Carol は join だけして輪には入らない（`member.add` で「他人を輪へ加える」対象になる）。
    const carolJoined = await handlers.handleCommand(CAROL_CONN, {
      command: "room.join", code: roomCode, displayName: "Carol", hasAiKey: false,
    });
    if (!carolJoined.isOk()) throw new Error("room.join failed: Carol");

    const room = store.get(roomCode)!;
    bobPid = room.participants.find((p) => p.displayName === "Bob")!.participantId;
    carolPid = room.participants.find((p) => p.displayName === "Carol")!.participantId;
    // 開始していないこと（かつて最も権限が厳しかった段階）を前提として確かめる。
    if (room.startedAt != null) throw new Error("開始前を前提にしているが startedAt が立っている");

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

  describe("かつてホスト限定・自己対象限定だったコマンドを、後から参加した人が実行できる", () => {
    // 旧 `permissions-before-start.test.ts` の 2 つの表（ホスト限定 7 件・
    // 他人対象の関係コマンド 3 件）と、旧 `authorize.test.ts` の対象解決 2 件を
    // 1 つに束ねて期待を反転させたもの。`role.set` は S3 でコマンドごと消えたため入らない。
    const cases: Array<[string, () => RoomScopedCommand]> = [
      ["session.abort", () => ({ command: "session.abort" })],
      ["room.passphrase.set", () => ({ command: "room.passphrase.set", passphrase: "ひらけごま2026" })],
      ["member.shuffle", () => ({ command: "member.shuffle" })],
      ["member.move", () => ({ command: "member.move", fromIndex: 0, toIndex: 2 })],
      ["ai.unlock", () => ({ command: "ai.unlock", key: "secret" })],
      ["participant.remove（他人）", () => ({ command: "participant.remove", participantId: bobPid })],
      ["participant.rename（他人）", () => ({ command: "participant.rename", participantId: bobPid, displayName: "Renamed" })],
      ["member.add（他人）", () => ({ command: "member.add", participantId: carolPid })],
      ["member.remove（他人の位置）", () => ({ command: "member.remove", index: 2 })],
      ["driver.skip（他人）", () => ({ command: "driver.skip", participantId: bobPid })],
      ["driver.resume（他人）", () => ({ command: "driver.resume", participantId: bobPid })],
    ];

    for (const [name, build] of cases) {
      it(`後から参加した人が ${name} を実行できる`, async () => {
        // Given（表内の各コマンドを対象にする。差分は cases のエントリそのもの）
        const command = build();
        // When
        const result = await handlers.handleCommand(ALICE_CONN, command);
        // Then（拒否のエラーが 1 件も届かず、処理が成功していること）
        expect(lastError(ALICE_CONN)).toBeUndefined();
        expect(result.isOk()).toBe(true);
      });
    }
  });

  /**
   * `driver.assign` はタイマー稼働中でなければドメイン側が `PhaseConflict` を返すため、
   * この 1 件だけ稼働状態を作ってから確かめる。**その稼働状態を作る操作
   * （`phase.set` / `session.act`）も、後から参加した人が実行する。**
   *
   * @requirements #95
   */
  it("後から参加した人がセッションを開始し、他人をドライバーに指名できる", async () => {
    // Given（後から参加した人自身が開始まで進める）
    const phased = await handlers.handleCommand(ALICE_CONN, { command: "phase.set", phase: "session" });
    if (!phased.isOk()) throw new Error("phase.set に失敗した");
    const started = await handlers.handleCommand(ALICE_CONN, { command: "session.act", action: "START" });
    if (!started.isOk()) throw new Error("session.act(START) に失敗した");
    broadcaster.sent.length = 0;

    // When（他人＝Bob を指名する）
    const result = await handlers.handleCommand(ALICE_CONN, {
      command: "driver.assign",
      participantId: bobPid,
    });

    // Then（拒否されず、現ドライバーが実際に Bob になっている）
    expect(lastError(ALICE_CONN)).toBeUndefined();
    const room = store.get(roomCode)!;
    expect(room.session.rotation[room.session.currentIndex]).toBe(bobPid);
    expect(result.isOk()).toBe(true);
  });

  /**
   * 同格化しても在室確認は残る（可否判定とは別の層）。
   * 旧 `permissions-before-start.test.ts` から引き取った 2 件。
   *
   * @requirements FR-070
   */
  describe("在室していない接続", () => {
    it("在室していない接続の操作は NOT_IN_ROOM で拒否される", async () => {
      // Given
      const command = { command: "driver.assign", participantId: bobPid } as const;

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
