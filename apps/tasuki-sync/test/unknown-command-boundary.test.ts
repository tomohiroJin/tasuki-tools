/**
 * 未知のコマンドは境界（wire スキーマ）で落ちる（#95 S3・default-deny）。
 *
 * ⚠ **このファイルは、消えた検査の代わりに置いてある。**
 * S3 より前は `checkPermission()` のステップ 0 が「登録表に無いコマンドは拒否」という
 * default-deny を担っていた。可否判定そのものを撤去したため、その段は無くなっている。
 * 塞ぎ直したのではなく**元から境界が塞いでいた**ことをここで実測して固定する
 * （`CommandSchema` は `v.variant("command", [...])` の判別可能 union であり、
 * union に無い `command` はパースの時点で落ちる）。
 *
 * 廃止した `role.set` を素材に使うのは、**wire から実際に消えたことの証拠**にもなるためである。
 * 対照（正当なコマンドは通る）を必ず併せて確認する —— 対照が無いと、スキーマの取り違えや
 * import の誤りで「常に false」になっていても緑になる。
 *
 * @requirements #95, FR-101
 */

import { describe, it, expect } from "bun:test";
import { CommandSchema } from "@tasuki/timer-core";
import * as v from "valibot";

describe("コマンドの境界は default-deny である", () => {
  it("廃止した role.set は union に無く、パースで落ちる", () => {
    // Given（役割の廃止より前は受理されていた形をそのまま用意する）
    const abolished = { command: "role.set", participantId: "p1", role: "viewer" };
    // When
    const result = v.safeParse(CommandSchema, abolished);
    // Then
    expect(result.success).toBe(false);
  });

  it("union に無い未知のコマンドはパースで落ちる", () => {
    // Given
    const unknown = { command: "totally.unknown" };
    // When
    const result = v.safeParse(CommandSchema, unknown);
    // Then
    expect(result.success).toBe(false);
  });

  it("対照: 正当なコマンドは通る（検査が常に false を返していないこと）", () => {
    // Given
    const valid = { command: "session.abort" };
    // When
    const result = v.safeParse(CommandSchema, valid);
    // Then
    expect(result.success).toBe(true);
  });
});
