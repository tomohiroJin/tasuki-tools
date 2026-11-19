import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { CommandSchema } from "../src/schemas.js";

describe("passphrase スキーマ", () => {
  it("room.join は任意の passphrase を受け付ける", () => {
    expect(v.safeParse(CommandSchema, { command: "room.join", code: "AA", displayName: "x" }).success).toBe(true);
    expect(v.safeParse(CommandSchema, { command: "room.join", code: "AA", displayName: "x", passphrase: "pw" }).success).toBe(true);
  });
  // #638: 合言葉の設定・解除は timer のコマンドではなくなった（玄関＝ハブの `room.passphrase.set`。
  // 契約は `@tasuki/room-core` の `HubCommandSchema`）。timer の入口へ届いても境界で落ちる。
  it("room.passphrase.set は timer のコマンドではない（#638）", () => {
    expect(v.safeParse(CommandSchema, { command: "room.passphrase.set", passphrase: "pw" }).success).toBe(false);
    expect(v.safeParse(CommandSchema, { command: "room.passphrase.set", passphrase: "" }).success).toBe(false);
  });
  // #377: 上限は `@tasuki/room-core` の `MAX_PASSPHRASE` に移し、timer の入口では
  // apps/tasuki-sync の `passphrase-rule.ts` が当てる（timer-core は @tasuki/* に依存しない）。
  // ここで上限を掛け直すと正本が 2 つになるので、**掛けていないこと**を固定する。
  // 超過の拒否は apps/tasuki-sync/test/live-ws.passphrase-limit.test.ts が実 WS 越しに見る。
  it("passphrase の長さはこの層では見ない（上限は room-core の規約・#377）", () => {
    // Given
    const long = "a".repeat(129);
    // When / Then
    expect(v.safeParse(CommandSchema, { command: "room.join", code: "AA", displayName: "x", passphrase: long }).success).toBe(true);
  });
});
