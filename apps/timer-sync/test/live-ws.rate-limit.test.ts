/**
 * レート制限が**実 WS の配線を通して**クライアント単位で効いていることを確かめる（#103）。
 *
 * ## なぜ in-process のテストでは足りないか
 *
 * `join-rate-limit.test.ts` は `handlers.handleConnectionOpen()` を**テストが自分で
 * 呼んで**「同じクライアントの別接続」を組み立てている。つまり
 * **`create-sync-server.ts` が `onConnect` を handlers へ配線しているか**は見ていない。
 * その配線を外すと鍵は connId へ落ち、接続を張り直すだけで残量が戻る
 * （#103 が塞いだ回避経路そのもの）が、in-process のテストは全件緑のままになる。
 *
 * ここは「WS アダプタが X-Forwarded-For から導いた鍵が、handlers のバケツまで
 * 届いているか」の 1 点だけを、実ソケットで見る。
 *
 * ## 時間に対する余裕
 *
 * バケツは毎秒 1 個補充される。使い切った直後に張り直しても残量は戻らないが、
 * 実 I/O を挟むので「1 個だけ戻る」ことはありうる。そこで新しい接続では複数回試し、
 * **1 度でも JOIN_RATE_LIMITED が返ること**を条件にする（数秒ぶんの余裕がある）。
 * 鍵が接続単位に戻っていれば新しい接続は容量ぶん通るので、この条件でも取り違えない。
 */

import { describe, it, expect, afterEach } from "bun:test";
import { DEFAULT_CAPACITY } from "@tasuki/rate-limit";
import {
  startLiveSyncServer,
  type LiveClient,
  type LiveSyncServer,
} from "./support/live-sync-server.js";

let server: LiveSyncServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

/** 存在しないコードで入室を試みる。 */
function badJoin(client: LiveClient): void {
  client.send({ command: "room.join", code: "NOPE99", displayName: "Bob", hasAiKey: false });
}

/** `count` 回失敗させ、その回数ぶんのエラーが届くまで待つ。 */
async function drainBadJoins(client: LiveClient, count: number): Promise<void> {
  const before = client.all("error").length;
  for (let i = 0; i < count; i++) badJoin(client);
  await client.until(
    (received) => received.filter((m) => m.type === "error").length >= before + count,
    `${count} 件のエラー応答`,
  );
}

/** 直近 `count` 件のエラーコード。 */
function lastErrorCodes(client: LiveClient, count: number): string[] {
  return client
    .all("error")
    .slice(-count)
    .map((m) => m.code);
}

describe("実 WS 越しの入室レート制限", () => {
  it("使い切ったクライアントは、接続を張り直しても JOIN_RATE_LIMITED のままになる", async () => {
    // Given（同じ X-Forwarded-For を名乗る 1 本目の接続で使い切る）
    server = startLiveSyncServer();
    const xff = { "x-forwarded-for": "203.0.113.7" };
    const first = await server.connect("first", xff);
    await drainBadJoins(first, DEFAULT_CAPACITY + 1);
    expect(lastErrorCodes(first, 1)).toEqual(["JOIN_RATE_LIMITED"]);

    // When（切断して、同じ IP から新しい接続を開く）
    await first.close();
    const second = await server.connect("second", xff);
    await drainBadJoins(second, 3);

    // Then（接続単位に戻っていれば 3 件とも ROOM_NOT_FOUND になる）
    expect(lastErrorCodes(second, 3)).toContain("JOIN_RATE_LIMITED");
  });

  it("別の IP のクライアントは巻き込まれない", async () => {
    // Given
    server = startLiveSyncServer();
    const attacker = await server.connect("attacker", { "x-forwarded-for": "203.0.113.7" });
    await drainBadJoins(attacker, DEFAULT_CAPACITY + 1);
    expect(lastErrorCodes(attacker, 1)).toEqual(["JOIN_RATE_LIMITED"]);

    // When
    const bystander = await server.connect("bystander", { "x-forwarded-for": "198.51.100.9" });
    await drainBadJoins(bystander, 3);

    // Then
    expect(lastErrorCodes(bystander, 3)).toEqual([
      "ROOM_NOT_FOUND",
      "ROOM_NOT_FOUND",
      "ROOM_NOT_FOUND",
    ]);
  });
});
