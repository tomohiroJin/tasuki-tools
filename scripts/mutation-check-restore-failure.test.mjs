/**
 * 復元に失敗したとき、`.applied`（戻っていないファイルの唯一の記録）が消えないこと（#542 の /code-review）。
 *
 * 以前は復元の失敗が `process.exit(1)` だったのでそこで終わった。いまはプロセスが続くので、失敗の後にもう一度
 * `restoreCurrentMutation` が呼ばれうる（待っていたシグナル・未捕捉の例外）。そこで空の一覧を復元の検証へ渡すと、
 * 「戻すものが無い」としてマーカーが消える。ここは使い捨てのリポジトリに入口の複製と小さな宣言を置き、
 * `.git/index.lock` を先に置いて `git checkout --` を必ず失敗させ（一過性でなく失敗し続ける復元）、本物の入口を子として起動して見る。
 *
 * 複製の入口は、開発環境の版の検査（sandbox に無い check-toolchain.mjs を起こす）だけを外してある。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));

/** 宣言 1 件・パッチ 1 件・テスト 1 件だけの使い捨てのリポジトリ。`patchKind` は何を壊すか（lib か package.json か）。 */
function makeSandbox(patchKind) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mutation-check-restore-"));
  fs.mkdirSync(path.join(root, "scripts", "lib"), { recursive: true });
  fs.mkdirSync(path.join(root, "scripts", "mutations"), { recursive: true });
  fs.mkdirSync(path.join(root, "pkgx"), { recursive: true });
  const libFiles = fs
    .readdirSync(path.join(SCRIPTS_DIR, "lib"))
    .filter((n) => n.endsWith(".mjs") && !n.endsWith(".test.mjs") && n !== "mutation-declarations.mjs");
  for (const n of libFiles) fs.copyFileSync(path.join(SCRIPTS_DIR, "lib", n), path.join(root, "scripts", "lib", n));
  const entry = fs.readFileSync(path.join(SCRIPTS_DIR, "mutation-check.mjs"), "utf8");
  assert.equal(entry.split("if (!assertToolchain()) {").length - 1, 1, "外す対象（版の検査）が入口にありません");
  // もう 1 つ: main() の後もイベントループを少し生かす。シグナルのハンドラは unref されていて、ループに他の仕事が無いと、
  // main() が戻った時点で待っていたシグナルを拾わずに終わる。本番では書き出しの待ち・並列の子がループを生かしているので、それを模す
  const tail = "if (isDirectRun(import.meta.url, process.argv[1])) main();";
  assert.equal(entry.split(tail).length - 1, 1, "入口の最後の行が見つかりません");
  fs.writeFileSync(
    path.join(root, "scripts", "mutation-check.mjs"),
    entry
      .replace("if (!assertToolchain()) {", "if (false) {")
      .replace(tail, "if (isDirectRun(import.meta.url, process.argv[1])) {\n  main();\n  setTimeout(() => {}, 3000);\n}"),
  );
  fs.writeFileSync(
    path.join(root, "scripts", "lib", "mutation-declarations.mjs"),
    `export const MUTATIONS = [{ id: 1, label: "sandbox", patch: "m1-sandbox.patch", pkg: "pkgx", tests: ["x.test.mjs"], note: "sandbox" }];\n`,
  );
  fs.writeFileSync(path.join(root, "pkgx", "package.json"), '{ "scripts": { "test": "node --test" } }\n');
  fs.writeFileSync(path.join(root, "pkgx", "lib.mjs"), "export const v = 1;\n");
  fs.writeFileSync(
    path.join(root, "pkgx", "x.test.mjs"),
    [
      'import { test } from "node:test";',
      'import assert from "node:assert/strict";',
      'import fs from "node:fs";',
      'import { v } from "./lib.mjs";',
      'test("v", () => {',
      '  if (process.env.SANDBOX_SIGINT === "1" && v === 2) {',
      "    // 変異が当たっているとき、入口（祖父母。node --test の親）へ SIGINT を送る（入口は spawnSync で待っているので、戻るまでハンドラは走らない）",
      '    const stat = fs.readFileSync(`/proc/${process.ppid}/stat`, "utf8");',
      '    const grand = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);',
      '    if (fs.readFileSync(`/proc/${grand}/cmdline`, "utf8").includes("mutation-check")) process.kill(grand, "SIGINT");',
      "  }",
      "  assert.equal(v, 1);",
      "});",
      "",
    ].join("\n"),
  );
  const patch =
    patchKind === "package"
      ? [
          "diff --git a/pkgx/package.json b/pkgx/package.json",
          "--- a/pkgx/package.json",
          "+++ b/pkgx/package.json",
          "@@ -1 +1 @@",
          '-{ "scripts": { "test": "node --test" } }',
          '+{ "scripts": { "test": "mocha" } }',
          "",
        ]
      : [
          "diff --git a/pkgx/lib.mjs b/pkgx/lib.mjs",
          "--- a/pkgx/lib.mjs",
          "+++ b/pkgx/lib.mjs",
          "@@ -1 +1 @@",
          "-export const v = 1;",
          "+export const v = 2;",
          "",
        ];
  fs.writeFileSync(path.join(root, "scripts", "mutations", "m1-sandbox.patch"), patch.join("\n"));
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init"], { cwd: root });
  // 復元の `git checkout --` を、何度試しても失敗させる
  fs.writeFileSync(path.join(root, ".git", "index.lock"), "");
  return root;
}

function runEntry(root, env = {}) {
  // 外側の node --test の印を引き継ぐと、内側の node --test が「テストの中から呼ばれた」として何も流さない
  const { NODE_TEST_CONTEXT: _outer, ...inherited } = process.env;
  return spawnSync(process.execPath, [path.join(root, "scripts", "mutation-check.mjs"), "--id", "1"], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    env: { ...inherited, ...env },
  });
}

describe("復元に失敗しても .applied（戻っていない唯一の記録）は消えない（#542）", { timeout: 300_000 }, () => {
  const marker = (root) => path.join(root, "scripts", "mutations", ".applied");

  test("復元の失敗（index.lock）は exit 1 で、.applied を残す", () => {
    const root = makeSandbox("lib");
    try {
      const r = runEntry(root);
      assert.equal(r.status, 1, `exit 1 になりません。stderr:\n${r.stderr.slice(-500)}`);
      assert.match(r.stderr, /致命的/);
      assert.equal(fs.readFileSync(marker(root), "utf8").trim(), "pkgx/lib.mjs");
      assert.match(fs.readFileSync(path.join(root, "pkgx", "lib.mjs"), "utf8"), /v = 2/, "戻っていない（変異が残っている）はず");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("復元に失敗した後に待っていた SIGINT のハンドラが走っても、.applied は残り、終了コードは 1 のまま（130 に隠れない）", () => {
    const root = makeSandbox("lib");
    try {
      const r = runEntry(root, { SANDBOX_SIGINT: "1" });
      assert.equal(r.status, 1, `exit 1 になりません（130 に隠れた？）。status=${r.status} stderr:\n${r.stderr.slice(-500)}`);
      assert.equal(fs.readFileSync(marker(root), "utf8").trim(), "pkgx/lib.mjs", ".applied が消えた/変わった");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("テストの実行が投げ（未知のランナー）、finally の復元も失敗して例外が uncaughtException へ届いても、.applied は残り exit 1", () => {
    const root = makeSandbox("package");
    try {
      const r = runEntry(root);
      assert.equal(r.status, 1, `exit 1 になりません。stderr:\n${r.stderr.slice(-500)}`);
      assert.match(r.stderr, /捕捉されない例外/);
      assert.equal(fs.existsSync(marker(root)), true, ".applied が消えた（戻っていないファイルの記録が失われた）");
      assert.equal(fs.readFileSync(marker(root), "utf8").trim(), "pkgx/package.json");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
