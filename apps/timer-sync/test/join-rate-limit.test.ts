/**
 * 入室失敗のレート制限（#103 で接続単位 → クライアント単位へ移した）。
 *
 * ## 以前との違い
 *
 * かつては接続クローズで失敗履歴が解放され、張り直せば再び試行できた。
 * **それが総当たりの回避経路だった**（ADR 0011 S1）。いまは鍵がクライアント
 * （IP の HMAC）なので、接続を閉じても残量は戻らない。
 *
 * WS アダプタを通さない in-process の経路では `open()` が呼ばれないため、
 * 鍵は connId へ落ちる（rate-limit-gate.ts の docstring 参照）。
 * このファイルは `handlers.handleConnectionOpen` を明示的に呼んで、
 * 「同じクライアントの別接続」を組み立てる。
 *
 * ## 後半の「窓の共有」について
 *
 * `room.join` と `ai.unlock` が**同一インスタンスのバケツ**を共有することは、
 * `makeHandlers` を通さないと表現できない（2 つのコマンドをまたぐ振る舞い）。
 * 旧 `join-rate-limiter.test.ts` にあった 2 件を、新しいゲートに合わせてここへ移した。
 * ゲートの単体テスト（`rate-limit-gate.test.ts`）へ降ろすと、
 * **`makeHandlers` が実際に 1 インスタンスを共有しているか**の検証が消える。
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { DEFAULT_CAPACITY } from "@tasuki/rate-limit";
import { makeHandlers } from "../src/application/handlers.js";
import { InMemoryRoomStore } from "../src/adapters/in-memory-room-store.js";
import { FakeClock } from "../src/adapters/system-clock.js";
import { FakeCodeGen } from "./support/fake-code-gen.js";
import { SpyBroadcaster } from "./support/spy-broadcaster.js";

const badJoin = (handlers: ReturnType<typeof makeHandlers>, conn: string) =>
  handlers.handleCommand(conn, {
    command: "room.join",
    code: "NOPE99",
    displayName: "Bob",
    hasAiKey: false,
  });

describe("入室失敗のレート制限", () => {
  let handlers: ReturnType<typeof makeHandlers>;
  let broadcaster: SpyBroadcaster;
  let store: InMemoryRoomStore;
  const conn = "spam-conn";

  beforeEach(() => {
    broadcaster = new SpyBroadcaster();
    store = new InMemoryRoomStore();
    handlers = makeHandlers({
      store,
      clock: new FakeClock(1_000_000),
      broadcaster,
      codeGen: new FakeCodeGen(),
    });
  });

  it("連続失敗が容量を超えると JOIN_RATE_LIMITED で拒否する", async () => {
    // Given（容量までは ROOM_NOT_FOUND）
    for (let i = 0; i < DEFAULT_CAPACITY; i++) {
      await badJoin(handlers, conn);
      expect(broadcaster.errorsTo(conn).at(-1)?.code, `${i} 回目`).toBe("ROOM_NOT_FOUND");
    }

    // When
    await badJoin(handlers, conn);

    // Then
    expect(broadcaster.errorsTo(conn).at(-1)?.code).toBe("JOIN_RATE_LIMITED");
  });

  it("接続を張り直しても、同じクライアントなら残量は戻らない", async () => {
    // Given（1 本目の接続で使い切る）
    handlers.handleConnectionOpen("conn-1", "client-A");
    for (let i = 0; i < DEFAULT_CAPACITY; i++) await badJoin(handlers, "conn-1");
    await badJoin(handlers, "conn-1");
    expect(broadcaster.errorsTo("conn-1").at(-1)?.code).toBe("JOIN_RATE_LIMITED");

    // When（切断して、同じクライアントから新しい接続を開く）
    handlers.handleConnectionClose("conn-1");
    handlers.handleConnectionOpen("conn-2", "client-A");
    await badJoin(handlers, "conn-2");

    // Then（かつてはここで ROOM_NOT_FOUND に戻っていた。それが回避経路だった）
    expect(broadcaster.errorsTo("conn-2").at(-1)?.code).toBe("JOIN_RATE_LIMITED");
  });

  it("別のクライアントは独立している", async () => {
    // Given
    handlers.handleConnectionOpen("conn-1", "client-A");
    for (let i = 0; i < DEFAULT_CAPACITY; i++) await badJoin(handlers, "conn-1");

    // When
    handlers.handleConnectionOpen("conn-2", "client-B");
    await badJoin(handlers, "conn-2");

    // Then
    expect(broadcaster.errorsTo("conn-2").at(-1)?.code).toBe("ROOM_NOT_FOUND");
  });

  /**
   * レート制限が壁時計から切り離されていること（設計正本 D8）。
   *
   * `handleRoomJoin` には系統の違う 2 つの「いま」がある。`clock.now()`（epoch ms・
   * ルームの会計用）と `performance.now()`（単調時計・レート制限用）である。
   * 取り違えても**通常のテストは全件緑のまま**になる（FakeClock は止まっているので
   * どちらを渡しても同じに見える）。ここは壁時計だけを大きく進めることで、その差を
   * 観測可能にする。壁時計を渡していれば補充が走って残量が戻り、この検査は落ちる。
   */
  it("壁時計が大きく飛んでも残量は戻らない（レート制限は単調時計で数える）", async () => {
    // Given（使い切る）
    const clock = new FakeClock(1_000_000);
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({
      store: new InMemoryRoomStore(),
      clock,
      broadcaster,
      codeGen: new FakeCodeGen(),
    });
    for (let i = 0; i < DEFAULT_CAPACITY; i++) await badJoin(handlers, conn);
    await badJoin(handlers, conn);
    expect(broadcaster.errorsTo(conn).at(-1)?.code).toBe("JOIN_RATE_LIMITED");

    // When（NTP のステップ調整を模して壁時計だけを 2 分進める。
    //       容量ぶんの補充時間 60 秒を大きく超える幅にしてある）
    clock.advance(120_000);
    await badJoin(handlers, conn);

    // Then（実時間はほとんど経っていないので残量は戻らない）
    expect(broadcaster.errorsTo(conn).at(-1)?.code).toBe("JOIN_RATE_LIMITED");
  });

  /**
   * 残量が無いとき、**実在するルームコード**でも JOIN_RATE_LIMITED を返すこと。
   * ここが逆順（照会してから判定）だと、攻撃者はトークンを消費せずに
   * 「そのコードが実在するか」を数え切れないほど試せる（設計正本 D3）。
   */
  it("残量が無いとき、実在するコードでも JOIN_RATE_LIMITED を返す", async () => {
    // Given
    const created = await handlers.handleCommand("host-conn", {
      command: "room.create",
      displayName: "ホスト",
    });
    expect(created.isOk()).toBe(true);
    const code = store.list()[0]!.code;

    handlers.handleConnectionOpen(conn, "client-A");
    for (let i = 0; i < DEFAULT_CAPACITY; i++) await badJoin(handlers, conn);

    // When
    await handlers.handleCommand(conn, {
      command: "room.join",
      code,
      displayName: "侵入者",
      hasAiKey: false,
    });

    // Then
    expect(broadcaster.errorsTo(conn).at(-1)?.code).toBe("JOIN_RATE_LIMITED");
  });
});

/**
 * `room.join` と `ai.unlock` のバケツ共有（旧 `join-rate-limiter.test.ts` から移送）。
 *
 * `ai.unlock` は合言葉の総当たり対策として `room.join` と同じバケツに相乗りしている。
 * `makeHandlers` がコマンドごとに別インスタンスを作ると、この相乗りが黙って消え、
 * **`ai.unlock` の総当たり対策が弱まる**。ここはその 1 点だけを見る。
 *
 * 数値は `DEFAULT_CAPACITY`（設計正本 D2）を参照し、ハードコードしない。
 */
describe("room.join と ai.unlock のレート制限バケツの共有", () => {
  let store: InMemoryRoomStore;
  let clock: FakeClock;
  let broadcaster: SpyBroadcaster;
  let handlers: ReturnType<typeof makeHandlers>;
  const hostConn = "host-conn";

  beforeEach(() => {
    store = new InMemoryRoomStore();
    clock = new FakeClock(1_000_000);
    broadcaster = new SpyBroadcaster();
    handlers = makeHandlers({
      store,
      clock,
      broadcaster,
      codeGen: new FakeCodeGen(),
      aiUnlockKey: "himitsu",
    });
    // 実経路と同じく、接続の受理時にクライアント鍵を登録する。
    handlers.handleConnectionOpen(hostConn, "client-A");
  });

  it("room.join の連続失敗が容量に達すると、同じクライアントの ai.unlock も即座に RATE_LIMITED になる", async () => {
    // Given（ホストとして入室した上で、同じ接続 ID で room.join を容量ぶん失敗させる。
    //       ai.unlock は在室確認・host 権限判定を通す必要があるため、同一接続が
    //       host として在室したまま room.join の別コードで失敗を積む）
    await handlers.handleCommand(hostConn, {
      command: "room.create",
      displayName: "Alice",
    });
    for (let i = 0; i < DEFAULT_CAPACITY; i++) {
      await handlers.handleCommand(hostConn, {
        command: "room.join",
        code: "NOPE99",
        displayName: "Bob",
        hasAiKey: false,
      });
    }
    expect(broadcaster.errorsTo(hostConn).at(-1)?.code).toBe("ROOM_NOT_FOUND");

    // When（在室・権限とも満たす同じ接続で ai.unlock を試みる。
    //       共有のバケツが空なら合言葉の正否を見る前に RATE_LIMITED になる）
    broadcaster.sent.length = 0;
    const result = await handlers.handleCommand(hostConn, {
      command: "ai.unlock",
      key: "himitsu",
    });

    // Then
    expect(result.isErr()).toBe(true);
    expect(broadcaster.errorsTo(hostConn).at(-1)?.code).toBe("RATE_LIMITED");
  });

  it("ai.unlock の連続失敗が容量に達すると、同じクライアントの room.join も即座に JOIN_RATE_LIMITED になる", async () => {
    // Given（ホストとして入室し、誤った合言葉で ai.unlock を容量ぶん失敗させる）
    await handlers.handleCommand(hostConn, {
      command: "room.create",
      displayName: "Alice",
    });
    for (let i = 0; i < DEFAULT_CAPACITY; i++) {
      await handlers.handleCommand(hostConn, {
        command: "ai.unlock",
        key: `wrong-${i}`,
      });
    }
    expect(broadcaster.errorsTo(hostConn).at(-1)?.code).toBe("AI_UNLOCK_FAILED");

    // When（同じ接続で room.join を試みる）
    broadcaster.sent.length = 0;
    const result = await handlers.handleCommand(hostConn, {
      command: "room.join",
      code: "SOME99",
      displayName: "Carol",
      hasAiKey: false,
    });

    // Then
    expect(result.isErr()).toBe(true);
    expect(broadcaster.errorsTo(hostConn).at(-1)?.code).toBe("JOIN_RATE_LIMITED");
  });

  /**
   * 上の 2 件は同じ接続の中での共有しか見ていない。**別の接続でも同じクライアント鍵
   * なら共有される**ことまで見ないと、「接続を張り直して ai.unlock の総当たりを続ける」
   * 経路が残る（#103 の核心をコマンドをまたいで確かめる）。
   */
  it("room.join で使い切ったクライアントは、別の接続から ai.unlock しても RATE_LIMITED になる", async () => {
    // Given（1 本目の接続で room.join を容量ぶん失敗させる）
    for (let i = 0; i < DEFAULT_CAPACITY; i++) {
      await handlers.handleCommand(hostConn, {
        command: "room.join",
        code: "NOPE99",
        displayName: "Bob",
        hasAiKey: false,
      });
    }
    handlers.handleConnectionClose(hostConn);

    // When（同じクライアント鍵の別接続でホストになり ai.unlock を試みる）
    const secondConn = "host-conn-2";
    handlers.handleConnectionOpen(secondConn, "client-A");
    await handlers.handleCommand(secondConn, {
      command: "room.create",
      displayName: "Alice",
    });
    broadcaster.sent.length = 0;
    const result = await handlers.handleCommand(secondConn, {
      command: "ai.unlock",
      key: "himitsu",
    });

    // Then
    expect(result.isErr()).toBe(true);
    expect(broadcaster.errorsTo(secondConn).at(-1)?.code).toBe("RATE_LIMITED");
  });
});
