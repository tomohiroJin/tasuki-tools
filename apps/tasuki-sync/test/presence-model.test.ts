/**
 * 多接続模型と在席による適格判定（#95 S4b・D14・D21）。
 *
 * ここで固定するのは、**「ハブや別ツールのタブが生きている人」と「タイマーの前に
 * 居る人」を区別する**ことである。設計正本 §6.2 が R14 の検査について
 *
 *   > `online` かつ timer に在席していない事例を必ず置く（`offline` だけで判定して
 *   > いると通ってしまうため）
 *
 * と指定しているのは、この区別が付かない実装でも「切断した人を飛ばす」テストは
 * 緑になるからである。**この 1 本だけが S4a の判定と S4b の判定を分ける。**
 *
 * @requirements R14, R15, R17
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { attachConnection, presenceOf, removeConnection } from "@tasuki/room-core";
import type { Room, SessionConfig } from "@tasuki/timer-core";
import { makeHandlers } from "../src/application/handlers.js";
import { PresenceManager } from "../src/application/presence.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryTimerStore } from "../src/adapters/in-memory-timer-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { makeTestHandlers } from "./support/room-builder.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";
import { putRoomView, roomViewOf } from "./support/room-view.js";

const config: SessionConfig = {
  language: "TypeScript",
  difficulty: "easy",
  members: ["A"],
  intervalMinutes: 5,
};

describe("多接続模型（#95 S4b）", () => {
  let store: InMemoryRoomStore;
  let timers: InMemoryTimerStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    timers = new InMemoryTimerStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeTestHandlers({
      store,
      timers,
      clock: new FakeClock(1_000_000),
      broadcaster,
      codeGen: new FakeCodeGen(),
    });
  });

  /** A（作成者）1 人のルームを作り、コードを返す。 */
  async function createRoom(connId = "conn-a1"): Promise<string> {
    const created = await handlers.handleCommand(connId, {
      command: "room.create",
      displayName: "A",
      config,
    });
    if (!created.isOk()) throw new Error("前提の構築に失敗: room.create");
    return broadcaster.createdFor(connId).code;
  }

  it("同じ人が resumeToken で 2 本目を繋いでも、名簿は 1 人・接続は 2 本になる（R17）", async () => {
    // Given: A が 1 本繋いでいる
    const code = await createRoom();
    const { resumeToken } = broadcaster.createdFor("conn-a1");

    // When: 同じ resumeToken で別の接続から入る（別タブ）
    await handlers.handleCommand("conn-a2", {
      command: "room.join",
      code,
      displayName: "A",
      hasAiKey: false,
      resumeToken,
    });

    // Then: 人は増えず、接続だけが増える
    const membership = store.get(code)!;
    expect(membership.participants).toHaveLength(1);
    expect([...membership.participants[0]!.connections.keys()]).toEqual(["conn-a1", "conn-a2"]);
  });

  it("2 本のうち 1 本が閉じても online のままで、snapshot は配信しない", async () => {
    // Given: A が 2 本繋いでいる
    const code = await createRoom();
    const { resumeToken } = broadcaster.createdFor("conn-a1");
    await handlers.handleCommand("conn-a2", {
      command: "room.join",
      code,
      displayName: "A",
      hasAiKey: false,
      resumeToken,
    });
    const presence = new PresenceManager({
      store,
      timers,
      broadcaster,
      clock: new FakeClock(1_000_000),
    });
    broadcaster.snapshots.length = 0;

    // When: 1 本目を閉じる
    presence.handleDisconnect("conn-a1");

    // Then: online のままで、wire に載る値は 1 つも変わらないので配信もしない
    expect(presenceOf(store.get(code)!.participants[0]!)).toBe("online");
    expect(broadcaster.snapshots).toHaveLength(0);

    // When: 最後の 1 本も閉じる
    presence.handleDisconnect("conn-a2");

    // Then: offline になり、その変化を配信する
    expect(presenceOf(store.get(code)!.participants[0]!)).toBe("offline");
    expect(broadcaster.snapshots).toHaveLength(1);
    expect(broadcaster.latestSnapshot()!.participants[0]!.presence).toBe("offline");
  });
});

describe("ドライバーの適格は在席で決まる（D21）", () => {
  let store: InMemoryRoomStore;
  let timers: InMemoryTimerStore;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    timers = new InMemoryTimerStore();
    handlers = makeTestHandlers({
      store,
      timers,
      clock: new FakeClock(1_000_000),
      broadcaster: new SpyBroadcaster(),
      codeGen: new FakeCodeGen(),
    });
  });

  /**
   * 稼働中の輪 [A, B, C]（currentIndex=0）を置く。3 人とも timer に在席した状態。
   *
   * `putRoomView` は wire の形から名簿を復元するので、**在席の差はここでは作れない**
   * （wire は「どのツールに居るか」を持たない）。差は各テストが名簿を直接更新して作る
   * —— 本番でそれを作るのはハブの接続（S5a）である。
   */
  async function setupRunningTrio(): Promise<string> {
    const created = await handlers.handleCommand("conn-a", {
      command: "room.create",
      displayName: "A",
      config,
    });
    if (!created.isOk()) throw new Error("前提の構築に失敗: room.create");
    const code = store.list().at(-1)!.code;
    const view = roomViewOf(store, timers, code);
    const a = view.participants[0]!;
    const seat = (id: string, name: string, conn: string): Room["participants"][number] => ({
      ...a,
      participantId: id,
      connId: conn,
      displayName: name,
      presence: "online",
      driverEligible: true,
    });
    putRoomView(store, timers, {
      ...view,
      participants: [a, seat("pid-b", "B", "conn-b"), seat("pid-c", "C", "conn-c")],
      session: {
        ...view.session,
        rotation: [a.participantId, "pid-b", "pid-c"],
        driverCounts: [0, 0, 0],
        currentIndex: 0,
      },
      clock: { ...view.clock, running: true },
    });
    return code;
  }

  /** その人の接続を「ハブに 1 本だけ」に差し替える（online だが timer に居ない）。 */
  function moveToHub(code: string, participantId: string, connId: string): void {
    const membership = store.get(code)!;
    const target = membership.participants.find((p) => p.id === participantId)!;
    let next = membership;
    for (const existing of target.connections.keys()) next = removeConnection(next, existing);
    store.put(attachConnection(next, participantId, connId, null));
  }

  it("online だが timer に在席していない人は SWITCH で飛ばされる（R14）", async () => {
    // Given: B は選択画面のタブだけを開いている（presence は online）
    const code = await setupRunningTrio();
    moveToHub(code, "pid-b", "hub-b");
    expect(presenceOf(store.get(code)!.participants[1]!)).toBe("online");

    // When: A が交代する
    await handlers.handleCommand("conn-a", { command: "session.act", action: "SWITCH" });

    // Then: B を飛ばして C（index 2）へ進む
    expect(roomViewOf(store, timers, code).session.currentIndex).toBe(2);
  });

  it("全員 timer に在席していれば従来どおり次へ進む（対照）", async () => {
    // Given
    const code = await setupRunningTrio();

    // When
    await handlers.handleCommand("conn-a", { command: "session.act", action: "SWITCH" });

    // Then
    expect(roomViewOf(store, timers, code).session.currentIndex).toBe(1);
  });

  it("自分以外の全員が timer から離れていたら現ドライバーを維持する（R15）", async () => {
    // Given: B と C は選択画面のタブだけ
    const code = await setupRunningTrio();
    moveToHub(code, "pid-b", "hub-b");
    moveToHub(code, "pid-c", "hub-c");

    // When
    await handlers.handleCommand("conn-a", { command: "session.act", action: "SWITCH" });

    // Then: 対象者が居ないので A のまま（縮退）
    expect(roomViewOf(store, timers, code).session.currentIndex).toBe(0);
  });

  it("代理は在席の概念を持たないので常に対象である", async () => {
    // Given: 輪 [A, 代理] で、A のほかに在席している人は居ない
    const code = await setupRunningTrio();
    const view = roomViewOf(store, timers, code);
    const a = view.participants[0]!;
    putRoomView(store, timers, {
      ...view,
      participants: [
        a,
        {
          ...a,
          participantId: "proxy-1",
          displayName: "P",
          connId: null,
          presence: "offline",
          isPlaceholder: true,
          driverEligible: true,
        },
      ],
      session: {
        ...view.session,
        rotation: [a.participantId, "proxy-1"],
        driverCounts: [0, 0],
        currentIndex: 0,
      },
      clock: { ...view.clock, running: true },
    });

    // When
    await handlers.handleCommand("conn-a", { command: "session.act", action: "SWITCH" });

    // Then: 代理へ回る（Web 非接続が常態なので、在席で外してはならない）
    expect(roomViewOf(store, timers, code).session.currentIndex).toBe(1);
  });

  it("一時離脱（driverEligible=false）の席は在席していても対象外である", async () => {
    // Given: B は timer に在席しているが一時離脱中
    const code = await setupRunningTrio();
    const view = roomViewOf(store, timers, code);
    putRoomView(store, timers, {
      ...view,
      participants: view.participants.map((p) =>
        p.participantId === "pid-b" ? { ...p, driverEligible: false } : p,
      ),
    });

    // When
    await handlers.handleCommand("conn-a", { command: "session.act", action: "SWITCH" });

    // Then
    expect(roomViewOf(store, timers, code).session.currentIndex).toBe(2);
  });
});
