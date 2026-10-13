/**
 * timer の受け口のアプリケーション側（#368 Task 2）。
 *
 * 接続層は境界の検証（`CommandSchema`）だけを掛けて、型のまま（`Command`）ここへ渡す。表示名の
 * 正規化（業務の検証）はここで掛ける。**拒んだときのフレームはスキーマ違反と同じ**（コード・文言）で、
 * 接続層に正規化があった頃と 1 バイトも変わらない（実 WS 越しの固定は `live-ws.display-name.test.ts`）。
 */
import { describe, expect, it } from "bun:test";
import type { Command, ServerMsg } from "@tasuki/timer-core";
import { createTimerCommandReceiver } from "../src/application/timer-command-receiver.js";

function setup() {
  const replies: Array<[string, ServerMsg]> = [];
  const routed: Array<[string, Command]> = [];
  const receive = createTimerCommandReceiver({
    reply: (connId, msg) => replies.push([connId, msg]),
    route: async (connId, cmd) => {
      routed.push([connId, cmd]);
    },
  });
  return { replies, routed, receive };
}

describe("timer の受け口（表示名の正規化）", () => {
  it("Given 前後に空白のある表示名 / When 受ける / Then 正規形に直して振り分けへ渡し、返事はしない", async () => {
    // Given
    const h = setup();
    // When
    await h.receive("c-1", { command: "room.create", displayName: "  ボブ  " });
    // Then
    expect(h.routed).toEqual([["c-1", { command: "room.create", displayName: "ボブ" }]]);
    expect(h.replies).toEqual([]);
  });

  it("Given 表示名を持たないコマンド / When 受ける / Then 同じ値のまま振り分けへ渡す", async () => {
    // Given
    const h = setup();
    const cmd: Command = { command: "time.ping", clientTime: 1 };
    // When
    await h.receive("c-1", cmd);
    // Then
    expect(h.routed[0]![1]).toBe(cmd);
  });

  it("Given 正規化すると空になる表示名 / When 受ける / Then INVALID_COMMAND（コマンドの形式が不正です）を本人へ返し、振り分けへは渡さない", async () => {
    // Given
    const h = setup();
    // When
    await h.receive("c-1", { command: "room.create", displayName: "   " });
    // Then
    expect(h.replies).toEqual([
      ["c-1", { type: "error", code: "INVALID_COMMAND", message: "コマンドの形式が不正です" }],
    ]);
    expect(h.routed).toEqual([]);
  });

  it("Given 拒む表示名 / When 受ける / Then 返事は同期に送る（await の前。接続層に正規化があった頃と同じ順番）", () => {
    // Given
    const h = setup();
    // When: await しない
    void h.receive("c-1", { command: "room.create", displayName: "   " });
    // Then
    expect(h.replies).toHaveLength(1);
  });
});
