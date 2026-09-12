/**
 * 境界での表示名の正規化（#95 S4b）。
 *
 * **`packages/timer-core/test/display-name.test.ts` からの移設である。**
 * S4a まで正規化は timer の wire スキーマ（`CommandSchema`）の中で行われており、
 * そのために `timer-core` が `@tasuki/room-core` を取り込んでいた（期限つきの一時依存・
 * `docs/adr/0017` 決定 4）。**表示名の規約はメンバーシップ文脈のものであって
 * モブタイマーのものではない**ので、S4b で規約を room-core に残したまま、
 * 適用する場所だけをアプリケーション層のこの関数へ移した。
 *
 * 守る性質は移設前と同じ 3 つである。
 *
 *   1. 正規化は**境界で 1 度だけ**掛かる（以後は正規形しか流れない）
 *   2. 正規化後に空になる名前は拒否する
 *   3. **NFKC の展開後の長さ**で上限を課す（前段の緩い上限だけでは突破される）
 *
 * ⚠ **この関数のテストだけでは配線の死を検出できない。** 実際に WS 越しで
 * 通ることは `live-ws.display-name.test.ts` が見る（[[verify-the-live-path]]）。
 *
 * @requirements FR-021, NFR-セキュリティ(A04), R13
 */
import { describe, expect, it } from "bun:test";
import { MAX_DISPLAY_NAME, MAX_NFKC_EXPANSION, normalizeDisplayName } from "@tasuki/room-core";
import type { Command } from "@tasuki/timer-core";
import { normalizeCommandNames } from "../src/application/normalize-command-names.js";

/** 表示名だけを差し替えた `room.join`。 */
function join(displayName: string): Command {
  return { command: "room.join", code: "AB0001", displayName, hasAiKey: false };
}

/** 正規化に成功した表示名を取り出す（失敗なら throw して前提の壊れを知らせる）。 */
function normalizedNameOf(cmd: Command): string {
  const result = normalizeCommandNames(cmd);
  if (result.isErr()) throw new Error(`正規化が拒否した: ${result.error}`);
  return (result.value as { displayName: string }).displayName;
}

describe("境界での表示名の正規化", () => {
  it("room.join の表示名が正規化されて渡る", () => {
    // Given
    const raw = "  Bob  ";

    // When
    const name = normalizedNameOf(join(raw));

    // Then
    expect(name).toBe("Bob");
  });

  it("room.join でも識別子ラベルは名乗れない", () => {
    // Given: 実在参加者の識別子を騙る書式
    const raw = "Bob（ID: 0x3P）";

    // When / Then
    expect(normalizedNameOf(join(raw))).toBe("Bob");
  });

  it("空白のみの表示名は正規化後に空になるので拒否される", () => {
    // Given / When
    const result = normalizeCommandNames(join("   "));

    // Then
    expect(result.isErr()).toBe(true);
  });

  it("正規化で短くなる入力は通る（保存される値が上限内なら受理する）", () => {
    // Given: 上限は「保存・配信される長さ」を守るためのもの。前後の空白は正規化で
    // 消えるので、生が長くても保存値が短ければ拒否する理由が無い。
    const raw = " ".repeat(200) + "Bob";

    // When / Then
    expect(normalizedNameOf(join(raw))).toBe("Bob");
  });

  it("正規化しても縮まないほど巨大な入力は、正規化より手前で弾く", () => {
    // Given: 前段の緩い上限（MAX_DISPLAY_NAME × 最大展開率）を超える入力
    const raw = "a".repeat(MAX_DISPLAY_NAME * MAX_NFKC_EXPANSION + 1);

    // When / Then: NFKC を走らせる前に落とす
    expect(normalizeCommandNames(join(raw)).isErr()).toBe(true);
  });

  it("room.create も同じ正規化を通る", () => {
    // Given
    const cmd: Command = { command: "room.create", displayName: "  Bob（ID: zzzz）  " };

    // When / Then
    expect(normalizedNameOf(cmd)).toBe("Bob");
  });

  it("participant.rename も同じ正規化を通る", () => {
    // Given
    const cmd: Command = {
      command: "participant.rename",
      participantId: "p1",
      displayName: "  Bob（ID: zzzz）  ",
    };

    // When / Then
    expect(normalizedNameOf(cmd)).toBe("Bob");
  });

  it("participant.addProxy も同じ正規化を通る", () => {
    // Given
    const cmd: Command = {
      command: "participant.addProxy",
      participantId: "p2",
      displayName: "  Pair\tProgrammer ",
    };

    // When / Then
    expect(normalizedNameOf(cmd)).toBe("Pair Programmer");
  });

  it("表示名を持たないコマンドはそのまま通す（同じ参照を返す）", () => {
    // Given
    const cmd: Command = { command: "session.act", action: "SWITCH" };

    // When
    const result = normalizeCommandNames(cmd);

    // Then: 触らないことを参照の同一性で固定する（写しを作ると取り違えが生まれる）。
    // **`isOk()` の確認を前に置かない**（前提の構築段階に検証を置く形になる・SC-031）。
    // 失敗していれば `_unsafeUnwrap` が throw して前提の壊れとして分かる。
    expect(result._unsafeUnwrap()).toBe(cmd);
  });
});

describe("NFKC 展開と最大長", () => {
  // NFKC は 1 文字を複数文字へ展開しうる。最大は U+FDFA（18 文字へ展開）。
  const EXPANDING = "ﷺ";

  it("正規化で展開しても、保存される長さは上限を超えない", () => {
    // Given: 生では上限ちょうどでも、展開後に上限を超える入力
    const raw = EXPANDING.repeat(MAX_DISPLAY_NAME);
    expect(raw.length).toBe(MAX_DISPLAY_NAME);
    expect(normalizeDisplayName(raw).length).toBeGreaterThan(MAX_DISPLAY_NAME);

    // When / Then: 通っていた頃は 40 文字の入力が 720 文字として保存され、
    // 全参加者へ配信・描画されていた
    expect(normalizeCommandNames(join(raw)).isErr()).toBe(true);
  });

  it("展開しても上限内に収まる入力は通る", () => {
    // Given: 2 文字なら 36 文字へ展開され、上限 40 に収まる
    const raw = EXPANDING.repeat(2);

    // When
    const name = normalizedNameOf(join(raw));

    // Then
    expect(name.length).toBeLessThanOrEqual(MAX_DISPLAY_NAME);
  });

  it("上限ちょうどの通常文字は通る", () => {
    // Given / When / Then
    expect(normalizedNameOf(join("a".repeat(MAX_DISPLAY_NAME))).length).toBe(MAX_DISPLAY_NAME);
  });

  it("上限を 1 文字超えると拒否される", () => {
    // Given / When / Then
    expect(normalizeCommandNames(join("a".repeat(MAX_DISPLAY_NAME + 1))).isErr()).toBe(true);
  });
});
