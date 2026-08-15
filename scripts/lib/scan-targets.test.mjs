import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { diffTargets, hasTargetDrift, formatTargetDiff } from "./scan-targets.mjs";

describe("diffTargets", () => {
  test("宣言と実体が一致するとき差分は空", () => {
    // Given: 同じ 2 件（順序だけ違う）
    const declared = ["b", "a"];
    const actual = ["a", "b"];
    // When
    const diff = diffTargets(declared, actual);
    // Then
    assert.deepEqual(diff, { missing: [], unexpected: [] });
  });

  test("宣言にあるが実在しないものを missing に出す（移設で対象を失う経路）", () => {
    // Given: 宣言したテストディレクトリが実体に無い
    const declared = ["packages/timer-core/test", "apps/timer-sync/test"];
    const actual = ["apps/timer-sync/test"];
    // When
    const diff = diffTargets(declared, actual);
    // Then
    assert.deepEqual(diff.missing, ["packages/timer-core/test"]);
    assert.deepEqual(diff.unexpected, []);
  });

  test("実在するが宣言に無いものを unexpected に出す（新設が黙って対象外になる経路）", () => {
    // Given: workspace に新しいパッケージがある
    const declared = ["packages/timer-core"];
    const actual = ["packages/timer-core", "packages/rate-limit"];
    // When
    const diff = diffTargets(declared, actual);
    // Then
    assert.deepEqual(diff.missing, []);
    assert.deepEqual(diff.unexpected, ["packages/rate-limit"]);
  });

  test("両方向のずれを同時に出す", () => {
    // Given / When
    const diff = diffTargets(["a", "b"], ["b", "c"]);
    // Then
    assert.deepEqual(diff, { missing: ["a"], unexpected: ["c"] });
  });

  test("差分は宣言・実体の並び順に依存しない", () => {
    // Given: 並びだけが違う同じ集合
    // When
    const a = diffTargets(["z", "a"], ["a", "y"]);
    const b = diffTargets(["a", "z"], ["y", "a"]);
    // Then
    assert.deepEqual(a, b);
  });

  test("重複は数えず集合として扱う", () => {
    // Given: 宣言に同じ項目が 2 回ある
    // When
    const diff = diffTargets(["a", "a"], ["a"]);
    // Then
    assert.deepEqual(diff, { missing: [], unexpected: [] });
  });

  test("実体が空でも宣言側は missing として出る", () => {
    // Given: 走査対象が消え去った状態
    // When
    const diff = diffTargets(["a"], []);
    // Then
    assert.deepEqual(diff.missing, ["a"]);
  });
});

describe("hasTargetDrift", () => {
  test("どちらの向きにも差分が無ければ false", () => {
    // Given / When / Then
    assert.equal(hasTargetDrift({ missing: [], unexpected: [] }), false);
  });

  test("missing だけでも true", () => {
    // Given / When / Then
    assert.equal(hasTargetDrift({ missing: ["a"], unexpected: [] }), true);
  });

  test("unexpected だけでも true", () => {
    // Given / When / Then
    assert.equal(hasTargetDrift({ missing: [], unexpected: ["a"] }), true);
  });
});

describe("formatTargetDiff", () => {
  test("ずれの向き・直し方・走査量の 3 点を出す", () => {
    // Given
    const diff = { missing: ["packages/gone"], unexpected: ["packages/new"] };
    // When
    const text = formatTargetDiff("audit-structure", diff, "src 9 パッケージ / 167 件");
    // Then
    assert.match(text, /\[audit-structure\]/);
    assert.match(text, /宣言にあるが実在しない: packages\/gone/);
    assert.match(text, /実在するが宣言に無い:\s+packages\/new/);
    assert.match(text, /現在の走査対象: src 9 パッケージ \/ 167 件/);
  });

  test("差分が無くても走査量は出る", () => {
    // Given: ずれなし
    // When
    const text = formatTargetDiff("x", { missing: [], unexpected: [] }, "10 件");
    // Then
    assert.match(text, /現在の走査対象: 10 件/);
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { listTrackedFiles, listRepoFiles, listWorkspacePackages } from "./scan-targets.mjs";

/** 追跡ファイル 1 件・未追跡 1 件・gitignore 対象 1 件を持つ一時リポジトリを作る。 */
function makeFixtureRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scan-targets-"));
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  fs.writeFileSync(path.join(dir, ".gitignore"), "ignored.md\n");
  fs.writeFileSync(path.join(dir, "tracked.md"), "# tracked\n");
  git("add", ".gitignore", "tracked.md");
  git("commit", "-q", "-m", "init");
  fs.writeFileSync(path.join(dir, "untracked.md"), "# untracked\n");
  fs.writeFileSync(path.join(dir, "ignored.md"), "# ignored\n");
  return dir;
}

describe("listTrackedFiles", () => {
  test("追跡下のファイルだけを返す", () => {
    // Given
    const dir = makeFixtureRepo();
    try {
      // When
      const files = listTrackedFiles(dir, ["*.md"]);
      // Then
      assert.deepEqual(files, ["tracked.md"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("listRepoFiles", () => {
  test("未追跡かつ gitignore 対象外を含め、gitignore 対象は含めない", () => {
    // Given
    const dir = makeFixtureRepo();
    try {
      // When
      const files = listRepoFiles(dir, ["*.md"]);
      // Then
      assert.deepEqual(files, ["tracked.md", "untracked.md"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("listWorkspacePackages", () => {
  const REPO_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();

  test("リポジトリルートを含めない", () => {
    // Given / When
    const packages = listWorkspacePackages(REPO_ROOT);
    // Then: ルートは相対パスが "" になる
    assert.equal(packages.includes(""), false);
    assert.equal(packages.includes("."), false);
  });

  test("既知のパッケージを相対パスで返す", () => {
    // Given / When
    const packages = listWorkspacePackages(REPO_ROOT);
    // Then
    assert.ok(packages.includes("packages/timer-core"));
    assert.ok(packages.includes("apps/timer-sync"));
    assert.ok(packages.includes("e2e"));
  });
});
