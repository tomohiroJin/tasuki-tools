import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ASSEMBLY_TARGETS,
  FORBIDDEN_IN_ENTRY,
  FORBIDDEN_IN_PARTS,
  findAssemblyProblems,
  importedNamesFrom,
  isEvidenceLine,
} from "./audit-assembly-wiring.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** 健全なエントリの最小形（実物と同じ書き方） */
const GOOD_ENTRY = [
  "import { loadPokerSyncConfig } from './config';",
  "import { createSyncServer } from './create-sync-server';",
  "",
  "const config = loadPokerSyncConfig(process.env);",
  "const server = createSyncServer(config);",
].join("\n");

const TARGET = {
  entry: "apps/x-sync/src/server.ts",
  assembler: "apps/x-sync/src/create-sync-server.ts",
  fn: "createSyncServer",
};

/** 与えたエントリ本文で `sources` を組む。`assembler` は既定で実在させる。 */
function sourcesOf(entrySource, { withAssembler = true } = {}) {
  const m = new Map();
  if (entrySource !== null) m.set(TARGET.entry, entrySource);
  if (withAssembler) m.set(TARGET.assembler, "export function createSyncServer() {}");
  return m;
}

describe("findAssemblyProblems", () => {
  test("健全な組では問題を返さない", () => {
    // Given / When
    const problems = findAssemblyProblems(TARGET, sourcesOf(GOOD_ENTRY));
    // Then
    assert.deepEqual(problems, []);
  });

  test("組み立て関数のファイルが無ければ検出する", () => {
    // Given: エントリは健全だが create-sync-server.ts が無い
    const problems = findAssemblyProblems(TARGET, sourcesOf(GOOD_ENTRY, { withAssembler: false }));
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /組み立て関数のファイルがありません/);
  });

  test("エントリが無ければ検出し、そこで打ち切る", () => {
    // Given: エントリが存在しない（assembler はある）
    const problems = findAssemblyProblems(TARGET, sourcesOf(null));
    // Then: エントリ不在の 1 件だけ（読めない本文について追加の主張をしない）
    assert.equal(problems.length, 1);
    assert.match(problems[0], /エントリがありません/);
  });

  test("import はあるが呼んでいなければ検出する", () => {
    // Given: import だけ残して呼び出しを消した（配線を切る典型の壊し方）
    const entry = GOOD_ENTRY.split("\n")
      .filter((l) => !l.includes("const server ="))
      .join("\n");
    // When
    const problems = findAssemblyProblems(TARGET, sourcesOf(entry));
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /createSyncServer\(\) を呼んでいません/);
  });

  test("呼んでいるが import していなければ検出する", () => {
    // Given: import 行だけを消す
    const entry = GOOD_ENTRY.split("\n")
      .filter((l) => !l.includes("from './create-sync-server'"))
      .join("\n");
    // When
    const problems = findAssemblyProblems(TARGET, sourcesOf(entry));
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /import していません/);
  });

  test("エントリに Bun.serve が現れたら行番号つきで検出する", () => {
    // Given: 組み立てがエントリに戻ってきた状態
    const entry = `${GOOD_ENTRY}\nBun.serve({ port: 0 });`;
    // When
    const problems = findAssemblyProblems(TARGET, sourcesOf(entry));
    // Then: 6 行目（1 起点）を指す
    assert.equal(problems.length, 1);
    assert.match(problems[0], /server\.ts:6 エントリに Bun\.serve が現れています/);
  });

  test("import 行の createSyncServer( は呼び出しと数えない", () => {
    // Given: import 文だけがあり、呼び出しが無い
    const entry = "import { createSyncServer } from './create-sync-server';";
    // When
    const problems = findAssemblyProblems(TARGET, sourcesOf(entry));
    // Then: 「呼んでいません」が出る（import 行を呼び出しと誤認しない）
    assert.equal(problems.length, 1);
    assert.match(problems[0], /呼んでいません/);
  });

  test("説明コメントの createSyncServer() を呼び出しの証拠に数えない（初版の欠陥）", () => {
    // Given: 実物の server.ts と同じく、冒頭コメントが関数名を説明に含む。
    // 呼び出し行だけを消す（本 PR の破壊検証で、初版はこれを緑にしていた）
    const entry = [
      "/**",
      " * 依存の組み立ては `create-sync-server.ts` の `createSyncServer()` が持つ。",
      " */",
      "import { createSyncServer } from './create-sync-server';",
      "",
      "const config = {};",
    ].join("\n");
    // When
    const problems = findAssemblyProblems(TARGET, sourcesOf(entry));
    // Then: コメントは証拠にならないので「呼んでいません」が出る
    assert.equal(problems.length, 1);
    assert.match(problems[0], /呼んでいません/);
  });

  test("コメントに書いた Bun.serve は逆に検出する（向きが非対称であること）", () => {
    // Given: 「無いこと」を求める側はコメント行も読む＝赤くなりやすい側へ倒す
    const entry = `${GOOD_ENTRY}\n// かつては Bun.serve をここで呼んでいた`;
    // When
    const problems = findAssemblyProblems(TARGET, sourcesOf(entry));
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /Bun\.serve が現れています/);
  });

  test("行末コメントの createSyncServer() は呼び出しの証拠として通ってしまう（現状の固定）", () => {
    // Given: 呼び出し行を消し、代わりに行末コメントへ関数名を書く。
    // **これは仕様ではなく既知の限界である**（ファイル冒頭「既知の限界」の緑になる向き）。
    // 現状を記録しておき、機構を変えたときにここが落ちて気づけるようにする。
    const entry = [
      "import { createSyncServer } from './create-sync-server';",
      "const x = 1; // かつては createSyncServer(config) を呼んでいた",
    ].join("\n");
    // When
    const problems = findAssemblyProblems(TARGET, sourcesOf(entry));
    // Then: 呼び出しは実在しないのに、問題なしと判定される
    assert.deepEqual(problems, []);
  });

  test("* で始まらないブロックコメント本文も証拠として通ってしまう（現状の固定）", () => {
    // Given: 同上。ブロックコメントの本文行が `*` で始まらない形
    const entry = [
      "import { createSyncServer } from './create-sync-server';",
      "/*",
      "依存の組み立ては createSyncServer(config) が持つ",
      "*/",
    ].join("\n");
    // When
    const problems = findAssemblyProblems(TARGET, sourcesOf(entry));
    // Then
    assert.deepEqual(problems, []);
  });

  test("import 行の行末コメントも import の証拠として通ってしまう（現状の固定）", () => {
    // Given: 本物の import は別モジュール。関数名とモジュール名は行末コメントにだけある
    const entry = [
      "import { a } from './b'; // createSyncServer は create-sync-server から",
      "const server = createSyncServer(config);",
    ].join("\n");
    // When
    const problems = findAssemblyProblems(TARGET, sourcesOf(entry));
    // Then: import は実在しないのに、問題なしと判定される
    assert.deepEqual(problems, []);
  });

  test("ブロックコメントを閉じたあとの実コードは落としてしまう（赤になる向き・現状の固定）", () => {
    // Given: `*/ 実コード` は `*` 始まりなのでコメントとして落ちる。
    // audit-log-hygiene.mjs の isCommentLine はこの形を扱う（挙動が違う 2 本目）
    const entry = [
      "import { createSyncServer } from './create-sync-server';",
      "*/ const server = createSyncServer(config);",
    ].join("\n");
    // When
    const problems = findAssemblyProblems(TARGET, sourcesOf(entry));
    // Then: 呼び出しは実在するのに「呼んでいません」が出る（安全側）
    assert.equal(problems.length, 1);
    assert.match(problems[0], /呼んでいません/);
  });

  test("問題が複数あればすべて返す", () => {
    // Given: import も呼び出しも無く、Bun.serve が居座っている
    const problems = findAssemblyProblems(TARGET, sourcesOf("Bun.serve({ port: 0 });"));
    // Then
    assert.equal(problems.length, 3);
  });
});

/** 分けた先（#591）を持つ組。組み立て関数は分けた先を import して呼ぶ。 */
const PART_FILE = "apps/x-sync/src/assembly/topic.ts";
const TARGET_WITH_PARTS = { ...TARGET, parts: [{ file: PART_FILE, fns: ["assembleTopic"] }] };
const GOOD_ASSEMBLER = [
  'import { assembleTopic } from "./assembly/topic.js";',
  "export function createSyncServer() {",
  "  const topic = assembleTopic(base);",
  "}",
].join("\n");
const GOOD_PART = "export function assembleTopic(base) { return {}; }";

function sourcesWithParts({ assembler = GOOD_ASSEMBLER, part = GOOD_PART } = {}) {
  const m = new Map([[TARGET.entry, GOOD_ENTRY]]);
  if (assembler !== null) m.set(TARGET.assembler, assembler);
  if (part !== null) m.set(PART_FILE, part);
  return m;
}

describe("findAssemblyProblems（分けた先・#591）", () => {
  test("健全な分けた先では問題を返さない", () => {
    assert.deepEqual(findAssemblyProblems(TARGET_WITH_PARTS, sourcesWithParts()), []);
  });

  test("分けた先のファイルが無ければ赤", () => {
    const problems = findAssemblyProblems(TARGET_WITH_PARTS, sourcesWithParts({ part: null }));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /分けた先のファイルがありません/);
  });

  test("組み立て関数が分けた先を import していなければ赤", () => {
    const assembler = ["export function createSyncServer() {", "  const topic = assembleTopic(base);", "}"].join("\n");
    const problems = findAssemblyProblems(TARGET_WITH_PARTS, sourcesWithParts({ assembler }));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /import していません/);
  });

  test("組み立て関数が分けた先の関数を呼んでいなければ赤（import だけでは証拠にならない）", () => {
    const assembler = ['import { assembleTopic } from "./assembly/topic.js";', "export function createSyncServer() {}"].join("\n");
    const problems = findAssemblyProblems(TARGET_WITH_PARTS, sourcesWithParts({ assembler }));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /assembleTopic\(\) を呼んでいません/);
  });

  test("呼び出しがコメント行にしか無いなら赤", () => {
    const assembler = [
      'import { assembleTopic } from "./assembly/topic.js";',
      "export function createSyncServer() {",
      "  // const topic = assembleTopic(base);",
      "}",
    ].join("\n");
    const problems = findAssemblyProblems(TARGET_WITH_PARTS, sourcesWithParts({ assembler }));
    assert.equal(problems.length, 1);
  });

  test("複数行に折り返した import でも、分けた先から取り込んだ名前として読む（偽の赤にしない）", () => {
    const assembler = [
      "import {",
      "  type TopicPart,",
      "  assembleTopic,",
      '} from "./assembly/topic.js";',
      "export function createSyncServer() {",
      "  const topic = assembleTopic(base);",
      "}",
    ].join("\n");
    assert.deepEqual(findAssemblyProblems(TARGET_WITH_PARTS, sourcesWithParts({ assembler })), []);
  });

  test("別のディレクトリの同名ファイルから import しても、分けた先の import とは数えない（偽の緑にしない）", () => {
    const assembler = [
      'import { assembleTopic } from "./other/topic.js";',
      "export function createSyncServer() {",
      "  const topic = assembleTopic(base);",
      "}",
    ].join("\n");
    const problems = findAssemblyProblems(TARGET_WITH_PARTS, sourcesWithParts({ assembler }));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /import していません/);
  });

  test("import type は名前を数えない・as の別名は元の名前で数える", () => {
    const names = importedNamesFrom(
      [
        'import type { assembleTopic } from "./assembly/topic.js";',
        'import { assembleRoulette as ar } from "./assembly/topic.js";',
        '// import { assembleHub } from "./assembly/topic.js";',
      ].join("\n"),
      TARGET.assembler,
      PART_FILE,
    );
    assert.deepEqual([...names], ["assembleRoulette"]);
  });

  test("分けた先で WsAdapter を起こしていれば赤（サーバーを起こすのは組み立て関数 1 か所）", () => {
    const part = `${GOOD_PART}\nconst ws = new WsAdapter({ port: 0 });`;
    const problems = findAssemblyProblems(TARGET_WITH_PARTS, sourcesWithParts({ part }));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /new WsAdapter\(/);
  });

  test("分けた先の Bun.serve はコメント行でも赤", () => {
    const part = `${GOOD_PART}\n// Bun.serve は使わない`;
    assert.equal(findAssemblyProblems(TARGET_WITH_PARTS, sourcesWithParts({ part })).length, 1);
  });
});

describe("宣言（ASSEMBLY_TARGETS / FORBIDDEN_IN_ENTRY）", () => {
  test("宣言した組は 1 つ以上あり、すべて実在する", () => {
    // Given / When / Then: 宣言が空なら検査は空振りする
    assert.ok(ASSEMBLY_TARGETS.length > 0);
    for (const t of ASSEMBLY_TARGETS) {
      for (const rel of [t.entry, t.assembler]) {
        assert.ok(fs.existsSync(path.join(REPO_ROOT, rel)), `実在しません: ${rel}`);
      }
    }
  });

  test("同期サーバーの src/server.ts を 1 つも取りこぼしていない", () => {
    // Given: apps/*-sync のうち src/server.ts を持つもの（実体から導出する）
    const appsDir = path.join(REPO_ROOT, "apps");
    const actual = fs
      .readdirSync(appsDir)
      .filter((name) => name.endsWith("-sync"))
      .map((name) => `apps/${name}/src/server.ts`)
      .filter((rel) => fs.existsSync(path.join(REPO_ROOT, rel)))
      .sort();
    // When
    const declared = ASSEMBLY_TARGETS.map((t) => t.entry).sort();
    // Then: 宣言と実体が全単射（片側だけ見る検査にしない）
    assert.deepEqual(declared, actual);
  });

  test("isEvidenceLine は行頭にマーカーが来る行だけを落とす", () => {
    // Given / When / Then: 行頭の非空白文字が `//` `*` `/*` なら落とす
    assert.equal(isEvidenceLine("const a = 1;"), true);
    assert.equal(isEvidenceLine("  const a = 1;"), true);
    assert.equal(isEvidenceLine("// コメント"), false);
    assert.equal(isEvidenceLine("  * JSDoc の継続行"), false);
    assert.equal(isEvidenceLine("/* ブロックの開始"), false);
  });

  test("isEvidenceLine は行頭にマーカーが来ないコメントを落とせない（現状の固定）", () => {
    // Given / When / Then: **直すためではなく、落とせないという事実を記録するための検査。**
    // 行頭しか見ない機構の帰結であり、精緻化は「賢い検査ほど穴が増える」を踏む。
    // 直す場合は、この 3 行が false になることを確認してから消すこと。
    assert.equal(isEvidenceLine("const x = 1; // 行末コメント"), true);
    assert.equal(isEvidenceLine("素のブロック本文（* で始まらない）"), true);
    assert.equal(isEvidenceLine("{/* 別の文字で始まる行に埋め込んだコメント */}"), true);
  });

  test("禁止構文の正規表現は空白入りの表記も拾う", () => {
    // Given: `Bun . serve(` のような書き方で検査を迂回できないこと
    const re = FORBIDDEN_IN_ENTRY[0].re;
    // When / Then
    assert.ok(re.test("Bun.serve({})"));
    assert.ok(re.test("Bun . serve({})"));
    assert.ok(!re.test("createBunServer()"));
  });
});

describe("宣言（parts・#591）", () => {
  test("宣言した分けた先はすべて実在し、assembly/ の実体と全単射（足し忘れは赤）", () => {
    // Given: assembly/ の実体（context.ts は部品ではなく共有の型）
    const dir = "apps/tasuki-sync/src/assembly";
    const actual = fs
      .readdirSync(path.join(REPO_ROOT, dir))
      .filter((name) => name.endsWith(".ts") && name !== "context.ts")
      .map((name) => `${dir}/${name}`)
      .sort();
    // When
    const target = ASSEMBLY_TARGETS.find((t) => t.assembler === "apps/tasuki-sync/src/create-sync-server.ts");
    const declared = (target?.parts ?? []).map((p) => p.file).sort();
    // Then
    assert.deepEqual(declared, actual);
    for (const p of target.parts) assert.ok(p.fns.length > 0, `呼ぶ関数が空です: ${p.file}`);
  });

  test("分けた先の禁止構文は WsAdapter の生成と Bun.serve", () => {
    assert.deepEqual(FORBIDDEN_IN_PARTS.map((f) => f.name), ["Bun.serve", "new WsAdapter("]);
    const re = FORBIDDEN_IN_PARTS[1].re;
    assert.ok(re.test("new WsAdapter({})"));
    assert.ok(re.test("new  WsAdapter ({})"));
    assert.ok(!re.test("type WsAdapter = ..."));
  });
});
