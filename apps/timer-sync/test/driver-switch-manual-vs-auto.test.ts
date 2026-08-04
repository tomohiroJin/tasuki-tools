/**
 * B-2 統合の検証: 手動 SWITCH（`session.act SWITCH`）と自動交代（`autoSwitch` が直接
 * 呼ぶ `advanceDriver`）で、交代先と回数の計算が一致することを確認する
 * （v2.7〜v2.10 で「手動と自動で交代の挙動が違う」バグ群が起きた分裂点）。
 *
 * `handleRoomCommand` は `isManualSwitch` 分岐（`decide` の結果を捨てて `advanceDriver`
 * を呼び直すコード）を撤去し、`computeIneligibleIndices` を `decide` へ注入した上で
 * 他コマンドと同じ `evolve` ループに統一した。自動交代（`autoSwitch`、`handlers.ts`
 * 内の非公開関数）は plan.md の方針により従来通り `advanceDriver` を直接呼ぶ。
 * `autoSwitch` の実体は「同じ ineligible 判定で `advanceDriver` を呼ぶ」の1行であるため、
 * ここでは同一の初期状態から (a) `handleCommand("session.act SWITCH")` を実行した結果と
 * (b) `advanceDriver` を直接呼んだ結果を比較し、両者が一致することを確認する。
 *
 * @requirements FR-165, FR-166, SC-057
 */

import { describe, it, expect } from "vitest";
import { advanceDriver } from "@tasuki/timer-core";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { SessionConfig, Room } from "@tasuki/timer-core";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

const config: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["A"],
  intervalMinutes: 5,
};

/** rotation・driverEligible を指定した稼働中ルームを作る。返り値は roomCode。 */
async function setupRunningRoom(
  handlers: ReturnType<typeof makeHandlers>,
  store: InMemoryRoomStore,
  members: { id: string; conn: string; eligible?: boolean }[],
): Promise<string> {
  const create = await handlers.handleCommand("conn-a", {
    command: "room.create",
    displayName: members[0]!.id,
    config,
  });
  if (!create.isOk()) throw new Error("create failed");
  const code = store.list().at(-1)!.code;
  const room = store.get(code)!;
  const host = room.participants[0]!;
  const participants: Room["participants"] = members.map((m, i) => ({
    ...host,
    participantId: i === 0 ? host.participantId : `pid-${m.id}`,
    connId: m.conn,
    displayName: m.id,
    role: "editor",
    presence: "online",
    driverEligible: m.eligible ?? true,
  }));
  store.put({
    ...room,
    participants,
    session: {
      ...room.session,
      rotation: participants.map((p) => p.participantId),
      driverCounts: participants.map(() => 0),
      currentIndex: 0,
    },
    clock: { ...room.clock, running: true },
  });
  return code;
}

/** driverEligible===false の参加者を rotation インデックスへ写した集合（handlers.ts の
 *  computeIneligibleIndices と同じ判定。autoSwitch が使う入力を再現する）。 */
function ineligibleIndicesOf(room: Room): Set<number> {
  return new Set(
    room.participants
      .map((p, i) => (p.driverEligible === false ? i : -1))
      .filter((i) => i >= 0),
  );
}

describe("手動 SWITCH と自動交代（advanceDriver）の一致（B-2統合）", () => {
  it("対象外（一時離脱）が居る輪では、手動交代と自動交代の交代先・回数が一致する", async () => {
    // Given（rotation [A,B,C]・B は一時離脱中。同一状態を手動用/比較用の2ルームに用意する）
    const members = [
      { id: "A", conn: "conn-a" },
      { id: "B", conn: "conn-b", eligible: false },
      { id: "C", conn: "conn-c" },
    ];
    const manualStore = new InMemoryRoomStore();
    const manualClock = new FakeClock(1_000_000);
    const manualHandlers = makeHandlers({
      store: manualStore,
      clock: manualClock,
      broadcaster: new SpyBroadcaster(),
      codeGen: new FakeCodeGen(),
    });
    const manualCode = await setupRunningRoom(manualHandlers, manualStore, members);
    const before = manualStore.get(manualCode)!;

    // When（手動: session.act SWITCH）
    await manualHandlers.handleCommand("conn-a", { command: "session.act", action: "SWITCH" });
    const manualResult = manualStore.get(manualCode)!;

    // 自動交代（autoSwitch）が呼ぶのと同じ入力で advanceDriver を直接評価する
    const autoAgg = advanceDriver(
      { session: before.session, clock: before.clock },
      ineligibleIndicesOf(before),
      manualClock.now(),
    );

    // Then（交代先・担当回数・交代回数が一致する）
    expect(manualResult.session.currentIndex).toBe(autoAgg.session.currentIndex);
    expect(manualResult.session.driverCounts).toEqual(autoAgg.session.driverCounts);
    expect(manualResult.session.totalSwitches).toBe(autoAgg.session.totalSwitches);
    expect(manualResult.session.currentIndex).toBe(2); // B(1) を飛ばして C(2) へ
  });

  it("輪1人（対象外なし）では、手動交代・自動交代のいずれも回数を増やさない（旧B-2反例）", async () => {
    // Given（rotation [A] のみ。decide の nextIndex は自分自身になる）
    const manualStore = new InMemoryRoomStore();
    const manualClock = new FakeClock(1_000_000);
    const manualHandlers = makeHandlers({
      store: manualStore,
      clock: manualClock,
      broadcaster: new SpyBroadcaster(),
      codeGen: new FakeCodeGen(),
    });
    const manualCode = await setupRunningRoom(manualHandlers, manualStore, [
      { id: "A", conn: "conn-a" },
    ]);
    const before = manualStore.get(manualCode)!;

    // When
    await manualHandlers.handleCommand("conn-a", { command: "session.act", action: "SWITCH" });
    const manualResult = manualStore.get(manualCode)!;

    const autoAgg = advanceDriver(
      { session: before.session, clock: before.clock },
      ineligibleIndicesOf(before),
      manualClock.now(),
    );

    // Then（担当回数・交代回数は増えない。手動/自動とも現ドライバーは変わらない）
    expect(manualResult.session.currentIndex).toBe(before.session.currentIndex);
    expect(manualResult.session.driverCounts).toEqual(before.session.driverCounts);
    expect(manualResult.session.totalSwitches).toBe(before.session.totalSwitches);
    expect(manualResult.session.currentIndex).toBe(autoAgg.session.currentIndex);
    expect(manualResult.session.driverCounts).toEqual(autoAgg.session.driverCounts);
    expect(manualResult.session.totalSwitches).toBe(autoAgg.session.totalSwitches);
  });
});
