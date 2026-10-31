/**
 * スクリプト同士の取り込みを許可表で固定するテスト（#361）。
 *
 * `scripts/` の検査スクリプトは、共有の部品を `scripts/lib/` から取り込む。ところが
 * スクリプトが**別のスクリプトを**取り込む形が 2 件あり、どれが意図した取り込みで、
 * どれがそうでないかを区別するものが無かった（#361 の計画 §1）。
 *
 * 2 件はどちらも単一の情報源を守るための取り込みである:
 * 走査の宣言 `SCANNED_PACKAGES` を `lib/` へ移すと、`scan-target-wiring.test.mjs` が
 * `audit-structure.mjs` の複製を書き換えて宣言を壊す検証が届かなくなる。
 * そこで取り込みをなくすのではなく、**許可表に理由つきで載せ、表に無いものを落とす。**
 * 決まりを文書ではなくコードで守らせる（設計正本 §2）。
 *
 * 見るもの:
 *   1. 表に無い取り込み（スクリプト → `scripts/lib/` 以外のスクリプト）
 *   2. 表にある取り込みでも、表に無い名前（`*` を含む）
 *   3. 死んだ許可（実体に一致しない行・取り込まれていない名前）
 *   4. `scripts/lib/` が `lib/` の外のスクリプトを取り込むこと（依存の向きの逆転）
 *   5. 走査対象が 0 件（ADR-0014 決定 8）
 *
 * 取り込みの読み取りは TypeScript の構文木で行う。コメントの中の
 * `export * from './a';` のような例文（`audit-public-surface.mjs` に実在する）を拾わないため。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { listTrackedFiles, hasZeroScanTargets } from "./lib/scan-targets.mjs";

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPTS_DIR, "..");

/**
 * 許可する「スクリプト → スクリプト」の取り込み。**理由が要る。**
 *
 * `names` は取り込んでよい名前の全部。足すときは、写さずに取り込む理由
 * （単一の情報源であること）を `reason` に書く。
 */
export const ALLOWED_SCRIPT_IMPORTS = [
  {
    from: "scripts/audit-public-surface.mjs",
    to: "scripts/audit-structure.mjs",
    names: ["SCANNED_PACKAGES", "entriesOf", "hasScanTarget"],
    reason:
      "走査の宣言とその述語の正本は audit-structure.mjs に置く。宣言をここに残すのは、" +
      "scan-target-wiring.test.mjs が複製を書き換えて宣言を壊す検証を届かせるため（#361 計画 §1）",
  },
  {
    from: "scripts/audit-ui-components.mjs",
    to: "scripts/audit-web-sync-boundary.mjs",
    names: ["listWebAppDirs"],
    reason:
      "web アプリの範囲（vite.config.ts の実在から導く。ADR-0019 決定 2）の正本は " +
      "audit-web-sync-boundary.mjs に置く。写すと 2 つの検査の範囲がずれうる",
  },
  {
    from: "scripts/audit-agent-entries.mjs",
    to: "scripts/audit-plan-gate.mjs",
    names: ["CONSTITUTION_PATH", "extractPrinciples"],
    reason:
      "憲法の置き場と原則の見出しの読み方の正本は audit-plan-gate.mjs に置く。写すと、" +
      "憲法の見出しの形が変わったときに片方の検査だけが読み方を直すことになる（#483）",
  },
];

/** 取り込みとして読むファイル（テストは除く。テストは自分の検査を取り込む）。 */
function isScannedScript(rel) {
  return rel.endsWith(".mjs") && !rel.endsWith(".test.mjs");
}

function isLib(rel) {
  return rel.startsWith("scripts/lib/");
}

/**
 * 1 ファイルの相対の取り込みを、構文木から読む。
 * @returns {{ spec: string, names: string[] }[]} `names` の `*` は名前空間か全再エクスポート、
 *   `default` は既定の取り込み。副作用だけの取り込みと動的 import は `names` が空。
 */
export function readRelativeImports(source) {
  const sf = ts.createSourceFile("x.mjs", source, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  const found = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const names = [];
      const clause = node.importClause;
      if (clause?.name) names.push("default");
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) names.push("*");
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) names.push((el.propertyName ?? el.name).text);
      }
      found.push({ spec: node.moduleSpecifier.text, names });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.exportClause;
      const names =
        clause && ts.isNamedExports(clause)
          ? clause.elements.map((el) => (el.propertyName ?? el.name).text)
          : ["*"];
      found.push({ spec: node.moduleSpecifier.text, names });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      found.push({ spec: node.arguments[0].text, names: ["*"] });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found.filter((i) => i.spec.startsWith("."));
}

/**
 * 問題を返す（純粋）。問題が無ければ空配列。
 *
 * @param files `Map<リポジトリ相対パス, ソース>`。走査するスクリプトだけを入れる
 * @param allowed 許可表
 */
export function findScriptImportProblems(files, allowed) {
  const problems = [];
  const used = new Map(allowed.map((a) => [`${a.from} → ${a.to}`, new Set()]));

  for (const [from, source] of files) {
    for (const { spec, names } of readRelativeImports(source)) {
      const to = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
      if (!to.startsWith("scripts/")) continue; // scripts の外は別の検査の領分
      if (isLib(to)) continue;
      if (isLib(from)) {
        problems.push(`lib から lib の外のスクリプトを取り込んでいます: ${from} → ${to}（依存の向きが逆）`);
        continue;
      }
      const key = `${from} → ${to}`;
      const entry = allowed.find((a) => a.from === from && a.to === to);
      if (!entry) {
        problems.push(
          `表に無い取り込み: ${key}（共有するなら scripts/lib/ へ置くか、理由つきで ALLOWED_SCRIPT_IMPORTS に載せる）`,
        );
        continue;
      }
      for (const name of names) {
        if (entry.names.includes(name)) used.get(key).add(name);
        else problems.push(`表に無い名前の取り込み: ${key} の ${name}`);
      }
    }
  }

  for (const a of allowed) {
    const key = `${a.from} → ${a.to}`;
    const seen = used.get(key);
    if (seen.size === 0) {
      problems.push(`死んだ許可（実体に一致しない）: ${key}`);
      continue;
    }
    for (const name of a.names) {
      if (!seen.has(name)) problems.push(`死んだ許可（取り込まれていない名前）: ${key} の ${name}`);
    }
  }
  return problems;
}

/** 実リポジトリの走査対象を読む。 */
function readRepoScripts() {
  const rels = listTrackedFiles(REPO_ROOT, ["scripts/*.mjs"]).filter(isScannedScript);
  return new Map(rels.map((rel) => [rel, fs.readFileSync(path.join(REPO_ROOT, rel), "utf8")]));
}

describe("readRelativeImports（取り込みの読み取り）", () => {
  test("名前つき・既定・名前空間・再エクスポート・動的 import を読み分ける", () => {
    // Given: 取り込みの書き方を一通り並べたソース
    const source = [
      'import a, { b, c as d } from "./x.mjs";',
      'import * as ns from "./y.mjs";',
      'export { e } from "./z.mjs";',
      'export * from "./w.mjs";',
      'const m = await import("./v.mjs");',
      'import "./side.mjs";',
      'import fs from "node:fs";',
    ].join("\n");
    // When
    const imports = readRelativeImports(source);
    // Then: 別名は元の名前で読み、パッケージの取り込みは拾わない
    assert.deepEqual(imports, [
      { spec: "./x.mjs", names: ["default", "b", "c"] },
      { spec: "./y.mjs", names: ["*"] },
      { spec: "./z.mjs", names: ["e"] },
      { spec: "./w.mjs", names: ["*"] },
      { spec: "./v.mjs", names: ["*"] },
      { spec: "./side.mjs", names: [] },
    ]);
  });

  test("コメントの中の例文は取り込みとして読まない", () => {
    // Given: audit-public-surface.mjs の注記と同じ形の例文
    const source = "/* `export * from './legacy';` のような行 */\n// import { x } from './y.mjs';\n";
    // When
    const imports = readRelativeImports(source);
    // Then
    assert.deepEqual(imports, []);
  });
});

describe("findScriptImportProblems（判定）", () => {
  const allowed = [{ from: "scripts/a.mjs", to: "scripts/b.mjs", names: ["X"], reason: "テスト用" }];

  test("lib からの取り込みと、表にある取り込みは問題にしない", () => {
    // Given
    const files = new Map([
      ["scripts/a.mjs", 'import { X } from "./b.mjs";\nimport { y } from "./lib/y.mjs";'],
      ["scripts/lib/y.mjs", 'import { z } from "./z.mjs";'],
    ]);
    // When
    const problems = findScriptImportProblems(files, allowed);
    // Then
    assert.deepEqual(problems, []);
  });

  test("表に無い取り込みを名指しで落とす", () => {
    // Given: 表に無い c.mjs → b.mjs
    const files = new Map([
      ["scripts/a.mjs", 'import { X } from "./b.mjs";'],
      ["scripts/c.mjs", 'import { X } from "./b.mjs";'],
    ]);
    // When
    const problems = findScriptImportProblems(files, allowed);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /表に無い取り込み: scripts\/c\.mjs → scripts\/b\.mjs/);
  });

  test("表にある取り込みでも、表に無い名前と名前空間の取り込みを落とす", () => {
    // Given: X のほかに Y を取り込み、さらに名前空間でも取り込む
    const files = new Map([["scripts/a.mjs", 'import { X, Y } from "./b.mjs";\nimport * as all from "./b.mjs";']]);
    // When
    const problems = findScriptImportProblems(files, allowed);
    // Then
    assert.deepEqual(problems, [
      "表に無い名前の取り込み: scripts/a.mjs → scripts/b.mjs の Y",
      "表に無い名前の取り込み: scripts/a.mjs → scripts/b.mjs の *",
    ]);
  });

  test("実体に一致しない許可と、取り込まれていない名前を死んだ許可として落とす", () => {
    // Given: 表の行に一致する取り込みが無い／表の名前の一部しか取り込まない
    const twoNames = [{ from: "scripts/a.mjs", to: "scripts/b.mjs", names: ["X", "Z"], reason: "テスト用" }];
    // When
    const none = findScriptImportProblems(new Map([["scripts/a.mjs", ""]]), allowed);
    const partial = findScriptImportProblems(new Map([["scripts/a.mjs", 'import { X } from "./b.mjs";']]), twoNames);
    // Then
    assert.deepEqual(none, ["死んだ許可（実体に一致しない）: scripts/a.mjs → scripts/b.mjs"]);
    assert.deepEqual(partial, ["死んだ許可（取り込まれていない名前）: scripts/a.mjs → scripts/b.mjs の Z"]);
  });

  test("lib が lib の外のスクリプトを取り込むと落とす", () => {
    // Given: 共有の部品が検査スクリプトを取り込む（向きが逆）
    const files = new Map([["scripts/lib/y.mjs", 'import { X } from "../b.mjs";']]);
    // When
    const problems = findScriptImportProblems(files, []);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /lib から lib の外のスクリプトを取り込んでいます: scripts\/lib\/y\.mjs → scripts\/b\.mjs/);
  });
});

describe("実リポジトリ: scripts/ の取り込みは許可表のとおり", () => {
  test("走査対象が 0 件でなく、問題が 0 件", (t) => {
    // Given: 追跡下の scripts/**/*.mjs（テストを除く）
    const files = readRepoScripts();
    const importCount = [...files.values()].reduce((n, s) => n + readRelativeImports(s).length, 0);
    // 走査量は成否によらず出す（ADR-0014 決定 6）
    t.diagnostic(`走査対象: ${files.size} ファイル / 相対の取り込み ${importCount} 件 / 許可 ${ALLOWED_SCRIPT_IMPORTS.length} 件`);
    assert.equal(hasZeroScanTargets(files.size), false, "走査対象が 0 件です（検査が空振りします）");
    // When
    const problems = findScriptImportProblems(files, ALLOWED_SCRIPT_IMPORTS);
    // Then
    assert.deepEqual(problems, []);
  });

  test("許可表の各行に理由がある", () => {
    // Given / When
    const missing = ALLOWED_SCRIPT_IMPORTS.filter((a) => typeof a.reason !== "string" || a.reason.trim() === "");
    // Then
    assert.deepEqual(missing, []);
  });
});
