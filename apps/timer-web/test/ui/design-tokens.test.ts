/**
 * 画面のコードに「生の色」を書かせない。
 *
 * @requirements FR-032（色のみに依存しない表現・WCAG AA のコントラスト）
 *
 * #78 でパレットを計器（朱・ほぼ黒）からカードテーブル（真鍮・フェルト緑）へ
 * 差し替えたとき、**トークンは切り替わったのに `rgba(255,74,46,0.3)` のような
 * 生の値が 62 箇所取り残された**。緑の卓の上に旧パレットの朱が残り、見た目が割れた。
 *
 * さらに悪いことに、`--urgent` が暗赤から明るいサーモンへ変わったのに `text-white`
 * が残り、**白文字のコントラストが 2.62 まで落ちていた**（AA は 4.5）。
 * 生の色は「パレットを変えたときに追従しない」だけでなく、**可読性を静かに壊す**。
 *
 * 例外は「色がパレットに属さない」ものだけに限る（下の ALLOW を参照）。
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** 走査対象（画面とコンポーネント）。テストファイルからの相対で解く。 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../src");

/**
 * 許すもの。**「卓の色に属さない」ことが理由になるものだけ。**
 * 「直すのが面倒」は理由にしない。
 */
const ALLOW: { file: string; pattern: RegExp }[] = [
  // いまは無い。QR の白地と影の黒は、素の CSS へ移した（`.invite-panel-qr` は `ui-exempt:` つき・影は `--shadow-dialog`）。
  // 移していない画面に残る生の色の例外を足すなら、ここへ理由つきで書く。
];

/** Tailwind に同梱の色（卓のパレットの外にある色相）。 */
const TAILWIND_HUES =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const COLOR_UTILITIES = "text|bg|border|ring|fill|stroke|from|to|via|divide|outline|shadow|accent|caret|decoration";

/**
 * 生の色の書き方。
 *
 * **Tailwind 同梱の色（`text-amber-300` など）も禁じる。** 16 進と rgba だけを見ていた
 * 版では琥珀が 6 箇所生き残っており、卓に無い色相が残っていた（#78 PR-2 の取りこぼし）。
 */
const RAW_COLOR = new RegExp(
  [
    "#[0-9a-fA-F]{3,8}\\b",
    "rgba?\\([0-9][^)]*\\)",
    `\\b(?:${COLOR_UTILITIES})-(?:white|black)\\b`,
    `\\b(?:${COLOR_UTILITIES})-(?:${TAILWIND_HUES})-[0-9]{2,3}(?:/[0-9]+)?\\b`,
  ].join("|"),
  "g",
);

/** 走査対象の `.tsx` と `.ts`（設計正本 D10・E5。関数でクラス名を返す `.ts` も色を書きうる）。 */
function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(name)) acc.push(full);
  }
  return acc;
}

/** コメントを落とす（説明文に書いた色はコードではない）。 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function isAllowed(relative: string, hit: string): boolean {
  return ALLOW.some(
    (a) => (a.file === "*" || a.file === relative) && a.pattern.test(hit),
  );
}

describe("画面のコードに生の色を書かない（#78 デザインシステム）", () => {
  it("src 配下の .tsx / .ts が、トークンを経由しない色を持たない", () => {
    // Given（走査対象の全 .tsx / .ts）
    const files = sourceFiles(ROOT);
    expect(files.length).toBeGreaterThan(20); // 走査対象が消えて空振りするのを防ぐ
    // .ts も走査に入っている（設計正本 D10・E5。関数でクラス名を返す presence.ts など）
    expect(files.some((f) => f.endsWith(".ts"))).toBe(true);

    // When（コメントを除いた本文から生の色を集める）
    const offenders: string[] = [];
    for (const full of files) {
      const relative = full.slice(ROOT.length + 1);
      const body = stripComments(readFileSync(full, "utf8"));
      for (const hit of body.match(RAW_COLOR) ?? []) {
        if (!isAllowed(relative, hit)) offenders.push(`${relative}: ${hit}`);
      }
    }

    // Then
    expect(offenders).toEqual([]);
  });

  it("ALLOW の各項目は 1 度以上使われている（直した後に例外だけが残らない）", () => {
    // Given（走査対象の全 .tsx / .ts）
    const files = sourceFiles(ROOT);
    // When（項目ごとに当たった回数を数える）
    const used = new Map(ALLOW.map((a) => [a, 0]));
    for (const full of files) {
      const relative = full.slice(ROOT.length + 1);
      const body = stripComments(readFileSync(full, "utf8"));
      for (const hit of body.match(RAW_COLOR) ?? []) {
        for (const a of ALLOW) {
          if ((a.file === "*" || a.file === relative) && a.pattern.test(hit)) used.set(a, (used.get(a) ?? 0) + 1);
        }
      }
    }
    // Then
    const unused = [...used].filter(([, n]) => n === 0).map(([a]) => `${a.file}: ${a.pattern}`);
    expect(unused).toEqual([]);
  });
});
