/**
 * `process.exit` の検出と `exitCode` の立て忘れの検出（#540）。構文木で見るので、文字列・正規表現・コメントの中は数えない。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { findProcessExitUses, findExitCodeWithoutReturn } from "./process-exit-scan.mjs";

describe("findProcessExitUses: 実コードの process.exit だけを数える", () => {
  test("process.exit(1) と process['exit'](1) と process[`exit`](1) を数える", () => {
    const src = "function main() {\n  process.exit(1);\n  process['exit'](2);\n  process[`exit`](3);\n}\n";
    assert.deepEqual(findProcessExitUses(src).map((u) => u.line), [2, 3, 4]);
  });
  test("分割代入・名前つき取り込み・別名の取り込みも数える", () => {
    const src = [
      'const { exit } = process;',
      'import { exit as quit } from "node:process";',
      'import proc from "node:process";',
      "proc.exit(1);",
      "",
    ].join("\n");
    assert.deepEqual(findProcessExitUses(src).map((u) => u.line), [1, 2, 4]);
  });
  test("文字列・正規表現・テンプレート・コメントの中は数えない", () => {
    const src = [
      'const a = "process.exit(1)"; // process.exit(2)',
      "const b = /process\\.exit\\(/;",
      "const c = `process.exit(${1})`;",
      "/* process.exit(3) */",
      "const g = \".github/workflows/*.yml\"; const h = 1; process.exitCode = 1;",
      "",
    ].join("\n");
    assert.deepEqual(findProcessExitUses(src), []);
  });
  test("文字列の `/*` で後ろの実コードを読み飛ばさない", () => {
    const src = 'const g = ".github/workflows/*.yml";\nprocess.exit(1);\nconst k = "*/";\n';
    assert.deepEqual(findProcessExitUses(src).map((u) => u.line), [2]);
  });
  test("括弧で包んだ (process).exit(1) と (process.exit)(1) も数える", () => {
    const src = "(process).exit(1);\n(process.exit)(2);\n((process))['exit'](3);\n";
    assert.deepEqual(findProcessExitUses(src).map((u) => u.line), [1, 2, 3]);
  });
  test("import { default as proc } from 'node:process' の proc.exit も数える", () => {
    const src = 'import { default as proc } from "node:process";\nproc.exit(1);\n';
    assert.deepEqual(findProcessExitUses(src).map((u) => u.line), [2]);
  });
  test("let / var の分割代入も数える", () => {
    assert.deepEqual(findProcessExitUses("let { exit } = process;\nvar { exit: quit } = process;\n").map((u) => u.line), [1, 2]);
  });
  test("process でない物の exit は数えない", () => {
    assert.deepEqual(findProcessExitUses("const worker = {}; worker.exit(1); other['exit'](1);"), []);
  });
});

describe("findExitCodeWithoutReturn: 非 0 の exitCode の直後は return か関数の最後", () => {
  test("直後が return なら通る", () => {
    assert.deepEqual(findExitCodeWithoutReturn("function main() { if (x) { process.exitCode = 1; return; } done(); }"), []);
  });
  test("関数の最後の文なら通る", () => {
    assert.deepEqual(findExitCodeWithoutReturn("function main() { run(); process.exitCode = 2; }"), []);
  });
  test("if の中で立てて return せず、後ろに続きがあれば名指しする", () => {
    const src = "function main() {\n  if (x) {\n    process.exitCode = 1;\n  }\n  console.log('OK');\n}\n";
    assert.deepEqual(findExitCodeWithoutReturn(src).map((u) => u.line), [3]);
  });
  test("同じブロックで立てたあとに別の文が続けば名指しする", () => {
    const src = "function main() {\n  process.exitCode = 1;\n  console.log('OK');\n}\n";
    assert.deepEqual(findExitCodeWithoutReturn(src).map((u) => u.line), [2]);
  });
  test("0 を代入する文は見ない", () => {
    assert.deepEqual(findExitCodeWithoutReturn("function main() { process.exitCode = 0; run(); }"), []);
  });
  test("式の中の三項などで代入する形（process.exitCode = ok ? 0 : 1）は非 0 になりうるので同じに見る", () => {
    const src = "function main() {\n  process.exitCode = ok ? 0 : 1;\n  after();\n}\n";
    assert.deepEqual(findExitCodeWithoutReturn(src).map((u) => u.line), [2]);
  });
  test("||= と ??= の代入も同じに見る", () => {
    const src = "function main() {\n  process.exitCode ||= 1;\n  after();\n}\nfunction g() {\n  process.exitCode ??= 2;\n  after();\n}\n";
    assert.deepEqual(findExitCodeWithoutReturn(src).map((u) => u.line), [2, 6]);
  });
  test("括弧で包んだ (process).exitCode = 1 も同じに見る", () => {
    assert.deepEqual(findExitCodeWithoutReturn("function main() {\n  (process).exitCode = 1;\n  after();\n}\n").map((u) => u.line), [2]);
  });
  test("else if の最後の文は、if 全体が関数の最後なら通る（else if の連なりをたどる）", () => {
    const src = "function main() {\n  if (a) { x(); } else if (b) { process.exitCode = 1; }\n}\n";
    assert.deepEqual(findExitCodeWithoutReturn(src), []);
  });
  test("else if の最後の文でも、if 全体の後に続きがあれば名指しする", () => {
    const src = "function main() {\n  if (a) { x(); } else if (b) {\n    process.exitCode = 1;\n  }\n  console.log('OK');\n}\n";
    assert.deepEqual(findExitCodeWithoutReturn(src).map((u) => u.line), [3]);
  });
  test("try / catch の最後の文は、try 全体が関数の最後なら通る", () => {
    const src = "function main() {\n  try { run(); process.exitCode = 1; } catch (e) { log(e); process.exitCode = 2; }\n}\n";
    assert.deepEqual(findExitCodeWithoutReturn(src), []);
  });
  test("try の後に続きがあれば名指しする", () => {
    const src = "function main() {\n  try {\n    process.exitCode = 1;\n  } catch (e) { log(e); }\n  console.log('OK');\n}\n";
    assert.deepEqual(findExitCodeWithoutReturn(src).map((u) => u.line), [3]);
  });
  test("ループの中の最後の文は名指しする（次の周回が続く）", () => {
    const src = "function main() {\n  for (const x of xs) {\n    process.exitCode = 1;\n  }\n}\n";
    assert.deepEqual(findExitCodeWithoutReturn(src).map((u) => u.line), [3]);
  });
});
