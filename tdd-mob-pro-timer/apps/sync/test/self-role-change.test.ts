/**
 * 自分の役割を自分で変更する（host-spof-relaxation G3・T021）
 *
 * 開始後は「見学に回る／進行に戻る」を本人が切り替えられる（FR-073b・plan.md D3b）。
 * これは「オフラインの編集者だけが一覧に残り、オンラインは見学者のみ」という
 * 不変条件では塞げない詰みを、presence に依存せずに塞ぐための経路である。
 *
 * あわせて、降格が「実在の編集者以上が1名以上残る」不変条件を破らないことを検査する
 * （FR-072/073）。権限（誰が実行できるか）と不変条件（結果の状態が妥当か）は別物なので、
 * checkPermission が許可した後に canDemote を別途検査する（plan.md D3）。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { Room, SessionConfig } from "@tdd-mob/core";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

const config: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["Alice", "Bob", "Carol"],
  intervalMinutes: 5,
};

const HOST = "sr-host";
const BOB = "sr-bob";
const CAROL = "sr-carol";

/**
 * @requirements FR-072, FR-073, FR-073b, US5
 */
describe("role.set: 自分の役割の変更", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  let code: string;

  const pidOf = (name: string): string =>
    store.get(code)!.participants.find((p) => p.displayName === name)!.participantId;

  const roleOf = (name: string): string =>
    store.get(code)!.participants.find((p) => p.displayName === name)!.role;

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
    code = created.value.code;
    await handlers.handleCommand(BOB, { command: "room.join", code, displayName: "Bob", hasAiKey: false });
    await handlers.handleCommand(CAROL, { command: "room.join", code, displayName: "Carol", hasAiKey: false });
    broadcaster.sent.length = 0;
  });

  async function start(): Promise<void> {
    await handlers.handleCommand(HOST, { command: "phase.set", phase: "session" });
    broadcaster.sent.length = 0;
  }

  it("① 開始後は見学者が自分を編集者に戻せる（詰みの自己解消）", async () => {
    // Given
    await handlers.handleCommand(HOST, { command: "role.set", participantId: pidOf("Carol"), role: "viewer" });
    await start();
    expect(roleOf("Carol")).toBe("viewer");

    // When
    const result = await handlers.handleCommand(CAROL, {
      command: "role.set", participantId: pidOf("Carol"), role: "editor",
    });

    // Then
    expect(result.isOk()).toBe(true);
    expect(roleOf("Carol")).toBe("editor");
  });

  it("② 開始後は編集者が自分を見学者にできる（進行から降りる）", async () => {
    // Given
    await start();

    // When
    const result = await handlers.handleCommand(BOB, {
      command: "role.set", participantId: pidOf("Bob"), role: "viewer",
    });

    // Then
    expect(result.isOk()).toBe(true);
    expect(roleOf("Bob")).toBe("viewer");
  });

  it("③ 開始前は自分の役割を変更できない（従来どおりホストのみ）", async () => {
    // When
    const result = await handlers.handleCommand(BOB, {
      command: "role.set", participantId: pidOf("Bob"), role: "viewer",
    });

    // Then
    expect(result.isErr()).toBe(true);
    expect(lastError(BOB)?.code).toBe("UNAUTHORIZED");
    expect(roleOf("Bob")).toBe("editor");
  });

  it("④ ホスト自身の自己降格は CANNOT_CHANGE_HOST で拒否される（移譲は別経路）", async () => {
    // Given
    await start();

    // When
    const result = await handlers.handleCommand(HOST, {
      command: "role.set", participantId: pidOf("Alice"), role: "viewer",
    });

    // Then
    expect(result.isErr()).toBe(true);
    expect(lastError(HOST)?.code).toBe("CANNOT_CHANGE_HOST");
    expect(roleOf("Alice")).toBe("host");
  });

  it("⑤ 実在の編集者以上が1名だけのとき、その1名の自己降格は拒否される", async () => {
    // Given（ホストは常に「編集者以上」に数えられるため、ホストが在室する限りこの状態には
    // コマンド経路から到達できない＝到達しようとすると④の CANNOT_CHANGE_HOST が先に効く。
    // 不変条件のガードが権限とは独立に効くことを固定するため、状態を直接組んで検証する）
    await start();
    const seeded = store.get(code)!;
    const bobId = pidOf("Bob");
    const room: Room = {
      ...seeded,
      // ホスト不在（hostParticipantId は誰も指さない）で、実在の編集者は Bob だけ。
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
    expect(lastError(BOB)?.code).toBe("LAST_MANAGER");
    expect(store.get(code)!.participants.find((p) => p.participantId === bobId)!.role).toBe("editor");
  });

  it("⑥ 最後の編集者による同値代入（editor→editor）は拒否されない（過剰拒否の防止）", async () => {
    // Given（⑤ と同じ「実在の編集者は Bob だけ」の状態を作る。
    // canDemote を cmd.role で絞らず全ての role.set に適用すると、対象が編集者以上である
    // 限り「自分を降ろしたのと同じ」と判定され、この no-op まで LAST_MANAGER で拒否される。
    // ⑤ が緑でもこの過剰拒否は起こりうるので、対の回帰テストとして固定する）
    await start();
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

    // When（Bob が自分に editor を代入する）
    const result = await handlers.handleCommand(BOB, {
      command: "role.set", participantId: bobId, role: "editor",
    });

    // Then
    expect(result.isOk()).toBe(true);
    expect(store.get(code)!.participants.find((p) => p.participantId === bobId)!.role).toBe("editor");
  });
});
