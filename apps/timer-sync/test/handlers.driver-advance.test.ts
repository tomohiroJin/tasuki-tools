/**
 * ドライバー不在の自動繰上（advanceForAbsence）のテスト（v2.2 R2-1）
 * presence の不在タイマーから駆動される前提の交代ロジックを検証する。
 * オフライン参加者を交代対象外（ineligible）に含め、次の online ドライバーへ
 * サーバー権威で繰り上げる。交代先が無ければ現状維持する。
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { SessionConfig, Room } from "@tasuki/timer-core";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

const config: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["A", "B", "C"],
  intervalMinutes: 5,
};

/**
 * room.create でルームを作り、テスト用に rotation / currentIndex / clock.running /
 * 各参加者の presence を上書きして稼働状態の room を store に置く。
 * @param members rotation を構成するメンバー名（config.members と一致させる）
 * @param presenceByName 名前→presence の対応（指定外は online 扱い）
 */
async function setupRunningRoom(
  handlers: ReturnType<typeof makeHandlers>,
  store: InMemoryRoomStore,
  members: string[],
  currentIndex: number,
  presenceByName: Record<string, Room["participants"][number]["presence"]>,
): Promise<string> {
  const create = await handlers.handleCommand("host-conn", {
    command: "room.create",
    displayName: members[0]!,
    config: { ...config, members },
  });
  if (!create.isOk()) throw new Error("create failed");
  // 本番（server.ts）は handleCommand の戻り値を破棄する。値は本番と同じ観測点から取る（FR-100）。
  const code = store.list().at(-1)!.code;

  const room = store.get(code)!;
  // 各メンバーが participant として存在するよう presence を設定する。
  // room.create では host(members[0]) のみ participant なので、
  // rotation 上の名前すべてに対応する participant を組み立てる。
  const host = room.participants[0]!;
  const participants: Room["participants"] = members.map((name, i) => ({
    ...host,
    participantId: `pid-test-${i}`,
    connId: `conn-${i}`,
    displayName: name,
    presence: presenceByName[name] ?? "online",
  }));

  store.put({
    ...room,
    participants,
    session: { ...room.session, rotation: participants.map((p) => p.participantId), currentIndex },
    clock: { ...room.clock, running: true },
  });
  return code;
}

/**
 * @requirements v2.2 R2-1
 */
describe("advanceForAbsence: ドライバー不在の自動繰上", () => {
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

  it("advanceForAbsence はオフラインの現ドライバーを飛ばして次の online へ繰り上げる", async () => {
    // Given
    const code = await setupRunningRoom(handlers, store, ["A", "B", "C"], 0, {
      A: "offline",
      B: "online",
      C: "online",
    });

    // When
    handlers.advanceForAbsence(code);

    // Then
    expect(store.get(code)!.session.currentIndex).toBe(1);
  });

  it("他が全員オフライン/ineligible なら現状維持（no-op）", async () => {
    // Given
    const code = await setupRunningRoom(handlers, store, ["A", "B"], 0, {
      A: "offline",
      B: "offline",
    });

    // When
    handlers.advanceForAbsence(code);

    // Then
    expect(store.get(code)!.session.currentIndex).toBe(0);
  });

  it("オフライン driver は交代対象から外れる（次が offline なら飛ばして現状維持）", async () => {
    // Given
    const code = await setupRunningRoom(handlers, store, ["A", "B"], 0, {
      A: "online",
      B: "offline",
    });

    // When
    handlers.advanceForAbsence(code);

    // Then（B(1) は offline で ineligible のため飛ばされ、交代先が無く現状維持）
    expect(store.get(code)!.session.currentIndex).toBe(0);
  });
});
