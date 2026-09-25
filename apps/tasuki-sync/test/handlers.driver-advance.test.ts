/**
 * ドライバー不在の自動繰上（advanceForAbsence）のテスト（v2.2 R2-1）
 * presence の不在タイマーから駆動される前提の交代ロジックを検証する。
 * オフライン参加者を交代対象外（ineligible）に含め、次の online ドライバーへ
 * サーバー権威で繰り上げる。交代先が無ければ現状維持する。
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { makeHandlers } from "../src/application/handlers.js";
import { makeTestHandlers } from "./support/room-builder.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryTimerStore } from "../src/adapters/in-memory-timer-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { SessionConfig, Room } from "@tasuki/timer-core";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { roomViewOf, putRoomView } from "./support/room-view.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

const config: SessionConfig = {
  intervalMinutes: 5,
};

/**
 * room.create でルームを作り、テスト用に rotation / currentIndex / clock.running /
 * 各参加者の presence を上書きして稼働状態の room を store に置く。
 * @param members rotation を構成するメンバー名（席の表示名と一致させる）
 * @param presenceByName 名前→presence の対応（指定外は online 扱い）
 */
async function setupRunningRoom(
  handlers: ReturnType<typeof makeHandlers>,
  store: InMemoryRoomStore,
  timers: InMemoryTimerStore,
  members: string[],
  currentIndex: number,
  presenceByName: Record<string, Room["participants"][number]["presence"]>,
): Promise<string> {
  const create = await handlers.handleCommand("host-conn", {
    command: "room.create",
    displayName: members[0]!,
    config,
  });
  if (!create.isOk()) throw new Error("create failed");
  // 本番（server.ts）は handleCommand の戻り値を破棄する。値は本番と同じ観測点から取る（FR-100）。
  const code = store.list().at(-1)!.code;

  const room = roomViewOf(store, timers, code);
  // 各メンバーが participant として存在するよう presence を設定する。
  // room.create では host(members[0]) のみ participant なので、
  // rotation 上の名前すべてに対応する participant を組み立てる。
  const host = room.participants[0]!;
  const participants: Room["participants"] = members.map((name, i) => ({
    ...host,
    participantId: `pid-test-${i}`,
    displayName: name,
    presence: presenceByName[name] ?? "online",
  }));

  // 接続 ID は wire に載らなくなった（#95 S4b）。オフラインの人には接続を持たせない
  // （`putRoomView` が presence から決める）ので、ここでは綴りだけを指定する。
  const connIds = Object.fromEntries(
    participants.map((p, i) => [p.participantId, [`conn-${i}`]]),
  );
  putRoomView(store, timers, {
    ...room,
    participants,
    session: { ...room.session, rotation: participants.map((p) => p.participantId), currentIndex },
    clock: { ...room.clock, running: true },
  }, connIds);
  return code;
}

/**
 * @requirements v2.2 R2-1
 */
describe("advanceForAbsence: ドライバー不在の自動繰上", () => {
  let store: InMemoryRoomStore;
  let timers: InMemoryTimerStore;
  let clock: FakeClock;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    timers = new InMemoryTimerStore();
    clock = new FakeClock(1000000);
    broadcaster = new SpyBroadcaster();
    handlers = makeTestHandlers({ store, timers, clock, broadcaster, codeGen: new FakeCodeGen() });
  });

  it("advanceForAbsence はオフラインの現ドライバーを飛ばして次の online へ繰り上げる", async () => {
    // Given
    const code = await setupRunningRoom(handlers, store, timers, ["A", "B", "C"], 0, {
      A: "offline",
      B: "online",
      C: "online",
    });

    // When
    handlers.advanceForAbsence(code);

    // Then
    expect(roomViewOf(store, timers, code).session.currentIndex).toBe(1);
  });

  it("他が全員オフライン/ineligible なら現状維持（no-op）", async () => {
    // Given
    const code = await setupRunningRoom(handlers, store, timers, ["A", "B"], 0, {
      A: "offline",
      B: "offline",
    });

    // When
    handlers.advanceForAbsence(code);

    // Then
    const after = roomViewOf(store, timers, code);
    expect(after.session.currentIndex).toBe(0);
    // 全席不適格は nextIndex を null へ縮退させる唯一の関門（D6・レビュー指摘2）。
    // ここを外すと ineligible.size === seats.length の比較が壊れても誰も気づかない。
    expect(after.session.nextIndex).toBeNull();
  });

  it("オフライン driver は交代対象から外れる（次が offline なら飛ばして現状維持）", async () => {
    // Given
    const code = await setupRunningRoom(handlers, store, timers, ["A", "B"], 0, {
      A: "online",
      B: "offline",
    });

    // When
    handlers.advanceForAbsence(code);

    // Then（B(1) は offline で ineligible のため飛ばされ、交代先が無く現状維持）
    expect(roomViewOf(store, timers, code).session.currentIndex).toBe(0);
  });

  // computeIneligibleIndices と seats[].skipReason は同じ関数（seatSkipReason）から
  // 出るので、両者が一致するというテストは恒真になる（#276 Step 6）。ここは判定を
  // 直接呼ばず、SWITCH コマンドで実際に交代を起こし、飛ばされた結果を見る。
  /**
   * @requirements #276 E1, E2
   */
  it("切断した席は交代で飛ばされ、seats に理由が載り、nextIndex がその先を指す", async () => {
    // Given: 輪は A(現・在席) → B(切断) → C(在席)。B には接続を持たせない。
    const code = await setupRunningRoom(handlers, store, timers, ["A", "B", "C"], 0, {
      A: "online",
      B: "offline",
      C: "online",
    });

    // 交代前に nextIndex の判定力を確かめる（レビュー指摘1）。currentIndex=0・ineligible={1}・
    // len=3 のこの局面は、正しい nextEligibleIndex は 2（Bを飛ばす）を返すが、wire.ts が
    // 「使ってはならない」と書く素朴な (currentIndex+1)%len は 1 を返す —— 両者が分岐する
    // 局面でしか、この関門が本物の判定を持っているかは確かめられない。交代後（currentIndex=2）
    // まで待つと ineligible={1} の効果が (2+1)%3=0 という「たまたま同じ答え」に隠れてしまう。
    expect(roomViewOf(store, timers, code).session.nextIndex).toBe(2); // 素朴な (cur+1)%len なら 1 になるはず

    // When（交代を実際に起こす。判定を直接呼ばない）
    await handlers.handleCommand("conn-0", { command: "session.act", action: "SWITCH" });

    // Then
    const after = roomViewOf(store, timers, code);
    expect(after.session.currentIndex).toBe(2); // Bを飛ばした
    expect(after.session.seats[1]!.skipReason).toBe("disconnected"); // 理由が載っている
    expect(after.session.nextIndex).toBe(0); // 次はAへ戻る
  });
});
