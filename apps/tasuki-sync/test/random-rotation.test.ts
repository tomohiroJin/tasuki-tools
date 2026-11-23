/**
 * ランダム交代のモード（#660）を、同期サーバーの入口（コマンド・時間切れ・在席の変化）から見る。
 *
 * - **予告と実際の交代先が同じ人**であること。予告は snapshot の `session.nextIndex`（画面の「次: 〈名前〉」）で、
 *   全員が同じ snapshot を受け取る。交代は手動の SWITCH・時間切れ（`advanceForAbsence` と同じ `autoSwitch`）・
 *   運転者の一時離脱の繰り上げ・運転者の退出の 4 つの経路で見る
 * - **乱数を引くのはサーバーだけ**で、輪の順のモードでは 1 回も引かないこと
 *
 * 抽選そのもの（袋の規則）は `packages/timer-core/test/random-rotation.test.ts` が見る。
 */

import { describe, it, expect } from "bun:test";
import type { Room } from "@tasuki/timer-core";
import { makeTestHandlers, type TestHandlers } from "./support/room-builder.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryTimerStore } from "../src/adapters/in-memory-timer-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { participantIdOfConn, roomViewOf } from "./support/room-view.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";
import { drawSeatOrder, randomOrderFor } from "../src/application/room-commands/shuffle-order.js";

/** 種から決まる乱数（線形合同法）。引いた回数を数える。テストごとに同じ列になる。 */
function seededRandom(seed: number) {
  let state = seed >>> 0;
  let calls = 0;
  return {
    randomInt(n: number): number {
      calls++;
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state % n;
    },
    get calls() {
      return calls;
    },
  };
}

interface Fixture {
  handlers: TestHandlers;
  store: InMemoryRoomStore;
  timers: InMemoryTimerStore;
  random: ReturnType<typeof seededRandom>;
  code: string;
  /** 席の順の接続 ID（`conn-0` が作成者） */
  conns: string[];
  view(): Room;
}

/** `names` の人が順に入り、全員が輪に並んだロビーのルームを作る（本番と同じコマンドで組む）。 */
async function lobbyOf(names: string[], options: { seed?: number; random?: boolean } = {}): Promise<Fixture> {
  const store = new InMemoryRoomStore();
  const timers = new InMemoryTimerStore();
  const random = seededRandom(options.seed ?? 1);
  const handlers = makeTestHandlers({
    store,
    timers,
    clock: new FakeClock(1_000_000),
    broadcaster: new SpyBroadcaster(),
    codeGen: new FakeCodeGen(),
    random,
  });
  const conns = names.map((_, i) => `conn-${i}`);
  const created = await handlers.handleCommand(conns[0]!, {
    command: "room.create",
    displayName: names[0]!,
    config: { intervalMinutes: 5, ...(options.random === true && { rotationMode: "random" as const }) },
  });
  if (!created.isOk()) throw new Error("lobbyOf(): room.create に失敗した");
  const code = store.list().at(-1)!.code;
  for (let i = 1; i < names.length; i++) {
    const joined = await handlers.handleCommand(conns[i]!, { command: "room.join", code, displayName: names[i]! });
    if (!joined.isOk()) throw new Error(`lobbyOf(): ${names[i]} の room.join に失敗した`);
    const added = await handlers.handleCommand(conns[i]!, {
      command: "member.add",
      participantId: participantIdOfConn(store, conns[i]!),
    });
    if (!added.isOk()) throw new Error(`lobbyOf(): ${names[i]} の member.add に失敗した`);
  }
  return { handlers, store, timers, random, code, conns, view: () => roomViewOf(store, timers, code) };
}

async function send(f: Fixture, conn: string, cmd: Parameters<TestHandlers["handleCommand"]>[1]): Promise<void> {
  const result = await f.handlers.handleCommand(conn, cmd);
  if (!result.isOk()) throw new Error(`send(): ${cmd.command} が ${result.error} で断られた`);
}

/** 画面と同じ順でセッションを始める（`phase.set` → `START`。timer-web の `timer-actions.ts` の `startSession`）。 */
async function start(f: Fixture): Promise<void> {
  await send(f, "conn-0", { command: "phase.set", phase: "session" });
  await send(f, "conn-0", { command: "session.act", action: "START" });
}

/** 画面が「次: 〈名前〉」に出す人（snapshot の `nextIndex` の席）。居なければ null。 */
function forecast(room: Room): string | null {
  return room.session.nextIndex === null ? null : room.session.seats[room.session.nextIndex]!.displayName;
}

function driver(room: Room): string {
  return room.session.seats[room.session.currentIndex]!.displayName;
}

const NAMES = ["あや", "いお", "うた", "えま"];

describe("ランダム交代: モードの切り替え", () => {
  it("Given ロビー / When ランダムを選ぶ / Then 設定に載り、サーバーが引く順を作る（全席の並べ替え）", async () => {
    const f = await lobbyOf(NAMES);

    await send(f, "conn-1", { command: "config.set", config: { rotationMode: "random" } });

    expect(f.view().config.rotationMode).toBe("random");
    const seatIds = f.view().session.seats.map((s) => s.id);
    const random = f.timers.get(f.code)!.session.randomRotation!;
    expect([...random.order].sort()).toEqual([...seatIds].sort());
    expect(random.drove).toEqual([seatIds[0]!]);
    expect(f.random.calls).toBeGreaterThan(0);
  });

  it("Given ランダム交代のルーム / When ロビーで輪の順に戻して開始 / Then 輪の順で回る", async () => {
    const f = await lobbyOf(NAMES, { random: true });

    await send(f, "conn-2", { command: "config.set", config: { rotationMode: "order" } });
    await start(f);

    expect(f.view().config.rotationMode).toBe("order");
    expect(f.timers.get(f.code)!.session.randomRotation).toBeNull();
    expect(forecast(f.view())).toBe("いお");
    await send(f, "conn-0", { command: "session.act", action: "SWITCH" });
    expect(driver(f.view())).toBe("いお");
    await send(f, "conn-0", { command: "session.act", action: "SWITCH" });
    expect(driver(f.view())).toBe("うた");
    expect(f.random.calls).toBe(0);
  });

  it("Given セッション中 / When モードを変える / Then ほかの設定と同じく断る（設定はロビーで変える）", async () => {
    const f = await lobbyOf(NAMES, { random: true });
    await start(f);

    const result = await f.handlers.handleCommand("conn-1", { command: "config.set", config: { rotationMode: "order" } });

    expect(result.isErr() && result.error).toBe("CONFIG_LOCKED_IN_SESSION");
    expect(f.view().config.rotationMode).toBe("random");
    expect(f.timers.get(f.code)!.session.randomRotation).not.toBeNull();
  });

  it("Given 1 回目を終えてロビーへ戻り、人が入った / When 2 回目を始める（リセット） / Then 入った人を含む引く順を作り直す", async () => {
    const f = await lobbyOf(["あや", "いお", "うた"], { random: true });
    await start(f);
    await send(f, "conn-0", { command: "session.act", action: "SWITCH" });
    await send(f, "conn-0", { command: "session.complete" });
    await send(f, "conn-0", { command: "phase.set", phase: "ready" });
    // ロビーで 4 人目が入る
    await send(f, "conn-new", { command: "room.join", code: f.code, displayName: "えま" });
    await send(f, "conn-new", { command: "member.add", participantId: participantIdOfConn(f.store, "conn-new") });

    // 画面は、時計が進んだ集約の開始をリセットで送る
    await send(f, "conn-0", { command: "phase.set", phase: "session" });
    await send(f, "conn-0", { command: "session.reset" });

    const seatIds = f.view().session.seats.map((s) => s.id);
    const random = f.timers.get(f.code)!.session.randomRotation!;
    expect([...random.order].sort()).toEqual([...seatIds].sort());
    expect(random.drove).toEqual([seatIds[0]!]);
  });

  it("Given 輪の順のモード / When 開始・交代・時間切れ / Then 乱数を 1 回も引かない", async () => {
    const f = await lobbyOf(NAMES);

    await start(f);
    await send(f, "conn-0", { command: "session.act", action: "SWITCH" });
    f.handlers.advanceForAbsence(f.code);
    await send(f, "conn-2", { command: "driver.skip", participantId: participantIdOfConn(f.store, "conn-2") });

    expect(driver(f.view())).toBe("えま");
    expect(f.random.calls).toBe(0);
  });

  it("Given 作成のときにランダムを選んだルーム / When あとから人が入って開始 / Then 開始で全員を含む引く順を作る", async () => {
    const f = await lobbyOf(NAMES, { random: true });
    // 作成の時点では乱数を引かない（引く順は空）
    expect(f.timers.get(f.code)!.session.randomRotation).toEqual({ order: [], drove: [f.view().session.seats[0]!.id] });
    expect(f.random.calls).toBe(0);

    await start(f);

    const seatIds = f.view().session.seats.map((s) => s.id);
    expect([...f.timers.get(f.code)!.session.randomRotation!.order].sort()).toEqual([...seatIds].sort());
  });
});

describe("ランダム交代: 予告と実際の交代先", () => {
  it.each([1, 2, 3, 4, 5])("手動の交代と時間切れを混ぜても、予告した人へ替わる（種 %i）", async (seed) => {
    const f = await lobbyOf(NAMES, { seed, random: true });
    await start(f);
    const drivers = [driver(f.view())];

    for (let n = 0; n < 24; n++) {
      const expected = forecast(f.view());
      // 偶数回は手動の SWITCH、奇数回は時間切れ（autoSwitch）
      if (n % 2 === 0) await send(f, `conn-${n % 4}`, { command: "session.act", action: "SWITCH" });
      else f.handlers.advanceForAbsence(f.code);
      expect(expected).not.toBeNull();
      expect(driver(f.view())).toBe(expected!);
      drivers.push(driver(f.view()));
    }

    // 同じ人が続かない
    drivers.forEach((name, i) => {
      if (i > 0) expect(name).not.toBe(drivers[i - 1]!);
    });
    // 開始の運転者から 4 人ごとに区切った 1 周は、全員が 1 回ずつ
    for (let round = 0; (round + 1) * 4 <= drivers.length; round++) {
      expect(drivers.slice(round * 4, (round + 1) * 4).sort()).toEqual([...NAMES].sort());
    }
    // 交代のたびに引く順を作り直している（順が毎回同じなら、周ごとの並びも同じになる）
    const rounds = [drivers.slice(4, 8).join(), drivers.slice(8, 12).join(), drivers.slice(12, 16).join(), drivers.slice(16, 20).join()];
    expect(new Set(rounds).size).toBeGreaterThan(1);
  });

  it("交代のあとのナビゲーター（直前に運転した人）は、交代前の運転者", async () => {
    const f = await lobbyOf(NAMES, { random: true });
    await start(f);
    const before = driver(f.view());

    await send(f, "conn-0", { command: "session.act", action: "SWITCH" });

    const room = f.view();
    expect(room.session.seats[room.session.previousDriverIndex!]!.displayName).toBe(before);
  });

  it("Given 予告した人が一時離脱した / Then 予告は別の人へ移り、交代もその人へ替わる。戻ればこの周のうちに番が回る", async () => {
    const f = await lobbyOf(NAMES, { random: true });
    await start(f);
    const first = forecast(f.view())!;
    const firstConn = f.conns[NAMES.indexOf(first)]!;
    const firstId = participantIdOfConn(f.store, firstConn);

    await send(f, firstConn, { command: "driver.skip", participantId: firstId });

    const second = forecast(f.view());
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    await send(f, "conn-0", { command: "session.act", action: "SWITCH" });
    expect(driver(f.view())).toBe(second!);

    // 戻った人は、まだ運転していないので、残りの 2 回の交代のどちらかで運転する
    await send(f, firstConn, { command: "driver.resume", participantId: firstId });
    const rest: string[] = [];
    for (let n = 0; n < 2; n++) {
      await send(f, "conn-0", { command: "session.act", action: "SWITCH" });
      rest.push(driver(f.view()));
    }
    expect(rest).toContain(first);
  });

  it("Given 予告した人の接続が切れた / Then 予告は別の人へ移り、時間切れの交代もその人へ替わる", async () => {
    const f = await lobbyOf(NAMES, { random: true });
    await start(f);
    const first = forecast(f.view())!;

    f.handlers.handleDisconnect(f.conns[NAMES.indexOf(first)]!);

    const second = forecast(f.view());
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    f.handlers.advanceForAbsence(f.code);
    expect(driver(f.view())).toBe(second!);
  });

  it("Given 運転者が一時離脱した（繰り上げ） / Then 予告した人が運転者になる", async () => {
    const f = await lobbyOf(NAMES, { random: true });
    await start(f);
    const expected = forecast(f.view())!;
    const calls = f.random.calls;

    await send(f, "conn-0", { command: "driver.skip", participantId: participantIdOfConn(f.store, "conn-0") });

    expect(driver(f.view())).toBe(expected);
    // 繰り上げでも引く順を作り直す
    expect(f.random.calls).toBeGreaterThan(calls);
  });

  it("Given 運転者が退出した / Then 予告した人が運転者になる", async () => {
    const f = await lobbyOf(NAMES, { random: true });
    await start(f);
    const expected = forecast(f.view())!;

    await send(f, "conn-0", { command: "participant.remove", participantId: participantIdOfConn(f.store, "conn-0") });

    expect(driver(f.view())).toBe(expected);
  });

  it("Given ほかの全員が一時離脱 / Then 予告は出さず（null）、交代しても運転者は変わらない", async () => {
    const f = await lobbyOf(NAMES, { random: true });
    await start(f);
    for (const conn of ["conn-1", "conn-2", "conn-3"]) {
      await send(f, conn, { command: "driver.skip", participantId: participantIdOfConn(f.store, conn) });
    }

    expect(f.view().session.nextIndex).toBeNull();
    await send(f, "conn-0", { command: "session.act", action: "SWITCH" });
    expect(driver(f.view())).toBe("あや");
  });
});

describe("ランダム交代の間の、指名・並べ替え・一時離脱", () => {
  it("指名（driver.assign）は通り、指名した人が運転者になる", async () => {
    const f = await lobbyOf(NAMES, { random: true });
    await start(f);

    await send(f, "conn-1", { command: "driver.assign", participantId: participantIdOfConn(f.store, "conn-3") });

    expect(driver(f.view())).toBe("えま");
    // 指名された人は、次の予告にならない（この周で運転した）
    expect(forecast(f.view())).not.toBe("えま");
  });

  it("並べ替え（member.shuffle）は通り、予告した人は変わらない", async () => {
    const f = await lobbyOf(NAMES, { random: true });
    await start(f);
    const expected = forecast(f.view());

    await send(f, "conn-2", { command: "member.shuffle" });

    expect(forecast(f.view())).toBe(expected);
    await send(f, "conn-0", { command: "session.act", action: "SWITCH" });
    expect(driver(f.view())).toBe(expected!);
  });

  it("一時離脱した人には番が回らない", async () => {
    const f = await lobbyOf(NAMES, { random: true });
    await start(f);
    await send(f, "conn-2", { command: "driver.skip", participantId: participantIdOfConn(f.store, "conn-2") });

    const drivers: string[] = [];
    for (let n = 0; n < 9; n++) {
      await send(f, "conn-0", { command: "session.act", action: "SWITCH" });
      drivers.push(driver(f.view()));
    }

    expect(drivers).not.toContain("うた");
  });
});

describe("引く順を作る順列（shuffle-order.ts）", () => {
  it("drawSeatOrder は 0..len-1 の並べ替えを返す", () => {
    const random = seededRandom(7);
    for (let n = 0; n < 50; n++) {
      expect([...drawSeatOrder(6, random.randomInt)].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    }
    expect(drawSeatOrder(0, random.randomInt)).toEqual([]);
  });

  it("randomOrderFor は、ランダム交代なら席の数の並べ替えを返す", () => {
    const random = seededRandom(7);
    const session = { rotation: ["a", "b", "c"], randomRotation: { order: [], drove: [] } };

    expect([...randomOrderFor(session, random.randomInt)!].sort()).toEqual([0, 1, 2]);
  });

  it("randomOrderFor は、輪の順のモードなら undefined を返し、乱数を引かない", () => {
    const random = seededRandom(7);

    expect(randomOrderFor({ rotation: ["a", "b", "c"], randomRotation: null }, random.randomInt)).toBeUndefined();
    expect(random.calls).toBe(0);
  });
});
