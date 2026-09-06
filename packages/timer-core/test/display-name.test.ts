/**
 * 表示名の境界での正規化（timer のスキーマ側の回帰テスト）。
 *
 * 「画面で同じに見えるものは同じ文字列である」を保証する。これが崩れると、
 * 同名判定が発火せず識別子も添えられないまま、見分けの付かない行が並ぶ。
 *
 * #95 S1 で、表示名の規約そのものの検査は `packages/room-core` へ移した。
 * ここに残しているのは `CommandSchema` を通したときの振る舞い —— 正規化が
 * **境界で 1 度だけ**掛かること、NFKC の展開後に最大長が課されること —— であり、
 * これは timer のスキーマの検査である。
 */

import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { CommandSchema } from "../src/index.js";
import { normalizeDisplayName } from "@tasuki/room-core";
import { MAX_DISPLAY_NAME } from "../src/aggregate.js";

describe("CommandSchema の表示名（境界での正規化）", () => {
  const join = (displayName: string) =>
    v.safeParse(CommandSchema, { command: "room.join", code: "AB0001", displayName, hasAiKey: false });

  it("room.join の表示名が正規化されて渡る", () => {
    // Given
    const rawDisplayName = "  Bob  ";
    // When
    const r = join(rawDisplayName);
    // Then
    expect(r.success).toBe(true);
    if (r.success) expect((r.output as { displayName: string }).displayName).toBe("Bob");
  });

  it("room.join でも識別子ラベルは名乗れない", () => {
    // Given
    const rawDisplayName = "Bob（ID: 0x3P）";
    // When
    const r = join(rawDisplayName);
    // Then
    expect(r.success).toBe(true);
    if (r.success) expect((r.output as { displayName: string }).displayName).toBe("Bob");
  });

  it("空白のみの表示名は正規化後に空になるので拒否される", () => {
    expect(join("   ").success).toBe(false);
  });

  it("正規化で短くなる入力は通る（保存される値が上限内なら受理する）", () => {
    // Given（上限は「保存・配信される長さ」を守るためのもの。前後の空白は正規化で消えるので、
    // 生が長くても保存値が短ければ拒否する理由が無い）
    // When
    const r = join(" ".repeat(200) + "Bob");
    // Then
    expect(r.success).toBe(true);
    if (r.success) expect((r.output as { displayName: string }).displayName).toBe("Bob");
  });

  it("正規化しても縮まないほど巨大な入力は、正規化より手前で弾く", () => {
    // 前段の緩い上限（MAX_DISPLAY_NAME × 最大展開率）を超えるものは NFKC を走らせる前に落とす。
    expect(join("a".repeat(MAX_DISPLAY_NAME * 18 + 1)).success).toBe(false);
  });

  it("participant.rename も同じ正規化を通る", () => {
    // Given
    const command = {
      command: "participant.rename", participantId: "p1", displayName: "  Bob（ID: zzzz）  ",
    } as const;
    // When
    const rename = v.safeParse(CommandSchema, command);
    // Then
    expect(rename.success).toBe(true);
    if (rename.success) expect((rename.output as { displayName: string }).displayName).toBe("Bob");
  });

  it("participant.addProxy も同じ正規化を通る", () => {
    // Given
    const command = {
      command: "participant.addProxy", participantId: "p2", displayName: "  Pair\tProgrammer ",
    } as const;
    // When
    const proxy = v.safeParse(CommandSchema, command);
    // Then
    expect(proxy.success).toBe(true);
    if (proxy.success) expect((proxy.output as { displayName: string }).displayName).toBe("Pair Programmer");
  });
});

// ─── コードレビューで見つかった指摘の回帰 ────────────────────────────────────

describe("NFKC 展開と最大長（レビュー指摘・必須）", () => {
  // NFKC は1文字を複数文字へ展開しうる。最大は U+FDFA（18文字へ展開）。
  const EXPANDING = "\ufdfa";

  it("正規化で展開しても、保存される長さは上限を超えない", () => {
    // Given（生では上限内でも、展開後に上限を超える入力は拒否する。
    // 通っていた頃は 40 文字の入力が 720 文字として保存され、全参加者へ配信されていた）
    const raw = EXPANDING.repeat(MAX_DISPLAY_NAME);
    expect(raw.length).toBe(MAX_DISPLAY_NAME); // 生の長さは上限ちょうど
    expect(normalizeDisplayName(raw).length).toBeGreaterThan(MAX_DISPLAY_NAME); // 展開する
    // When
    const r = v.safeParse(CommandSchema, {
      command: "room.join", code: "AB0001", displayName: raw, hasAiKey: false,
    });
    // Then
    expect(r.success).toBe(false);
  });

  it("展開しても上限内に収まる入力は通る", () => {
    // Given（2文字なら 36 文字へ展開され、上限 40 に収まる）
    const raw = EXPANDING.repeat(2);
    // When
    const r = v.safeParse(CommandSchema, {
      command: "room.join", code: "AB0001", displayName: raw, hasAiKey: false,
    });
    // Then
    expect(r.success).toBe(true);
    if (r.success) {
      const out = (r.output as { displayName: string }).displayName;
      expect(out.length).toBeLessThanOrEqual(MAX_DISPLAY_NAME);
    }
  });

  it("上限ちょうどの通常文字は通る", () => {
    // Given
    const displayName = "a".repeat(MAX_DISPLAY_NAME);
    // When
    const ok = v.safeParse(CommandSchema, {
      command: "room.join", code: "AB0001", displayName, hasAiKey: false,
    });
    // Then
    expect(ok.success).toBe(true);
  });

  it("上限を1文字超えると拒否される", () => {
    // Given
    const displayName = "a".repeat(MAX_DISPLAY_NAME + 1);
    // When
    const ng = v.safeParse(CommandSchema, {
      command: "room.join", code: "AB0001", displayName, hasAiKey: false,
    });
    // Then
    expect(ng.success).toBe(false);
  });
});
