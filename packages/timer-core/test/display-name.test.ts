/**
 * 表示名の正規化（実機の敵対的検証で見つかった素通り経路の回帰テスト）。
 *
 * 「画面で同じに見えるものは同じ文字列である」を保証する。これが崩れると、
 * 同名判定が発火せず識別子も添えられないまま、見分けの付かない行が並ぶ。
 */

import { describe, it, expect } from "vitest";
import * as v from "valibot";
import { nameSkeleton, conflictsWithExisting, CommandSchema } from "../src/index.js";
// 公開契約（index.ts）に載せない記号は宣言ファイルから直接取る（#220）。
// 外の製品コードが取り込まないものは列挙しない、が ADR-0016 追記の条件である。
import { normalizeDisplayName } from "../src/display-name.js";
import { MAX_DISPLAY_NAME } from "../src/aggregate.js";

describe("normalizeDisplayName", () => {
  it("前後の空白を落とす（HTML が畳んで見分けが付かなくなるのを防ぐ）", () => {
    // "  Bob  " は画面では "Bob" と同一に見えるのに、文字列としては別物だった。
    expect(normalizeDisplayName("  Bob  ")).toBe("Bob");
  });

  it("改行・タブ・全角空白も1つの半角空白へ畳む", () => {
    // Given（入力と期待値の組をそれぞれ1行で示す）
    // When / Then
    expect(normalizeDisplayName("Bob\nAdmin")).toBe("Bob Admin");
    expect(normalizeDisplayName("Bob\t\tSmith")).toBe("Bob Smith");
    expect(normalizeDisplayName("Bob　　Smith")).toBe("Bob Smith");
  });

  it("制御文字を落とす", () => {
    expect(normalizeDisplayName("Bob\u0000\u001b[31m")).toBe("Bob[31m");
  });

  it("識別子ラベルの書式を剥がす（なりすまし防止）", () => {
    // Given（入力と期待値の組をそれぞれ1行で示す）
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
    // Given（入力と期待値の組をそれぞれ1行で示す）
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

// ─── 3巡目の敵対的検証で見つかった迂回経路 ──────────────────────────────────
// 前回入れた正規化そのものを標的にしたところ、4通りで破れた。

describe("normalizeDisplayName（防御の迂回に対する回帰）", () => {
  const ZWSP = "\u200b";
  const ZWNJ = "\u200c";
  const WJ = "\u2060";
  const ZWJ = "\u200d";

  it("ゼロ幅文字を落とす（画面では素の名前と同一に見えるため）", () => {
    // Given（入力と期待値の組をそれぞれ1行で示す）
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
    // Given（入力と期待値の組をそれぞれ1行で示す）
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

describe("双方向制御文字（レビュー指摘・推奨）", () => {
  const RLO = "\u202e"; // RIGHT-TO-LEFT OVERRIDE
  const LRO = "\u202d";
  const PDF = "\u202c";
  const RLI = "\u2067";

  it("保存される値から落とす（表示上まったく別の名前に見せられるため）", () => {
    // Given（入力と期待値の組をそれぞれ1行で示す）
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

/**
 * conflictsWithExisting\uff08T061\uff09\u3002
 *
 * `apps/sync/src/application/handlers.ts` \u306e `participant.addProxy` /
 * `participant.rename` \u306e\u91cd\u8907\u691c\u67fb\u3092\u4e00\u5143\u5316\u3057\u305f\u95a2\u6570\u306e\u56de\u5e30\u30c6\u30b9\u30c8\u3002
 * \u5224\u5b9a\u5185\u5bb9\u306f\u73fe\u5728\u306e handlers.ts \u3068**\u540c\u4e00**\u306b\u3059\u308b
 * \uff08`trim().toLowerCase()` \u306e\u5358\u7d14\u6bd4\u8f03\u30fb\u81ea\u5206\u81ea\u8eab\u3092\u9664\u5916\u3067\u304d\u308b\u30fb`nameSkeleton` \u306f\u4f7f\u308f\u306a\u3044\uff09\u3002
 * \u3088\u308a\u6b63\u3057\u3044\u5224\u5b9a\uff08\u898b\u305f\u76ee\u306e\u66d6\u6627\u5224\u5b9a\u3092\u62d2\u5426\u306b\u3082\u4f7f\u3046\u7b49\uff09\u3078\u306e\u5909\u66f4\u306f\u6319\u52d5\u5909\u66f4\u306b\u306a\u308b\u305f\u3081\u7981\u6b62\u3002
 */
describe("conflictsWithExisting", () => {
  const participants = [
    { participantId: "p1", displayName: "Alice" },
    { participantId: "p2", displayName: "Bob" },
  ];

  it("\u5b8c\u5168\u4e00\u81f4\u3059\u308b\u8868\u793a\u540d\u304c\u3042\u308c\u3070\u885d\u7a81\u3068\u307f\u306a\u3059", () => {
    expect(conflictsWithExisting(participants, "Bob")).toBe(true);
  });

  it("\u8a72\u5f53\u3059\u308b\u8868\u793a\u540d\u304c\u306a\u3051\u308c\u3070\u885d\u7a81\u3057\u306a\u3044", () => {
    expect(conflictsWithExisting(participants, "Carol")).toBe(false);
  });

  it("\u524d\u5f8c\u306e\u7a7a\u767d\u3068\u5927\u6587\u5b57\u5c0f\u6587\u5b57\u306e\u9055\u3044\u3092\u7121\u8996\u3057\u3066\u6bd4\u8f03\u3059\u308b\uff08handlers.ts \u3068\u540c\u4e00\u306e\u5224\u5b9a\uff09", () => {
    expect(conflictsWithExisting(participants, "  bob  ")).toBe(true);
    expect(conflictsWithExisting(participants, "BOB")).toBe(true);
  });

  it("excludeId \u3092\u6307\u5b9a\u3059\u308b\u3068\u81ea\u5206\u81ea\u8eab\u306f\u6bd4\u8f03\u5bfe\u8c61\u304b\u3089\u9664\u5916\u3059\u308b\uff08rename \u306e\u73fe\u5728\u540d\u3078\u306e\u6539\u540d\u306f\u8a31\u53ef\uff09", () => {
    // p2 \u81ea\u8eab\u306e\u73fe\u5728\u540d\uff08Bob\uff09\u3078\u306e\u6539\u540d\u306f no-op \u76f8\u5f53\u3067\u8a31\u53ef\u3055\u308c\u308b\uff08handlers.ts \u306e rename \u691c\u67fb\u3068\u540c\u4e00\uff09\u3002
    expect(conflictsWithExisting(participants, "Bob", "p2")).toBe(false);
    // \u4ed6\u4eba\uff08p1 = Alice\uff09\u3068\u540c\u3058\u540d\u524d\u306b\u3057\u3088\u3046\u3068\u3059\u308b\u5834\u5408\u306f excludeId \u304c\u3042\u3063\u3066\u3082\u885d\u7a81\u3059\u308b\u3002
    expect(conflictsWithExisting(participants, "Alice", "p2")).toBe(true);
  });

  it("excludeId \u3092\u7701\u7565\u3059\u308b\u3068\u5168\u54e1\u3068\u6bd4\u8f03\u3059\u308b\uff08addProxy \u306e\u91cd\u8907\u691c\u67fb\u3068\u540c\u4e00\u3002\u81ea\u5206\u81ea\u8eab\u3068\u3044\u3046\u6982\u5ff5\u304c\u306a\u3044\uff09", () => {
    expect(conflictsWithExisting(participants, "Alice")).toBe(true);
  });

  it("\u898b\u305f\u76ee\u304c\u7d1b\u3089\u308f\u3057\u3044\u6587\u5b57\uff08nameSkeleton \u76f8\u5f53\uff09\u3067\u3082\u885d\u7a81\u3068\u5224\u5b9a\u3057\u306a\u3044\uff08\u62d2\u5426\u306b\u306f\u7b2c2\u5c64\u3092\u4f7f\u308f\u306a\u3044\uff09", () => {
    // "\u0412" (\u30ad\u30ea\u30eb\u6587\u5b57) \u306f "B" \u3068\u898b\u305f\u76ee\u304c\u540c\u3058\u3060\u304c\u3001trim/lowercase \u306e\u5358\u7d14\u6bd4\u8f03\u3067\u306f\u5225\u7269\u3068\u3057\u3066\u6271\u3046\u3002
    // nameSkeleton \u3092\u4f7f\u3046\u300c\u3088\u308a\u6b63\u3057\u3044\u5224\u5b9a\u300d\u3078\u306e\u5909\u66f4\u306f\u3053\u3053\u3067\u691c\u51fa\u3059\u308b\uff08\u632f\u308b\u821e\u3044\u306e\u5909\u66f4\u306e\u305f\u3081\u7981\u6b62\uff09\u3002
    expect(conflictsWithExisting(participants, "\u0412ob")).toBe(false);
  });

  it("\u7a7a\u914d\u5217\u306a\u3089\u5e38\u306b\u885d\u7a81\u3057\u306a\u3044", () => {
    expect(conflictsWithExisting([], "Bob")).toBe(false);
  });
});
