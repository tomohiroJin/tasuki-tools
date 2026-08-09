/**
 * エラーが「クライアントへどう届くか」を実 WS で確かめる（Issue #80）。
 *
 * `error-code-coverage.test.ts` はソースを走査するメタテストで、コードに対する
 * 表示文言が決まっているかを見る。`SpyBroadcaster` を使う既存テストは
 * 「broadcaster にどう渡したか」を見る。**どちらも実ソケットに何が届くかは見ていない。**
 * ここは応答フレームそのもの（JSON のキーと値）を検証する。
 *
 * @requirements FR-101, FR-105
 */

import { describe, it, expect, afterEach } from "bun:test";
import {
  startLiveSyncServer,
  createRoom,
  joinRoom,
  type LiveClient,
  type LiveSyncServer,
} from "./support/live-sync-server.js";

let server: LiveSyncServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe("実 WS 越しのエラー応答", () => {
  it("JSON として壊れた本文には INVALID_JSON が、キーちょうど 3 つのフレームで返る", async () => {
    // Given
    server = startLiveSyncServer();
    const client = await server.connect("client");

    // When
    client.sendRaw("{ これは JSON ではない");

    // Then: 生テキストをそのままパースして形を固定する
    const raw = await waitRawFrame(client);
    expect(Object.keys(raw).sort()).toEqual(["code", "message", "type"]);
    expect(raw).toEqual({
      type: "error",
      code: "INVALID_JSON",
      message: "JSON の形式が不正です",
    });
  });

  it("スキーマに合わない本文には INVALID_COMMAND が返る", async () => {
    // Given
    server = startLiveSyncServer();
    const client = await server.connect("client");

    // When: JSON としては妥当だが CommandSchema の 31 variant のどれにも当たらない
    client.sendRaw(JSON.stringify({ command: "room.create" })); // displayName が無い

    // Then
    const raw = await waitRawFrame(client);
    expect(raw).toEqual({
      type: "error",
      code: "INVALID_COMMAND",
      message: "コマンドの形式が不正です",
    });
  });

  it("在室していない接続がルームスコープコマンドを送ると NOT_IN_ROOM が返る", async () => {
    // Given: ルームに入っていない接続
    server = startLiveSyncServer();
    const client = await server.connect("client");

    // When
    client.send({ command: "session.act", action: "START" });

    // Then
    const error = await client.take("error");
    expect(error.code).toBe("NOT_IN_ROOM");
    expect(error.message).toMatch(/\S/);
  });

  it("存在しないルームコードへの join には ROOM_NOT_FOUND が返る", async () => {
    // Given
    server = startLiveSyncServer();
    const client = await server.connect("client");

    // When
    client.send({
      command: "room.join",
      code: "存在しないコード",
      displayName: "だれか",
      hasAiKey: false,
    });

    // Then
    const error = await client.take("error");
    expect(error.code).toBe("ROOM_NOT_FOUND");
  });

  it("実在しない participantId の指名には PARTICIPANT_NOT_FOUND が返る", async () => {
    // Given: 開始済みのルーム
    server = startLiveSyncServer();
    const host = await server.connect("host");
    await createRoom(host, "ホスト");
    await host.take("snapshot");
    host.send({ command: "phase.set", phase: "session" });
    await host.take("snapshot", (m) => m.room.phase === "session");
    host.send({ command: "session.act", action: "START" });
    await host.take("snapshot", (m) => m.room.clock.running);

    // When
    host.send({ command: "driver.assign", participantId: "居ない人" });

    // Then
    const error = await host.take("error");
    expect(error.code).toBe("PARTICIPANT_NOT_FOUND");
  });

  it("エラーは送った接続にだけ返り、他の在室者へは漏れない", async () => {
    // Given: 2 人が在室している
    server = startLiveSyncServer();
    const host = await server.connect("host");
    const guest = await server.connect("guest");
    const created = await createRoom(host, "ホスト");
    await joinRoom(guest, created.code, "ゲスト");

    // When: ゲストだけが壊れた本文を送る
    guest.sendRaw("壊れた本文");
    await guest.take("error");

    // Then: ホストには何も届かない
    await host.expectSilence();
    expect(host.all("error")).toEqual([]);
  });

  it("wire スキーマに残るが規則表に無いコマンド（break.start）は既定拒否される", async () => {
    // Given: 撤去済みの休憩機能。CommandSchema には後方互換で残っているが（FR-089）、
    // permissions.ts の REGISTERED_COMMANDS には無いので default-deny に落ちる。
    // UI からは到達できず、実ソケットからしか叩けない経路。
    server = startLiveSyncServer();
    const host = await server.connect("host");
    await createRoom(host, "ホスト");
    await host.take("snapshot");

    // When
    host.send({ command: "break.start" });

    // Then: スキーマは通るが権限判定で弾かれる（UNKNOWN_COMMAND へは進まない）
    const error = await host.take("error");
    expect(error.code).toBe("UNAUTHORIZED");
  });
});

/**
 * エラーが届くのを待ち、**生テキストをそのままパースして**返す。
 * 型付きの `received` ではなく wire の実物を見るためのヘルパ。
 */
async function waitRawFrame(client: LiveClient): Promise<Record<string, unknown>> {
  await client.take("error");
  return JSON.parse(client.rawFrames.at(-1)!) as Record<string, unknown>;
}
