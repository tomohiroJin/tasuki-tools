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
