/**
 * driver.assign（Issue #13 任意メンバー強制指名）のサーバ挙動。
 * host 限定・participantId→index 解決・離脱中の自動復帰・現ドライバー指名 no-op を検証する。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import type { SessionConfig, Room } from "@tdd-mob/core";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

const config: SessionConfig = { language: "TypeScript", difficulty: "easy", members: ["A"], intervalMinutes: 5 };

/** host A（rotation[0]）を作り、rotation [A,B,C] を稼働中にして B の eligibility を上書きした room を置く。
 *  B=pid-b/conn-b（editor）・C=pid-c/conn-c（editor）。 */
async function setup(
  handlers: ReturnType<typeof makeHandlers>,
  store: InMemoryRoomStore,
  bOverrides: Partial<Room["participants"][number]>,
): Promise<string> {
  const create = await handlers.handleCommand("conn-a", {
    command: "room.create", displayName: "A", config: { ...config, members: ["A"] },
  });
  if (!create.isOk()) throw new Error("create failed");
  const code = create.value.code;
  const room = store.get(code)!;
  const host = room.participants[0]!;
  const mk = (id: string, name: string, conn: string, ov: Partial<Room["participants"][number]> = {}): Room["participants"][number] =>
    ({ ...host, participantId: id, connId: conn, displayName: name, role: "editor", presence: "online", driverEligible: true, ...ov });
  store.put({
    ...room,
    participants: [host, mk("pid-b", "B", "conn-b", bOverrides), mk("pid-c", "C", "conn-c")],
    // rotation は参加者IDの配列（D6b）
    session: { ...room.session, rotation: [host.participantId, "pid-b", "pid-c"], driverCounts: [0, 0, 0], currentIndex: 0 },
    clock: { ...room.clock, running: true },
  });
  return code;
}

describe("driver.assign（Issue #13 強制指名）", () => {
  let store: InMemoryRoomStore;
  let handlers: ReturnType<typeof makeHandlers>;
  beforeEach(() => {
    store = new InMemoryRoomStore();
    handlers = makeHandlers({ store, clock: new FakeClock(1_000_000), broadcaster: new SpyBroadcaster(), codeGen: new FakeCodeGen() });
  });

  it("host が任意メンバーを指名すると currentIndex がそのメンバーになる", async () => {
    // Given
    const code = await setup(handlers, store, {});
    // When
    await handlers.handleCommand("conn-a", { command: "driver.assign", participantId: "pid-c" });
    // Then
    expect(store.get(code)!.session.currentIndex).toBe(2); // C
  });

  it("指名交代で totalSwitches が加算される（通常交代と同じカウント）", async () => {
    // Given
    const code = await setup(handlers, store, {});
    // When
    await handlers.handleCommand("conn-a", { command: "driver.assign", participantId: "pid-c" });
    // Then
    expect(store.get(code)!.session.totalSwitches).toBe(1);
  });

  it("一時離脱中のメンバーを指名すると自動復帰する", async () => {
    // Given（B 離脱中）
    const code = await setup(handlers, store, { driverEligible: false });
    // When
    await handlers.handleCommand("conn-a", { command: "driver.assign", participantId: "pid-b" });
    // Then
    const room = store.get(code)!;
    expect(room.session.currentIndex).toBe(1); // B
    const b = room.participants.find((p) => p.participantId === "pid-b")!;
    expect(b.driverEligible).toBe(true); // 自動復帰
  });

  it("現ドライバー自身の指名は状態を変えない（no-op）", async () => {
    // Given（A は rotation[0]・currentIndex 0）
    const code = await setup(handlers, store, {});
    const hostPid = store.get(code)!.participants[0]!.participantId;
    // When
    await handlers.handleCommand("conn-a", { command: "driver.assign", participantId: hostPid });
    // Then
    expect(store.get(code)!.session.currentIndex).toBe(0);
  });

  it("host 以外（editor）の指名は拒否され状態が変わらない", async () => {
    // Given
    const code = await setup(handlers, store, {});
    // When
    const result = await handlers.handleCommand("conn-b", { command: "driver.assign", participantId: "pid-c" });
    // Then
    expect(result.isErr()).toBe(true);
    expect(store.get(code)!.session.currentIndex).toBe(0);
  });

  it("rotation 外（未検出 participantId）の指名は拒否される", async () => {
    // Given
    const code = await setup(handlers, store, {});
    // When
    const result = await handlers.handleCommand("conn-a", { command: "driver.assign", participantId: "pid-unknown" });
    // Then
    expect(result.isErr()).toBe(true);
    expect(store.get(code)!.session.currentIndex).toBe(0);
  });

  it("実在（非代理）オフラインのメンバーは指名できない（R2-1: 無人ドライバー防止）", async () => {
    // Given（B は実在オフライン）
    const code = await setup(handlers, store, { presence: "offline" });
    // When
    const result = await handlers.handleCommand("conn-a", { command: "driver.assign", participantId: "pid-b" });
    // Then
    expect(result.isErr()).toBe(true);
    expect(store.get(code)!.session.currentIndex).toBe(0); // 変わらない
  });

  it("代理（placeholder）はオフラインでも指名できる（対面在席の実在者を表すため）", async () => {
    // Given（B は代理）
    const code = await setup(handlers, store, { presence: "offline", isPlaceholder: true });
    // When
    await handlers.handleCommand("conn-a", { command: "driver.assign", participantId: "pid-b" });
    // Then
    expect(store.get(code)!.session.currentIndex).toBe(1); // B へ交代できる
  });

  it("現ドライバー自身の no-op 指名は driverEligible を書き換えない（副作用なし）", async () => {
    // Given（現ドライバー A を一時離脱状態(driverEligible=false)にしておく）
    const code = await setup(handlers, store, {});
    const room = store.get(code)!;
    const host = room.participants[0]!;
    store.put({
      ...room,
      participants: [{ ...host, driverEligible: false }, ...room.participants.slice(1)],
    });

    // When
    await handlers.handleCommand("conn-a", { command: "driver.assign", participantId: host.participantId });

    // Then
    const after = store.get(code)!;
    expect(after.session.currentIndex).toBe(0); // no-op（現ドライバー自身）
    expect(after.participants[0]!.driverEligible).toBe(false); // 副作用で復帰させない
  });
});
