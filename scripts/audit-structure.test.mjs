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
  extractContractNames,
  extractNamedImportsFromPackage,
  sc039dContractOnlyValues,
  sc039DeclaredContractFiles,
  findStaleSc029Exceptions,
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
      { file: "packages/core/test/permissions-differential.test.ts", reason: "差分テスト" },
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
      ["packages/timer-core/src/i18n/ja.ts", "export const ja = {\n  ok: 1,\n};\n"],
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
      ["packages/timer-core/src/problem.ts", "export const FALLBACK_PROBLEMS = [1, 2, 3];"],
    ]);
    const productSources = new Map([
      ["apps/web/src/App.tsx", "import { FALLBACK_PROBLEMS } from '@tasuki/timer-core';"],
    ]);
    assert.equal(sc039bUnusedPublicData(packageSrcFiles, productSources), 0);
  });

  test("③: 自ファイル内でのみ使う公開記号を件数として計上する", () => {
    const packageSrcFiles = new Map([
      ["packages/timer-core/src/schemas.ts", "export const SessionConfigSchema = v.object({});"],
    ]);
    const productSources = new Map([["apps/web/src/App.tsx", "no reference here"]]);
    assert.equal(sc039cSelfOnlyPublicSymbols(packageSrcFiles, productSources), 1);
  });

  test("③: 型（interface / type）は数えない（#223。判定に型解決が要るため）", () => {
    // 公開契約に載せる型は、値の署名から到達できるだけで誰も名前で取り込まない
    // （ADR-0016 追記）。③はそれを見分けられないので、最初から対象にしない。
    const packageSrcFiles = new Map([
      [
        "packages/poker-core/src/protocol.ts",
        ["export interface ProtocolError { code: string }", "export type ServerMessage = { type: string };"].join(
          "\n",
        ),
      ],
    ]);
    const productSources = new Map([["apps/web/src/App.tsx", "no reference here"]]);
    assert.equal(sc039cSelfOnlyPublicSymbols(packageSrcFiles, productSources), 0);
  });

  test("③: 型を混ぜても、同じファイルの値は数え続ける（型の除外が値まで巻き込まない）", () => {
    const packageSrcFiles = new Map([
      [
        "packages/poker-core/src/protocol.ts",
        [
          "export type ServerMessage = { type: string };",
          "export const ERROR_CODES = ['a'];",
          "export function isKnownErrorCode(c) { return ERROR_CODES.includes(c); }",
        ].join("\n"),
      ],
    ]);
    const productSources = new Map([["apps/web/src/App.tsx", "no reference here"]]);
    assert.equal(sc039cSelfOnlyPublicSymbols(packageSrcFiles, productSources), 2);
  });

  test("欠陥2回帰: 自ファイル内の他スキーマの合成に使われている定数は②（未使用データ）としては計上しない", () => {
    // schemas.ts のような「他スキーマに合成されて使われる」実例を単純化したもの。
    // RoomSchema は製品コードから直接参照されている（真に生きている）。
    // ParticipantSchema は他ファイルからは参照されないが、同一ファイル内の RoomSchema の
    // 定義で使われているため、真に死んだデータ（②）としては数えてはならない。
    const packageSrcFiles = new Map([
      [
        "packages/timer-core/src/schemas.ts",
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
        "packages/timer-core/src/participants.ts",
        "export function countManagers(participants) { return participants.length; }",
      ],
    ]);
    const productSources = new Map([["apps/web/src/App.tsx", "no reference here"]]);
    assert.equal(sc039cSelfOnlyPublicSymbols(packageSrcFiles, productSources), 1);
  });

  test("欠陥4回帰: 文字列リテラル内の一致は識別子としての参照とみなさない（ja が \"ja-JP\" に出現しても無視）", () => {
    const packageSrcFiles = new Map([
      ["packages/timer-core/src/i18n/ja.ts", "export const ja = {\n  ok: 1,\n};\n"],
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
        "packages/timer-core/src/i18n/ja.ts",
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
        "packages/timer-core/src/problem.ts",
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

  /**
   * **同名の記号は別パッケージにも立つ。**（#214 で実際に踏んだ）
   *
   * `packages/timer-core` と `packages/poker-core` が両方 `DEFAULT_ERROR_MESSAGE` を
   * 公開したとき、名前だけで製品コード全体を探す実装は、**poker 側を参照している 2 行**を
   * 根拠に timer 側の例外を「不要になった」と報告した。timer 側を参照している製品コードは
   * 1 つも無かった。
   */
  test("別パッケージの同名の記号を参照しているだけでは、不要とは言わない", () => {
    // Given: x が SHARED を公開し、y も同名の SHARED を持つ。参照しているのは y のほうだけ
    const pkgSrc = new Map([["packages/x/src/decl.ts", "export const SHARED = 1;\n"]]);
    const product = new Map([
      ["packages/y/src/user.ts", "import { SHARED } from '@tasuki/y';\nconst a = SHARED;\n"],
    ]);
    const exceptions = [{ file: "packages/x/src/decl.ts", name: "SHARED", reason: "検査の土台" }];
    // When
    const problems = findStaleSymbolExceptions(exceptions, pkgSrc, product);
    // Then
    assert.deepEqual(problems, []);
  });

  test("公開元のパッケージを取り込んでいるファイルからの参照なら、不要になったと報告する", () => {
    // Given: 上と同じ形で、import 先だけが x になっている
    const pkgSrc = new Map([["packages/x/src/decl.ts", "export const SHARED = 1;\n"]]);
    const product = new Map([
      ["packages/y/src/user.ts", "import { SHARED } from '@tasuki/x';\nconst a = SHARED;\n"],
    ]);
    const exceptions = [{ file: "packages/x/src/decl.ts", name: "SHARED", reason: "検査の土台" }];
    // When
    const problems = findStaleSymbolExceptions(exceptions, pkgSrc, product);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /不要/);
  });

  /**
   * **サブパスで取り込む形もある。**（#214 の敵対的検証が実測で見つけた）
   *
   * `apps/timer-web` は `@tasuki/timer-core/aggregate` や `@tasuki/timer-core/problem`
   * からしか取り込まないファイルを多数持つ。取り込みの判定を「指定子の直後がクォート」に
   * 限ると、**これらのファイルからの参照が生存の根拠として数えられなくなる**。
   */
  test("サブパスで取り込んでいるファイルからの参照も、不要になったと報告する", () => {
    // Given: 公開元をサブパスで取り込んでいる
    const pkgSrc = new Map([["packages/x/src/decl.ts", "export const SHARED = 1;\n"]]);
    const product = new Map([
      ["packages/y/src/user.ts", "import { SHARED } from '@tasuki/x/sub';\nconst a = SHARED;\n"],
    ]);
    const exceptions = [{ file: "packages/x/src/decl.ts", name: "SHARED", reason: "検査の土台" }];
    // When
    const problems = findStaleSymbolExceptions(exceptions, pkgSrc, product);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /不要/);
  });

  /**
   * 前方一致では当たらないこと。`@tasuki/x-extra` は `x` とは別のパッケージである。
   */
  test("名前が前方一致するだけの別パッケージからの参照は数えない", () => {
    // Given
    const pkgSrc = new Map([["packages/x/src/decl.ts", "export const SHARED = 1;\n"]]);
    const product = new Map([
      ["packages/y/src/user.ts", "import { SHARED } from '@tasuki/x-extra';\nconst a = SHARED;\n"],
    ]);
    const exceptions = [{ file: "packages/x/src/decl.ts", name: "SHARED", reason: "検査の土台" }];
    // When
    const problems = findStaleSymbolExceptions(exceptions, pkgSrc, product);
    // Then
    assert.deepEqual(problems, []);
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

describe("findStaleSymbolExceptions: 型の例外は何も落とさないので腐りとして落とす（#223）", () => {
  const productSources = new Map([["apps/web/src/App.tsx", "no reference here"]]);

  test("型だけの記号を例外に載せると落ちる", () => {
    const packageSrcFiles = new Map([
      ["packages/poker-core/src/protocol.ts", "export type ProtocolError = { code: string };"],
    ]);
    const exceptions = [
      { file: "packages/poker-core/src/protocol.ts", name: "ProtocolError", reason: "理由はある" },
    ];
    const problems = findStaleSymbolExceptions(exceptions, packageSrcFiles, productSources);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /型が載っています/);
  });

  test("対照: 値の例外は落とさない", () => {
    const packageSrcFiles = new Map([
      ["packages/poker-core/src/protocol.ts", "export const ERROR_CODES = ['a'];"],
    ]);
    const exceptions = [
      { file: "packages/poker-core/src/protocol.ts", name: "ERROR_CODES", reason: "理由はある" },
    ];
    assert.deepEqual(findStaleSymbolExceptions(exceptions, packageSrcFiles, productSources), []);
  });

  test("同名の値があるなら落とさない（値が消えて型だけ残った場合との差）", () => {
    const packageSrcFiles = new Map([
      [
        "packages/poker-core/src/protocol.ts",
        ["export const Foo = 1;", "export type Foo = number;"].join("\n"),
      ],
    ]);
    const exceptions = [
      { file: "packages/poker-core/src/protocol.ts", name: "Foo", reason: "理由はある" },
    ];
    assert.deepEqual(findStaleSymbolExceptions(exceptions, packageSrcFiles, productSources), []);
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

describe("findStaleSc029Exceptions: SC-029 の例外表も両方向に腐らせない（#184）", () => {
  const testFiles = new Map([
    ["packages/x/test/a.test.ts", 'it("FR-072 のケース", () => {});'],
    ["packages/x/test/b.test.ts", 'it("交代する", () => {});'],
  ]);

  test("仕様の識別番号を実際に含むファイルの例外は問題にならない", () => {
    // Given
    const ex = [{ file: "packages/x/test/a.test.ts", reason: "差分テストの組み合わせ" }];
    // When
    const problems = findStaleSc029Exceptions(ex, testFiles);
    // Then
    assert.deepEqual(problems, []);
  });

  test("走査対象に無いファイルの例外は問題として報告する", () => {
    // Given（実在しないパスを置いても静かに素通りしていた）
    const ex = [{ file: "packages/nonexistent/tests/ghost.test.ts", reason: "差分テスト" }];
    // When
    const problems = findStaleSc029Exceptions(ex, testFiles);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /ghost\.test\.ts/);
  });

  test("識別番号がもう無いファイルの例外は不要になったと報告する", () => {
    // Given（例外が何も外していない＝空回りの状態）
    const ex = [{ file: "packages/x/test/b.test.ts", reason: "差分テスト" }];
    // When
    const problems = findStaleSc029Exceptions(ex, testFiles);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /不要/);
  });

  test("理由が空の例外は問題として報告する", () => {
    // Given
    const ex = [{ file: "packages/x/test/a.test.ts", reason: "" }];
    // When
    const problems = findStaleSc029Exceptions(ex, testFiles);
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /理由/);
  });
});

import { buildSc039Sources } from "./audit-structure.mjs";

describe("SC-039②③ の走査範囲は宣言から導く（#180）", () => {
  /**
   * 合成の走査対象。**timer のパッケージを 1 つも含まない。**
   *
   * `buildSc039Sources` が `packages/timer-core` を名指しで取り出している限り、
   * この入力では照合先が組み立てられない。名指しをやめて宣言から導けば通る。
   */
  const declarations = [
    { pkg: "packages/alpha", src: "src", test: "tests", entry: "index.ts" },
    { pkg: "packages/beta", src: "source", test: "tests", entry: "index.ts" },
    { pkg: "apps/gamma", src: "src", test: "tests", entry: "main.tsx" },
    { pkg: "e2e", src: null, test: "tests", entry: null },
  ];
  const contents = {
    "packages/alpha/src": new Map([["index.ts", "export const Alpha = 1;\n"]]),
    "packages/beta/source": new Map([["index.ts", "export const Beta = 2;\n"]]),
    "apps/gamma/src": new Map([["main.tsx", "export const Gamma = Alpha;\n"]]),
  };
  const loaded = loadScanTargets(
    declarations,
    (pkg, sub) => contents[`${pkg}/${sub}`] ?? new Map(),
  );

  test("照合先は宣言された packages/ 配下のすべてを覆う（1 つを名指ししない）", () => {
    // When
    const { packageSrcFiles } = buildSc039Sources(loaded);
    // Then: 宣言に `packages/` が 2 つあるなら 2 つとも照合先に入る
    assert.deepEqual(
      [...packageSrcFiles.keys()].sort(),
      ["packages/alpha/src/index.ts", "packages/beta/source/index.ts"],
    );
  });

  test("照合先の鍵は宣言した src ディレクトリ名から作る（`src` 決め打ちにしない）", () => {
    // Given: packages/beta の src ディレクトリ名は `source`
    // When
    const { packageSrcFiles } = buildSc039Sources(loaded);
    // Then
    assert.ok(packageSrcFiles.has("packages/beta/source/index.ts"));
  });

  test("参照元は apps も packages も含み、e2e（src を持たない宣言）は含まない", () => {
    // When
    const { productSources } = buildSc039Sources(loaded);
    // Then
    assert.deepEqual(
      [...productSources.keys()].sort(),
      [
        "apps/gamma/src/main.tsx",
        "packages/alpha/src/index.ts",
        "packages/beta/source/index.ts",
      ],
    );
  });
});

import {
  isPackageLayer,
  sc039DeclaredComparedPackages,
  sc039DeclaredReferencePackages,
  sc039DeclaredComparedFiles,
  sc039DeclaredReferenceFiles,
  formatSc039FileDrift,
  findSrcWithoutEntry,
  sc039ScanVolumeDimensions,
  formatSc039ScanVolume,
} from "./audit-structure.mjs";

describe("SC-039②③ の走査対象の宣言（#180）", () => {
  const declarations = [
    { pkg: "packages/alpha", src: "src", test: "tests", entry: "index.ts" },
    { pkg: "packages/beta", src: "source", test: "tests", entry: "index.ts" },
    { pkg: "packages/gamma", src: null, test: "tests", entry: null },
    { pkg: "apps/delta", src: "src", test: "tests", entry: "main.tsx" },
    { pkg: "e2e", src: null, test: "tests", entry: null },
  ];

  test("照合先は `packages/` 層のうち src を持つ宣言（層の境界は FR-119②③ の文言どおり）", () => {
    // When / Then
    assert.deepEqual(sc039DeclaredComparedPackages(declarations), [
      "packages/alpha",
      "packages/beta",
    ]);
  });

  test("参照元は層を問わず src とエントリを持つ宣言すべて", () => {
    // When / Then
    assert.deepEqual(sc039DeclaredReferencePackages(declarations), [
      "apps/delta",
      "packages/alpha",
      "packages/beta",
    ]);
  });

  test("層の判定は接頭辞 1 か所だけで行う", () => {
    // When / Then
    assert.equal(isPackageLayer("packages/alpha"), true);
    assert.equal(isPackageLayer("apps/delta"), false);
    assert.equal(isPackageLayer("e2e"), false);
  });

  test("組み立て結果は、実際に寄与したパッケージを名乗る（宣言と突き合わせるため）", () => {
    // Given
    const contents = {
      "packages/alpha/src": new Map([["index.ts", "export const Alpha = 1;\n"]]),
      "packages/beta/source": new Map([["index.ts", "export const Beta = 2;\n"]]),
      "apps/delta/src": new Map([["main.tsx", "export const Delta = 3;\n"]]),
    };
    // When
    const sources = buildSc039Sources(
      loadScanTargets(declarations, (pkg, sub) => contents[`${pkg}/${sub}`] ?? new Map()),
    );
    // Then: 宣言から導いた一覧と、実際に組み立てた一覧が一致する
    assert.deepEqual(sources.comparedPackages, sc039DeclaredComparedPackages(declarations));
    assert.deepEqual(sources.referencePackages, sc039DeclaredReferencePackages(declarations));
  });

  test("src が空のパッケージは名乗りに現れない（宣言との照合で落ちる側へ倒す）", () => {
    // Given: packages/beta の src だけが 1 件も読めない
    const contents = {
      "packages/alpha/src": new Map([["index.ts", "export const Alpha = 1;\n"]]),
      "apps/delta/src": new Map([["main.tsx", "export const Delta = 3;\n"]]),
    };
    // When
    const sources = buildSc039Sources(
      loadScanTargets(declarations, (pkg, sub) => contents[`${pkg}/${sub}`] ?? new Map()),
    );
    // Then
    assert.deepEqual(sources.comparedPackages, ["packages/alpha"]);
  });

  test("src はあるがエントリを持たない宣言は名指しで落とす（参照元を静かに失う形）", () => {
    // Given: エントリの無い src 宣言。SC-027 も測れず、SC-039 の参照元にも入らない
    const broken = [
      { pkg: "packages/alpha", src: "src", test: "tests", entry: "index.ts" },
      { pkg: "packages/beta", src: "src", test: "tests", entry: null },
    ];
    // When / Then
    assert.deepEqual(findSrcWithoutEntry(broken), ["packages/beta"]);
    assert.deepEqual(findSrcWithoutEntry(declarations), []);
  });

  test("走査量は照合先・参照元をパッケージ数とファイル件数の両方で名乗る", () => {
    // Given
    const sources = {
      packageSrcFiles: new Map([["a", ""], ["b", ""]]),
      productSources: new Map([["a", ""], ["b", ""], ["c", ""]]),
      contractFiles: new Map([["a", ""]]),
      comparedPackages: ["packages/alpha"],
      referencePackages: ["packages/alpha", "apps/delta"],
    };
    // When / Then
    assert.equal(
      formatSc039ScanVolume(sources),
      "照合先 1 パッケージ / 2 ファイル、参照元 2 パッケージ / 3 ファイル、公開契約 1 ファイル",
    );
    assert.deepEqual(
      sc039ScanVolumeDimensions(sources).map((d) => d.count),
      [1, 2, 2, 3, 1],
    );
  });
});

describe("SC-039②③ の走査対象の宣言をファイル単位で見る（#180 の敵対的レビュー）", () => {
  const declarations = [
    { pkg: "packages/alpha", src: "src", test: "tests", entry: "index.ts" },
    { pkg: "packages/beta", src: "src", test: "tests", entry: "index.ts" },
    { pkg: "apps/delta", src: "src", test: "tests", entry: "main.tsx" },
  ];
  const contents = {
    "packages/alpha/src": new Map([
      ["index.ts", "export * from './used.js';\n"],
      ["used.ts", "export const Used = 1;\n"],
      ["orphan.ts", "export const Orphan = 2;\n"],
    ]),
    "packages/beta/src": new Map([["index.ts", "export const Beta = 3;\n"]]),
    "apps/delta/src": new Map([["main.tsx", "export const Delta = 4;\n"]]),
  };
  const loaded = loadScanTargets(declarations, (pkg, sub) => contents[`${pkg}/${sub}`] ?? new Map());

  test("照合先の宣言は `packages/` 層の src 配下のファイルすべて（到達性で絞らない）", () => {
    // When / Then: orphan.ts は index.ts から到達しないが、照合先には入る
    assert.deepEqual(sc039DeclaredComparedFiles(loaded), [
      "packages/alpha/src/index.ts",
      "packages/alpha/src/orphan.ts",
      "packages/alpha/src/used.ts",
      "packages/beta/src/index.ts",
    ]);
  });

  test("参照元の宣言は層を問わず、到達可能なファイルだけ（唯一の絞り込みは到達性）", () => {
    // When / Then: orphan.ts だけが落ちる
    assert.deepEqual(sc039DeclaredReferenceFiles(loaded), [
      "apps/delta/src/main.tsx",
      "packages/alpha/src/index.ts",
      "packages/alpha/src/used.ts",
      "packages/beta/src/index.ts",
    ]);
  });

  test("素の組み立て結果は、宣言から導いたファイル集合と一致する（全単射が成り立つ）", () => {
    // When
    const sources = buildSc039Sources(loaded);
    // Then
    assert.deepEqual([...sources.packageSrcFiles.keys()].sort(), sc039DeclaredComparedFiles(loaded));
    assert.deepEqual([...sources.productSources.keys()].sort(), sc039DeclaredReferenceFiles(loaded));
  });

  test("パッケージ単位の名乗りは、1 ファイルだけ抜けても変わらない（粒度を上げた理由）", () => {
    // Given: alpha の 3 ファイルのうち 1 つだけを集合から外した状態を作る
    const sources = buildSc039Sources(loaded);
    sources.packageSrcFiles.delete("packages/alpha/src/orphan.ts");
    // Then: パッケージ単位では宣言と一致したままで、ずれが見えない
    assert.deepEqual(sources.comparedPackages, sc039DeclaredComparedPackages(declarations));
    // Then: ファイル単位にすると、抜けた 1 件が missing として名指しできる
    const diff = diffTargets(sc039DeclaredComparedFiles(loaded), [...sources.packageSrcFiles.keys()]);
    assert.deepEqual(diff.missing, ["packages/alpha/src/orphan.ts"]);
    assert.deepEqual(diff.unexpected, []);
  });

  test("ずれの表示は「実在しない」ではなく「集合へ入っていない」と言う（直し方が違う）", () => {
    // Given: 両方向のずれ
    const diff = {
      missing: ["packages/alpha/src/orphan.ts"],
      unexpected: ["packages/ghost/src/ghost.ts"],
    };
    // When
    const text = formatSc039FileDrift(diff, "照合先 2 パッケージ / 3 ファイル、参照元 3 パッケージ / 4 ファイル");
    // Then: 落ちるファイルは実在している。移設を疑わせる文言を出さない
    assert.ok(!text.includes("実在しない"), `誤った案内が出ています:\n${text}`);
    assert.match(text, /宣言では走査するのに集合へ入っていない: packages\/alpha\/src\/orphan\.ts/);
    assert.match(text, /集合に入っているが宣言では走査しない: {2}packages\/ghost\/src\/ghost\.ts/);
    // Then: 2 行のパスの開始列が揃っている（ずれた案内は読み比べられない）
    const cols = text
      .split("\n")
      .filter((l) => l.includes("packages/"))
      .map((l) => l.indexOf("packages/"));
    assert.equal(new Set(cols).size, 1, `列が揃っていません: ${cols.join(", ")}`);
    // Then: 走査量を必ず添える（#135 D5）
    assert.match(text, /現在の走査対象: 照合先 2 パッケージ \/ 3 ファイル/);
  });
});

import { scanVolumeOf, findScanVolumeDrift } from "./audit-structure.mjs";

describe("走査対象の同一性: 照合した集合と指標が測った集合の突き合わせ（#198）", () => {
  const mapOf = (n) => new Map([...Array(n).keys()].map((i) => [`k${i}`, ""]));
  /** loadScanTargets の結果を模した最小の形（規模だけが問題になる）。 */
  const loadedOf = (pkgs) => pkgs.map(([src, test]) => ({ srcFiles: mapOf(src), testFiles: mapOf(test) }));

  test("scanVolumeOf: 渡された集合そのものの件数を名乗る", () => {
    // Given: 2 パッケージ（src 100+86・test 200+68）と 3 つの派生集合
    // When
    const volume = scanVolumeOf(
      loadedOf([[100, 200], [86, 68]]),
      mapOf(29),
      mapOf(186),
      mapOf(268),
      mapOf(4),
    );
    // Then
    assert.deepEqual(volume, {
      走査パッケージ: 2,
      "src ファイル": 186,
      "test ファイル": 268,
      "SC-039 照合先": 29,
      "SC-039 参照元": 186,
      テスト集合: 268,
      "SC-039 公開契約": 4,
    });
  });

  test("scanVolumeOf: 派生集合を経ない走査対象も名乗る（loaded 側の痩せを見る）", () => {
    // Given: SC-027 は loaded を、SC-035 / SC-039① は個々の srcFiles を直接読む
    const loaded = loadedOf([[100, 200], [86, 68]]);
    // When: パッケージを 1 つ落とす
    loaded.pop();
    // Then: 派生集合が同じままでも、走査パッケージと src/test の件数で分かる
    const volume = scanVolumeOf(loaded, mapOf(29), mapOf(186), mapOf(268), mapOf(4));
    assert.equal(volume["走査パッケージ"], 1);
    assert.equal(volume["src ファイル"], 100);
    assert.equal(volume["test ファイル"], 200);
  });

  test("scanVolumeOf: 間引かれた後に呼ぶと減った件数を名乗る（入れ物ではなく実体を見る）", () => {
    // Given: 一度渡した集合から 1 件消す
    const packageSrcFiles = mapOf(29);
    // When
    packageSrcFiles.delete("k0");
    // Then: 控えた件数ではなく、いまの件数が出る
    const volume = scanVolumeOf(loadedOf([[1, 1]]), packageSrcFiles, mapOf(186), mapOf(268), mapOf(4));
    assert.equal(volume["SC-039 照合先"], 28);
  });

  test("findScanVolumeDrift: 一致していればずれは無い", () => {
    // Given / When / Then
    const v = { a: 1, b: 2 };
    assert.deepEqual(findScanVolumeDrift(v, { ...v }), []);
  });

  test("findScanVolumeDrift: 減った次元を名指しする（照合より後段での間引き）", () => {
    // Given: 照合時 29 件、指標が測ったのは 28 件
    // When
    const drift = findScanVolumeDrift(
      { "SC-039 照合先": 29, テスト集合: 268 },
      { "SC-039 照合先": 28, テスト集合: 268 },
    );
    // Then: どの次元がどう変わったかまで出す（赤の根拠になる）
    assert.deepEqual(drift, ["SC-039 照合先: 29 → 28"]);
  });

  test("findScanVolumeDrift: 増えた場合もずれとして出す（片方向では塞げない）", () => {
    // Given / When: 指標側で足す変更も、照合した対象と違うことに変わりはない
    const drift = findScanVolumeDrift({ テスト集合: 268 }, { テスト集合: 269 });
    // Then
    assert.deepEqual(drift, ["テスト集合: 268 → 269"]);
  });

  test("findScanVolumeDrift: 申告そのものが欠けていればずれとして出す（不足側へ倒す）", () => {
    // Given: 指標側が次元ごと名乗らなくなった状態
    // When
    const drift = findScanVolumeDrift({ "SC-039 参照元": 186 }, {});
    // Then: 黙って通さない
    assert.deepEqual(drift, ["SC-039 参照元: 186 → undefined"]);
  });
});

import { buildSc039Sources as buildForContract } from "./audit-structure.mjs";
import {
  sc039ScanVolumeDimensions as dimensionsForContract,
  scanVolumeOf as scanVolumeOfForContract,
} from "./audit-structure.mjs";

describe("SC-039④: 公開契約に載っているだけの値（#182）", () => {
  describe("extractContractNames: 列挙を値と型に分ける", () => {
    test("値の再エクスポートは値として拾う", () => {
      // Given / When
      const { values, types } = extractContractNames("export { a, b } from './x';");
      // Then
      assert.deepEqual(values, ["a", "b"]);
      assert.deepEqual(types, []);
    });

    test("`export type { … }` は型として拾う（値には数えない）", () => {
      // Given / When
      const { values, types } = extractContractNames("export type { A } from './x';");
      // Then
      assert.deepEqual(values, []);
      assert.deepEqual(types, ["A"]);
    });

    test("同じ節に混ざるインライン `type` 修飾子も型として拾う", () => {
      // Given: 値と型が 1 つの節に同居する書き方
      // When
      const { values, types } = extractContractNames("export { type A, b } from './x';");
      // Then
      assert.deepEqual(values, ["b"]);
      assert.deepEqual(types, ["A"]);
    });

    test("`as` で改名していれば公開名は右側（利用者が書くのはこちら）", () => {
      // Given / When
      const { values } = extractContractNames("export { internalName as publicName } from './x';");
      // Then
      assert.deepEqual(values, ["publicName"]);
    });

    test("節の中のブロックコメントは名前として拾わない（カンマを含んでも分割を壊さない）", () => {
      // Given: 中括弧の中にカンマを含むブロックコメントがある列挙
      const source = "export {\n  a, /* b, c はまだ決めていない */\n  b,\n} from './x';";
      // When
      const { values } = extractContractNames(source);
      // Then: コメントの断片が記号名に化けない
      assert.deepEqual(values, ["a", "b"]);
    });

    test("節の中の行コメントは名前として拾わない", () => {
      // Given: 註釈つきの列挙
      const source = "export {\n  a, // 説明\n  b,\n} from './x';";
      // When
      const { values } = extractContractNames(source);
      // Then
      assert.deepEqual(values, ["a", "b"]);
    });
  });

  describe("extractNamedImportsFromPackage: そのパッケージ本体からの取り込みだけを見る", () => {
    test("パッケージ本体からの取り込みを拾う", () => {
      // Given / When
      const names = extractNamedImportsFromPackage(
        "import { a, b } from '@tasuki/poker-core';",
        "poker-core",
      );
      // Then
      assert.deepEqual([...names].sort(), ["a", "b"]);
    });

    test("名前空間の綴りには依存しない（末尾のパッケージ名だけを見る）", () => {
      // Given: 名前空間が変わっても同じパッケージである
      // When
      const names = extractNamedImportsFromPackage("import { a } from '@other/poker-core';", "poker-core");
      // Then
      assert.deepEqual([...names], ["a"]);
    });

    test("サブパスからの取り込みは数えない（index.ts を通らないため）", () => {
      // Given: index.ts を経由しない取り込み
      // When
      const names = extractNamedImportsFromPackage(
        "import { a } from '@tasuki/timer-core/aggregate';",
        "timer-core",
      );
      // Then
      assert.deepEqual([...names], []);
    });

    test("相対 import は拾わない（末尾一致が同名の隣接モジュールに当たる）", () => {
      // Given: `packages/poker-core/src/index.ts` は自分の `./protocol` を再エクスポートしている。
      //        末尾一致だけを見ると、これが `@tasuki/protocol` からの取り込みに化ける
      // When
      const names = extractNamedImportsFromPackage(
        "export { isKnownErrorCode } from './protocol';",
        "protocol",
      );
      // Then: 記号を黙って「生きている」側へ倒さない
      assert.deepEqual([...names], []);
    });

    test("絶対パスの import も拾わない", () => {
      // Given / When
      const names = extractNamedImportsFromPackage("import { a } from '/src/protocol';", "protocol");
      // Then
      assert.deepEqual([...names], []);
    });

    test("前方一致の別パッケージは拾わない", () => {
      // Given / When
      const names = extractNamedImportsFromPackage("import { a } from '@tasuki/poker-core-extra';", "poker-core");
      // Then
      assert.deepEqual([...names], []);
    });

    test("行コメントの中の import は取り込みとみなさない", () => {
      // Given: コメントアウトされた取り込み
      // When
      const names = extractNamedImportsFromPackage(
        "// import { computeStats } from '@tasuki/poker-core';",
        "poker-core",
      );
      // Then: 記号を黙って「生きている」側へ倒さない
      assert.deepEqual([...names], []);
    });

    test("ブロックコメントの中の import は取り込みとみなさない", () => {
      // Given / When
      const names = extractNamedImportsFromPackage(
        "/* import { computeStats } from '@tasuki/poker-core'; */",
        "poker-core",
      );
      // Then
      assert.deepEqual([...names], []);
    });

    test("JSDoc の中で行頭が `*` の行に書かれた import も取り込みとみなさない", () => {
      // Given: 説明のために import 文を例示する docstring
      const source = ["/**", " * import { computeStats } from '@tasuki/poker-core';", " */"].join("\n");
      // When
      const names = extractNamedImportsFromPackage(source, "poker-core");
      // Then
      assert.deepEqual([...names], []);
    });

    test("文字列リテラルの中の import は取り込みとみなさない", () => {
      // Given / When
      const names = extractNamedImportsFromPackage(
        `const s = "import { computeStats } from '@tasuki/poker-core';";`,
        "poker-core",
      );
      // Then
      assert.deepEqual([...names], []);
    });

    test("行頭から始まる本物の import は、字下げされていても拾う", () => {
      // Given: 条件付き読み込みなどで字下げされた取り込み
      // When
      const names = extractNamedImportsFromPackage("  import { a } from '@tasuki/x';", "x");
      // Then
      assert.deepEqual([...names], ["a"]);
    });

    test("複数行にまたがる import も拾う", () => {
      // Given / When
      const names = extractNamedImportsFromPackage(
        "import {\n  a,\n  b,\n} from '@tasuki/x';",
        "x",
      );
      // Then
      assert.deepEqual([...names].sort(), ["a", "b"]);
    });

    test("`as` で改名していても、使われている公開名は左側", () => {
      // Given / When
      const names = extractNamedImportsFromPackage("import { a as localName } from '@tasuki/x';", "x");
      // Then
      assert.deepEqual([...names], ["a"]);
    });

    test("`import type { … }` も取り込みとして数える", () => {
      // Given / When
      const names = extractNamedImportsFromPackage("import type { A } from '@tasuki/x';", "x");
      // Then
      assert.deepEqual([...names], ["A"]);
    });

    test("インライン `type` 修飾子つきの取り込みも数える", () => {
      // Given / When
      const names = extractNamedImportsFromPackage("import { type A, b } from '@tasuki/x';", "x");
      // Then
      assert.deepEqual([...names].sort(), ["A", "b"]);
    });
  });

  describe("sc039dContractOnlyValues: 外から取り込まれない値を数える", () => {
    const indexOf = (body) => new Map([["packages/x/src/index.ts", body]]);

    test("外部の製品コードが取り込まない値は数える", () => {
      // Given: index は a を列挙するが、誰も取り込まない
      const productSources = new Map([["apps/app/src/main.ts", "console.log('何も取り込まない');"]]);
      // When / Then
      assert.equal(sc039dContractOnlyValues(indexOf("export { a } from './a';"), productSources), 1);
    });

    test("外部の製品コードが取り込む値は数えない", () => {
      // Given / When / Then
      const productSources = new Map([["apps/app/src/main.ts", "import { a } from '@tasuki/x';"]]);
      assert.equal(sc039dContractOnlyValues(indexOf("export { a } from './a';"), productSources), 0);
    });

    test("型は数えない（公開している値の署名から到達できるため）", () => {
      // Given: 誰も取り込まない型だけを列挙する
      const productSources = new Map([["apps/app/src/main.ts", "何も取り込まない"]]);
      // When / Then
      assert.equal(sc039dContractOnlyValues(indexOf("export type { A } from './a';"), productSources), 0);
    });

    test("自パッケージの中からの取り込みは生存の根拠にしない", () => {
      // Given: 同じパッケージの別ファイルが index 経由で取り込んでいる
      const productSources = new Map([["packages/x/src/other.ts", "import { a } from '@tasuki/x';"]]);
      // When / Then: index に載せる理由は「外から使われること」なので数える
      assert.equal(sc039dContractOnlyValues(indexOf("export { a } from './a';"), productSources), 1);
    });

    test("識別子が字面として現れるだけでは取り込みとみなさない", () => {
      // Given: import 文の中括弧の外に同じ綴りがあるだけ
      const productSources = new Map([["apps/app/src/main.ts", "const a = 1; console.log(a);"]]);
      // When / Then
      assert.equal(sc039dContractOnlyValues(indexOf("export { a } from './a';"), productSources), 1);
    });

    test("パッケージが複数あれば合算する", () => {
      // Given: 2 パッケージがそれぞれ 1 件ずつ死んだ値を持つ
      const contractFiles = new Map([
        ["packages/x/src/index.ts", "export { a } from './a';"],
        ["packages/y/src/index.ts", "export { b } from './b';"],
      ]);
      const productSources = new Map([["apps/app/src/main.ts", "何も取り込まない"]]);
      // When / Then
      assert.equal(sc039dContractOnlyValues(contractFiles, productSources), 2);
    });

    test("`packages/` 層でないパスを渡されたら落ちる（黙って 0 件にしない）", () => {
      // Given: パッケージ名を取り出せないパス
      const contractFiles = new Map([["apps/app/src/main.tsx", "export { a } from './a';"]]);
      // When / Then
      assert.throws(() => sc039dContractOnlyValues(contractFiles, new Map()), /packages/);
    });
  });

  describe("走査対象は宣言から導く（#135 の機構・ADR-0014）", () => {
    const declarations = [
      { pkg: "packages/alpha", src: "src", test: "tests", entry: "index.ts" },
      { pkg: "packages/beta", src: "source", test: "tests", entry: "entry.ts" },
      { pkg: "packages/gamma", src: null, test: "tests", entry: null },
      { pkg: "apps/delta", src: "src", test: "tests", entry: "main.tsx" },
    ];
    const readDir = (pkg, sub) =>
      new Map([
        [pkg === "packages/beta" ? "entry.ts" : pkg === "apps/delta" ? "main.tsx" : "index.ts", "export {} from './x';"],
        ["other.ts", ""],
      ]);

    test("宣言側: `packages/` 層で src とエントリを持つものだけを挙げる", () => {
      // Given / When
      const files = sc039DeclaredContractFiles(loadScanTargets(declarations, readDir));
      // Then: apps 層は公開契約ではない。src を持たない宣言も入らない
      assert.deepEqual(files, ["packages/alpha/src/index.ts", "packages/beta/source/entry.ts"]);
    });

    test("組み立て側: buildSc039Sources が同じ一覧を返す（全単射で照合できる）", () => {
      // Given / When
      const { contractFiles } = buildForContract(loadScanTargets(declarations, readDir));
      // Then
      assert.deepEqual(
        [...contractFiles.keys()].sort(),
        ["packages/alpha/src/index.ts", "packages/beta/source/entry.ts"],
      );
    });
  });

  describe("走査量の申告に公開契約を含める（#198 の機構）", () => {
    const mapOf = (n) => new Map([...Array(n).keys()].map((i) => [`k${i}`, ""]));

    test("0 件ガードの内訳に公開契約ファイルが入る", () => {
      // Given / When
      const dimensions = dimensionsForContract({
        comparedPackages: ["a"],
        packageSrcFiles: mapOf(29),
        referencePackages: ["a"],
        productSources: mapOf(186),
        contractFiles: mapOf(4),
      });
      // Then
      assert.ok(dimensions.some((d) => d.count === 4 && /公開契約/.test(d.label)));
    });

    test("scanVolumeOf が公開契約の件数も名乗る（照合より後段での間引きを見る）", () => {
      // Given / When
      const volume = scanVolumeOfForContract(
        [{ srcFiles: mapOf(1), testFiles: mapOf(1) }],
        mapOf(29),
        mapOf(186),
        mapOf(268),
        mapOf(4),
      );
      // Then
      assert.equal(volume["SC-039 公開契約"], 4);
    });
  });
});
