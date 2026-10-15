/**
 * 名簿の保管（`saveRoster`）が、timer の画面に映る席の情報が変わったときだけ timer へ配ること（#374）。
 *
 * 実 WS の振る舞いは `live-ws.timer-seat-presence.test.ts` が見る。ここは配る・配らないの境界を
 * 1 件ずつ固定する（同じ参照なら snapshot を組まない・二重に配らない・映らない変化では配らない）。
 */
import { describe, expect, it } from "bun:test";
import type { Room as MembershipRoom } from "@tasuki/room-core";
import { INITIAL_BREAK_STATE, type TimerState } from "@tasuki/timer-core";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryTimerStore } from "../src/adapters/in-memory-timer-store.js";
import { saveRoster } from "../src/application/save-roster.js";
import { TOOL_HUB, TOOL_TIMER } from "../src/application/tool-id.js";
import type { TimerStore } from "../src/ports/timer-store.js";
import { spyHub } from "./support/hub.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";

const CODE = "mob-374";

/** A（輪の先頭・timer に在席）と B（輪の 2 番目）。B の接続の宣言だけを変えて使う。 */
function roster(bTool: string | null | undefined): MembershipRoom {
  return {
    code: CODE,
    createdAt: 0,
    participants: [
      { id: "a", displayName: "あや", connections: new Map([["ca", TOOL_TIMER]]), joinedAt: 1 },
      {
        id: "b",
        displayName: "いずみ",
        connections: bTool === undefined ? new Map() : new Map([["cb", bTool]]),
        joinedAt: 2,
      },
    ],
  };
}

const timer: TimerState = {
  code: CODE,
  createdAt: 0,
  config: { intervalMinutes: 5 },
  session: {
    rotation: [
      { kind: "member", participantId: "a", eligible: true },
      { kind: "member", participantId: "b", eligible: true },
    ],
    currentIndex: 0,
    isPaused: false,
    driverCounts: [0, 0],
    totalSwitches: 0,
    previousDriverId: null,
    break: INITIAL_BREAK_STATE,
  },
  clock: {
    running: true,
    intervalSeconds: 300,
    anchorServerTime: 0,
    secondsLeftAtAnchor: 300,
    accumulatedElapsedMs: 0,
    runningSince: 0,
  },
  phase: "session",
  sessionRecords: [],
  handoffNote: "",
};

function setup(before: MembershipRoom) {
  const store = new InMemoryRoomStore();
  store.put(before);
  const timers = new InMemoryTimerStore();
  timers.put(timer);
  const timerBroadcaster = new SpyBroadcaster();
  return { deps: { store, hub: spyHub(), timers, timerBroadcaster }, timerBroadcaster };
}

describe("saveRoster の timer への配信（#374）", () => {
  it("Given B が timer に在席 / When B がハブだけになる / Then 席の理由が変わるので timer へ 1 通配る", () => {
    const { deps, timerBroadcaster } = setup(roster(TOOL_TIMER));
    saveRoster(deps, roster(TOOL_HUB));
    expect(timerBroadcaster.snapshots).toHaveLength(1);
    expect(timerBroadcaster.snapshots[0]?.room.session.seats[1]?.skipReason).toBe("away");
  });

  it("Given B が未接続 / When B がハブで入る / Then 「未接続」が「別の画面」に変わるので配る", () => {
    const { deps, timerBroadcaster } = setup(roster(undefined));
    saveRoster(deps, roster(TOOL_HUB));
    expect(timerBroadcaster.snapshots).toHaveLength(1);
  });

  it("Given B がハブに居る / When 同じ形の名簿を保管し直す / Then 映るものは変わらないので配らない", () => {
    const { deps, timerBroadcaster } = setup(roster(TOOL_HUB));
    saveRoster(deps, roster(TOOL_HUB));
    expect(timerBroadcaster.snapshots).toHaveLength(0);
  });

  it("Given 保管済みの名簿と同じ参照 / When 保管し直す / Then timer の状態を引かずに返す（snapshot を組まない）", () => {
    const { deps, timerBroadcaster } = setup(roster(TOOL_TIMER));
    const same = deps.store.get(CODE)!;
    let reads = 0;
    const inner = deps.timers;
    const counting: TimerStore = {
      get: (code) => (reads++, inner.get(code)),
      put: (state) => inner.put(state),
      remove: (code) => inner.remove(code),
      list: () => inner.list(),
    };
    saveRoster({ ...deps, timers: counting }, same);
    expect(reads).toBe(0);
    expect(timerBroadcaster.snapshots).toHaveLength(0);
  });

  it("Given 呼び出し側が timer の snapshot を自分で配る / When 席の理由が変わる名簿を保管する / Then ここでは配らない（二重に配らない）", () => {
    const { deps, timerBroadcaster } = setup(roster(TOOL_TIMER));
    saveRoster(deps, roster(TOOL_HUB), { timerSnapshotSentByCaller: true });
    expect(timerBroadcaster.snapshots).toHaveLength(0);
  });
});
