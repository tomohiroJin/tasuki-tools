import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DOMAIN_ERROR_TARGETS,
  FORBIDDEN_FIELDS,
  findDeclarationSpan,
  findDomainErrorProblems,
} from "./audit-domain-error-shape.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const TARGET = { file: "packages/x-core/src/round.ts", type: "RoundError" };

/** 与えた本文で `sources` を組む（`null` を渡すとファイルが実在しない状態になる）。 */
function sourcesOf(source) {
  const m = new Map();
  if (source !== null) m.set(TARGET.file, source);
  return m;
}

describe("findDeclarationSpan: 実物にある 4 つの書き方を切り出せる", () => {
  test("1 行の type", () => {
    // Given / When
    const span = findDeclarationSpan("const a = 1;\nexport type RoomError = { code: 'x' };\n", "RoomError");
    // Then
    assert.deepEqual(span, {
      startLine: 2,
      endLine: 2,
      lines: ["export type RoomError = { code: 'x' };"],
    });
  });

  test("複数行の合併 type は最後のメンバーまで含む（1 メンバー目で切れない）", () => {
    // Given: メンバー行は `}` で終わる。ここで終端にしてしまうと 2 件目以降を読まなくなる
    const src = [
      "export type RoundError =",
      "  | { code: 'a'; op: 'x' }",
      "  | { code: 'b'; message: string };",
      "export const after = 1;",
    ].join("\n");
    // When
    const span = findDeclarationSpan(src, "RoundError");
    // Then
    assert.equal(span.startLine, 1);
    assert.equal(span.endLine, 3);
    assert.equal(span.lines.length, 3);
  });

  test("複数行の interface は閉じ中括弧の行で終える（`;` が無くても終端になる）", () => {
    // Given
    const src = ["export interface EmptyName {", '  type: "EmptyName";', "}", "export const after = 1;"].join("\n");
    // When
    const span = findDeclarationSpan(src, "EmptyName");
    // Then
    assert.equal(span.endLine, 3);
    assert.ok(!span.lines.join("\n").includes("after"));
  });

  test("名前を並べただけの合併 type も終端の `;` で終える", () => {
    // Given
    const src = ["export type DomainError =", "  | EmptyName", "  | DuplicateName;", "const after = 1;"].join("\n");
    // When
    const span = findDeclarationSpan(src, "DomainError");
    // Then
    assert.equal(span.endLine, 3);
  });

  test("宣言が無ければ null", () => {
    assert.equal(findDeclarationSpan("export type Other = { a: 1 };", "RoundError"), null);
  });

  test("終端に達しなければ endLine を null で返す（黙って全文を読んだことにしない）", () => {
    // Given: 閉じない interface
    const span = findDeclarationSpan("export interface Broken {\n  type: 'x';\n", "Broken");
    // Then
    assert.equal(span.startLine, 1);
    assert.equal(span.endLine, null);
  });
});

describe("findDomainErrorProblems", () => {
  test("判別子と機械可読な詳細だけなら問題を返さない", () => {
    // Given / When
    const problems = findDomainErrorProblems(
      TARGET,
      sourcesOf("export type RoundError =\n  | { code: 'a'; op: 'x' }\n  | { code: 'b' };\n"),
    );
    // Then
    assert.deepEqual(problems, []);
  });

  test("message フィールドを足すと検出し、行番号と型名を名指しする", () => {
    // Given: 実際に型へ書き戻したときの形（型システムはこれを止めない）
    const src = ["export type RoundError =", "  | { code: 'a'; op: 'x' }", "  | { code: 'b'; message: string };"].join("\n");
    // When
    const problems = findDomainErrorProblems(TARGET, sourcesOf(src));
    // Then
    assert.equal(problems.length, 1);
    assert.match(problems[0], /round\.ts:3 ドメインエラー型 RoundError に message フィールドがあります/);
  });

  test("`message?:` と引用符つきのキーも検出する", () => {
    for (const field of ["message?: string", "'message': string", '"message": string']) {
      // Given / When
      const problems = findDomainErrorProblems(
        TARGET,
        sourcesOf(`export type RoundError = { code: 'a'; ${field} };`),
      );
      // Then
      assert.equal(problems.length, 1, `検出できていません: ${field}`);
    }
  });

  test("宣言の範囲の外にある message は検出しない（同じファイルの別の型を巻き込まない）", () => {
    // Given: 検査対象の型は健全で、同じファイルの別の型だけが message を持つ。
    // これが「ProtocolError / ServerMessage を巻き込まない」性質の最小形である
    const src = [
      "export type RoundError = { code: 'a' };",
      "export type ProtocolError = { code: 'invalid-message'; message: string };",
    ].join("\n");
    // When
    const problems = findDomainErrorProblems(TARGET, sourcesOf(src));
    // Then
    assert.deepEqual(problems, []);
  });

  test("ファイルが実在しなければ検出する", () => {
    const problems = findDomainErrorProblems(TARGET, sourcesOf(null));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /宣言にあるが実在しない/);
  });

  test("型が改名・削除されていれば検出する（検査が静かに空振りする経路）", () => {
    const problems = findDomainErrorProblems(TARGET, sourcesOf("export type RoundFailure = { code: 'a' };"));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /RoundError の型宣言が見つかりません/);
  });

  test("終端に達しない宣言は範囲を決められないものとして検出する", () => {
    const problems = findDomainErrorProblems(TARGET, sourcesOf("export interface RoundError {\n  code: 'a';\n"));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /終端が見つかりません/);
  });
});

describe("宣言（DOMAIN_ERROR_TARGETS）と実物の突合", () => {
  test("宣言した全ファイル・全型が実在し、いま問題は 0 件", () => {
    // Given: 実物を読む（検査本体と同じ読み方）
    const sources = new Map();
    for (const t of DOMAIN_ERROR_TARGETS) {
      const abs = path.join(REPO_ROOT, t.file);
      if (fs.existsSync(abs)) sources.set(t.file, fs.readFileSync(abs, "utf8"));
    }
    // When
    const problems = DOMAIN_ERROR_TARGETS.flatMap((t) => findDomainErrorProblems(t, sources));
    // Then
    assert.deepEqual(problems, [], problems.join("\n"));
  });

  test("WS プロトコルと文言生成のファイルは宣言に入っていない（ADR-0016 の逐語が対象外と定めた）", () => {
    // Then: 誤検出の芽を宣言の段で断つ
    const files = DOMAIN_ERROR_TARGETS.map((t) => t.file);
    assert.ok(!files.includes("packages/poker-core/src/protocol.ts"), "protocol.ts は対象外のはず");
    assert.ok(!files.includes("packages/poker-core/src/error-messages.ts"), "error-messages.ts は対象外のはず");
  });

  test("対象外だと言っている ProtocolError は、現に message フィールドを持つ（誤検出の危険が実在する）", () => {
    // Given: 「巻き込むと誤検出になる」が机上の話でないことを実物で確かめる。
    // ここが空振りしたら、上の 2 つの assert は守るものが無くなっている
    const protocolSrc = fs.readFileSync(path.join(REPO_ROOT, "packages/poker-core/src/protocol.ts"), "utf8");
    const span = findDeclarationSpan(protocolSrc, "ProtocolError");
    assert.notEqual(span, null, "ProtocolError の宣言が見つかりません");
    // When: 検査と同じ判定を、あえて対象外のはずの型へ当ててみる
    const problems = findDomainErrorProblems(
      { file: "packages/poker-core/src/protocol.ts", type: "ProtocolError" },
      new Map([["packages/poker-core/src/protocol.ts", protocolSrc]]),
    );
    // Then: 宣言に入れていたら赤くなっていた。入れていないので実際には見に行かない
    assert.equal(problems.length, 1);
    assert.match(problems[0], /ProtocolError に message フィールドがあります/);
  });

  test("禁止フィールドの宣言は空にならない", () => {
    assert.ok(FORBIDDEN_FIELDS.length > 0);
  });
});
