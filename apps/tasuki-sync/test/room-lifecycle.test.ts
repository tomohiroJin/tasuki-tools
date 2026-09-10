/**
 * ルームの寿命は 1 つの規則で決まる（#95 S4a・R10・D8）。
 *
 * 名簿の保管が timer と poker で 1 つになった帰結として、寿命の規則も 1 つにした。
 * ルームが消える契機は次の 2 つだけである。
 *
 *   1. **アイドル回収（TTL）** — 全員 offline のまま `ROOM_IDLE_TTL_MS` を超えた
 *      （`application/room-reclaimer.ts` → `application/destroy-room.ts`）
 *   2. **在室者 0 人の退出** — 名簿の最後の 1 人が明示的に抜けた
 *      （`application/command-handlers/participant-remove.ts` → 同じ `destroy-room.ts`）
 *
 * **「最後の接続が切れた瞬間に消す」経路は撤去した**（旧 poker の FR-014）。
 * 接続が切れただけでは名簿もツールの状態も残る —— 戻ってこられることが利用者から見た
 * 変更点であり、poker 側の実 WS の 2 本（`test/poker/reconnect.test.ts` の
 * 「全員が閉じてもルームは残る」）がその利用者から見える形を固定する。
 *
 * 組み立ては `test/support/room-builder.ts` の `makeTestHandlers` に揃える
 * （`passphrase.test.ts` と同じ形）。TTL の観測は `room-reclaimer.test.ts` の
 * `sweep(now)` を直に呼ぶ形を踏襲する（時計を進めずに済む）。
 *
 * @requirements #95 S4a（R10・D8）, Issue #79
 */
import { beforeEach, describe, expect, it } from "bun:test";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { InMemoryTimerStore } from "../src/adapters/in-memory-timer-store.js";
import { InMemoryRoundStore } from "../src/poker/adapters/in-memory-round-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { RoomReclaimer } from "../src/application/room-reclaimer.js";
import { makeTestHandlers } from "./support/room-builder.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";

const TTL = 1_800_000;

let store: InMemoryRoomStore;
let timers: InMemoryTimerStore;
let rounds: InMemoryRoundStore;
let broadcaster: SpyBroadcaster;
let handlers: ReturnType<typeof makeTestHandlers>;
let code: string;

/** TTL 回収の契機を、ハンドラ一式と同じ破棄経路へ繋いだ回収器。 */
const reclaimerFor = (): RoomReclaimer =>
  new RoomReclaimer({
    store,
    idleTtlMs: TTL,
    onReclaim: (c) => handlers.destroyRoom(c),
  });

beforeEach(async () => {
  store = new InMemoryRoomStore();
  timers = new InMemoryTimerStore();
  rounds = new InMemoryRoundStore();
  broadcaster = new SpyBroadcaster();
  handlers = makeTestHandlers({
    store,
    timers,
    rounds,
    clock: new FakeClock(1_000_000),
    broadcaster,
    codeGen: new FakeCodeGen(),
  });
  await handlers.handleCommand("c1", { command: "room.create", displayName: "アリス" });
  code = broadcaster.createdFor("c1").code;
});

describe("ルームの寿命", () => {
  it("接続が全部切れても、名簿とツールの状態は残る（即時破棄をやめた）", () => {
    // Given（beforeEach: 唯一の接続 c1 が居るルーム）
    // When: その唯一の接続が切れる
    handlers.handleDisconnect("c1");

    // Then: 名簿も timer の状態も残る（戻ってこられる）
    expect(store.get(code)).toBeDefined();
    expect(timers.get(code)).toBeDefined();
  });

  it("全員 offline のまま TTL を超えると、名簿・timer 状態・ラウンドが揃って消える", () => {
    // Given: 3 つの保管すべてに実体がある状態で、全員が offline になる
    rounds.put(code, { status: "voting", votes: new Map() });
    handlers.handleDisconnect("c1");
    const reclaimer = reclaimerFor();

    // When: 全員 offline を検知してから TTL を超えるまで sweep する
    reclaimer.sweep(2_000_000);
    reclaimer.sweep(2_000_000 + TTL);

    // Then: 3 面が揃って消える（1 面でも残ると幽霊のルームになる）
    expect(store.get(code)).toBeUndefined();
    expect(timers.get(code)).toBeUndefined();
    expect(rounds.get(code)).toBeUndefined();
  });

  it("TTL に満たない間は消えない（対照実行）", () => {
    // Given: 上と同じく全員 offline
    handlers.handleDisconnect("c1");
    const reclaimer = reclaimerFor();

    // When: TTL に 1ms 足りないところまでしか進めない
    reclaimer.sweep(2_000_000);
    reclaimer.sweep(2_000_000 + TTL - 1);

    // Then: まだ残っている（上の 1 本が「常に消す」実装でも通ってしまうのを防ぐ）
    expect(store.get(code)).toBeDefined();
  });

  it("最後の 1 人が明示的に退出すると即時に破棄される（既存の振る舞い）", async () => {
    // Given
    const self = store.get(code)!.participants[0]!.id;

    // When: 名簿の最後の 1 人が自分で抜ける（切断ではなく明示的な退出）
    await handlers.handleCommand("c1", { command: "participant.remove", participantId: self });

    // Then: TTL を待たずに消える（Issue #79 の経路はそのまま残る）
    expect(store.get(code)).toBeUndefined();
    expect(timers.get(code)).toBeUndefined();
  });

  it("最後の 1 人の退出でも、ラウンドは同じ破棄経路で解放される", async () => {
    // 上の 1 本は名簿と timer だけを見る。**契機が 2 つある以上、ラウンドの解放も
    // 両方の契機で見ないと片方だけが腐る**（`destroy-room.ts` 冒頭の禁じ手そのもの）。
    // Given
    rounds.put(code, { status: "voting", votes: new Map() });
    const self = store.get(code)!.participants[0]!.id;

    // When
    await handlers.handleCommand("c1", { command: "participant.remove", participantId: self });

    // Then
    expect(rounds.get(code)).toBeUndefined();
  });

  it("代理が輪に残っていても、名簿が空になれば破棄される（S3 が残した宿題）", async () => {
    // Given: 輪に代理の席がある（代理は名簿には居ない）
    await handlers.handleCommand("c1", {
      command: "participant.addProxy",
      displayName: "同席のカルロス",
      // client 供給の値。サーバー側で再生成されるので中身に意味は無い（handlers.ts）。
      participantId: "ignored-client-supplied",
    });
    expect(timers.get(code)!.session.rotation.some((e) => e.kind === "proxy")).toBe(true);
    const self = store.get(code)!.participants[0]!.id;

    // When: 名簿の最後の 1 人が抜ける
    await handlers.handleCommand("c1", { command: "participant.remove", participantId: self });

    // Then: 輪に代理が残っていても部屋ごと消える（「代理だけが残る部屋」は作れない）
    expect(store.get(code)).toBeUndefined();
    expect(timers.get(code)).toBeUndefined();
  });
});
