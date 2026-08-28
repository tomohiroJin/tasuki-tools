/**
 * scripts/audit-structure.mjs の単体テスト（T002）
 *
 * 既知の入力（インライン文字列・小さな Map）に対する期待値を固定する。
 * 実リポジトリ全体はスキャンしない（遅く壊れやすいテストを避けるため・spec/plan の指示）。
 * Node 組み込みの test runner（node:test）を使う。新規依存は追加しない。
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  extractImportSpecifiers,
  resolveRelativeImport,
  computeReachableFiles,
  sc027UnreachableModules,
  sc028DuplicateTestDoubles,
  extractTestNames,
  sc029SpecIdsInNames,
  sc030CallNamesInNames,
  splitIntoTestBodies,
  sc031GuardExpects,
  sc032GwtMarkers,
  sc036TestCount,
  extractCodeMessagePairs,
  extractClientErrorTable,
  sc035MessageDefinitions,
  sc039aUnreachableBranchInApps,
  stripStringsAndComments,
  extractPublicDeclarations,
  sc039bUnusedPublicData,
  sc039cSelfOnlyPublicSymbols,
  findStaleSymbolExceptions,
  findStaleTestExceptions,
  formatTable,
  hasScanTarget,
  findInvalidDeclarations,
  loadScanTargets,
  measureScanVolume,
  formatScanVolume,
  scanVolumeDimensions,
} from "./audit-structure.mjs";

describe("SC-027: 到達しないモジュール（グラフ探索）", () => {
  test("相対 import の .js 指定子は .ts ファイルへ解決される", () => {
    const files = new Map([
      ["index.ts", 'export * from "./a.js";'],
      ["a.ts", "export const A = 1;"],
    ]);
    const resolved = resolveRelativeImport("index.ts", "./a.js", files);
    assert.equal(resolved, "a.ts");
  });

  test("拡張子省略の import は index.ts へも解決される", () => {
    const files = new Map([
      ["index.ts", 'import "./sub";'],
      ["sub/index.ts", "export const X = 1;"],
    ]);
    const resolved = resolveRelativeImport("index.ts", "./sub", files);
    assert.equal(resolved, "sub/index.ts");
  });

  test("非相対 import（パッケージ間参照）は解決しない", () => {
    const files = new Map([["index.ts", 'import { x } from "@tasuki/timer-core";']]);
    assert.equal(resolveRelativeImport("index.ts", "@tasuki/timer-core", files), null);
  });

  test("入口から辿って到達するファイルのみが到達可能集合に入る", () => {
    const files = new Map([
      ["index.ts", 'export * from "./used.js";'],
      ["used.ts", "export const U = 1;"],
      ["orphan.ts", "export const O = 1;"],
    ]);
    const reachable = computeReachableFiles(files, ["index.ts"]);
    assert.ok(reachable.has("index.ts"));
    assert.ok(reachable.has("used.ts"));
    assert.ok(!reachable.has("orphan.ts"));
  });

  test("入口から到達しないファイルが 1 件であれば SC-027 は 1 を返す", () => {
    const files = new Map([
      ["index.ts", 'export * from "./used.js";'],
      ["used.ts", "export const U = 1;"],
      ["orphan.ts", "export const O = 1;"],
    ]);
    assert.equal(sc027UnreachableModules(files, ["index.ts"]), 1);
  });

  test("すべてのファイルが到達可能なら SC-027 は 0 を返す", () => {
    const files = new Map([
      ["index.ts", 'export * from "./used.js";'],
      ["used.ts", "export const U = 1;"],
    ]);
    assert.equal(sc027UnreachableModules(files, ["index.ts"]), 0);
  });
});

describe("SC-028: テストダブルの重複定義", () => {
  test("同名の Fake が 2 ファイルで定義されていれば 1 種として数える", () => {
    const testFiles = new Map([
      ["a.test.ts", "class FakeClock {}"],
      ["b.test.ts", "class FakeClock {}"],
      ["c.test.ts", "const SpyOnly = {};"],
    ]);
    assert.equal(sc028DuplicateTestDoubles(testFiles), 1);
  });

  test("1 ファイルにしか無い定義は重複として数えない", () => {
    const testFiles = new Map([["a.test.ts", "function FakeAudio() {}"]]);
    assert.equal(sc028DuplicateTestDoubles(testFiles), 0);
  });

  test("欠陥1回帰: 同一ファイル内で同名が複数回定義されていても『箇所』として数える（ファイル境界を問わない）", () => {
    // apps/web/test/platform/sound.test.ts の実例を単純化したもの:
    // 同一ファイル内で FakeAudio が複数回、FakeOsc が複数回、別々に定義されている。
    const testFiles = new Map([
      [
        "sound.test.ts",
        [
          "class FakeOsc {}",
          "class FakeGain {}",
          "class FakeAudio {}",
          "class FakeAudio {}",
          "class FakeOsc {}",
          "class FakeAudio {}",
        ].join("\n"),
      ],
    ]);
    // FakeAudio(3箇所) と FakeOsc(2箇所) の 2 種が対象。FakeGain は 1 箇所のみなので対象外。
    assert.equal(sc028DuplicateTestDoubles(testFiles), 2);
  });
});

describe("SC-029: テスト名に含まれる仕様の識別番号", () => {
  test("it の名前に FR-番号を含む場合に 1 件と数える", () => {
    const testFiles = new Map([["a.test.ts", 'it("FR-006 を満たす", () => {});']]);
    assert.equal(sc029SpecIdsInNames(testFiles), 1);
  });

  test("describe の名前は対象に含めない", () => {
    const testFiles = new Map([
      ["a.test.ts", 'describe("FR-006", () => { it("交代する", () => {}); });'],
    ]);
    assert.equal(sc029SpecIdsInNames(testFiles), 0);
  });

  test("FR-093 の例外表にあるファイルは除外する", () => {
    const testFiles = new Map([
      [
        "packages/core/test/permissions-differential.test.ts",
        'it("FR-072 のケース", () => {});',
      ],
    ]);
    const count = sc029SpecIdsInNames(testFiles, [
      "packages/core/test/permissions-differential.test.ts",
    ]);
    assert.equal(count, 0);
  });
});

describe("SC-030: テスト名に含まれる呼び出しの言い回し", () => {
  test("「呼ばれる」を含む名前は 1 件と数える", () => {
    const testFiles = new Map([["a.test.ts", 'it("advanceDriver が呼ばれる", () => {});']]);
    assert.equal(sc030CallNamesInNames(testFiles), 1);
  });

  test("観測可能な結果を述べているだけの名前は数えない", () => {
    const testFiles = new Map([["a.test.ts", 'it("次のドライバーに交代する", () => {});']]);
    assert.equal(sc030CallNamesInNames(testFiles), 0);
  });
});

describe("SC-031: 前提段階に置かれた検証（ガード expect）", () => {
  test("後ろに別の expect があるガードは 1 件と数える", () => {
    const testFiles = new Map([
      [
        "a.test.ts",
        [
          'it("正常系を検証する", () => {',
          "  const result = decide(cmd);",
          "  expect(result.isOk()).toBe(true);",
          "  expect(result.value.driver).toBe(1);",
          "});",
        ].join("\n"),
      ],
    ]);
    assert.equal(sc031GuardExpects(testFiles), 1);
  });

  test("そのテストの最後の expect である場合は検証そのものとみなし数えない", () => {
    const testFiles = new Map([
      [
        "a.test.ts",
        [
          'it("正常系を検証する", () => {',
          "  const result = decide(cmd);",
          "  expect(result.isOk()).toBe(true);",
          "});",
        ].join("\n"),
      ],
    ]);
    assert.equal(sc031GuardExpects(testFiles), 0);
  });

  test("当初 95→実際 84 の過大計上バグの再発防止: 複数テストが並ぶ中でも各テストの最後だけを除外する", () => {
    const testFiles = new Map([
      [
        "a.test.ts",
        [
          'it("1件目", () => {',
          "  expect(a.isOk()).toBe(true);", // ガード（後ろに別 expect あり）
          "  expect(a.value).toBe(1);",
          "});",
          'it("2件目", () => {',
          "  expect(b.isOk()).toBe(true);", // 最後の expect なので Then
          "});",
        ].join("\n"),
      ],
    ]);
    // 1件目のみガードとして計上（=1）。2件目は最後の expect なので計上しない。
    assert.equal(sc031GuardExpects(testFiles), 1);
  });
});

describe("SC-032: GWT の区切り", () => {
  test("本体 2 行以下のテストは分母に含めない", () => {
    const testFiles = new Map([
      ["a.test.ts", ['it("2行で完結する", () => {', "  expect(f()).toBe(1);", "});"].join("\n")],
    ]);
    const { denominator } = sc032GwtMarkers(testFiles);
    assert.equal(denominator, 0);
  });

  test("本体 3 行以上かつ Given/When 区切りがあれば分子に数える", () => {
    const testFiles = new Map([
      [
        "a.test.ts",
        [
          'it("交代する", () => {',
          "  // Given",
          "  const room = aRoom().build();",
          "  // When",
          "  act(room);",
          "  // Then",
          "  expect(room.driver).toBe(1);",
          "});",
        ].join("\n"),
      ],
    ]);
    const { denominator, numerator } = sc032GwtMarkers(testFiles);
    assert.equal(denominator, 1);
    assert.equal(numerator, 1);
  });

  test("本体 3 行以上でも区切りが無ければ分子に数えない", () => {
    const testFiles = new Map([
      [
        "a.test.ts",
        [
          'it("交代する", () => {',
          "  const room = aRoom().build();",
          "  act(room);",
          "  expect(room.driver).toBe(1);",
          "});",
        ].join("\n"),
      ],
    ]);
    const { denominator, numerator } = sc032GwtMarkers(testFiles);
    assert.equal(denominator, 1);
    assert.equal(numerator, 0);
  });
});

describe("SC-036: テスト総数", () => {
  test("it と test の両方を数える", () => {
    const testFiles = new Map([
      ["a.test.ts", ['it("A", () => {});', 'test("B", () => {});'].join("\n")],
    ]);
    assert.equal(sc036TestCount(testFiles), 2);
  });
});

describe("SC-035: 利用者向け文言の定義箇所（同一オブジェクトリテラル内のみを対応とみなす）", () => {
  test("同一オブジェクトリテラル内の code と message のみを組として抽出する", () => {
    const source = [
      "broadcaster.sendTo(connId, {",
      '  type: "error",',
      '  code: "ROOM_NOT_FOUND",',
      '  message: "見つかりません",',
      "});",
    ].join("\n");
    const pairs = extractCodeMessagePairs(source);
    assert.deepEqual(pairs, [{ code: "ROOM_NOT_FOUND", message: "見つかりません" }]);
  });

  test("別のオブジェクトリテラルにある message は対応させない（近接ペアリングの誤りを避ける）", () => {
    const source = [
      "const other = { message: \"無関係な文言\" };",
      "broadcaster.sendTo(connId, {",
      '  code: "X",',
      "});",
    ].join("\n");
    const pairs = extractCodeMessagePairs(source);
    assert.equal(pairs.length, 0);
  });

  test("クライアント側テーブルにも存在するコードは定義箇所 2 以上として数える", () => {
    const serverSources = [
      ['broadcaster.sendTo(c, {', '  code: "RATE_LIMITED",', '  message: "多すぎます",', "});"].join(
        "\n",
      ),
    ];
    const clientSource = [
      "const ERROR_MESSAGES: Record<string, string> = {",
      '  RATE_LIMITED: "試行が多すぎます。",',
      "};",
    ].join("\n");
    assert.equal(sc035MessageDefinitions(serverSources, clientSource), 1);
  });

  test("サーバー側にしか存在しないコードは 1 箇所のみなので数えない", () => {
    const serverSources = [
      ['broadcaster.sendTo(c, {', '  code: "ONLY_SERVER",', '  message: "サーバーのみ",', "});"].join(
        "\n",
      ),
    ];
    const clientSource = "const ERROR_MESSAGES = {};";
    assert.equal(sc035MessageDefinitions(serverSources, clientSource), 0);
  });
});

describe("SC-039: 生きたモジュール内部の到達不能な要素", () => {
  test("①: 既知パターン !room.onBreak を検出する", () => {
    const handlersSource = "if (!room.onBreak) { return err(\"UNKNOWN_COMMAND\"); }";
    assert.equal(sc039aUnreachableBranchInApps(handlersSource), 1);
  });

  test("①: パターンが無ければ 0 を返す（機械判定できる範囲に限定する設計の裏返し）", () => {
    assert.equal(sc039aUnreachableBranchInApps("if (room.onBreak) { doSomething(); }"), 0);
  });

  test("宣言抽出: export const/interface/type を拾う", () => {
    const source = "export const A = 1;\nexport interface B {}\nexport type C = number;";
    const decls = extractPublicDeclarations(source);
    assert.deepEqual(decls.map((d) => d.name), ["A", "B", "C"]);
  });

  test("②: 製品コードから一度も参照されない公開データは行数として計上する", () => {
    const packageSrcFiles = new Map([
      ["packages/core/src/i18n/ja.ts", "export const ja = {\n  ok: 1,\n};\n"],
    ]);
    // productSources には参照が一切ない（テストからの参照はそもそも与えない=FR-090）
    const productSources = new Map([
      ["apps/web/src/App.tsx", "console.log('nothing referenced from this file');"],
    ]);
    const lines = sc039bUnusedPublicData(packageSrcFiles, productSources);
    assert.ok(lines > 0);
  });

  test("②: 製品コードから参照されている公開データは計上しない", () => {
    const packageSrcFiles = new Map([
      ["packages/core/src/problem.ts", "export const FALLBACK_PROBLEMS = [1, 2, 3];"],
    ]);
    const productSources = new Map([
      ["apps/web/src/App.tsx", "import { FALLBACK_PROBLEMS } from '@tasuki/timer-core';"],
    ]);
    assert.equal(sc039bUnusedPublicData(packageSrcFiles, productSources), 0);
  });

  test("③: 自ファイル内でのみ使う公開記号を件数として計上する", () => {
    const packageSrcFiles = new Map([
      ["packages/core/src/schemas.ts", "export interface SessionConfigSchema { x: number }"],
    ]);
    const productSources = new Map([["apps/web/src/App.tsx", "no reference here"]]);
    assert.equal(sc039cSelfOnlyPublicSymbols(packageSrcFiles, productSources), 1);
  });

  test("欠陥2回帰: 自ファイル内の他スキーマの合成に使われている定数は②（未使用データ）としては計上しない", () => {
    // schemas.ts のような「他スキーマに合成されて使われる」実例を単純化したもの。
    // RoomSchema は製品コードから直接参照されている（真に生きている）。
    // ParticipantSchema は他ファイルからは参照されないが、同一ファイル内の RoomSchema の
    // 定義で使われているため、真に死んだデータ（②）としては数えてはならない。
    const packageSrcFiles = new Map([
      [
        "packages/core/src/schemas.ts",
        [
          "export const ParticipantSchema = v.object({});",
          "export const RoomSchema = v.object({ participants: ParticipantSchema });",
        ].join("\n"),
      ],
    ]);
    const productSources = new Map([
      ["apps/sync/src/rooms.ts", "import { RoomSchema } from '@tasuki/timer-core';"],
    ]);
    assert.equal(sc039bUnusedPublicData(packageSrcFiles, productSources), 0);
  });

  test("欠陥3回帰: export function / export class も③の対象に含める（countManagers 相当）", () => {
    const packageSrcFiles = new Map([
      [
        "packages/core/src/participants.ts",
        "export function countManagers(participants) { return participants.length; }",
      ],
    ]);
    const productSources = new Map([["apps/web/src/App.tsx", "no reference here"]]);
    assert.equal(sc039cSelfOnlyPublicSymbols(packageSrcFiles, productSources), 1);
  });

  test("欠陥4回帰: 文字列リテラル内の一致は識別子としての参照とみなさない（ja が \"ja-JP\" に出現しても無視）", () => {
    const packageSrcFiles = new Map([
      ["packages/core/src/i18n/ja.ts", "export const ja = {\n  ok: 1,\n};\n"],
    ]);
    const productSources = new Map([
      ["apps/web/src/App.tsx", 'const locale = "ja-JP"; console.log(locale);'],
    ]);
    // "ja-JP" という文字列リテラルの中にしか出現しないので、他ファイルからの真の参照は無い。
    assert.ok(sc039bUnusedPublicData(packageSrcFiles, productSources) > 0);
    assert.equal(sc039cSelfOnlyPublicSymbols(packageSrcFiles, productSources), 1);
  });

  test("欠陥5回帰: 死んだ型エイリアスからしか参照されない公開データは②に数える（JaMessages問題）", () => {
    // JaMessages 自体は同一ファイル内で ja を参照しているが、JaMessages はどの製品コードからも
    // 使われていない死んだ記号である。死んだ記号からの参照を「生存の根拠」にしてはならないので、
    // ja は②（未使用データ）として数えなければならない。
    const packageSrcFiles = new Map([
      [
        "packages/core/src/i18n/ja.ts",
        ["export const ja = {", "  ok: 1,", "};", "export type JaMessages = typeof ja;"].join(
          "\n",
        ),
      ],
    ]);
    // productSources のどこも JaMessages を参照しない（＝JaMessages は生きた根ではない）。
    const productSources = new Map([
      ["apps/web/src/App.tsx", "console.log('JaMessages も ja も使わないコード');"],
    ]);
    assert.ok(sc039bUnusedPublicData(packageSrcFiles, productSources) > 0);
  });

  test("生きた公開関数から参照される公開データは②に数えない（関数ルートからの推移的生存）", () => {
    // pickFallback は他ファイルから参照される「生きた根」。FALLBACK_PROBLEMS は他ファイルからは
    // 参照されないが、生きた根 pickFallback の本体内で参照されているため生きている。
    const packageSrcFiles = new Map([
      [
        "packages/core/src/problem.ts",
        [
          "export const FALLBACK_PROBLEMS = [1, 2, 3];",
          "export function pickFallback() { return FALLBACK_PROBLEMS[0]; }",
        ].join("\n"),
      ],
    ]);
    const productSources = new Map([
      [
        "apps/web/src/App.tsx",
        "import { pickFallback } from '@tasuki/timer-core'; pickFallback();",
      ],
    ]);
    assert.equal(sc039bUnusedPublicData(packageSrcFiles, productSources), 0);
  });
});

describe("formatTable", () => {
  test("数値目標を持つ指標は PASS / 未達 を出す", () => {
    // Given
    const results = { sc027: { value: 0, target: 0 }, sc029: { value: 7, target: 0 } };
    // When
    const table = formatTable(results);
    // Then
    assert.match(table, /SC027 \| 0 \| 0 \| PASS/);
    assert.match(table, /SC029 \| 7 \| 0 \| 未達/);
  });

  test("数値目標を持たない指標は判定を出さない", () => {
    // Given: 目標が文字列の指標（記録のためだけの数値）
    const results = { sc036: { value: 1382, target: "P1 完了時の基準値以上" } };
    // When
    const table = formatTable(results);
    // Then: 「未達」と誤って出さない
    assert.match(table, /SC036 \| 1382 \| P1 完了時の基準値以上 \| —/);
    assert.doesNotMatch(table, /未達/);
  });

  test("値が文字列の指標も判定を出さない", () => {
    // Given
    const results = { sc032: { value: "1023/1051（97.3%）", target: "100%" } };
    // When
    const table = formatTable(results);
    // Then
    assert.match(table, /SC032 \| 1023\/1051（97\.3%） \| 100% \| —/);
  });

  test("目標が数値でも、値が文字列なら判定を出さない", () => {
    // Given: 目標だけ数値。上のテストは目標も文字列なので、判定条件から
    //        「値が数値か」を落としても気づけない。この組み合わせで初めて効く
    const results = { sc099: { value: "abc", target: 100 } };
    // When
    const table = formatTable(results);
    // Then
    assert.match(table, /SC099 \| abc \| 100 \| —/);
  });
});

import {
  SCANNED_PACKAGES,
  EXCLUDED_PACKAGES,
  readFilesRecursive,
  hasScanTarget as hasScanTargetForFixture,
} from "./audit-structure.mjs";
import { listWorkspacePackages, diffTargets } from "./lib/scan-targets.mjs";
import { execFileSync as execFileSyncForRoot } from "node:child_process";
import fsForFixture from "node:fs";
import pathForFixture from "node:path";

describe("走査対象の宣言", () => {
  const REPO_ROOT = execFileSyncForRoot("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();

  test("宣言と除外を合わせると workspace の全パッケージを覆う", () => {
    // Given
    const declared = [
      ...SCANNED_PACKAGES.map((d) => d.pkg),
      ...EXCLUDED_PACKAGES.map((e) => e.pkg),
    ];
    // When
    const diff = diffTargets(declared, listWorkspacePackages(REPO_ROOT));
    // Then
    assert.deepEqual(diff, { missing: [], unexpected: [] });
  });

  test("宣言した src / test ディレクトリはすべて実在する", () => {
    // Given / When / Then
    for (const d of SCANNED_PACKAGES) {
      for (const sub of [d.src, d.test]) {
        // 走査対象かどうかの判定は本体と同じ述語を使う（null / "" を分けて書かない）
        if (!hasScanTargetForFixture(sub)) continue;
        const abs = pathForFixture.join(REPO_ROOT, d.pkg, sub);
        assert.ok(fsForFixture.existsSync(abs), `実在しません: ${d.pkg}/${sub}`);
      }
    }
  });

  test("宣言したエントリポイントはすべて実在する", () => {
    // Given / When / Then
    for (const d of SCANNED_PACKAGES) {
      if (!hasScanTargetForFixture(d.entry) || !hasScanTargetForFixture(d.src)) continue;
      const abs = pathForFixture.join(REPO_ROOT, d.pkg, d.src, d.entry);
      assert.ok(fsForFixture.existsSync(abs), `実在しません: ${d.pkg}/${d.src}/${d.entry}`);
    }
  });

  test("除外には理由が書かれている", () => {
    // Given / When / Then
    for (const e of EXCLUDED_PACKAGES) {
      assert.ok(e.reason && e.reason.length > 0, `${e.pkg} に理由がありません`);
    }
  });

  test("除外理由が主張する状態（TS を持たない）は今も成立している", () => {
    // Given: packages/ui は「src・tests とも TS を 1 つも持たない」という状態を
    //        理由に除外されている。理由は方針ではなく状態の主張なので、
    //        .ts / .tsx が足された瞬間に陳腐化しうる。その陳腐化を検知する。
    const uiEntry = EXCLUDED_PACKAGES.find((e) => e.pkg === "packages/ui");
    assert.ok(uiEntry, "packages/ui が EXCLUDED_PACKAGES から消えています");
    // When
    const files = readFilesRecursive(pathForFixture.join(REPO_ROOT, uiEntry.pkg), [".ts", ".tsx"]);
    // Then
    assert.equal(
      files.size,
      0,
      `packages/ui に .ts/.tsx が見つかりました。除外理由が陳腐化しています: ${[...files.keys()]}`,
    );
  });
});

describe("走査対象の宣言の妥当性（ADR-0014 決定 1・決定 9）", () => {
  test("非空の文字列だけが走査対象を指す", () => {
    // Given / When / Then
    assert.equal(hasScanTarget("src"), true);
    assert.equal(hasScanTarget(null), false);
    assert.equal(hasScanTarget(""), false);
    assert.equal(hasScanTarget(undefined), false);
  });

  test("null と非空の文字列だけなら不正な宣言は無い", () => {
    // Given: e2e と同じ「src を持たない」形を含む
    const declarations = [
      { pkg: "packages/a", src: "src", test: "test", entry: "index.ts" },
      { pkg: "e2e", src: null, test: "tests", entry: null },
    ];
    // When / Then
    assert.deepEqual(findInvalidDeclarations(declarations), []);
  });

  test("空文字列は不正な宣言として名指しされる（走査対象を静かに 1 つ失う経路）", () => {
    // Given: test だけを空文字列にした宣言（件数のガードでは 1 件の欠落を検知できない）
    const declarations = [
      { pkg: "packages/a", src: "src", test: "", entry: "index.ts" },
      { pkg: "packages/b", src: "src", test: "test", entry: "index.ts" },
    ];
    // When
    const invalid = findInvalidDeclarations(declarations);
    // Then
    assert.deepEqual(invalid, ['packages/a.test = ""']);
  });

  test("キーの書き忘れ（undefined）も不正な宣言として出る", () => {
    // Given: test を書き忘れた宣言
    const declarations = [{ pkg: "packages/a", src: "src", entry: "index.ts" }];
    // When
    const invalid = findInvalidDeclarations(declarations);
    // Then
    assert.deepEqual(invalid, ["packages/a.test = undefined"]);
  });

  test("実リポジトリの宣言に不正なものは無い", () => {
    // Given / When / Then
    assert.deepEqual(findInvalidDeclarations(SCANNED_PACKAGES), []);
  });
});

describe("走査量の算出（ADR-0014 決定 6・決定 8・決定 9）", () => {
  /** ディレクトリごとの中身を固定した読み役（実 I/O はしない）。 */
  const reader = (table) => (pkg, sub) => {
    const n = table[`${pkg}/${sub}`] ?? 0;
    return new Map(Array.from({ length: n }, (_, i) => [`f${i}.ts`, ""]));
  };

  test("src / test を持つパッケージ数とファイル件数を別々に数える", () => {
    // Given: src を持たない宣言が 1 件混ざっている（e2e と同じ形）
    const declarations = [
      { pkg: "packages/a", src: "src", test: "test" },
      { pkg: "e2e", src: null, test: "tests" },
    ];
    // When
    const loaded = loadScanTargets(
      declarations,
      reader({ "packages/a/src": 5, "packages/a/test": 7, "e2e/tests": 3 }),
    );
    const volume = measureScanVolume(loaded);
    // Then
    assert.deepEqual(volume, { srcPackages: 1, srcFiles: 5, testPackages: 2, testFiles: 10 });
  });

  test("宣言の行数が残っていても src / test が null なら走査量は 0 になる", () => {
    // Given: 宣言は 2 行あるが、走査するディレクトリはどちらも消えている
    const declarations = [
      { pkg: "packages/a", src: null, test: null },
      { pkg: "packages/b", src: null, test: null },
    ];
    // When
    const volume = measureScanVolume(loadScanTargets(declarations, reader({})));
    // Then: 行数（2）ではなく走査量（0）が出る
    assert.deepEqual(volume, { srcPackages: 0, srcFiles: 0, testPackages: 0, testFiles: 0 });
  });

  test("空文字列の宣言は走査もされず、走査量にも数えられない（数え方と走査を割らない）", () => {
    // Given: test を空文字列にした宣言。読み役はパッケージ直下に 99 件あるつもりで返す
    const declarations = [{ pkg: "packages/a", src: "src", test: "" }];
    // When
    const loaded = loadScanTargets(declarations, reader({ "packages/a/src": 5, "packages/a/": 99 }));
    const volume = measureScanVolume(loaded);
    // Then: 数えた件数と読み込んだ Map が同じ（99 を「走査した」と数えない）
    assert.equal(loaded[0].testFiles.size, 0);
    assert.deepEqual(volume, { srcPackages: 1, srcFiles: 5, testPackages: 0, testFiles: 0 });
  });

  test("ディレクトリが実在してもファイルが 0 件ならファイル側だけが 0 になる", () => {
    // Given: 宣言も走査先も生きているが、対象拡張子のファイルが 1 つも無い
    const declarations = [{ pkg: "packages/a", src: "src", test: "test" }];
    // When
    const volume = measureScanVolume(loadScanTargets(declarations, reader({})));
    // Then
    assert.deepEqual(scanVolumeDimensions(volume).filter((d) => d.count === 0).map((d) => d.label), [
      "src ファイル",
      "test ファイル",
    ]);
  });

  test("走査量の 1 行はパッケージ数とファイル件数の両方を出す（設計正本 §5.4 の書式）", () => {
    // Given
    const volume = { srcPackages: 9, srcFiles: 167, testPackages: 10, testFiles: 249 };
    // When
    const text = formatScanVolume(volume);
    // Then
    assert.equal(text, "src 9 パッケージ / 167 件、test 10 パッケージ / 249 件");
  });

  test("0 件ガードが見る内訳は、出力する走査量と同じ 4 つ", () => {
    // Given
    const volume = { srcPackages: 9, srcFiles: 167, testPackages: 10, testFiles: 249 };
    // When
    const dimensions = scanVolumeDimensions(volume);
    // Then
    assert.deepEqual(
      dimensions.map((d) => d.count),
      [9, 167, 10, 249],
    );
    for (const d of dimensions) assert.ok(formatScanVolume(volume).includes(String(d.count)));
  });
});

describe("findStaleSymbolExceptions: 例外表は両方向に腐らせない", () => {
  const productSources = new Map([
    ["packages/x/src/user.ts", "import { USED } from './decl.js';\nconst a = USED;\n"],
  ]);
  const packageSrcFiles = new Map([
    ["packages/x/src/decl.ts", "export const ALIVE = 1;\nexport const USED = 2;\n"],
  ]);

  test("実在する未参照の記号を挙げた例外は問題にならない", () => {
    // Given
    const exceptions = [{ file: "packages/x/src/decl.ts", name: "ALIVE", reason: "検査の土台" }];
    // When
    const problems = findStaleSymbolExceptions(exceptions, packageSrcFiles, productSources);
    // Then
    assert.deepEqual(problems, []);
  });

  test("宣言が実在しない例外は問題として報告する", () => {
    // Given（記号が消えたのに例外だけ残った状態）
    const exceptions = [{ file: "packages/x/src/decl.ts", name: "GONE", reason: "検査の土台" }];
    // When
    const problems = findStaleSymbolExceptions(exceptions, packageSrcFiles, productSources);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /GONE/);
  });

  test("ファイルごと実在しない例外は問題として報告する", () => {
    // Given
    const exceptions = [{ file: "packages/x/src/none.ts", name: "ALIVE", reason: "検査の土台" }];
    // When
    const problems = findStaleSymbolExceptions(exceptions, packageSrcFiles, productSources);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /none\.ts/);
  });

  test("製品から参照されるようになった記号の例外は不要になったと報告する", () => {
    // Given
    const exceptions = [{ file: "packages/x/src/decl.ts", name: "USED", reason: "検査の土台" }];
    // When
    const problems = findStaleSymbolExceptions(exceptions, packageSrcFiles, productSources);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /不要/);
  });

  test("理由が空の例外は問題として報告する", () => {
    // Given
    const exceptions = [{ file: "packages/x/src/decl.ts", name: "ALIVE", reason: "" }];
    // When
    const problems = findStaleSymbolExceptions(exceptions, packageSrcFiles, productSources);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /理由/);
  });
});

describe("sc039cSelfOnlyPublicSymbols: 例外表に載る記号は数えない", () => {
  const productSources = new Map([["packages/x/src/user.ts", "const a = 1;\n"]]);
  const packageSrcFiles = new Map([
    ["packages/x/src/decl.ts", "export const A = 1;\nexport const B = 2;\n"],
  ]);

  test("例外なしなら 2 件", () => {
    // Given / When
    const n = sc039cSelfOnlyPublicSymbols(packageSrcFiles, productSources);
    // Then
    assert.equal(n, 2);
  });

  test("1 件を例外にすると 1 件になる", () => {
    // Given
    const exceptions = [{ file: "packages/x/src/decl.ts", name: "A", reason: "検査の土台" }];
    // When
    const n = sc039cSelfOnlyPublicSymbols(packageSrcFiles, productSources, exceptions);
    // Then
    assert.equal(n, 1);
  });
});

describe("findStaleTestExceptions: SC-032 の例外は両方向に腐らせない", () => {
  const marked = [
    'it("区切りのあるテスト", () => {',
    "  // Given",
    "  const a = build();",
    "  // When",
    "  const r = act(a);",
    "  // Then",
    "  expect(r).toBe(1);",
    "});",
  ].join("\n");
  const unmarked = [
    'it("区切りの無いテスト", () => {',
    "  const a = build();",
    "  const r = act(a);",
    "  expect(r).toBe(1);",
    "});",
  ].join("\n");
  const files = new Map([["pkg/test/a.test.ts", `${marked}\n${unmarked}\n`]]);

  test("実在し、区切りが無く、分母に入るテストの例外は問題にならない", () => {
    // Given
    const ex = [{ file: "pkg/test/a.test.ts", testName: "区切りの無いテスト", reason: "操作が無い" }];
    // When
    const problems = findStaleTestExceptions(ex, files);
    // Then
    assert.deepEqual(problems, []);
  });

  test("実在しないテスト名の例外は問題として報告する", () => {
    // Given
    const ex = [{ file: "pkg/test/a.test.ts", testName: "消えたテスト", reason: "操作が無い" }];
    // When
    const problems = findStaleTestExceptions(ex, files);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /消えたテスト/);
  });

  test("実在しないファイルの例外は問題として報告する", () => {
    // Given
    const ex = [{ file: "pkg/test/none.test.ts", testName: "区切りの無いテスト", reason: "操作が無い" }];
    // When
    const problems = findStaleTestExceptions(ex, files);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /none\.test\.ts/);
  });

  test("区切りが付いたテストの例外は不要になったと報告する", () => {
    // Given
    const ex = [{ file: "pkg/test/a.test.ts", testName: "区切りのあるテスト", reason: "操作が無い" }];
    // When
    const problems = findStaleTestExceptions(ex, files);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /不要/);
  });

  test("理由が空の例外は問題として報告する", () => {
    // Given
    const ex = [{ file: "pkg/test/a.test.ts", testName: "区切りの無いテスト", reason: "" }];
    // When
    const problems = findStaleTestExceptions(ex, files);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /理由/);
  });
});

describe("sc032GwtMarkers: 例外に載るテストは分母から外す", () => {
  const unmarkedLong = [
    'it("区切りの無いテスト", () => {',
    "  const a = build();",
    "  const r = act(a);",
    "  expect(r).toBe(1);",
    "});",
  ].join("\n");
  const files = new Map([["pkg/test/a.test.ts", `${unmarkedLong}\n`]]);

  test("例外なしなら分母に入る", () => {
    // Given / When
    const r = sc032GwtMarkers(files);
    // Then
    assert.equal(r.denominator, 1);
    assert.equal(r.numerator, 0);
  });

  test("例外にすると分母から外れ、割合は 1 になる", () => {
    // Given
    const ex = [{ file: "pkg/test/a.test.ts", testName: "区切りの無いテスト", reason: "操作が無い" }];
    // When
    const r = sc032GwtMarkers(files, ex);
    // Then
    assert.equal(r.denominator, 0);
    assert.equal(r.ratio, 1);
  });
});

describe("stripStringsAndComments: 剥がしすぎず、行番号も崩さない（#184）", () => {
  test("ブロックコメントを落としても行数が変わらない", () => {
    // Given（5 行のブロックコメントを挟んだソース）
    const source = "const a = 1;\n/*\n * x\n * y\n */\nconst b = 2;\n";
    // When
    const stripped = stripStringsAndComments(source);
    // Then
    assert.equal(stripped.split("\n").length, source.split("\n").length);
  });

  test("複数行のテンプレートリテラルを落としても行数が変わらない", () => {
    // Given
    const source = "const a = `x\ny\nz`;\nconst b = 2;\n";
    // When
    const stripped = stripStringsAndComments(source);
    // Then
    assert.equal(stripped.split("\n").length, source.split("\n").length);
  });

  test("閉じないアポストロフィは行末で打ち切り、次の行のコードを食べない", () => {
    // Given（`/it's/` の正規表現リテラル。ヘルパは正規表現を知らない）
    const source = "const re = /it's/;\nexport * from './a';\n";
    // When
    const stripped = stripStringsAndComments(source);
    // Then（剥がしすぎの被害は 1 行に閉じ込められ、次の行のコードは残る）
    assert.match(stripped, /export \*/);
  });

  test("行コメントは改行を残す", () => {
    // Given
    const source = "const a = 1; // x\nconst b = 2;\n";
    // When
    const stripped = stripStringsAndComments(source);
    // Then
    assert.equal(stripped.split("\n").length, source.split("\n").length);
  });

  test("通常の文字列・コメントはこれまでどおり落とす", () => {
    // Given
    const source = 'const a = "STRINGBODY"; /* BLOCKBODY */ // LINEBODY\n';
    // When
    const stripped = stripStringsAndComments(source);
    // Then
    assert.doesNotMatch(stripped, /STRINGBODY|BLOCKBODY|LINEBODY/);
  });
});
