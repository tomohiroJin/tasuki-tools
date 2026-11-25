/**
 * `scripts/changes-since.mjs` の配線（#675）。
 *
 * 判定そのものは `scripts/lib/changes-since.test.mjs` が見る。ここは、`main()` が実際に git を叩き、
 * **前のタグを解けない・HEAD の祖先でないときに、空の一覧を出さずに止まる**ことを、複製を子プロセスで起動して見る。
 * 複製の中で、リポジトリの根を一時ディレクトリに作った git のリポジトリへ差し替える（追跡下の履歴には依らない）。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createScriptCopyHarness, countOf } from "./lib/script-copy-harness.mjs";
import { findGuardedCommands } from "./lib/agent-guard.mjs";

const SCRIPT = "changes-since.mjs";
const { runScriptCopy } = createScriptCopyHarness(".changes-since-", { timeoutMs: 60_000 });

const ROOT_LINE = 'const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");';

/** 一時のリポジトリで git を流す。利用者の設定（署名・フック・既定の枝名）に依らない。 */
function git(root, ...args) {
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" },
  }).trim();
}

function commitFiles(root, subject, files) {
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", subject);
}

/**
 * 一時のリポジトリを作り、`build(root)` で履歴を積んでから、複製を起動する。
 * 最初のコミットにタグ `v1.0.0` を打ってある。
 */
function runFixture(args, build = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "changes-since-"));
  try {
    git(root, "init", "-q", "-b", "main");
    commitFiles(root, "chore: 最初 (#1)", { "README.md": "a\n" });
    git(root, "tag", "v1.0.0");
    build(root);
    return runScriptCopy(
      SCRIPT,
      (source) => {
        assert.equal(countOf(source, ROOT_LINE), 1, "差し替える行（REPO_ROOT）が実装に 1 か所ありません");
        return source.replace(ROOT_LINE, `const REPO_ROOT = ${JSON.stringify(root)};`);
      },
      { args },
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const threeCommits = (root) => {
  commitFiles(root, "feat(checkin): やり方を足す（#635） (#20)", { "packages/checkin-core/src/methods.ts": "x\n", "apps/checkin-web/src/App.tsx": "x\n" });
  commitFiles(root, "feat(sync): 受け方を変える (#21)", { "apps/tasuki-sync/src/config.ts": "x\n", "deploy/timer/app.env": "A=1\n" });
  commitFiles(root, "docs: 直に積んだ", { "deploy/README.md": "x\n" });
};

describe("changes-since の起動", () => {
  test("前のタグを渡さなければ、既定に倒さず exit 2 で終わる", () => {
    const r = runFixture([]);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /前のタグ/);
  });

  test("引数が 2 つ以上・- で始まる引数は exit 2 で終わる", () => {
    assert.equal(runFixture(["v1.0.0", "v2.0.0"]).status, 2);
    // - で始まる語を git へ渡さない（rev として解く前に、使い方を出して止まる）
    const dashed = runFixture(["--all"]);
    assert.equal(dashed.status, 2);
    assert.match(dashed.stderr, /前のタグを 1 つ/);
    assert.doesNotMatch(dashed.stderr, /解けません/);
  });

  test("解けないタグは、空の一覧を出さずに exit 2 で終わる（浅い複製・打ち間違い）", () => {
    const r = runFixture(["v9.9.9"], threeCommits);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /v9\.9\.9/);
    assert.doesNotMatch(r.stdout, /0 件/);
  });

  test("HEAD の祖先でないタグは、一覧を出さずに exit 2 で終わる（別の枝・履歴が途切れた浅い複製）", () => {
    const r = runFixture(["v-side"], (root) => {
      threeCommits(root);
      git(root, "switch", "-q", "--orphan", "side");
      commitFiles(root, "chore: 別の根 (#99)", { "x.txt": "x\n" });
      git(root, "tag", "v-side");
      git(root, "switch", "-q", "main");
    });
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /祖先/);
    assert.doesNotMatch(r.stdout, /#20/);
  });
});

describe("changes-since の起動（枝分かれしたタグ）", () => {
  test("根は同じでも、main から分かれた枝のタグは祖先でないので exit 2 で終わる（共通の祖先があるだけでは足りない）", () => {
    const r = runFixture(["v-hotfix"], (root) => {
      git(root, "switch", "-q", "-c", "hotfix");
      commitFiles(root, "fix: 枝だけの直し (#40)", { "packages/poker-core/src/a.ts": "x\n" });
      git(root, "tag", "v-hotfix");
      git(root, "switch", "-q", "main");
      threeCommits(root);
    });
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /祖先/);
    assert.doesNotMatch(r.stdout, /#20/);
  });
});

describe("changes-since の一覧", () => {
  test("前のタグより後のコミットを古い順に並べ、印とまとめを出して exit 0", () => {
    const r = runFixture(["v1.0.0"], threeCommits);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /#20\s+[0-9a-f]{7}\s+feat\(checkin\).*\[wire: checkin-core\]/);
    assert.match(r.stdout, /#21\s+[0-9a-f]{7}\s+feat\(sync\).*\[同期サーバー\] \[deploy（文書以外）: deploy\/timer\/app\.env\]/);
    assert.match(r.stdout, /番号なし\s+[0-9a-f]{7}\s+docs: 直に積んだ\s+\[deploy（文書だけ）\]/);
    assert.ok(r.stdout.indexOf("#20") < r.stdout.indexOf("#21"), "古い順に並んでいません");
    assert.doesNotMatch(r.stdout, /最初 \(#1\)/, "前のタグのコミットそのものは含めない");
    assert.match(r.stdout, /wire.*: #20$/m);
    assert.match(r.stdout, /番号を取れなかったコミット: 1 件/);
  });

  test("頭の行に、範囲の両端（タグとハッシュ・HEAD のハッシュと枝）と件数を出す", () => {
    const r = runFixture(["v1.0.0"], threeCommits);
    assert.match(r.stdout, /v1\.0\.0（[0-9a-f]{7}）\.\.HEAD（[0-9a-f]{7}・main）: 3 件/);
  });

  test("前のタグと HEAD が同じなら、0 件と出して exit 0", () => {
    const r = runFixture(["v1.0.0"]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /0 件/);
  });

  test("消したファイルも、触れたものとして印が付く（改名を追って消えた側を落とさない）", () => {
    const r = runFixture(["v1.1.0"], (root) => {
      commitFiles(root, "feat: 足す (#30)", { "packages/topic-core/src/old.ts": "同じ中身の長い行 1\n同じ中身の長い行 2\n同じ中身の長い行 3\n" });
      git(root, "tag", "v1.1.0");
      fs.mkdirSync(path.join(root, "apps/topic-web/src"), { recursive: true });
      git(root, "mv", "packages/topic-core/src/old.ts", "apps/topic-web/src/moved.ts");
      git(root, "commit", "-q", "-m", "refactor: 画面へ移す (#31)");
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /#31.*\[wire: topic-core\]/);
  });
});

describe("changes-since の一覧（パスと題の字）", () => {
  test("日本語・空白の名前のファイルにも印が付く（git が引用符つきで出す形に化けない）", () => {
    const r = runFixture(["v1.0.0"], (root) => {
      commitFiles(root, "feat: 日本語の名前 (#70)", { "packages/checkin-core/src/やり方.ts": "x\n" });
      commitFiles(root, "chore: 断片 (#71)", { "deploy/timer/メモ 1.conf": "x\n" });
      commitFiles(root, "feat: 設定 (#75)", { "apps/tasuki-sync/src/設定.ts": "x\n" });
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /wire.*: #70$/m);
    assert.match(r.stdout, /同期サーバー.*: #75$/m);
    assert.match(r.stdout, /deploy\/ の文書以外.*: #71$/m);
    assert.match(r.stdout, /\[deploy（文書以外）: deploy\/timer\/メモ 1\.conf\]/);
  });

  test("題に区切りの字が紛れていたら、ずれた一覧を出さずに exit 2 で終わる", () => {
    const r = runFixture(["v1.0.0"], (root) => {
      commitFiles(root, "feat: 区切り\x02の字 (#80)", { "packages/checkin-core/src/a.ts": "x\n" });
    });
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /想定の形ではありません/);
    assert.doesNotMatch(r.stdout, /まとめ/);
  });
});

describe("フックの一覧との関係", () => {
  test("一覧のコマンドは、本番デプロイを止めるフックの一覧に当たらない（読むだけ）", () => {
    for (const command of ["pnpm changes:since v4.7.1", "node scripts/changes-since.mjs v4.7.1"]) {
      assert.deepEqual(findGuardedCommands(command), [], command);
    }
  });
});
