/**
 * 複製の補助（`lib/script-copy-harness.mjs`）のテスト（#544）。
 *
 * 検査スクリプトの複製を作って走らせるテストは、ファイルごとに分かれて**同時に走りうる**。
 * 起動時の掃除は接頭辞の一致で消すので、接頭辞が別のファイルの接頭辞の前方一致になっていると、
 * 片方の起動が他方の複製を消して、走行中のテストが原因の分かりにくい失敗になる。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SCRIPTS_DIR, createScriptCopyHarness, findPrefixOverlaps } from "./lib/script-copy-harness.mjs";

const SELF = "script-copy-harness.test.mjs";

/**
 * 1 つのテストのソースから、複製の接頭辞の宣言を拾う。
 * `declarations` は宣言の数（`createScriptCopyHarness(` の呼び出し・`const COPY_PREFIX =`）、
 * `prefixes` は引数が**文字列の literal**（引用の種類を問わない）だった宣言から拾えた接頭辞。
 * 2 つが食い違えば、変数・式・補間つきのテンプレートで渡されていて、重なりの検査が見えていない。
 */
export function scanPrefixDeclarations(source) {
  const declarations = [...source.matchAll(/createScriptCopyHarness\(|const COPY_PREFIX\s*=/g)].length;
  const prefixes = [
    ...[...source.matchAll(/createScriptCopyHarness\(\s*(["'`])([^"'`$\\\n]+)\1\s*[,)]/g)].map((m) => m[2]),
    ...[...source.matchAll(/const COPY_PREFIX\s*=\s*(["'`])([^"'`$\\\n]+)\1/g)].map((m) => m[2]),
  ];
  return { declarations, prefixes };
}

/** scripts/ 配下（lib を含む）のテストを再帰で集める。 */
function listTestFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : listTestFiles(full);
    return e.name.endsWith(".test.mjs") && e.name !== SELF ? [full] : [];
  });
}

/** scripts/ 配下のテストが宣言している複製の接頭辞を、ファイルごとに集める（導出）。 */
function collectPrefixes() {
  const found = [];
  const unreadable = [];
  for (const full of listTestFiles(SCRIPTS_DIR)) {
    const file = path.relative(SCRIPTS_DIR, full);
    const { declarations, prefixes } = scanPrefixDeclarations(fs.readFileSync(full, "utf8"));
    for (const prefix of prefixes) found.push({ file, prefix });
    if (declarations !== prefixes.length) unreadable.push(`${file}: 宣言 ${declarations} 件のうち literal で読めたのは ${prefixes.length} 件`);
  }
  return { found, unreadable };
}

describe("複製の接頭辞はファイルごとに分かれている", () => {
  const { found, unreadable } = collectPrefixes();

  test("接頭辞を宣言しているテストが 0 件でない（この導出自身の空振り検出）", () => {
    assert.ok(found.length > 0, "接頭辞が 1 件も見つかりません");
    assert.ok(
      found.some((f) => f.file.startsWith("wiring-")),
      "wiring-*.test.mjs の接頭辞が見つかりません",
    );
  });

  test("接頭辞はすべて文字列の literal で渡されている（変数・補間つきのテンプレートは重なりの検査から漏れる）", () => {
    assert.deepEqual(unreadable, []);
  });

  test("scripts/ 配下（lib の下も）のテストを見る", () => {
    assert.ok(listTestFiles(SCRIPTS_DIR).some((f) => path.dirname(f) !== SCRIPTS_DIR), "サブディレクトリのテストを見ていません");
  });

  test("接頭辞の拾い方: 二重引用・単引用・バッククォートの literal は拾い、変数・補間つきは拾わない", () => {
    const ok = (src) => scanPrefixDeclarations(src);
    assert.deepEqual(ok('createScriptCopyHarness(".a-")'), { declarations: 1, prefixes: [".a-"] });
    assert.deepEqual(ok("createScriptCopyHarness('.a-')"), { declarations: 1, prefixes: [".a-"] });
    assert.deepEqual(ok("createScriptCopyHarness(`.a-`)"), { declarations: 1, prefixes: [".a-"] });
    assert.deepEqual(ok('const COPY_PREFIX = ".a-";'), { declarations: 1, prefixes: [".a-"] });
    assert.notEqual(ok("createScriptCopyHarness(PREFIX)").declarations, ok("createScriptCopyHarness(PREFIX)").prefixes.length);
    assert.notEqual(ok("createScriptCopyHarness(`.a-${x}-`)").declarations, ok("createScriptCopyHarness(`.a-${x}-`)").prefixes.length);
    assert.notEqual(ok("const COPY_PREFIX = PREFIX;").declarations, ok("const COPY_PREFIX = PREFIX;").prefixes.length);
  });

  test("どの接頭辞も、別のファイルの接頭辞と前方一致しない", () => {
    assert.deepEqual(findPrefixOverlaps(found), []);
  });
});

describe("createScriptCopyHarness", () => {
  // このテストが scripts/ に置く残骸は、すべてこの接頭辞の下に置く。SIGKILL で finally が走らなくても、
  // 次の起動のこの掃除が消す（残ると変異検査の「作業ツリーが clean」の前提を壊す）。
  createScriptCopyHarness(".harness-selftest-");

  test("重なりの判定は、前方一致する接頭辞の組を名指しで返す（判定自身の空振り検出）", () => {
    assert.deepEqual(findPrefixOverlaps([{ file: "a", prefix: ".x-" }, { file: "b", prefix: ".y-" }]), []);
    assert.equal(findPrefixOverlaps([{ file: "a", prefix: ".x-" }, { file: "b", prefix: ".x-y-" }]).length, 1);
  });

  test("起動時の掃除は自分の接頭辞の残骸だけを消し、別の接頭辞のものは消さない", () => {
    // Given: 自分の接頭辞と、別の接頭辞の残骸
    const mine = path.join(SCRIPTS_DIR, ".harness-selftest-a-leftover.mjs");
    const other = path.join(SCRIPTS_DIR, ".harness-selftest-b-leftover.mjs");
    fs.writeFileSync(mine, "");
    fs.writeFileSync(other, "");
    try {
      // When
      createScriptCopyHarness(".harness-selftest-a-");
      // Then
      assert.equal(fs.existsSync(mine), false, "自分の接頭辞の残骸が残っています");
      assert.equal(fs.existsSync(other), true, "別の接頭辞の複製を消しています");
    } finally {
      fs.rmSync(mine, { force: true });
      fs.rmSync(other, { force: true });
    }
  });

  test("複製を走らせて結果を返し、複製を残さない。書き換えが反映される", () => {
    const { runScriptCopy } = createScriptCopyHarness(".harness-selftest-c-");
    const r = runScriptCopy("check-links.mjs", () => "console.log('copied'); process.exitCode = 3;");
    assert.equal(r.status, 3);
    assert.equal(r.stdout.trim(), "copied");
    assert.deepEqual(
      fs.readdirSync(SCRIPTS_DIR).filter((n) => n.startsWith(".harness-selftest-c-")),
      [],
    );
  });

  test("引数と環境を複製へ渡せる。環境に undefined を入れると、その変数は子へ渡らない（#547）", () => {
    const { runScriptCopy } = createScriptCopyHarness(".harness-selftest-e-");
    const body = () => "console.log(JSON.stringify({ argv: process.argv.slice(2), a: process.env.HARNESS_A ?? null, b: process.env.HARNESS_B ?? null }));";
    const prev = process.env.HARNESS_B;
    process.env.HARNESS_B = "inherited";
    try {
      const r = runScriptCopy("check-links.mjs", body, { args: ["x", "y"], env: { HARNESS_A: "1", HARNESS_B: undefined } });
      assert.deepEqual(JSON.parse(r.stdout), { argv: ["x", "y"], a: "1", b: null });
      const plain = runScriptCopy("check-links.mjs", body);
      assert.deepEqual(JSON.parse(plain.stdout), { argv: [], a: null, b: "inherited" });
    } finally {
      if (prev === undefined) delete process.env.HARNESS_B;
      else process.env.HARNESS_B = prev;
    }
  });

  test("withScriptCopy は複製の道を渡し、同期でも非同期でも、終わったら（落ちても）複製を消す（#547）", async () => {
    const { withScriptCopy } = createScriptCopyHarness(".harness-selftest-f-");
    const left = () => fs.readdirSync(SCRIPTS_DIR).filter((n) => n.startsWith(".harness-selftest-f-"));
    let seen;
    const sync = withScriptCopy("check-links.mjs", () => "x", (copyPath, source) => {
      seen = { exists: fs.existsSync(copyPath), source };
      return "sync-result";
    });
    assert.equal(sync, "sync-result");
    assert.deepEqual(seen, { exists: true, source: "x" });
    assert.deepEqual(left(), []);

    let during;
    const asyncResult = await withScriptCopy("check-links.mjs", (s) => s, async (copyPath) => {
      await new Promise((r) => setTimeout(r, 50));
      during = fs.existsSync(copyPath);
      return "async-result";
    });
    assert.equal(asyncResult, "async-result");
    assert.equal(during, true, "非同期の終わる前に複製を消しています");
    assert.deepEqual(left(), []);

    await assert.rejects(
      withScriptCopy("check-links.mjs", (s) => s, async () => {
        throw new Error("boom");
      }),
      /boom/,
    );
    assert.deepEqual(left(), []);
    assert.throws(() => withScriptCopy("check-links.mjs", (s) => s, () => { throw new Error("sync-boom"); }), /sync-boom/);
    assert.deepEqual(left(), []);

    // then だけを持つ値（finally を持たない）でも、決着の後に消す
    const thenOnly = await withScriptCopy("check-links.mjs", (s) => s, (copyPath) => ({
      then(resolve) {
        setTimeout(() => resolve(fs.existsSync(copyPath)), 50);
      },
    }));
    assert.equal(thenOnly, true, "決着の前に複製を消しています");
    assert.deepEqual(left(), []);
  });

  test("then の取り出しが投げても、実行が投げたときの後始末が失敗しても、複製を消し、元のエラーを投げる（#547）", () => {
    const { withScriptCopy } = createScriptCopyHarness(".harness-selftest-g-");
    const left = () => fs.readdirSync(SCRIPTS_DIR).filter((n) => n.startsWith(".harness-selftest-g-"));
    // then の getter が投げる
    assert.throws(
      () =>
        withScriptCopy("check-links.mjs", (s) => s, () => ({
          get then() {
            throw new Error("getter-boom");
          },
        })),
      /getter-boom/,
    );
    assert.deepEqual(left(), []);
    // 後始末が失敗する（複製を中身のあるディレクトリに差し替える。force だけの rmSync は落ちる）
    let dir;
    try {
      assert.throws(
        () =>
          withScriptCopy("check-links.mjs", (s) => s, (copyPath) => {
            dir = copyPath;
            fs.rmSync(copyPath);
            fs.mkdirSync(copyPath);
            fs.writeFileSync(path.join(copyPath, "x"), "");
            throw new Error("original");
          }),
        (e) => e.message === "original" && e.cleanupFailure instanceof Error,
      );
    } finally {
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
    assert.deepEqual(left(), []);
  });

  test("時間切れの Error に、それまでの stdout・stderr の末尾を含める（#547）", () => {
    const { runScriptCopy } = createScriptCopyHarness(".harness-selftest-h-", { timeoutMs: 1500 });
    assert.throws(
      () => runScriptCopy("check-links.mjs", () => "console.log('partial-out'); console.error('partial-err'); setTimeout(() => {}, 20000);"),
      /時間切れ[\s\S]*partial-out[\s\S]*partial-err/,
    );
  });

  test("複製の実行が時間切れになったら、時間切れと分かる文言で落とす", () => {
    const { runScriptCopy } = createScriptCopyHarness(".harness-selftest-d-", { timeoutMs: 300 });
    assert.throws(() => runScriptCopy("check-links.mjs", () => "setTimeout(() => {}, 5000);"), /時間切れ/);
    assert.deepEqual(
      fs.readdirSync(SCRIPTS_DIR).filter((n) => n.startsWith(".harness-selftest-d-")),
      [],
    );
  });

  test("形の不正な接頭辞（`.` で始まらない・`-` で終わらない）は受け付けない", () => {
    assert.throws(() => createScriptCopyHarness("wiring-"));
    assert.throws(() => createScriptCopyHarness(".wiring"));
  });
});
