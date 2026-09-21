/**
 * 表示名の正規化（実機の敵対的検証で見つかった素通り経路の回帰テスト）。
 *
 * 「画面で同じに見えるものは同じ文字列である」を保証する。これが崩れると、
 * 同名判定が発火せず識別子も添えられないまま、見分けの付かない行が並ぶ。
 *
 * #95 S1 で `packages/timer-core` から移設した。`CommandSchema`（境界での正規化）を
 * 見る 2 つの describe は timer-core 側に残してある。あれは timer のスキーマの検査であり、
 * メンバーシップ文脈の責務ではない。
 */

import { describe, it, expect } from "vitest";
import {
  normalizeDisplayName,
  nameSkeleton,
  conflictsWithExisting,
  rendersAsNothing,
} from "../src/index.js";

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

  /**
   * 制御文字でラベルの見出しを割ると、剥がしを逃れたうえで**ラベルが復活する**（#284）。
   *
   * 剥がし（`stripLabelMarkers`）が制御文字の除去より先に走っていたため、
   * `ID` の中や `:` の直前に 1 文字挟むだけで書式の照合が外れ、そのあと制御文字だけが
   * 落ちて `(ID: rqdK)` が完成していた。`<scr<script>ipt>` 型のすり抜けと同型で、
   * **実在の参加者と完全に同一のラベルを名乗れる**。
   *
   * 境界（`apps/tasuki-sync/.../display-name-rule.ts`）は正規化を 1 度しか掛けないので、
   * この値はそのまま保存・配信される。
   */
  it("制御文字でラベルの見出しを割っても剥がす（復活させない）", () => {
    // Given（準備）: `ID` の内側・`:` の直前に C0 制御文字を 1 つ挟む
    // When / Then（操作）
    expect(normalizeDisplayName("Bob（I\u0008D: rqdK）")).toBe("Bob");
    expect(normalizeDisplayName("Bob（ID\u007f: rqdK）")).toBe("Bob");
    expect(normalizeDisplayName("Bob(I\u0001D: rqdK)")).toBe("Bob");
    expect(normalizeDisplayName("Bob（\u001bID: rqdK）")).toBe("Bob");
  });

  it("剥がした結果はすべて素の名前に一致する（同名として識別子が付けられる）", () => {
    // Given
    const attacks = [
      "Bob" + ZWSP,
      "Bob（（ID: x）ID: rqdK）",
      "Bob（ＩＤ: rqdK）",
      "Bob（ID: rqdK",
      // 制御文字で見出しを割る形（#284）。剥がしの後に制御文字が落ちて復活していた
      "Bob（I\u0008D: rqdK）",
      "Bob（ID\u007f: rqdK）",
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
 * conflictsWithExisting（T061）。
 *
 * `apps/tasuki-sync/src/application/handlers.ts` の `participant.addProxy` /
 * `participant.rename` の重複検査を一元化した関数の回帰テスト。
 * 判定内容は現在の handlers.ts と**同一**にする
 * （`trim().toLowerCase()` の単純比較・自分自身を除外できる・`nameSkeleton` は使わない）。
 * より正しい判定（見た目の曖昧判定を拒否にも使う等）への変更は挙動変更になるため禁止。
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

/**
 * なりすましの反証探索（#284）。**列挙して満足せず、総当たりで数え直す。**
 *
 * ここは 3 度書き直している。毎回「塞いだ」と報告し、毎回残っていた:
 *
 * 1. 手で選んだ制御文字 4 種だけを見て緑にした（**544 件**を見逃した）
 * 2. オラクルを実装と**同じ述語**（`Default_Ignorable_Code_Point`）で書いた。
 *    実装が伏せる文字はオラクルも伏せるので、**述語の選び方が狭いことは
 *    原理的に検出できなかった**（**32 件**を見逃した。`\p{Cf}` から前置結合記号・
 *    割注・聖刻文字の書式制御を差し引いたぶん）
 * 3. 剥がしの回数上限（20）を考えず、**入れ子 21 段**で剥がし残しが通った
 *
 * **だからオラクルは実装より広く書く。** {@link INVISIBLE} は
 * `\p{Cc}` ∪ `\p{Cf}` ∪ `\p{Default_Ignorable_Code_Point}` の和で、
 * 実装が伏せる集合と**同じでなければならない**という要求は置いていない ——
 * 実装が狭ければ、その差はここで赤くなる。
 *
 * **それでもこれは「全部」ではない。** 字面を持たないのにこの 3 つの性質のどれにも
 * 入らない文字（外字・未割当の描画結果など）は、この基準では拾えない。言えるのは
 * **「この基準で走査した範囲では 0 件」**までである。
 */
describe("なりすましの反証探索（#284）", () => {
  /** 見出しの形。**実装とは別に書く**（実装の綴りが誤っていても気づけるように）。 */
  const LOOKS_LIKE_LABEL = /[（(]\s*ID\s*[:：]/iu;
  /** 画面に自分の字面を持たない文字。**実装の述語より広く取る。** */
  const INVISIBLE = /[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u;
  /** 目に映る姿（字面を持たない文字を伏せ、合成まで済ませる）。 */
  const asSeen = (value: string): string =>
    value.replace(new RegExp(INVISIBLE.source, "gu"), "").normalize("NFC");

  /**
   * 走査するコードポイント: **BMP 全域 ＋ 全 Unicode のうち字面を持たない文字**。
   *
   * 面を手で挙げると、挙げなかった面が見えない（2 巡目は BMP とタグ面だけを見ていて
   * U+110BD / U+110CD / U+13430–1343F を取り逃がした）。**全 17 面を 1 度なめて集める。**
   */
  function* codePoints(): Generator<number> {
    for (let cp = 0; cp <= 0xffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue; // サロゲート単体は文字ではない
      yield cp;
    }
    for (let cp = 0x10000; cp <= 0x10ffff; cp++) {
      if (INVISIBLE.test(String.fromCodePoint(cp))) yield cp;
    }
  }

  const hex = (cp: number): string => "U+" + cp.toString(16).toUpperCase().padStart(4, "0");

  it("条件1: 見出しを割れるコードポイントは、この基準で走査した範囲では 0 件", () => {
    // Given（準備）: 1 文字を見出しの内側・前後へ挟む
    const inject = (c: string): string[] => [
      `Bob(I${c}D: rqdK)`,
      `Bob(${c}ID: rqdK)`,
      `Bob(ID${c}: rqdK)`,
      `Bob(ID:${c} rqdK)`,
      `Bob（I${c}D: rqdK）`,
    ];

    // When（操作）: 総当たり
    const bypass: number[] = [];
    for (const cp of codePoints()) {
      const c = String.fromCodePoint(cp);
      for (const input of inject(c)) {
        if (LOOKS_LIKE_LABEL.test(asSeen(normalizeDisplayName(input)))) {
          bypass.push(cp);
          break;
        }
      }
    }

    // Then: 直す前は 32 件（U+0600–0605 ほか、`\p{Cf}` から差し引かれているもの）
    expect(bypass.map(hex).join(" ")).toBe("");
  }, 60_000);

  it("条件2: 入れ子を深くしても剥がし残しが通らない", () => {
    // Given（準備）: 剥がしは 20 回で打ち切っていた。**21 段で剥がし残しが返っていた**
    //   （`"Bob(ID: rqdK)ID: rqdK)"`）。上限 40 文字は正規化の**後**に課されるので、
    //   境界の前段が通す 720 文字ぶんだけ段を書ける
    const nested = (depth: number): string =>
      "Bob" + "(".repeat(depth) + "ID:x" + ")ID: rqdK".repeat(depth) + ")";

    // When / Then（操作）: 打ち切りの境目（19–21）と、その先まで
    for (const depth of [1, 19, 20, 21, 25, 40, 100]) {
      const out = normalizeDisplayName(nested(depth));
      expect(LOOKS_LIKE_LABEL.test(asSeen(out)), depth + " 段").toBe(false);
    }
  }, 60_000);

  it("条件3: 見た目が同じなのに骨格が割れるコードポイントは、この基準で走査した範囲では 0 件", () => {
    // Given（準備）: **結合記号を伴う形も作る。** 不可視を抜くとそこで合成が解禁されるので、
    //   抜いた後に NFKC を掛け直さないと `"Jose" + ZWJ + U+0301` が `"José"` と割れる
    const marks = ["", "\u0301", "\u0300", "\u030a", "\u0308"];

    // When（操作）
    const split: number[] = [];
    for (const cp of codePoints()) {
      const c = String.fromCodePoint(cp);
      for (const mark of marks) {
        const victim = "Jose" + mark;
        const attacker = "Jose" + c + mark;
        // 目に映る姿が同じなら、骨格も同じでなければ曖昧判定が発火しない
        if (asSeen(attacker) === asSeen(victim) && nameSkeleton(attacker) !== nameSkeleton(victim)) {
          split.push(cp);
          break;
        }
      }
    }

    // Then: 直す前は 4,271 件
    expect(split.map(hex).join(" ")).toBe("");
  }, 60_000);

  it("照合で伏せる集合と、骨格で伏せる集合が一致する", () => {
    // Given（準備）: 2 つが食い違うと、片方だけ広げたことに誰も気づけない。
    //   **内部の正規表現を覗かず、振る舞いの差で見る**
    //
    //   どちらの探りも**語の途中**へ挟む。末尾に置くと、骨格の側だけが前後の空白を
    //   落とすせいで「空白文字は骨格では消えるが照合では消えない」と出てしまい、
    //   集合の違いではなく空白の畳み方を測ることになる（実際に一度そうなった）。
    const disagree: number[] = [];

    // When（操作）
    for (const cp of codePoints()) {
      const c = String.fromCodePoint(cp);
      const hiddenWhenMatching = normalizeDisplayName(`Bob(I${c}D: rqdK)`) === "Bob";
      const hiddenInSkeleton = nameSkeleton(`Bo${c}b`) === nameSkeleton("Bob");
      if (hiddenWhenMatching !== hiddenInSkeleton) disagree.push(cp);
    }

    // Then
    expect(disagree.map(hex).join(" ")).toBe("");
  }, 60_000);

  it("ZWJ はラベルの外では残る（絵文字の連結を壊さない）", () => {
    // Given（準備）: 照合のときだけ伏せる、という作りが効いているか
    const ZWJ2 = "\u200d";
    const family = "\u{1f468}" + ZWJ2 + "\u{1f469}" + ZWJ2 + "\u{1f467}";

    // When / Then（操作）
    expect(normalizeDisplayName(family), "家族絵文字だけ").toBe(family);
    // **ラベルを付けても外側の ZWJ は生き残る**（単純に消す実装だと 3 つに分解される）
    expect(normalizeDisplayName(family + "(ID: rqdK)"), "家族絵文字＋ラベル").toBe(family);
    // ラベルの内側に居る ZWJ だけが、ラベルごと消える
    expect(normalizeDisplayName("Bob(I" + ZWJ2 + "D: rqdK)"), "ラベル内の ZWJ").toBe("Bob");
  });
});

/**
 * 字面の無い表示名（#284 の 3 巡目）。
 *
 * **長さだけを見ていると取り逃がす。** 第1層は ZWJ・U+FE0F・U+00AD・U+3164 などを
 * 正当な用途のために残すので、それ 1 文字だけの名前は「長さ 1」で通っていた ——
 * 玄関の欄は空に見えるのに `required` も `trim()` も素通りし、サーバーも弾かず、
 * **名前が 1 文字も見えない参加者**が名簿に並んだ。
 */
describe("rendersAsNothing（#284）", () => {
  it("字面を持たない文字だけの名前を落とす", () => {
    // Given（準備）: 第1層を生き延びる種類を並べる（U+200B は第1層で消えるので長さ 0）
    const blanks = [
      "\u200b", "\u200d", "\u00ad", "\ufe0f",
      "\u3164", "\u034f", "\u0600", "\ufff9", "   ", "",
    ];

    // When / Then（操作）: 境界と玄関はこの判定で拒む
    for (const raw of blanks) {
      expect(rendersAsNothing(normalizeDisplayName(raw)), JSON.stringify(raw)).toBe(true);
    }
  });

  it("字面のある名前は落とさない", () => {
    // Given（準備）: 絵文字・字形選択子つきの記号も「見える名前」である
    const visible = [
      "Bob",
      "ともひろ",
      "\u{1f468}\u200d\u{1f469}",
      "❤\ufe0f",
      "a\u200db",
    ];

    // When / Then（操作）
    for (const raw of visible) {
      expect(rendersAsNothing(normalizeDisplayName(raw)), JSON.stringify(raw)).toBe(false);
    }
  });
});

/**
 * 冪等性の反証探索（#284）。
 *
 * **手で選んだ入力で「冪等」と言ってはいけない。** 2 巡目は 7 入力だけを通して
 * `"A" + U+200B + U+030A`（1 度目が分解形・2 度目が合成形）を取り逃がし、
 * 3 巡目は生成語彙が短すぎて**入れ子 21 段の形へ構造的に届かなかった**
 * （剥がし残しは 2 度目で更に削れるので、そこでも冪等性が崩れていた）。
 *
 * ここでは語彙から入力を**生成し**、加えて**入れ子を長さで変えながら**突き合わせる。
 * 種は固定してあるので、落ちたら必ず再現する。
 */
describe("冪等性の反証探索（#284）", () => {
  /** 再現可能な擬似乱数（mulberry32）。 */
  function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** 正規化のどの段にも触る語彙。 */
  const ALPHABET = [
    "A", "a", "B", "o", "b", "か", "ｶ", "Ｂ", "O",
    // 結合記号（前の文字と合成しうる）
    "\u0300", "\u0301", "\u030a", "\u0308", "\u0327",
    "\u0653", "\u09be", "\u0f71",
    // 字面を持たない文字（抜けると合成が解禁される）
    "\u200b", "\u200c", "\u200d", "\u00ad", "\u034f",
    "\u2060", "\ufeff", "\ufe0f", "\ufe0e", "\u115f",
    "\u1160", "\u3164", "\u061c", "\u180e", "\u0600",
    "\ufff9", "\u{e0001}", "\u{e0100}",
    // 双方向制御
    "\u202a", "\u202e", "\u2066", "\u2069",
    // 制御文字・空白
    "\u0000", "\u0001", "\u001b", "\u007f", "\u009f",
    " ", "\t", "\n", "\u3000", "\u00a0",
    // ラベルの部品（入れ子が育つように括弧を厚めに入れる）
    "(", "(", "(", ")", ")", "（", "）", "I", "D", ":", "：", "ID", "ＩＤ", "id",
    // 互換分解・合成に効くもの
    "\ufdfa", "\u2163", "ﬁ", "①", "㍿",
    // 絵文字
    "\u{1f468}", "\u{1f469}", "\u{1f467}", "\u{1f600}",
  ];

  it("生成した入力で 2 度掛けても変わらない", () => {
    // Given（準備）: **長さを 1〜40 まで振る**。短いままだと入れ子の形へ届かない
    const next = rng(20260921);
    const counterexamples: string[] = [];

    // When（操作）
    for (let i = 0; i < 50_000; i++) {
      const len = 1 + Math.floor(next() * 40);
      let s = "";
      for (let k = 0; k < len; k++) s += ALPHABET[Math.floor(next() * ALPHABET.length)]!;
      const once = normalizeDisplayName(s);
      if (normalizeDisplayName(once) !== once) {
        counterexamples.push(JSON.stringify(s) + " -> " + JSON.stringify(once));
        if (counterexamples.length >= 5) break;
      }
    }

    // Then
    expect(counterexamples.join("\n")).toBe("");
  }, 60_000);

  it("入れ子の深さを変えても 2 度掛けで変わらない", () => {
    // Given（準備）: 剥がしを打ち切っていたときは、**残骸が 2 度目で更に削れていた**
    const nested = (depth: number): string =>
      "Bob" + "(".repeat(depth) + "ID:x" + ")ID: rqdK".repeat(depth) + ")";

    // When / Then（操作）: 境界の前段（720 文字）で書ける段数まで見る
    for (let depth = 1; depth <= 70; depth++) {
      const once = normalizeDisplayName(nested(depth));
      expect(normalizeDisplayName(once), depth + " 段").toBe(once);
    }
  }, 60_000);

  it("字面を持たない文字を抜くと合成が解禁される形（見つけた反例そのもの）", () => {
    // Given（準備）: U+200B を落とすと A と U+030A が隣り合い、2 度目で合成されていた
    const input = "A\u200b\u030a";

    // When（操作）
    const once = normalizeDisplayName(input);

    // Then: 1 度で合成まで済む（末尾の NFKC が無いと "A" + U+030A で止まる）
    expect(once).toBe("\u00c5");
    expect(normalizeDisplayName(once)).toBe(once);
  });
});
