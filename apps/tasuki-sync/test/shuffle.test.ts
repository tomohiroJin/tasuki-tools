/**
 * member.shuffle（モブ順のランダム化・サーバー権威）の sync テスト
 * サーバーが順列を生成し、稼働中は現ドライバー位置を固定する。在室者なら誰でも実行できる。
 */

import { describe, it, expect, beforeEach, jest, afterEach } from "bun:test";
import { makeHandlers } from "../src/application/handlers.js";
import { makeTestHandlers } from "./support/room-builder.js";
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

const HOST_CONN = "host-conn";

/**
 * 作成者(=members[0]) が居る稼働/非稼働ルームを作る。
 * rotation/currentIndex/driverCounts/clock.running を上書きして store に置く。
 */
async function setupRoom(
  handlers: ReturnType<typeof makeHandlers>,
  store: InMemoryRoomStore,
  members: string[],
  currentIndex: number,
  running: boolean,
): Promise<string> {
  const create = await handlers.handleCommand(HOST_CONN, {
    command: "room.create",
    displayName: members[0]!,
    config: { ...config, members },
  });
  if (!create.isOk()) throw new Error("create failed");
  // 本番（server.ts）は handleCommand の戻り値を破棄する。値は本番と同じ観測点から取る（FR-100）。
  const code = store.list().at(-1)!.code;

  const room = store.get(code)!;
  const creator = room.participants[0]!; // connId: HOST_CONN（ルームを作った接続）
  // rotation 上の各名に participant を割り当てる。先頭は作成者（HOST_CONN）を維持する。
  const participants: Room["participants"] = members.map((name, i) =>
    i === 0
      ? { ...creator, displayName: name }
      : {
          ...creator,
          participantId: `pid-m-${i}`,
          connId: `conn-${i}`,
          displayName: name,
        },
  );

  store.put({
    ...room,
    participants,
    session: {
      ...room.session,
      // rotation は参加者IDの配列（D6b）
      rotation: participants.map((p) => p.participantId),
      currentIndex,
      driverCounts: members.map((_, i) => i + 1), // [1,2,3]
    },
    clock: { ...room.clock, running },
  });
  return code;
}

/** rotation（参加者IDの配列・D6b）を表示名へ写す。検証の意図は「並び」なので名前で見る。 */
function rotationNames(room: Room | undefined): string[] {
  if (!room) return [];
  return room.session.rotation.map(
    (id) => room.participants.find((p) => p.participantId === id)?.displayName ?? "",
  );
}

/**
 * @requirements v2.3 #1
 */
describe("member.shuffle（サーバー権威のランダム化）", () => {
  let store: InMemoryRoomStore;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    store = new InMemoryRoomStore();
    broadcaster = new SpyBroadcaster();
    handlers = makeTestHandlers({
      store,
      clock: new FakeClock(1_000_000),
      broadcaster,
      codeGen: new FakeCodeGen(),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("非稼働中: member.shuffle が ok で rotation が並べ替わる（Math.random 固定で決定的）", async () => {
    // Given（Fisher–Yates で呼ばれる random を固定する。i=2: Math.floor(r*3)、i=1: Math.floor(r*2)。
    // r=0 を返すと i=2 で j=0（[C,B,A]）、i=1 で j=0（[B,C,A]）になる）
    await setupRoom(handlers, store, ["A", "B", "C"], 0, false);
    jest.spyOn(Math, "random").mockReturnValue(0);

    // When
    const result = await handlers.handleCommand(HOST_CONN, { command: "member.shuffle" });

    // Then
    result._unsafeUnwrap();
    const room = broadcaster.latestSnapshot();
    expect(rotationNames(room)).toEqual(["B", "C", "A"]);
    // driverCounts も順列に追従する（元 [1,2,3] が order=[1,2,0] で並ぶ）。
    expect(room?.session.driverCounts).toEqual([2, 3, 1]);
    // config.members も rotation にミラーされる。
    expect(room?.config.members).toEqual(["B", "C", "A"]);
  });

  it("稼働中: 現ドライバーの位置が固定され、その名前が currentIndex で不変", async () => {
    // Given（currentIndex=1＝"B" を稼働中にシャッフル。B の位置＝index 1 は固定される。
    // others=[0,2] をシャッフル。i=1: Math.floor(r*2)。r=0 で j=0＝入れ替えなし→[0,2]）
    await setupRoom(handlers, store, ["A", "B", "C"], 1, true);
    jest.spyOn(Math, "random").mockReturnValue(0);

    // When
    const result = await handlers.handleCommand(HOST_CONN, { command: "member.shuffle" });

    // Then（currentIndex は 1 のまま、その名前は "B" のまま＝現ドライバー現役）
    result._unsafeUnwrap();
    const room = broadcaster.latestSnapshot();
    expect(room?.session.currentIndex).toBe(1);
    expect(rotationNames(room)[1]).toBe("B");
  });

  it("稼働中: 現ドライバー名は順列の中身に関わらず保持される", async () => {
    // Given（others=[0,1] を i=1: r=0.99→Math.floor(0.99*2)=1 で入れ替え→[1,0]）
    await setupRoom(handlers, store, ["A", "B", "C"], 2, true);
    jest.spyOn(Math, "random").mockReturnValue(0.99);

    // When
    await handlers.handleCommand(HOST_CONN, { command: "member.shuffle" });

    // Then（現ドライバー "C" は index 2 に固定）
    const room = broadcaster.latestSnapshot();
    expect(rotationNames(room)[2]).toBe("C");
    expect(room?.session.currentIndex).toBe(2);
  });

  // #95 S3 以前は「作成者以外の member.shuffle は UNAUTHORIZED で拒否される」だった。
  // 役割の廃止で在室者なら誰でも並べ替えられるため、期待を反転させる。
  it("作成者以外の参加者も member.shuffle を実行でき、rotation が並べ替わる", async () => {
    // Given（Math.random を固定して並びを決定的にする。上の非稼働中ケースと同じ順列）
    await setupRoom(handlers, store, ["A", "B", "C"], 0, false);
    jest.spyOn(Math, "random").mockReturnValue(0);

    // When（conn-1 は作成者ではない "B"）
    const result = await handlers.handleCommand("conn-1", { command: "member.shuffle" });

    // Then
    result._unsafeUnwrap();
    expect(broadcaster.errorsTo("conn-1")).toEqual([]);
    expect(rotationNames(broadcaster.latestSnapshot())).toEqual(["B", "C", "A"]);
  });
});
