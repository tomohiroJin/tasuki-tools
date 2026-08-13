/**
 * scripts/audit-log-hygiene.mjs の単体テスト。
 * 実リポジトリはスキャンしない（インライン文字列と小さな Map だけを渡す）。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  findViolations,
  findStaleAllowances,
  findMissingRequired,
  ALLOWED_FILES,
  REQUIRED_FILES,
} from "./audit-log-hygiene.mjs";

describe("禁止された構文の検出", () => {
  test("許可されていないファイルの console は違反", () => {
    const v = findViolations("apps/timer-sync/src/foo.ts", 'console.log("x");\n');
    assert.equal(v.length, 1);
    assert.equal(v[0].line, 1);
  });

  test("許可ファイルでもマーカーが無ければ違反", () => {
    const v = findViolations(ALLOWED_FILES[0], 'console.log("x");\n');
    assert.equal(v.length, 1);
  });

  test("許可ファイルでマーカーがあれば違反にしない", () => {
    const v = findViolations(ALLOWED_FILES[0], 'console.log("x"); // log-hygiene:allow 理由\n');
    assert.equal(v.length, 0);
  });

  test("process.stdout.write も検出する", () => {
    const v = findViolations("apps/timer-sync/src/foo.ts", "process.stdout.write('x');\n");
    assert.equal(v.length, 1);
  });

  test("publicText の呼び出しも検出する（抜け道の管理）", () => {
    const v = findViolations("apps/timer-sync/src/foo.ts", "const a = publicText(secret);\n");
    assert.equal(v.length, 1);
  });

  test("publicText の定義（export function）は呼び出しではないので違反にしない", () => {
    const src = "export function publicText(value) { return value; }\n";
    const v = findViolations("apps/timer-sync/src/application/log/log-safe.ts", src);
    assert.equal(v.length, 0);
  });

  test("コメント行の console は違反にしない", () => {
    const v = findViolations("apps/timer-sync/src/foo.ts", '// console.log("説明")\n');
    assert.equal(v.length, 0);
  });
});

describe("fail-closed: 陳腐化した許可の検出", () => {
  test("許可ファイルにマーカーが 1 つも無ければ陳腐化として報告する", () => {
    const scanned = new Map(ALLOWED_FILES.map((f) => [f, "const x = 1;\n"]));
    assert.deepEqual(findStaleAllowances(scanned).sort(), [...ALLOWED_FILES].sort());
  });

  test("マーカーがあれば陳腐化ではない", () => {
    const scanned = new Map(ALLOWED_FILES.map((f) => [f, "// log-hygiene:allow 理由\n"]));
    assert.deepEqual(findStaleAllowances(scanned), []);
  });
});

describe("fail-closed: 走査対象の消失の検出", () => {
  test("必須ファイルが走査結果に無ければ報告する", () => {
    assert.deepEqual(findMissingRequired(new Map()).sort(), [...REQUIRED_FILES].sort());
  });

  test("すべて揃っていれば空", () => {
    const scanned = new Map(REQUIRED_FILES.map((f) => [f, ""]));
    assert.deepEqual(findMissingRequired(scanned), []);
  });
});

describe("ブロックコメント絡みの行単位の判定（状態を持たない設計）", () => {
  test("`/* ... */` 単体で始まる行（`*` 単独始まりではない）は読み飛ばさず検出する", () => {
    const v = findViolations(
      "apps/timer-sync/src/foo.ts",
      "/* note */ console.log(secretToken);\n",
    );
    assert.equal(v.length, 1);
    assert.equal(v[0].line, 1);
  });

  test(
    "複数行ブロックコメントの閉じ行に続く実コードを検出する。" +
      "`*\\/` はブロックコメントを閉じるので、その後ろに書かれた console.log は" +
      "実行されるコードであり、`*` 始まりだからといって読み飛ばしてはならない。",
    () => {
      const v = findViolations(
        "apps/timer-sync/src/foo.ts",
        "/*\ncomment\n*/ console.log(secretToken);\n",
      );
      assert.equal(v.length, 1);
      assert.equal(v[0].line, 3);
    },
  );

  test(
    "安全側の偽陽性: ブロックコメントの継続行が `*` で始まらないと、地の文でも検出する。" +
      "状態を持たないので「コメントの中にいるかどうか」を追跡できない。安全側（余計に赤くなる）" +
      "なので許容する。",
    () => {
      const v = findViolations(
        "apps/timer-sync/src/foo.ts",
        "/*\nconsole.log(secretToken) という書き方は禁止\n*/\n",
      );
      assert.equal(v.length, 1);
      assert.equal(v[0].line, 2);
    },
  );

  test("許可ファイルでは、同じ行にマーカーがあれば違反にしない", () => {
    const v = findViolations(
      ALLOWED_FILES[0],
      '/* note */ console.log("x"); // log-hygiene:allow 理由\n',
    );
    assert.equal(v.length, 0);
  });
});

describe("回帰: 正規表現リテラル内のエスケープされたスラッシュ(状態を持たないので元々問題にならない)", () => {
  test("/http:\\/\\// のような正規表現の後に続く console を検出する", () => {
    const v = findViolations(
      "apps/timer-sync/src/foo.ts",
      "const re = /http:\\/\\//; console.log(secretToken)\n",
    );
    assert.equal(v.length, 1);
  });

  test("/a\\// のような短い正規表現の後に続く console も検出する", () => {
    const v = findViolations(
      "apps/timer-sync/src/foo.ts",
      "const re = /a\\//; console.log(secretToken)\n",
    );
    assert.equal(v.length, 1);
  });
});

// テンプレートリテラルの中身は文字列データであってコードではない。そこに
// `console.log(x)` と書かれていても console は呼ばれないため、検出しないのが正しい。
// このテストが確かめているのは検出の有無ではなく**非局所性が無いこと**である:
// ある行に何を書いても、別の行の判定結果は変わってはならない。
// （かつての文字単位の状態機械はこれを壊し、無関係な行の記述が離れた行の判定を
//  変えてしまった。状態を持たない現設計ではこの種のバグは原理的に起こらない。）
describe("回帰: ある行の記述が別の行の判定を変えないこと（非局所性が無いこと）", () => {
  test("正規表現っぽい断片が別の行にあっても、テンプレートリテラルの中の行の扱いは変わらない", () => {
    const repro = findViolations(
      "apps/timer-sync/src/foo.ts",
      "const re = /a\\//; const s = `\n// console.log(secretToken)\n`;\n",
    );
    const control = findViolations(
      "apps/timer-sync/src/foo.ts",
      "const s = `\n// console.log(secretToken)\n`;\n",
    );
    assert.deepEqual(repro, control);
  });
});

describe("ブロックコメントの閉じ行に続く実コード（`*/` の後ろは実行されるコード）", () => {
  test("`*/ console.log(x)` の行は、`*` 始まりでも読み飛ばさず検出する", () => {
    const v = findViolations("apps/timer-sync/src/foo.ts", "*/ console.log(secretToken);\n");
    assert.equal(v.length, 1);
    assert.equal(v[0].line, 1);
  });

  test("`**/ console.log(x)` の行も同型（`**/` もブロックコメントを閉じる）", () => {
    const v = findViolations("apps/timer-sync/src/foo.ts", "**/ console.log(secretToken);\n");
    assert.equal(v.length, 1);
    assert.equal(v[0].line, 1);
  });

  test("閉じるだけの行（`*/` の後ろが空白のみ）は従来どおり読み飛ばす", () => {
    const v = findViolations("apps/timer-sync/src/foo.ts", "/**\n * console.log は禁止\n */\n");
    assert.equal(v.length, 0);
  });

  test("`* 本文 */` のように行内で閉じても後続が無ければ読み飛ばす", () => {
    const v = findViolations("apps/timer-sync/src/foo.ts", " * console.log は禁止 */\n");
    assert.equal(v.length, 0);
  });
});

// C1（最終レビューの指摘）: ロガの第 1 引数（event）は型で守られていない。
// `fields` は LogField で塞がれているが、`event` は生の `string` なので
// `logger.info(`reclaimed ${code}`, { idleMs })` と書けば型検査もテストも素通りし、
// ルームコードが journal へ出る。検査の側で第 1 引数の形を縛る。
describe("ロガ呼び出しの第 1 引数（event）の形", () => {
  test("最終レビューの反例: テンプレートリテラルでルームコードを埋め込む行を検出する", () => {
    const v = findViolations(
      "apps/timer-sync/src/create-sync-server.ts",
      "      logger.info(`reclaimed ${code}`, { idleMs });\n",
    );
    assert.equal(v.length, 1);
    assert.equal(v[0].line, 1);
  });

  test("this.logger 経由のテンプレートリテラルも検出する", () => {
    const v = findViolations(
      "apps/timer-sync/src/application/problem-delegation.ts",
      "    this.logger.warn(`ai.fail ${roomCode}`);\n",
    );
    assert.equal(v.length, 1);
  });

  test("文字列連結（リテラル + 変数）を検出する", () => {
    const v = findViolations(
      "apps/timer-sync/src/foo.ts",
      'logger.info("reclaimed " + code, { idleMs });\n',
    );
    assert.equal(v.length, 1);
  });

  test("文字列連結（変数 + リテラル）を検出する", () => {
    const v = findViolations("apps/timer-sync/src/foo.ts", 'logger.error(code + " failed");\n');
    assert.equal(v.length, 1);
  });

  test("変数を渡す形も検出する（別行で組み立てた文字列を渡す抜け道）", () => {
    const v = findViolations("apps/timer-sync/src/foo.ts", "logger.info(message, { idleMs });\n");
    assert.equal(v.length, 1);
  });

  test("現行の正しい呼び出し（リテラル + fields）は違反にしない", () => {
    const v = findViolations(
      "apps/timer-sync/src/create-sync-server.ts",
      "      logger.info(\"reclaimed\", { room: refEncoder.room(code), idleMs });\n",
    );
    assert.equal(v.length, 0);
  });

  test("引数がリテラル 1 つだけの呼び出しも違反にしない", () => {
    const v = findViolations("apps/timer-sync/src/server.ts", '  logger.warn("origins-unset");\n');
    assert.equal(v.length, 0);
  });

  test("単一引用符のリテラルも違反にしない", () => {
    const v = findViolations("apps/timer-sync/src/foo.ts", "logger.info('sigterm');\n");
    assert.equal(v.length, 0);
  });

  test("引数なしの呼び出しは違反にしない（出力する値が無い）", () => {
    const v = findViolations("apps/timer-sync/src/foo.ts", "logger.info();\n");
    assert.equal(v.length, 0);
  });

  test("コメント行のテンプレートリテラルは違反にしない", () => {
    const v = findViolations(
      "apps/timer-sync/src/foo.ts",
      "// logger.info(`reclaimed ${code}`) と書いてはならない\n",
    );
    assert.equal(v.length, 0);
  });

  test("許可ファイルでマーカーがあれば違反にしない（実出力口の sink など）", () => {
    const v = findViolations(
      "apps/timer-sync/src/adapters/console-log-sink.ts",
      "    console.error(line); // log-hygiene:allow 唯一の実出力口\n",
    );
    assert.equal(v.length, 0);
  });
});
