/**
 * 表示名の正規化（実機の敵対的検証で見つかった素通り経路の回帰テスト）。
 *
 * 「画面で同じに見えるものは同じ文字列である」を保証する。これが崩れると、
 * 同名判定が発火せず識別子も添えられないまま、見分けの付かない行が並ぶ。
 */

import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { normalizeDisplayName, nameSkeleton, CommandSchema, MAX_DISPLAY_NAME } from "../src/index.js";

describe("normalizeDisplayName", () => {
  it("前後の空白を落とす（HTML が畳んで見分けが付かなくなるのを防ぐ）", () => {
    // "  Bob  " は画面では "Bob" と同一に見えるのに、文字列としては別物だった。
    expect(normalizeDisplayName("  Bob  ")).toBe("Bob");
  });

  it("改行・タブ・全角空白も1つの半角空白へ畳む", () => {
    // When / Then
    expect(normalizeDisplayName("Bob\nAdmin")).toBe("Bob Admin");
    expect(normalizeDisplayName("Bob\t\tSmith")).toBe("Bob Smith");
    expect(normalizeDisplayName("Bob　　Smith")).toBe("Bob Smith");
  });

  it("制御文字を落とす", () => {
    expect(normalizeDisplayName("Bob\u0000\u001b[31m")).toBe("Bob[31m");
  });

  it("識別子ラベルの書式を剥がす（なりすまし防止）", () => {
    // When / Then（これを名乗れると、実在の参加者と完全に同一のラベルを作れてしまう）
    expect(normalizeDisplayName("Bob（ID: 0x3P）")).toBe("Bob");
    expect(normalizeDisplayName("Bob(ID: 0x3P)")).toBe("Bob");
    expect(normalizeDisplayName("Bob（id：ZZZZ）")).toBe("Bob");
    expect(normalizeDisplayName("Bob（ ID : abcd ）")).toBe("Bob");
  });

  it("剥がした結果、本来の同名として扱えるようになる", () => {
    // なりすまし名は素の "Bob" になり、以後は通常の同名として識別子が添えられる。
    expect(normalizeDisplayName("Bob（ID: 0x3P）")).toBe(normalizeDisplayName("Bob"));
  });

  it("空白のみは空文字になる（可否は呼び出し側が決める）", () => {
    expect(normalizeDisplayName("   ")).toBe("");
    expect(normalizeDisplayName("\n\t")).toBe("");
  });

  it("通常の名前は変えない", () => {
    // When / Then
    expect(normalizeDisplayName("Bob")).toBe("Bob");
    expect(normalizeDisplayName("ともひろ")).toBe("ともひろ");
    expect(normalizeDisplayName("Ada Lovelace")).toBe("Ada Lovelace");
  });
});

describe("CommandSchema の表示名（境界での正規化）", () => {
  const join = (displayName: string) =>
    v.safeParse(CommandSchema, { command: "room.join", code: "AB0001", displayName, hasAiKey: false });

  it("room.join の表示名が正規化されて渡る", () => {
    // When
    const r = join("  Bob  ");
    // Then
    expect(r.success).toBe(true);
    if (r.success) expect((r.output as { displayName: string }).displayName).toBe("Bob");
  });

  it("room.join でも識別子ラベルは名乗れない", () => {
    // When
    const r = join("Bob（ID: 0x3P）");
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
    // When
    const rename = v.safeParse(CommandSchema, {
      command: "participant.rename", participantId: "p1", displayName: "  Bob（ID: zzzz）  ",
    });
    // Then
    expect(rename.success).toBe(true);
    if (rename.success) expect((rename.output as { displayName: string }).displayName).toBe("Bob");
  });

  it("participant.addProxy も同じ正規化を通る", () => {
    // When
    const proxy = v.safeParse(CommandSchema, {
      command: "participant.addProxy", participantId: "p2", displayName: "  Pair\tProgrammer ",
    });
    // Then
    expect(proxy.success).toBe(true);
    if (proxy.success) expect((proxy.output as { displayName: string }).displayName).toBe("Pair Programmer");
  });
});

// ─── 3巡目の敵対的検証で見つかった迂回経路 ──────────────────────────────────
// 前回入れた正規化そのものを標的にしたところ、4通りで破れた。

describe("normalizeDisplayName（防御の迂回に対する回帰）", () => {
  const ZWSP = "\u200b";
  const ZWNJ = "\u200c";
  const WJ = "\u2060";
  const ZWJ = "\u200d";

  it("ゼロ幅文字を落とす（画面では素の名前と同一に見えるため）", () => {
    // When / Then（\s に含まれないので空白の畳み込みでは落ちない）
    expect(normalizeDisplayName("Bob" + ZWSP)).toBe("Bob");
    expect(normalizeDisplayName("Bob" + ZWNJ)).toBe("Bob");
    expect(normalizeDisplayName("Bob" + WJ)).toBe("Bob");
    expect(normalizeDisplayName(ZWSP + "Bob" + ZWSP)).toBe("Bob");
  });

  it("ZWJ は残す（絵文字の連結という正当な用途があるため）", () => {
    // 家族絵文字が3つに分解されないようにする。見た目の偽装は nameSkeleton が拾う。
    const family = "\u{1f468}" + ZWJ + "\u{1f469}" + ZWJ + "\u{1f467}";
    expect(normalizeDisplayName(family + " Family")).toBe(family + " Family");
  });

  it("入れ子のラベル書式を、変化がなくなるまで剥がす", () => {
    // 1回だけだと内側が消えた結果が再びラベルの形になる（実在参加者の識別子を偽造できた）。
    expect(normalizeDisplayName("Bob（（ID: x）ID: rqdK）")).toBe("Bob");
    expect(normalizeDisplayName("Bob（（（ID: a）ID: b）ID: c）")).toBe("Bob");
  });

  it("全角のラベル書式も剥がす（NFKC で半角へ寄せてから判定する）", () => {
    expect(normalizeDisplayName("Bob（ＩＤ: rqdK）")).toBe("Bob");
    expect(normalizeDisplayName("Ｂｏｂ（ＩＤ：rqdK）")).toBe("Bob");
  });

  it("閉じ括弧が無いラベル書式も剥がす", () => {
    // 閉じないだけで剥がしを逃れられ、画面には識別子つきに見える文字列が残っていた。
    expect(normalizeDisplayName("Bob（ID: rqdK")).toBe("Bob");
    expect(normalizeDisplayName("Bob(ID: rqdK")).toBe("Bob");
  });

  it("剥がした結果はすべて素の名前に一致する（同名として識別子が付けられる）", () => {
    // Given
    const attacks = [
      "Bob" + ZWSP,
      "Bob（（ID: x）ID: rqdK）",
      "Bob（ＩＤ: rqdK）",
      "Bob（ID: rqdK",
    ];
    // When / Then
    for (const a of attacks) {
      expect(normalizeDisplayName(a), a).toBe("Bob");
    }
  });

  it("正当な名前は壊さない", () => {
    // When / Then
    expect(normalizeDisplayName("O'Brien")).toBe("O'Brien");
    expect(normalizeDisplayName("Jean-Luc")).toBe("Jean-Luc");
    expect(normalizeDisplayName("Ada Lovelace")).toBe("Ada Lovelace");
    // 括弧つきでも ID ラベルの形でなければ残す。
    expect(normalizeDisplayName("Bob (guest)")).toBe("Bob (guest)");
  });
});

describe("nameSkeleton（見え方による曖昧判定・第2層）", () => {
  it("キリル文字の見た目が同じ名前を同じ骨格へ寄せる", () => {
    // \u0412 はキリル大文字 В。Latin B と画面上まったく同じに見える。
    expect(nameSkeleton("\u0412ob")).toBe(nameSkeleton("Bob"));
  });

  it("ギリシャ文字も寄せる", () => {
    // \u0391 はギリシャ大文字 Α。
    expect(nameSkeleton("\u0391lice")).toBe(nameSkeleton("Alice"));
  });

  it("大文字小文字を畳む（サーバーの重複拒否と判定を揃える）", () => {
    expect(nameSkeleton("BOB")).toBe(nameSkeleton("bob"));
  });

  it("ZWJ を落とす（正規化では残すぶんをここで拾う）", () => {
    expect(nameSkeleton("Bob\u200d")).toBe(nameSkeleton("Bob"));
  });

  it("見た目が違う名前は別の骨格になる", () => {
    expect(nameSkeleton("Bob")).not.toBe(nameSkeleton("Bobby"));
    expect(nameSkeleton("たなか")).not.toBe(nameSkeleton("Tanaka"));
  });

  it("骨格は比較専用で、表示名を置き換えるものではない", () => {
    // キリル名がラテンに書き換わってしまっては、正当な利用者の名前を壊す。
    expect(normalizeDisplayName("\u0412ob")).toBe("\u0412ob");
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
    const ok = v.safeParse(CommandSchema, {
      command: "room.join", code: "AB0001", displayName: "a".repeat(MAX_DISPLAY_NAME), hasAiKey: false,
    });
    expect(ok.success).toBe(true);
  });

  it("上限を1文字超えると拒否される", () => {
    const ng = v.safeParse(CommandSchema, {
      command: "room.join", code: "AB0001", displayName: "a".repeat(MAX_DISPLAY_NAME + 1), hasAiKey: false,
    });
    expect(ng.success).toBe(false);
  });
});

describe("双方向制御文字（レビュー指摘・推奨）", () => {
  const RLO = "\u202e"; // RIGHT-TO-LEFT OVERRIDE
  const LRO = "\u202d";
  const PDF = "\u202c";
  const RLI = "\u2067";

  it("保存される値から落とす（表示上まったく別の名前に見せられるため）", () => {
    // When / Then（ZWJ と違い正当な用途が無い。第2層は「既存の名前と衝突したとき」しか拾わないので、
    // 単独で見た目を偽装する場合を取り逃がす）
    expect(normalizeDisplayName("Bob" + RLO + "xyz")).toBe("Bobxyz");
    expect(normalizeDisplayName("A" + LRO + "B" + PDF)).toBe("AB");
    expect(normalizeDisplayName("A" + RLI + "B")).toBe("AB");
  });

  it("落とした結果、素の名前と同一になり同名として扱える", () => {
    expect(normalizeDisplayName("Bob" + RLO)).toBe("Bob");
  });
});

describe("nameSkeleton のメモ化（レビュー指摘・提案）", () => {
  it("同じ入力を繰り返しても結果が変わらない", () => {
    const first = nameSkeleton("Bob");
    for (let i = 0; i < 5; i++) expect(nameSkeleton("Bob")).toBe(first);
  });

  it("メモが溢れても正しい値を返す（上限超えで捨てても純関数のまま）", () => {
    for (let i = 0; i < 600; i++) nameSkeleton("name-" + i);
    expect(nameSkeleton("\u0412ob")).toBe(nameSkeleton("Bob"));
  });
});
