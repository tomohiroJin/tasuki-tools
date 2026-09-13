/**
 * 表示名の正規化が**実経路で**掛かっていること（#95 S4b）。
 *
 * 規約は `@tasuki/room-core`、適用は境界（`adapters/ws-adapter.ts` → `normalizeCommandNames`）
 * にある。**この 2 つが繋がっていることは関数の単体テストでは分からない**
 * （`test/normalize-command-names.test.ts` は関数だけを見る）。S4a 以前は同じ仕事を
 * wire スキーマの `transform` が担っていたので、移設で配線が死んでいないかを実ソケットで見る。
 *
 * ⚠ **in-process の `handleCommand` を直接呼ぶテストはここを通らない**（valibot も
 * 境界にしか無いので S4a 以前から同じ）。だからこのファイルが要る。
 *
 * @requirements FR-021, R13
 */

import { describe, it, expect, afterEach } from "bun:test";
import { MAX_DISPLAY_NAME } from "@tasuki/room-core";
import { startLiveSyncServer, createRoom, type LiveSyncServer } from "./support/live-sync-server.js";

let server: LiveSyncServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe("実 WS・表示名の正規化", () => {
  it("前後の空白と識別子ラベルが落ちた名前で名簿に載る", async () => {
    // Given: 空白で囲み、実在参加者の識別子を騙る書式を混ぜた表示名
    server = startLiveSyncServer();
    const host = await server.connect("host");

    // When
    const created = await createRoom(host, "  ボブ（ID: 0x3P）  ");

    // Then: 保存・配信される値は正規形である
    const snapshot = await host.take("snapshot");
    const me = snapshot.room.participants.find(
      (p) => p.participantId === created.participantId,
    );
    expect(me?.displayName).toBe("ボブ");
  });

  it("正規化すると空になる名前は INVALID_COMMAND で拒まれる", async () => {
    // Given
    server = startLiveSyncServer();
    const host = await server.connect("host");

    // When: 空白だけの表示名で作成を試みる
    host.send({ command: "room.create", displayName: "   " });

    // Then: スキーマ違反と同じフレームが返る（コードも文言も同一である）
    const error = await host.take("error");
    expect(error.code).toBe("INVALID_COMMAND");
    expect(error.message).toBe("コマンドの形式が不正です");
    expect(host.all("room.created")).toEqual([]);
  });

  it("NFKC で展開して上限を超える名前は拒まれる（保存される長さで判定する）", async () => {
    // Given: 生では上限ちょうどだが、NFKC で 18 倍に展開される文字
    server = startLiveSyncServer();
    const host = await server.connect("host");
    const expanding = "ﷺ".repeat(MAX_DISPLAY_NAME);

    // When
    host.send({ command: "room.create", displayName: expanding });

    // Then
    const error = await host.take("error");
    expect(error.code).toBe("INVALID_COMMAND");
    expect(host.all("room.created")).toEqual([]);
  });

  it("上限ちょうどの名前は通る（対照）", async () => {
    // Given
    server = startLiveSyncServer();
    const host = await server.connect("host");

    // When
    const created = await createRoom(host, "あ".repeat(MAX_DISPLAY_NAME));

    // Then
    expect(created.code).toBeTruthy();
  });
});

/**
 * 表示名の規約は**入口をまたいで 1 つ**である（#95 S5b・#248）。
 *
 * S4a まで poker は自前の規約（`packages/poker-core/src/name.ts` の 24 文字）を持ち、
 * timer とハブは `@tasuki/room-core` の 40 文字を使っていた。**ハブで名乗った名前が
 * poker へ届くのは S5b から**なので、食い違いはここで実害になる（40 文字で名乗った人が
 * poker の入口で弾かれる）。
 *
 * 同じ理由で、**ハブの入口にも上限が効いていなければならない**。S5a の
 * `hub-handlers.ts` は `normalizeDisplayName` の戻り値を `null` と比べていたが、
 * あの関数は `string` しか返さない —— 空文字も 1000 文字も素通りしていた。
 */
describe("実 WS・表示名の規約は入口をまたいで 1 つ（#95 S5b）", () => {
  it("Given 上限ちょうどの名前 / When poker の入口で名乗る / Then 参加できる", async () => {
    // Given: timer とハブが通す長さ（40 文字）
    server = startLiveSyncServer();
    const poker = await server.connectPoker("poker");
    const name = "あ".repeat(MAX_DISPLAY_NAME);

    // When
    poker.send({ type: "create-room", name });

    // Then: poker の入口も同じ長さを通す
    const joined = await poker.take((m) => m.type === "joined" || m.type === "error", "joined");
    expect(joined.type).toBe("joined");
  });

  it("Given 正規化すると空になる名前 / When poker の入口で名乗る / Then 拒まれる（対照）", async () => {
    // Given
    server = startLiveSyncServer();
    const poker = await server.connectPoker("poker");

    // When: 空白だけの名前
    poker.send({ type: "create-room", name: "   " });

    // Then
    const error = await poker.take((m) => m.type === "error" || m.type === "joined", "error");
    expect(error.type).toBe("error");
  });

  it("Given 上限を超える名前 / When ハブの入口で名乗る / Then 拒まれる", async () => {
    // Given
    server = startLiveSyncServer();
    const hub = await server.connectHub("hub");
    const tooLong = "あ".repeat(MAX_DISPLAY_NAME + 1);

    // When
    hub.send({ command: "room.create", roomName: "朝会モブ", displayName: tooLong });

    // Then: 保存・配信される長さを保証する（timer の入口と同じ判定）
    const msg = await hub.take((m) => m.type === "error" || m.type === "room.created", "error");
    expect(msg.type).toBe("error");
  });

  it("Given 正規化すると空になる名前 / When ハブの入口で名乗る / Then 拒まれる", async () => {
    // Given
    server = startLiveSyncServer();
    const hub = await server.connectHub("hub");

    // When: 空白だけの名前
    hub.send({ command: "room.create", roomName: "朝会モブ", displayName: "   " });

    // Then
    const msg = await hub.take((m) => m.type === "error" || m.type === "room.created", "error");
    expect(msg.type).toBe("error");
  });

  it("Given NFKC で展開して上限を超える名前 / When poker の入口で名乗る / Then 拒まれる", async () => {
    // Given: 生では上限ちょうどだが、NFKC で 18 倍に展開される文字
    server = startLiveSyncServer();
    const poker = await server.connectPoker("poker");

    // When
    poker.send({ type: "create-room", name: "ﷺ".repeat(MAX_DISPLAY_NAME) });

    // Then: 判定は**保存される長さ**で行う（timer の入口と同じ）
    const msg = await poker.take((m) => m.type === "error" || m.type === "joined", "error");
    expect(msg.type).toBe("error");
  });
});
