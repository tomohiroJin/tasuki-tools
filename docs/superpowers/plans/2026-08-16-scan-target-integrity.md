# 走査対象の健全性（#135）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 検査が走査対象を静かに失う／最初から見ない 7 経路を、走査対象の宣言と実体を全単射で照合する単一の仕組みで塞ぐ。

**Architecture:** `scripts/lib/scan-targets.mjs` に「実体の列挙」と「宣言との照合」を集約する。判定は純粋関数、I/O と `process.exit` は呼び出し側に置く（既存 `audit-log-hygiene.mjs` の方針）。各検査は走査対象を明示的に宣言し、実行時に実体と突き合わせて、どちらの向きのずれでも落ちる。実体の権威はツール自身（`pnpm -r list` / `git ls-files`）で、自作の再実装を禁じる。

**Tech Stack:** Node 22 標準のみ（`node:fs` / `node:path` / `node:child_process` / `node:test` / `node:assert`）。追加依存は禁止。pnpm 11.5.0 / GitHub Actions。

**Spec:** [`docs/superpowers/specs/2026-08-16-scan-target-integrity-design.md`](../specs/2026-08-16-scan-target-integrity-design.md)

## Global Constraints

- **追加依存は禁止。** Node 標準ライブラリのみを使う（既存の `scripts/*.mjs` と同じ）。
- **判定は純粋関数、I/O と `process.exit` は呼び出し側。** `scripts/audit-log-hygiene.mjs` の設計方針に合わせる。
- **`pnpm-workspace.yaml` を手で解析してはならない**（MUST NOT）。workspace の権威は `pnpm -r list --depth -1 --json`（ルートを除く）。
- **`git ls-files '*package.json'` で workspace を代替してはならない**（MUST NOT）。pnpm の解決規則の自作再実装になる。
- **git の pathspec に `**` を書いてはならない**（MUST NOT）。git の pathspec で `**` は特別扱いされず `*` と同義なので、`scripts/**/*.test.mjs` は `scripts/*/*.test.mjs` と同じ意味になり **`scripts/` 直下を静かに取りこぼす**。`*` が `/` を跨ぐので `scripts/*.test.mjs` だけで再帰列挙になる。
- **`*.test.mjs` を repo 全体に使ってはならない**（MUST NOT）。`packages/ui/tests/tokens.test.mjs` を拾う。`scripts/` に限定する。
- **CI で `| xargs` に繋いではならない**（MUST NOT）。GitHub Actions の既定シェルは `bash -e` で `pipefail` を設定せず、対象生成の失敗が握り潰される。`targets="$(...)"` の代入形にする。
- **`check-links` の存在判定を未追跡ファイルへ広げてはならない**（MUST NOT）。ローカル緑・CI 赤の食い違いを生む。走査対象だけを広げる。
- **件数の下限を直書きしてはならない**（MUST NOT）。下限を下げるのが赤を消す最短経路になり、対応表から項目を消すのと同じ穴になる。
- **除外には理由を必須とする。** 除外に書いた対象が実在しなくなったら落とす。
- コメント・docstring・テスト名は日本語。テストは Given / When / Then のコメントを置く（SC032）。
- コミットは Conventional Commits ＋日本語本文。`main` へ直接コミットしない。作業ブランチは `feature/135-scan-target-integrity`。

## 実測済みの前提（spec §3 が正本。ここでは値を再掲しない）

作業を始める前に spec の §3 を読むこと。特に §3.2（テストディレクトリ名が `test` と `tests` で割れている）と §3.10（git pathspec の挙動）は、読まずに実装すると必ず踏む。

## ファイル構成

| ファイル | 責務 |
|---|---|
| `scripts/lib/scan-targets.mjs`（新規） | 実体の列挙と、宣言との全単射照合。**唯一の実装** |
| `scripts/lib/scan-targets.test.mjs`（新規） | 上記の単体テスト |
| `scripts/list-scan-targets.mjs`（新規） | CI へ対象を渡す薄い CLI。0 件なら非ゼロ終了 |
| `scripts/mutation-check.mjs`（変更） | 対応表 ↔ patch の全単射（経路①） |
| `scripts/audit-structure.mjs`（変更） | パッケージ宣言と全単射・走査量出力（経路②⑪） |
| `scripts/audit-log-hygiene.mjs`（変更） | 同上＋未走査 `.tsx` 件数の出力（経路⑪・D7） |
| `scripts/check-links.mjs`（変更） | `*.md` の全分割・走査対象の拡大（経路③⑧） |
| `.github/workflows/ci.yml`（変更） | shellcheck と `node --test` の対象生成（経路④⑬） |
| `docs/adr/0014-scan-target-integrity.md`（新規） | 決定の正本 |

---

### Task 1: 照合の純粋関数

**Files:**
- Create: `scripts/lib/scan-targets.mjs`
- Test: `scripts/lib/scan-targets.test.mjs`

**Interfaces:**
- Consumes: なし
- Produces:
  - `diffTargets(declared: string[], actual: string[]) => { missing: string[], unexpected: string[] }`
  - `hasTargetDrift(diff) => boolean`
  - `formatTargetDiff(name: string, diff, scanSummary: string) => string`

- [ ] **Step 1: 失敗するテストを書く**

`scripts/lib/scan-targets.test.mjs` を新規作成する。

```js
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
```

- [ ] **Step 2: 落ちることを確認する**

```bash
cd /home/vscode/tasuki-work
node --test scripts/lib/scan-targets.test.mjs
```

期待: `Cannot find module` でエラー終了（`scan-targets.mjs` がまだ無い）。

- [ ] **Step 3: 最小の実装を書く**

`scripts/lib/scan-targets.mjs` を新規作成する。

```js
/**
 * 走査対象の健全性（#135・ADR-0014）。
 *
 * 各検査は走査対象を**宣言**し、実行時に**実体**を列挙して全単射で照合する。
 * 「宣言にあるが実在しない」「実在するが宣言に無い」のどちらでも落とす。
 *
 * 判定は純粋関数、I/O と process.exit は呼び出し側に置く
 * （scripts/audit-log-hygiene.mjs の設計方針に合わせた）。追加依存は禁止。
 */

/**
 * 宣言と実体の差分を両方向で取る。
 *
 * missing:    宣言にあるが実体に無い（移設・改名で対象を失った）
 * unexpected: 実体にあるが宣言に無い（新設されたものが黙って対象外になった）
 *
 * **片方向では塞げない。** missing だけを見ると新設が素通りし（#103 が実際に踏んだ）、
 * unexpected だけを見ると移設が素通りする（#70 の最終レビューが見つけた経路）。
 */
export function diffTargets(declared, actual) {
  const declaredSet = new Set(declared);
  const actualSet = new Set(actual);
  return {
    missing: [...declaredSet].filter((x) => !actualSet.has(x)).sort(),
    unexpected: [...actualSet].filter((x) => !declaredSet.has(x)).sort(),
  };
}

/** どちらかの向きにずれがあるか。 */
export function hasTargetDrift(diff) {
  return diff.missing.length > 0 || diff.unexpected.length > 0;
}

/**
 * ずれを人が読める形にする。
 *
 * **必ず 3 点を出す**: ずれの向き・向きごとの直し方・現在の走査量。
 * 走査量を出すのは、#103 の「11 パッケージ中 3 つしか見ていない」が長く
 * 気づかれなかった原因が「量を一度も出していなかったこと」だから。
 */
export function formatTargetDiff(name, diff, scanSummary) {
  const lines = [`[${name}] 走査対象の宣言が実体とずれています`];
  for (const m of diff.missing) {
    lines.push(`  宣言にあるが実在しない: ${m}    ← 移設したなら宣言を直す`);
  }
  for (const u of diff.unexpected) {
    lines.push(`  実在するが宣言に無い:   ${u}    ← 対象に入れるか、理由つきで除外する`);
  }
  lines.push(`  現在の走査対象: ${scanSummary}`);
  return lines.join("\n");
}
```

- [ ] **Step 4: 通ることを確認する**

```bash
node --test scripts/lib/scan-targets.test.mjs
```

期待: `pass 12` / `fail 0`。

- [ ] **Step 5: コミット**

```bash
git add scripts/lib/scan-targets.mjs scripts/lib/scan-targets.test.mjs
git commit -m "feat: 走査対象の宣言と実体を照合する純粋関数を足す（#135）

- diffTargets は両方向の差分を返す。片方向では移設と新設のどちらかが素通りする
- formatTargetDiff はずれの向き・直し方・走査量の 3 点を必ず出す"
```

---

### Task 2: 実体の列挙

**Files:**
- Modify: `scripts/lib/scan-targets.mjs`（追記）
- Test: `scripts/lib/scan-targets.test.mjs`（追記）

**Interfaces:**
- Consumes: Task 1 の `diffTargets` は使わない（独立）
- Produces:
  - `listTrackedFiles(repoRoot: string, patterns: string[]) => string[]`
  - `listRepoFiles(repoRoot: string, patterns: string[]) => string[]`
  - `listWorkspacePackages(repoRoot: string) => string[]`（リポジトリ相対・ルートを除く）

- [ ] **Step 1: 失敗するテストを書く**

`scripts/lib/scan-targets.test.mjs` の末尾に追記する。一時 git リポジトリを作って検証するので、作業リポジトリを汚さない。

```js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { listTrackedFiles, listRepoFiles, listWorkspacePackages } from "./scan-targets.mjs";

/** 追跡ファイル 1 件・未追跡 1 件・gitignore 対象 1 件を持つ一時リポジトリを作る。 */
function makeFixtureRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scan-targets-"));
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  git("init", "-q");
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
```

- [ ] **Step 2: 落ちることを確認する**

```bash
node --test scripts/lib/scan-targets.test.mjs
```

期待: `listTrackedFiles is not a function` などで FAIL。

- [ ] **Step 3: 実装を書く**

`scripts/lib/scan-targets.mjs` の冒頭に import を足し、末尾に追記する。

```js
import path from "node:path";
import { execFileSync } from "node:child_process";

/** git のパス列挙。NUL 区切りで受け取り、空要素を落とす。 */
function gitLines(repoRoot, args) {
  return execFileSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean);
}

/**
 * 追跡下のファイルを列挙する。
 *
 * **pathspec に `**` を書いてはならない。** git の pathspec で `**` は特別扱いされず、
 * `*` と同じく `/` を跨ぐ単なるワイルドカードとして振る舞う。したがって
 * `scripts/**\/*.test.mjs` は `scripts/*\/*.test.mjs` と同義になり、`scripts/` 直下の
 * ファイルを**静かに取りこぼす**。0 件になって空振りが露見するのではなく、
 * 一部だけ一致して残りが落ちるので、「0 件なら落とす」検査では救えない。
 * `*` が `/` を跨ぐため、再帰列挙には `scripts/*.test.mjs` だけで足りる。
 */
export function listTrackedFiles(repoRoot, patterns) {
  return gitLines(repoRoot, ["ls-files", "-z", ...patterns]).sort();
}

/**
 * 追跡下 ∪（未追跡かつ gitignore 対象外）を列挙する。
 *
 * **存在判定に使ってはならない。** 存在判定を未追跡へ広げると、未追跡ファイルへの
 * リンクがローカルでは通り CI では落ちる（PR-2 で踏んだ食い違いの逆向き）。
 * 走査対象を広げる用途に限る。gitignore 対象は従来どおり見ない。
 */
export function listRepoFiles(repoRoot, patterns) {
  const tracked = gitLines(repoRoot, ["ls-files", "-z", ...patterns]);
  const untracked = gitLines(repoRoot, [
    "ls-files",
    "-z",
    "--others",
    "--exclude-standard",
    ...patterns,
  ]);
  return [...new Set([...tracked, ...untracked])].sort();
}

/**
 * workspace のパッケージをリポジトリ相対パスで列挙する（ルートを除く）。
 *
 * **権威は pnpm 自身**（ADR-0014）。pnpm-workspace.yaml を手で解析してはならず、
 * `git ls-files '*package.json'` で代替してもならない。どちらも pnpm の解決規則の
 * 自作再実装になり、workspace の glob が変わったときに黙ってずれる。
 *
 * `pnpm install` 済みであることを要求する。install を走らせないジョブからは呼ばない。
 */
export function listWorkspacePackages(repoRoot) {
  const stdout = execFileSync("pnpm", ["-r", "list", "--depth", "-1", "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const root = path.resolve(repoRoot);
  return JSON.parse(stdout)
    .map((entry) => path.resolve(entry.path))
    .filter((abs) => abs !== root)
    .map((abs) => path.relative(root, abs).split(path.sep).join("/"))
    .sort();
}
```

- [ ] **Step 4: 通ることを確認する**

```bash
node --test scripts/lib/scan-targets.test.mjs
```

期待: 全件 PASS。

- [ ] **Step 5: 実体が 11 件であることを手で確かめる**

```bash
node -e 'import("./scripts/lib/scan-targets.mjs").then(m=>console.log(m.listWorkspacePackages(process.cwd())))'
```

期待: 11 件の配列。ルート（`""`）を含まない。

- [ ] **Step 6: コミット**

```bash
git add scripts/lib/scan-targets.mjs scripts/lib/scan-targets.test.mjs
git commit -m "feat: 走査対象の実体を列挙する関数を足す（#135）

- workspace の権威は pnpm -r list。YAML の手解析も git ls-files での代替も禁じる
- listRepoFiles は走査対象の拡大専用。存在判定には使わない"
```

---

### Task 3: CI への結線（経路④ shellcheck・経路⑬ 自己テスト）

**Files:**
- Create: `scripts/list-scan-targets.mjs`
- Modify: `.github/workflows/ci.yml:223-225`（shellcheck）と `:214-215`（`node --test`）

**Interfaces:**
- Consumes: `listTrackedFiles`（Task 2）
- Produces: CLI `node scripts/list-scan-targets.mjs <shell|script-tests>` — 1 行 1 パスを stdout、0 件なら exit 1

- [ ] **Step 1: CLI を書く**

`scripts/list-scan-targets.mjs` を新規作成する。

```js
#!/usr/bin/env node
/**
 * CI へ走査対象を渡す薄い CLI（#135・ADR-0014）。
 *
 * ワークフローの YAML に対象を書かないための入口。YAML に書くと、
 * ADR 0009 D6 の「deploy/** と scripts/** を対象」という記述と実装がずれても
 * 誰も気づかない（実際に非再帰のグロブのままだった）。
 *
 * 対象が 0 件なら非ゼロで終了する。除外は理由つきで宣言し、除外が
 * 1 件も一致しなくなったら落とす（死んだ除外行を残さない）。
 */
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { listTrackedFiles } from "./lib/scan-targets.mjs";

const REPO_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

/**
 * 種別ごとの実体と除外。
 *
 * shell:        `.specify/scripts/**` は spec-kit の vendor（ADR 0009 D6）。
 * script-tests: `scripts/` に限定する。`*.test.mjs` にすると
 *               packages/ui/tests/tokens.test.mjs（ui 自身のテスト）まで拾う。
 *               `scripts/*.test.mjs` は git の `*` が `/` を跨ぐため再帰列挙になる。
 *               `**` は特別扱いされず `*` と同義なので使わない（直下を取りこぼす）。
 */
const KINDS = {
  shell: {
    patterns: ["*.sh"],
    exclusions: [
      { prefix: ".specify/scripts/", reason: "spec-kit の vendor（ADR 0009 D6）" },
    ],
  },
  "script-tests": {
    patterns: ["scripts/*.test.mjs"],
    exclusions: [],
  },
};

export function selectTargets(all, exclusions) {
  const problems = [];
  for (const e of exclusions) {
    if (!all.some((rel) => rel.startsWith(e.prefix))) {
      problems.push(`除外が 1 件も一致しません: ${e.prefix}（${e.reason}）`);
    }
  }
  const targets = all.filter((rel) => !exclusions.some((e) => rel.startsWith(e.prefix)));
  return { targets, problems };
}

function main() {
  const kind = process.argv[2];
  const spec = KINDS[kind];
  if (!spec) {
    console.error(`未知の種別です: ${kind}（使えるのは ${Object.keys(KINDS).join(" / ")}）`);
    process.exit(2);
  }

  const all = listTrackedFiles(REPO_ROOT, spec.patterns);
  const { targets, problems } = selectTargets(all, spec.exclusions);

  if (problems.length > 0) {
    for (const p of problems) console.error(`[list-scan-targets] ${p}`);
    process.exit(1);
  }
  if (targets.length === 0) {
    console.error(`[list-scan-targets] ${kind} の対象が 0 件です（検査が空振りします）`);
    process.exit(1);
  }
  console.log(targets.join("\n"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
```

- [ ] **Step 2: 手で確かめる**

```bash
node scripts/list-scan-targets.mjs shell
node scripts/list-scan-targets.mjs script-tests
node scripts/list-scan-targets.mjs nope; echo "exit=$?"
```

期待: `shell` は 6 本（`.specify/` を含まない）、`script-tests` は 5 本（`scripts/lib/scan-targets.test.mjs` を含む）、`nope` は exit=2。

- [ ] **Step 3: CI を書き換える**

`.github/workflows/ci.yml` の `quality` ジョブで、次の 2 ステップを置き換える。

置き換え前:

```yaml
      - run: node --test scripts/audit-structure.test.mjs scripts/check-links.test.mjs scripts/ci-scope.test.mjs scripts/audit-log-hygiene.test.mjs
        if: steps.scope.outputs.code == 'true'
```

置き換え後:

```yaml
      # 対象は列挙しない。scripts/ 配下の *.test.mjs を git から導出する。
      # 列挙をハードコードすると、新しいテストが黙って走らない（#135 経路⑬）。
      - name: scripts の自己テスト
        if: steps.scope.outputs.code == 'true'
        shell: bash
        run: |
          set -euo pipefail
          targets="$(node scripts/list-scan-targets.mjs script-tests)"
          node --test $targets
```

置き換え前:

```yaml
      # shellcheck。.specify/scripts/** は vendor のため対象外（ADR 0009 D6）。
      - run: shellcheck -x --source-path=deploy --severity=warning deploy/*.sh deploy/lib/*.sh scripts/*.sh
        if: steps.scope.outputs.code == 'true'
```

置き換え後:

```yaml
      # shellcheck。対象は git から導出する（グロブが非再帰でサブディレクトリの
      # .sh が無検査だった。#135 経路④）。.specify/scripts/** は vendor（ADR 0009 D6）。
      - name: shellcheck
        if: steps.scope.outputs.code == 'true'
        shell: bash
        run: |
          set -euo pipefail
          targets="$(node scripts/list-scan-targets.mjs shell)"
          shellcheck -x --source-path=deploy --severity=warning $targets
```

**`| xargs` に繋がないこと。** GitHub Actions の既定シェルは `pipefail` を設定せず、
対象生成が失敗しても後段が成功すれば緑になる。`targets="$(...)"` の代入なら `set -e` が拾う。
`$targets` をクォートしないのは意図的（対象パスに空白は無い）。

- [ ] **Step 4: 手元で同じことを再現する**

```bash
set -euo pipefail
targets="$(node scripts/list-scan-targets.mjs script-tests)"
node --test $targets
```

期待: 5 ファイル分のテストが全件 PASS。

- [ ] **Step 5: コミット**

```bash
git add scripts/list-scan-targets.mjs .github/workflows/ci.yml
git commit -m "feat: shellcheck と自己テストの対象を git から導出する（#135 経路④⑬）

- ci.yml から対象の列挙を消す。ADR 0009 D6 の記述と実装が初めて一致する
- | xargs に繋がない。Actions の既定シェルは pipefail を立てず失敗を握り潰す
- 経路⑬（node --test の列挙がハードコード）は本 Issue の設計中に見つけた"
```

---

### Task 4: 変異の対応表と patch の全単射（経路①）

**Files:**
- Modify: `scripts/mutation-check.mjs`（`assertMutationTestsExist` の直後に追加、`main()` から呼ぶ）

**Interfaces:**
- Consumes: `diffTargets` / `hasTargetDrift` / `formatTargetDiff`（Task 1）
- Produces: なし（内部関数）

- [ ] **Step 1: 対照実行**

```bash
node scripts/mutation-check.mjs 2>&1 | head -5
```

期待: `[mutation-check] 変異数: 13` が出る。**この値を控える。**

- [ ] **Step 2: 実装を書く**

`scripts/mutation-check.mjs` の import に足す。

```js
import { diffTargets, hasTargetDrift, formatTargetDiff } from "./lib/scan-targets.mjs";
```

`assertMutationTestsExist` の直後に足す。

```js
/**
 * 対応表と patch ファイルが全単射であることを確かめる（#135 経路①）。
 *
 * **限界**: 対応表の項目と patch ファイルを**両方**消せば全単射は保たれ、
 * この検査は通る。件数の下限を直書きする対策は採らない — 下限を下げるのが
 * 赤を消す最短経路になり、対応表から項目を消すのと同じ穴になるため
 * （ADR-0014）。patch の削除が diff に現れることをレビューの拠り所とする。
 */
function assertMutationPatchesBijective() {
  if (MUTATIONS.length === 0) {
    console.error("[mutation-check] 変異が 0 件です（検査が空振りします）");
    process.exit(1);
  }
  const declared = MUTATIONS.map((m) => m.patch);
  const actual = fs.readdirSync(MUTATIONS_DIR).filter((f) => f.endsWith(".patch"));
  const diff = diffTargets(declared, actual);
  if (hasTargetDrift(diff)) {
    console.error(formatTargetDiff("mutation-check", diff, `変異 ${declared.length} 件`));
    process.exit(1);
  }
}
```

`main()` の `assertMutationTestsExist();` の直後に呼び出しを足す。

```js
  assertMutationTestsExist();
  assertMutationPatchesBijective();
```

- [ ] **Step 3: 通ることを確認する（対照）**

```bash
node scripts/mutation-check.mjs 2>&1 | head -5
```

期待: Step 1 と同じ出力。新しいエラーが出ない。

- [ ] **Step 4: 壊して赤を確認する**

```bash
# 壊す前に、壊れることを確かめる準備
cp scripts/mutations/m13-adapter-reads-x-real-ip.patch /tmp/m13.bak
rm scripts/mutations/m13-adapter-reads-x-real-ip.patch
ls scripts/mutations/*.patch | wc -l   # 13 → 12 になったことを先に確認する
node scripts/mutation-check.mjs; echo "exit=$?"
```

期待: `宣言にあるが実在しない: m13-adapter-reads-x-real-ip.patch` を含むメッセージ、`exit=1`。

```bash
cp /tmp/m13.bak scripts/mutations/m13-adapter-reads-x-real-ip.patch
git status --porcelain   # 空であることを確認
```

- [ ] **Step 5: コミット**

```bash
git add scripts/mutation-check.mjs
git commit -m "feat: 変異の対応表と patch の全単射を検査する（#135 経路①）

- 対応表を空にすると落ちる。片側だけ消しても落ちる
- 両方消す経路は塞げない。限界を docstring と ADR-0014 に明記した"
```

---

### Task 5: ログ衛生の走査対象を導出する（経路⑪・D7）

**Files:**
- Modify: `scripts/audit-log-hygiene.mjs:30-34`（`SCAN_DIRS`）と `main()`
- Test: `scripts/audit-log-hygiene.test.mjs`（追記）

**Interfaces:**
- Consumes: `listWorkspacePackages` / `diffTargets` / `hasTargetDrift` / `formatTargetDiff`
- Produces: `SCANNED_PACKAGES: string[]` / `EXCLUDED_PACKAGES: {pkg, reason}[]`（export・テストから参照）

- [ ] **Step 1: 対照実行**

```bash
node scripts/audit-log-hygiene.mjs; echo "exit=$?"
```

期待: `ログ衛生 OK（走査 52 ファイル）` / `exit=0`。**この値を控える。**

- [ ] **Step 2: 失敗するテストを書く**

`scripts/audit-log-hygiene.test.mjs` の末尾に追記する。

```js
import { SCANNED_PACKAGES, EXCLUDED_PACKAGES } from "./audit-log-hygiene.mjs";
import { listWorkspacePackages, diffTargets } from "./lib/scan-targets.mjs";
import { execFileSync as execFileSyncForRoot } from "node:child_process";

describe("走査対象の宣言", () => {
  const REPO_ROOT = execFileSyncForRoot("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();

  test("宣言と除外を合わせると workspace の全パッケージを覆う", () => {
    // Given
    const declared = [...SCANNED_PACKAGES, ...EXCLUDED_PACKAGES.map((e) => e.pkg)];
    // When
    const diff = diffTargets(declared, listWorkspacePackages(REPO_ROOT));
    // Then
    assert.deepEqual(diff, { missing: [], unexpected: [] });
  });

  test("除外には理由が書かれている", () => {
    // Given / When / Then
    for (const e of EXCLUDED_PACKAGES) {
      assert.ok(e.reason && e.reason.length > 0, `${e.pkg} に理由がありません`);
    }
  });
});
```

- [ ] **Step 3: 落ちることを確認する**

```bash
node --test scripts/audit-log-hygiene.test.mjs
```

期待: `SCANNED_PACKAGES` が undefined で FAIL。

- [ ] **Step 4: 実装を書く**

`scripts/audit-log-hygiene.mjs` の `SCAN_DIRS` の定義（30〜34 行目のコメント込み）を、次で置き換える。

```js
/**
 * 走査するパッケージ（リポジトリルート起点）。各パッケージの `src/` 配下の `.ts` を見る。
 *
 * **ハードコードの配列をやめ、workspace の実体と全単射で照合する**（#135 経路⑪）。
 * 以前は timer-sync・poker-sync・rate-limit の 3 つだけを見ており、新設パッケージは
 * 黙って対象外になった。packages/rate-limit（生の IP を最も直接扱う）が実際に
 * 素通りし、最終レビューで人が気づくまで緑のままだった。
 */
export const SCANNED_PACKAGES = [
  "apps/landing",
  "apps/poker-sync",
  "apps/poker-web",
  "apps/timer-sync",
  "apps/timer-web",
  "packages/poker-core",
  "packages/protocol",
  "packages/rate-limit",
  "packages/timer-core",
];

/** 走査から外すパッケージ。**理由が要る。** 実在しなくなったら落ちる。 */
export const EXCLUDED_PACKAGES = [
  { pkg: "packages/ui", reason: "TS を 1 つも持たない（CSS トークンとフォントのみ）" },
  { pkg: "e2e", reason: "src/ を持たない。テストコードのログ経路は本検査の対象外" },
];

const SCAN_DIRS = SCANNED_PACKAGES.map((pkg) => `${pkg}/src`);
```

import に足す（`fs` / `path` / `fileURLToPath` は既にある）。

```js
import {
  listWorkspacePackages,
  diffTargets,
  hasTargetDrift,
  formatTargetDiff,
} from "./lib/scan-targets.mjs";
```

`main()` の冒頭に照合を、末尾に走査量の出力を足す。

```js
function main() {
  // 走査対象の宣言が workspace の実体とずれていないかを最初に見る（#135 経路⑪）。
  const packages = listWorkspacePackages(REPO_ROOT);
  const declared = [...SCANNED_PACKAGES, ...EXCLUDED_PACKAGES.map((e) => e.pkg)];
  const drift = diffTargets(declared, packages);
  if (hasTargetDrift(drift)) {
    console.error(
      formatTargetDiff("audit-log-hygiene", drift, `${SCANNED_PACKAGES.length} パッケージ`),
    );
    process.exit(1);
  }

  const scanned = new Map();
  for (const dir of SCAN_DIRS) {
    for (const [k, v] of readTsFiles(dir)) scanned.set(k, v);
  }

  // ...（既存の problems の組み立てはそのまま）...

  if (problems.length > 0) {
    for (const p of problems) console.error(p);
    console.error(`\n${problems.length} 件の問題があります（走査 ${scanned.size} ファイル）`);
    process.exit(1);
  }
  console.log(
    `ログ衛生 OK（走査 ${scanned.size} ファイル / ${SCANNED_PACKAGES.length} パッケージ）`,
  );
  console.log(
    `  走査していない .tsx: ${countSkippedTsx()} 件` +
      "（ブラウザの console が ADR 0012 D1 の射程に入るかは別 Issue で判断する）",
  );
}
```

`readTsFiles` の隣に、走査していない `.tsx` を数える関数を足す。

```js
/**
 * 走査対象ディレクトリにある `.tsx` の件数を数える（走査はしない）。
 *
 * **見ていないものを黙っていない**ための出力（#135 D7）。射程を `.ts` に
 * 据え置く判断そのものは別 Issue で行う。
 */
function countSkippedTsx() {
  let n = 0;
  for (const dir of SCAN_DIRS) {
    const abs = path.join(REPO_ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === "dist") continue;
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith(".tsx")) n++;
      }
    };
    walk(abs);
  }
  return n;
}
```

- [ ] **Step 5: 通ることを確認する**

```bash
node --test scripts/audit-log-hygiene.test.mjs
node scripts/audit-log-hygiene.mjs; echo "exit=$?"
```

期待: テスト全件 PASS。`ログ衛生 OK（走査 120 ファイル / 9 パッケージ）` と `走査していない .tsx: 47 件`、`exit=0`。**52 → 120 に増えて、なお違反 0 件**であることを確認する。

- [ ] **Step 6: 壊して赤を確認する**

```bash
# 宣言から 1 つ消す
sed -i 's#^  "packages/rate-limit",$##' scripts/audit-log-hygiene.mjs
grep -c '"packages/rate-limit"' scripts/audit-log-hygiene.mjs   # 0 になったことを先に確認
node scripts/audit-log-hygiene.mjs; echo "exit=$?"
git checkout -- scripts/audit-log-hygiene.mjs
```

期待: `実在するが宣言に無い:   packages/rate-limit`、`exit=1`。

- [ ] **Step 7: コミット**

```bash
git add scripts/audit-log-hygiene.mjs scripts/audit-log-hygiene.test.mjs
git commit -m "feat: ログ衛生の走査対象を workspace から照合する（#135 経路⑪）

- 3 パッケージのハードコードをやめ、全 11 パッケージを宣言または除外で覆う
- 走査は 52 → 120 ファイルへ。違反は 0 件のまま（実測）
- 走査していない .tsx の件数を出す。射程の判断は別 Issue"
```

---

### Task 6: 構造監査の走査対象を宣言する（経路②⑪）

**Files:**
- Modify: `scripts/audit-structure.mjs:726-790`（`runAudit`）と `main()`
- Test: `scripts/audit-structure.test.mjs`（追記）

**Interfaces:**
- Consumes: `listWorkspacePackages` / `diffTargets` / `hasTargetDrift` / `formatTargetDiff`
- Produces: `SCANNED_PACKAGES: {pkg, src, test, entry}[]` / `EXCLUDED_PACKAGES: {pkg, reason}[]`

**注意（読まずに実装すると壊す）**: SC-035 と SC-039 は **timer 固有**の指標で、`apps/timer-web/src/App.tsx`・`apps/timer-sync/src/application/handlers.ts`・`packages/timer-core/src` を名指しで使う。走査を広げても**この 3 つの結線は変えない**。広げるのは `allTestFiles`（SC-028〜032・036）と SC-027（エントリを持つパッケージごと）だけ。

- [ ] **Step 1: 対照実行**

```bash
node scripts/audit-structure.mjs > /tmp/audit-before.txt; echo "exit=$?"; cat /tmp/audit-before.txt
```

期待: 指標の表が出て `exit=0`。**この表を控える**（Task 8 と ADR で「測り直した値」として使う）。

- [ ] **Step 2: 失敗するテストを書く**

`scripts/audit-structure.test.mjs` の末尾に追記する。

```js
import { SCANNED_PACKAGES, EXCLUDED_PACKAGES } from "./audit-structure.mjs";
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
        if (sub === null) continue;
        const abs = pathForFixture.join(REPO_ROOT, d.pkg, sub);
        assert.ok(fsForFixture.existsSync(abs), `実在しません: ${d.pkg}/${sub}`);
      }
    }
  });

  test("宣言したエントリポイントはすべて実在する", () => {
    // Given / When / Then
    for (const d of SCANNED_PACKAGES) {
      if (d.entry === null) continue;
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
});
```

- [ ] **Step 3: 落ちることを確認する**

```bash
node --test scripts/audit-structure.test.mjs
```

期待: `SCANNED_PACKAGES` が undefined で FAIL。

- [ ] **Step 4: 宣言を書く**

`scripts/audit-structure.mjs` の `runAudit` の直前に足す。

```js
/**
 * 走査するパッケージ。**src と test は独立に宣言する。**
 *
 * テストディレクトリ名は `test` と `tests` で割れている（実測）。規則で導出すると
 * 必ずどちらかを取りこぼすため、宣言して実体と照合する（#135 経路②⑪・ADR-0014）。
 * `entry` は SC-027 の到達性測定の起点。持たないパッケージは null。
 */
export const SCANNED_PACKAGES = [
  { pkg: "packages/timer-core", src: "src", test: "test", entry: "index.ts" },
  { pkg: "packages/poker-core", src: "src", test: "tests", entry: "index.ts" },
  { pkg: "packages/protocol", src: "src", test: "tests", entry: "index.ts" },
  { pkg: "packages/rate-limit", src: "src", test: "tests", entry: "index.ts" },
  { pkg: "apps/timer-sync", src: "src", test: "test", entry: "server.ts" },
  { pkg: "apps/timer-web", src: "src", test: "test", entry: "main.tsx" },
  { pkg: "apps/poker-sync", src: "src", test: "tests", entry: "server.ts" },
  { pkg: "apps/poker-web", src: "src", test: "tests", entry: "main.tsx" },
  { pkg: "apps/landing", src: "src", test: "tests", entry: "main.tsx" },
  { pkg: "e2e", src: null, test: "tests", entry: null },
];

/** 走査から外すパッケージ。**理由が要る。** */
export const EXCLUDED_PACKAGES = [
  { pkg: "packages/ui", reason: "src・tests とも TS を 1 つも持たない（CSS トークンとフォント）" },
];
```

import に足す。

```js
import {
  listWorkspacePackages,
  diffTargets,
  hasTargetDrift,
  formatTargetDiff,
} from "./lib/scan-targets.mjs";
```

- [ ] **Step 5: `runAudit` を宣言駆動に書き換える**

`runAudit` の冒頭 3 行（`loadPackage("packages/timer-core")` 等）と `allTestFiles` の組み立てを置き換える。**SC-035 と SC-039 の結線は変えない**ため、timer の 3 つは名前付きで取り出しておく。

```js
function runAudit() {
  const loaded = SCANNED_PACKAGES.map((d) => ({
    ...d,
    srcFiles: d.src ? readFilesRecursive(path.join(REPO_ROOT, d.pkg, d.src), EXT_TS) : new Map(),
    testFiles: d.test ? readFilesRecursive(path.join(REPO_ROOT, d.pkg, d.test), EXT_TS) : new Map(),
  }));
  const byPkg = new Map(loaded.map((p) => [p.pkg, p]));

  // SC-035 / SC-039 は timer 固有の指標。走査を広げてもここは変えない。
  const core = byPkg.get("packages/timer-core");
  const sync = byPkg.get("apps/timer-sync");
  const web = byPkg.get("apps/timer-web");

  const allTestFiles = new Map();
  for (const p of loaded) {
    for (const [k, v] of p.testFiles) allTestFiles.set(`${p.pkg}/${p.test}/${k}`, v);
  }

  // SC-027: エントリを持つパッケージごとに到達性を測り、合算する
  const sc027 = loaded
    .filter((p) => p.entry !== null)
    .reduce((n, p) => n + sc027UnreachableModules(p.srcFiles, [p.entry]), 0);

  const reachable = {
    core: computeReachableFiles(core.srcFiles, [core.entry]),
    sync: computeReachableFiles(sync.srcFiles, [sync.entry]),
    web: computeReachableFiles(web.srcFiles, [web.entry]),
  };
```

上の置き換えで 733〜751 行目（`allTestFiles` の組み立て・SC-027・`reachable`）は消える。
**残る `.src` 参照は 7 箇所**で、これを `.srcFiles` へ読み替える。**式の中身は変えない。**

| 現行の行 | 式 |
|---|---|
| 764 | `const serverSources = [...sync.src.values()];` |
| 765 | `const clientSource = web.src.get("App.tsx") ?? "";` |
| 768 | `const handlersSource = sync.src.get("application/handlers.ts") ?? "";` |
| 770 / 773 / 776 | `productSources` の `core.src` / `sync.src` / `web.src` |
| 782 | `coreOnly` の `core.src` |

読み替え漏れがないことは次で確かめる。

```bash
grep -n 'core\.src\b\|sync\.src\b\|web\.src\b' scripts/audit-structure.mjs
```

期待: 0 件。

- [ ] **Step 6: 照合と走査量の出力を足す**

`main()` を置き換える。

```js
function main() {
  // 走査対象の宣言が実体とずれていないかを最初に見る（#135 経路②⑪）。
  //
  // **これは測定値の合否ではなく計測器の健全性の合否**（ADR-0014）。
  // ADR 0009 D2 の「構造監査は値を出すだけ」は測定値についての決定であり、
  // 走査対象を失ったまま全指標 PASS の表を出すことまで許してはいない。
  const packages = listWorkspacePackages(REPO_ROOT);
  const declared = [
    ...SCANNED_PACKAGES.map((d) => d.pkg),
    ...EXCLUDED_PACKAGES.map((e) => e.pkg),
  ];
  const drift = diffTargets(declared, packages);

  const missingDirs = [];
  for (const d of SCANNED_PACKAGES) {
    for (const sub of [d.src, d.test]) {
      if (sub === null) continue;
      if (!fs.existsSync(path.join(REPO_ROOT, d.pkg, sub))) missingDirs.push(`${d.pkg}/${sub}`);
    }
  }

  const srcCount = SCANNED_PACKAGES.filter((d) => d.src !== null).length;
  const testCount = SCANNED_PACKAGES.filter((d) => d.test !== null).length;
  const summary = `src ${srcCount} パッケージ / test ${testCount} パッケージ`;

  if (hasTargetDrift(drift) || missingDirs.length > 0) {
    const merged = {
      missing: [...drift.missing, ...missingDirs].sort(),
      unexpected: drift.unexpected,
    };
    console.error(formatTargetDiff("audit-structure", merged, summary));
    process.exit(1);
  }

  const results = runAudit();
  console.log(`[audit-structure] 走査対象: ${summary}`);
  console.log(formatTable(results));
}
```

- [ ] **Step 7: 通ることを確認する**

```bash
node --test scripts/audit-structure.test.mjs
node scripts/audit-structure.mjs > /tmp/audit-after.txt; echo "exit=$?"
diff /tmp/audit-before.txt /tmp/audit-after.txt
```

期待: テスト全件 PASS、`exit=0`。**diff には走査量の行の追加と、指標値の変化が出る**（走査が 3 → 10 パッケージへ広がったため）。SC031 が 0 から増え、SC032 の率が下がるはず。**変化した値を控える**（ADR とタスク 10 の振り返りに書く）。

- [ ] **Step 8: 壊して赤を確認する（経路②）**

```bash
mv packages/timer-core/test packages/timer-core/test-moved
ls packages/timer-core/ | grep -c '^test$'   # 0 になったことを先に確認
node scripts/audit-structure.mjs; echo "exit=$?"
mv packages/timer-core/test-moved packages/timer-core/test
git status --porcelain   # 空であることを確認
```

期待: `宣言にあるが実在しない: packages/timer-core/test`、`exit=1`。
**以前はここで全指標 PASS の表を出して exit=0 だった。**

- [ ] **Step 9: コミット**

```bash
git add scripts/audit-structure.mjs scripts/audit-structure.test.mjs
git commit -m "feat: 構造監査の走査対象を宣言と照合で決める（#135 経路②⑪）

- 3 パッケージのハードコードをやめ、10 パッケージを宣言（ui は理由つき除外）
- src と test を独立に宣言する。テストディレクトリ名は test / tests で割れている
- 対象を失うと落ちる。測定値の合否ではなく計測器の健全性の合否（ADR 0009 D2 との区別）
- SC-035 / SC-039 は timer 固有の指標なので結線を変えない
- 走査量を常に出力する"
```

---

### Task 7: リンク検査の全分割と走査対象の拡大（経路③⑧）

**Files:**
- Modify: `scripts/check-links.mjs:156-167`（`LIVE_DOCS`）・`checkConstants`・`main()`
- Test: `scripts/check-links.test.mjs`（追記）

**Interfaces:**
- Consumes: `listRepoFiles` / `listTrackedFiles` / `diffTargets`（Task 1・2）
- Produces: `DORMANT_DOCS: {prefix, reason}[]` / `classifyDocs(tracked) => {unclassified: string[]}`

- [ ] **Step 1: 対照実行**

```bash
node scripts/check-links.mjs; echo "exit=$?"
```

期待: `リンク検査 OK` 相当の出力、`exit=0`。

- [ ] **Step 2: 失敗するテストを書く**

`scripts/check-links.test.mjs` の末尾に追記する。

```js
import { LIVE_DOCS, DORMANT_DOCS, classifyDocs } from "./check-links.mjs";

describe("classifyDocs", () => {
  test("LIVE_DOCS に属する文書は無所属にならない", () => {
    // Given
    const tracked = ["docs/guides/development.md", "README.md"];
    // When
    const { unclassified } = classifyDocs(tracked);
    // Then
    assert.deepEqual(unclassified, []);
  });

  test("除外接頭辞に属する文書は無所属にならない", () => {
    // Given
    const tracked = ["docs/plans/2026-01-01-x.md"];
    // When
    const { unclassified } = classifyDocs(tracked);
    // Then
    assert.deepEqual(unclassified, []);
  });

  test("どちらにも属さない文書を無所属として出す", () => {
    // Given: 新設ディレクトリの文書
    const tracked = ["docs/newarea/notes.md"];
    // When
    const { unclassified } = classifyDocs(tracked);
    // Then
    assert.deepEqual(unclassified, ["docs/newarea/notes.md"]);
  });

  test("LIVE_DOCS からエントリを消すと、その配下が無所属になる", () => {
    // Given: docs/guides/ を失った状態を模す
    const live = LIVE_DOCS.filter((e) => e !== "docs/guides/");
    const tracked = ["docs/guides/development.md"];
    // When
    const { unclassified } = classifyDocs(tracked, { live });
    // Then: 経路③ — 以前はエントリごと消えて緑になっていた
    assert.deepEqual(unclassified, ["docs/guides/development.md"]);
  });

  test("除外には理由が書かれている", () => {
    // Given / When / Then
    for (const d of DORMANT_DOCS) {
      assert.ok(d.reason && d.reason.length > 0, `${d.prefix} に理由がありません`);
    }
  });
});
```

- [ ] **Step 3: 落ちることを確認する**

```bash
node --test scripts/check-links.test.mjs
```

期待: `classifyDocs is not a function` で FAIL。

- [ ] **Step 4: 実装を書く**

`LIVE_DOCS` に `SECURITY.md` を足す。

```js
export const LIVE_DOCS = [
  "README.md",
  "AGENTS.md",
  "CLAUDE.md",
  "SECURITY.md",
  "docs/README.md",
  "docs/adr/",
  "docs/guides/",
  "deploy/",
  ".github/",
  "e2e/",
  ".specify/memory/",
];
```

その直後に足す。

```js
/**
 * コードパス検査の対象にしない文書。**理由が要る。**
 *
 * LIVE_DOCS と合わせて**追跡下の全 `*.md` を分割する**（#135 経路③・ADR-0014）。
 * 「各エントリが 1 件以上に一致すること」では経路③を塞げない — 経路③の攻撃は
 * エントリの**削除**であり、削除すれば照合対象ごと消えて緑のままになるため。
 * 実体側を全分割すれば、エントリを消した瞬間にその配下が無所属になって落ちる。
 */
export const DORMANT_DOCS = [
  { prefix: "docs/superpowers/", reason: "設計正本・実装計画。作業中に頻繁に増減する" },
  { prefix: "docs/plans/", reason: "旧世代の実装計画。記録として保持する" },
  { prefix: "docs/timer/", reason: "timer の作業記録。記録として保持する" },
  { prefix: "docs/poker/", reason: "poker の作業記録。記録として保持する" },
  { prefix: "docs/retrospectives/", reason: "振り返り。当時の記述を保つのが正しい" },
  { prefix: ".claude/skills/", reason: "AI CLI のスキル定義。リポジトリの文書ではない" },
  { prefix: ".specify/templates/", reason: "spec-kit の vendor テンプレート" },
  { prefix: "packages/protocol/README.md", reason: "パッケージ README。LIVE_DOCS の粒度に合わない" },
  { prefix: "packages/ui/README.md", reason: "パッケージ README。LIVE_DOCS の粒度に合わない" },
];

/**
 * 追跡下の `*.md` を LIVE / 休眠 / 無所属に分ける。
 *
 * 無所属が 1 件でもあれば検査は落ちる。新しい文書ディレクトリを作ったとき、
 * 「リンク検査の対象にするか、理由つきで外すか」を人が必ず決めることになる。
 */
export function classifyDocs(tracked, { live = LIVE_DOCS, dormant = DORMANT_DOCS } = {}) {
  const matches = (rel, entry) => (entry.endsWith("/") ? rel.startsWith(entry) : rel === entry);
  const unclassified = tracked.filter(
    (rel) =>
      !live.some((e) => matches(rel, e)) && !dormant.some((d) => matches(rel, d.prefix)),
  );
  return { unclassified };
}
```

`checkConstants` に、休眠宣言が死んでいないかの検査を足す。

```js
export function checkConstants({ exists }) {
  const errors = [];
  for (const entry of LIVE_DOCS) {
    if (!exists(entry)) errors.push(`LIVE_DOCS が実在しないパスを指しています: ${entry}`);
  }
  for (const d of DORMANT_DOCS) {
    if (!exists(d.prefix)) {
      errors.push(`DORMANT_DOCS が実在しないパスを指しています: ${d.prefix}（${d.reason}）`);
    }
  }
  return errors;
}
```

`main()` を書き換える。**走査対象だけを広げ、存在判定は `trackedPaths()` のまま**にする。

```js
function main() {
  const tracked = trackedPaths();
  const exists = (rel) => tracked.has(rel) || tracked.has(rel.endsWith("/") ? rel : `${rel}/`);
  const errors = checkConstants({ exists });

  // 全分割の検査は**追跡下**の .md に対して行う（#135 経路③）。
  const trackedDocs = gitList(["ls-files", "*.md"]).sort();
  for (const rel of classifyDocs(trackedDocs).unclassified) {
    errors.push(
      `LIVE_DOCS にも DORMANT_DOCS にも属さない文書があります: ${rel}` +
        "（検査対象に入れるか、理由つきで DORMANT_DOCS へ足してください）",
    );
  }

  // 走査対象は**未追跡かつ gitignore 対象外**も含める（#135 経路⑧）。
  // 存在判定（trackedPaths）は広げない。広げるとローカル緑・CI 赤になる。
  const files = listRepoFiles(REPO_ROOT, ["*.md"]);
  if (files.length === 0) {
    errors.push("走査対象の .md が 1 件もありません（検査が空振りしています）");
  }

  // ...（以降の走査ループはそのまま）...
```

出力の末尾に走査量を足す。

```js
  console.log(`  走査対象: ${files.length} 件（うち追跡下 ${trackedDocs.length} 件）`);
```

import に足す。

```js
import { listRepoFiles } from "./lib/scan-targets.mjs";
```

- [ ] **Step 5: 通ることを確認する**

```bash
node --test scripts/check-links.test.mjs
node scripts/check-links.mjs; echo "exit=$?"
```

期待: テスト全件 PASS、`exit=0`。走査対象の件数は次と一致すること。

```bash
git ls-files '*.md' | wc -l
```

**件数を計画へ直書きしない。** この計画自身のコミットで増えるため、実行時に数える。

- [ ] **Step 6: 壊して赤を確認する（経路③）**

```bash
sed -i 's#^  "docs/guides/",$##' scripts/check-links.mjs
grep -c '"docs/guides/"' scripts/check-links.mjs   # 0 になったことを先に確認
node scripts/check-links.mjs; echo "exit=$?"
git checkout -- scripts/check-links.mjs
```

期待: `LIVE_DOCS にも DORMANT_DOCS にも属さない文書があります: docs/guides/...` が 7 件、`exit=1`。
**以前は同じ操作で「リンク検査 OK」・exit=0 になっていた。**

- [ ] **Step 7: 壊して赤を確認する（経路⑧）**

```bash
mkdir -p docs/guides && cat > docs/guides/tmp-broken.md <<'EOF'
実在しないパス `packages/no-such-package/src/index.ts` を参照する。
EOF
git status --porcelain docs/guides/tmp-broken.md   # ?? で未追跡であることを先に確認
node scripts/check-links.mjs; echo "exit=$?"
rm docs/guides/tmp-broken.md
```

期待: 未追跡のまま `packages/no-such-package/src/index.ts` が検出されて `exit=1`。
**以前は未追跡なので走査されず exit=0 だった。**

- [ ] **Step 8: コミット**

```bash
git add scripts/check-links.mjs scripts/check-links.test.mjs
git commit -m "feat: リンク検査を全分割にし、走査対象へ未追跡文書を含める（#135 経路③⑧）

- 追跡下の全 *.md を LIVE_DOCS か DORMANT_DOCS のどちらかへ必ず分類する
- エントリを削っても緑になっていた経路を塞ぐ（各エントリの一致件数では塞げない）
- 走査対象に未追跡かつ gitignore 対象外を含める。存在判定は追跡下のまま
- SECURITY.md をリンク検査の対象へ入れる"
```

---

### Task 8: 破壊検証（7 経路）と CI で赤くなることの確認

**Files:**
- Create: `docs/superpowers/plans/2026-08-16-scan-target-integrity-verification.md`（検証記録）

**Interfaces:**
- Consumes: Task 3〜7 の全実装
- Produces: 検証記録（Issue へ貼る素材）

- [ ] **Step 1: 対照実行をまとめて取る**

```bash
cd /home/vscode/tasuki-work
git status --porcelain   # 空であることを確認（変異検査が要求する）
node scripts/list-scan-targets.mjs shell | wc -l
node scripts/list-scan-targets.mjs script-tests | wc -l
node scripts/audit-structure.mjs | tail -20
node scripts/audit-log-hygiene.mjs
node scripts/check-links.mjs | tail -3
node scripts/mutation-check.mjs 2>&1 | tail -3
```

すべて緑であること、走査量が出ていることを記録する。

- [ ] **Step 2: 経路④の破壊検証**

```bash
mkdir -p deploy/timer && cat > deploy/timer/probe.sh <<'EOF'
#!/usr/bin/env bash
for f in $(ls *.txt); do echo "$f"; done
EOF
node scripts/list-scan-targets.mjs shell | grep -c 'deploy/timer/probe.sh'   # 0（未追跡なので出ない）
git add deploy/timer/probe.sh
node scripts/list-scan-targets.mjs shell | grep -c 'deploy/timer/probe.sh'   # 1 になったことを確認
targets="$(node scripts/list-scan-targets.mjs shell)"
shellcheck -x --source-path=deploy --severity=warning $targets; echo "exit=$?"
git rm -f --cached deploy/timer/probe.sh && rm -rf deploy/timer
```

期待: SC2045 で `exit=1`。**以前のグロブでは対象に入らず緑だった。**

- [ ] **Step 3: 経路⑬の破壊検証**

```bash
node scripts/list-scan-targets.mjs script-tests | grep -c 'scripts/lib/scan-targets.test.mjs'
```

期待: `1`。**列挙をハードコードしていた頃はここに現れなかった。**

除外側も確かめる。

```bash
node -e '
import("./scripts/list-scan-targets.mjs").then(m => {
  const r = m.selectTargets(["a.sh"], [{ prefix: ".specify/scripts/", reason: "x" }]);
  console.log(r.problems);
})'
```

期待: 「除外が 1 件も一致しません」が 1 件出る。

- [ ] **Step 4: 経路①②③⑧⑪の破壊検証をやり直す**

Task 4 Step 4 / Task 5 Step 6 / Task 6 Step 8 / Task 7 Step 6・Step 7 を、
**すべての実装が入った状態で**もう一度通す。各回で次を記録する。

1. 壊す前の緑と走査件数
2. 壊れたことの確認（`grep -c` や `ls | wc -l` の値）
3. 赤の終了コードとメッセージ本文
4. 戻した後に `git status --porcelain` が空であること

- [ ] **Step 5: 恒真化の確認（`diffTargets` を無力化する）**

```bash
cp scripts/lib/scan-targets.mjs /tmp/scan-targets.bak
python3 - <<'PY'
import io
p = "scripts/lib/scan-targets.mjs"
s = io.open(p, encoding="utf-8").read()
old = "  return {\n    missing: [...declaredSet].filter((x) => !actualSet.has(x)).sort(),\n    unexpected: [...actualSet].filter((x) => !declaredSet.has(x)).sort(),\n  };"
assert old in s
s = s.replace(old, "  return { missing: [], unexpected: [] };", 1)
io.open(p, "w", encoding="utf-8").write(s)
PY
grep -c 'return { missing: \[\], unexpected: \[\] };' scripts/lib/scan-targets.mjs   # 1 になったことを先に確認
node --test scripts/lib/scan-targets.test.mjs; echo "exit=$?"
cp /tmp/scan-targets.bak scripts/lib/scan-targets.mjs
git status --porcelain
```

期待: 単体テストが FAIL する（`exit=1`）。**通ってしまったらテストが恒真**なので、
そのケースを足してから先へ進む。

- [ ] **Step 6: CI で赤くなることを確認する**

```bash
git checkout -b tmp/135-break-verification
# 経路②を壊す（構造監査が対象を失う）
git mv packages/timer-core/test packages/timer-core/test-moved
git commit -m "test: 破壊検証（マージしない）"
git push -u origin tmp/135-break-verification
gh run list --branch tmp/135-break-verification --limit 3
```

`quality` ジョブが赤くなることを確認し、**run の URL を控える**。確認後に片付ける。

```bash
git push origin --delete tmp/135-break-verification
git checkout feature/135-scan-target-integrity
git branch -D tmp/135-break-verification
```

- [ ] **Step 7: 検証記録を書いてコミット**

`docs/superpowers/plans/2026-08-16-scan-target-integrity-verification.md` に、
7 経路 × 4 段（対照 / 壊れた確認 / 赤の本文 / 復旧）と CI の run URL を表で残す。

```bash
git add docs/superpowers/plans/2026-08-16-scan-target-integrity-verification.md
git commit -m "test: 7 経路の破壊検証の記録を残す（#135）

- 各経路で対照実行・壊れたことの確認・赤の本文・復旧の 4 段を記録
- diffTargets を無力化して単体テストが落ちることも確認（恒真化の検査）
- CI が赤くなる実 run の URL つき"
```

---

### Task 9: 規範と文書

**Files:**
- Create: `docs/adr/0014-scan-target-integrity.md`
- Modify: `docs/adr/0009-ci-scope-and-checks.md`（2026-08-12 の追記から参照）
- Modify: `.specify/memory/constitution.md`（原則 VII の適用範囲）
- Modify: `docs/guides/development.md`（新パッケージ追加時の手順）

**Interfaces:**
- Consumes: Task 6 Step 7 で控えた「測り直した指標値」
- Produces: なし

- [ ] **Step 1: ADR-0014 を書く**

まず `docs/adr/template.md` を読み、節の構成をそれに合わせる。次の骨子で書く。

```markdown
# ADR-0014: 検査の走査対象は宣言と実体の照合で決める

- **状態**: 採択
- **日付**: 2026-08-16
- **関連**: Issue #135 / ADR-0009（CI が守る範囲と検査の配置）/ 憲法 原則 VII

## 背景

リポジトリの検査は走査対象をそれぞれの流儀で決めていた。ハードコードの配列、
非再帰のグロブ、実行時に静かに空になる走査。#70 の最終レビューで 4 経路、
その後 #116・#119・#103・#126 から 8 経路の申し送りが入り、うち 7 経路が
「宣言と実体がずれても誰も言わない」という同一の機序だった。

構造監査が走査対象を失って全指標 PASS の表を出す穴は、#72 が
パッケージを移設した瞬間に踏む。ログ衛生が新設パッケージを見ない穴は、
packages/rate-limit で**一度実際に踏んでいる**（人が気づくまで緑だった）。

## 決定

1. **走査対象は宣言し、実体と全単射で照合する。** 「宣言にあるが実在しない」
   「実在するが宣言に無い」のどちらでも落とす（MUST）。片方向では、
   移設と新設のどちらかが必ず素通りする。
2. **除外には理由を書く**（MUST）。除外に書いた対象が実在しなくなったら落とす。
3. **実体の権威はツール自身。** workspace は `pnpm -r list --depth -1 --json`、
   ファイルは `git ls-files`。`pnpm-workspace.yaml` の手解析も、
   `git ls-files '*package.json'` による代替も禁ずる（MUST NOT）。
   どちらも pnpm の解決規則の自作再実装であり、glob が変われば黙ってずれる。
4. **リンク検査は追跡下の全 `*.md` を全分割する**（MUST）。
   「各エントリが 1 件以上に一致すること」では塞げない。エントリを削除すれば
   照合対象ごと消えるため、対策のつもりで同じ穴を再生産することになる。
5. **走査対象の拡大と存在判定の拡大を混同しない**（MUST NOT）。
   存在判定を未追跡ファイルへ広げると、ローカル緑・CI 赤の食い違いを生む。
6. **走査量を常に出力する**（MUST）。緑のときも「何を何件見たか」を出す。
7. **計測器の健全性は合否を持つ。** ADR-0009 D2 の「構造監査は値を出すだけ」は
   **測定値**についての決定であり、走査対象を失ったまま全指標 PASS の表を
   出すことまでは許していない。測定値は落ちない、計測器は落ちる。
8. **件数の下限を直書きしない**（MUST NOT）。ファイルが減るたびに下限を
   下げるのが赤を消す最短経路になり、対応表から項目を消すのと同じ穴になる。

## 塞げていないこと

**変異検査の対応表は、項目と patch ファイルを両方消せば全単射が保たれたまま通る。**
決定 8 により件数の下限では塞げない。patch ファイルの削除が diff に現れることを
レビューの拠り所とする。**この限界は既知であり、緑は「対応表が健全である」ことを
証明しない。**

`scripts/` は `package.json` を持たないため、`mutation-check` の
`detectRunner` で走者を決められず、共有モジュール自身を変異検査で守れない。

## 影響

（Task 6 Step 7 で控えた、構造監査の走査拡大で動いた指標値をここに書く。
数値の正本は docs/superpowers/specs/2026-08-16-scan-target-integrity-design.md）
```

- [ ] **Step 2: ADR 0009 から参照させる**

`docs/adr/0009-ci-scope-and-checks.md` の「追記（2026-08-12・#70 最終レビュー）」に、
#135 で塞いだこと・残した限界・ADR-0014 へのリンクを足す。D2 の記述には
「走査対象の健全性は例外で、合否を持つ（ADR-0014）」と一文を足す。

- [ ] **Step 3: 憲法 原則 VII に適用範囲を書く**

`.specify/memory/constitution.md` の「### VII. 検査は壊して確かめる」に、
**MUST を増やさず**、既存 MUST の適用範囲として 1 項目を足す。

```markdown
- 検査の健全性には**走査対象の健全性**を含む。対象を失った検査・対象を
  最初から見ていない検査は、赤にならないまま何も検証しない（docs/adr/0014）
```

- [ ] **Step 4: 開発ガイドに手順を書く**

`docs/guides/development.md` に節を足す。**新しいパッケージを足すと CI が赤くなる**こと、
赤を消す正しい手順（走査対象に入れる／理由つきで除外する）、
**「宣言から消す」で赤を消してはいけない**ことを書く。

- [ ] **Step 5: リンク検査を通す**

```bash
node scripts/check-links.mjs; echo "exit=$?"
```

期待: `exit=0`。ADR-0014 は `docs/adr/` 配下なので LIVE_DOCS に入り、
書いたパスがすべて実在することまで検査される。

- [ ] **Step 6: コミット**

```bash
git add docs/adr/0014-scan-target-integrity.md docs/adr/0009-ci-scope-and-checks.md \
        .specify/memory/constitution.md docs/guides/development.md
git commit -m "docs: 走査対象の健全性を ADR-0014 として制定する（#135）

- 宣言と実体の全単射・権威はツール自身・走査量の出力を決定として記録
- 計測器の健全性は合否を持つ（ADR 0009 D2 の測定値の合否とは別）
- 経路①を塞ぎきれないことを限界として明記
- 憲法 原則 VII に適用範囲を追記（MUST は増やさない）"
```

---

### Task 10: Issue の整理と振り返り

**Files:**
- Create: `docs/retrospectives/2026-08-16-issue-135-scan-target-integrity.md`

**Interfaces:**
- Consumes: Task 8 の検証記録、Task 6 の測り直した値
- Produces: なし

- [ ] **Step 1: #135 の本文とタイトルを更新する**

タイトルを「検査が静かに効かなくなる経路を塞ぐ（走査対象の健全性）」に変える。
本文の完了条件を EARS（spec §6.1 の E1〜E11）へ置き換え、範囲が 7 経路であること、
切り出した 4 本の Issue 番号を書く。

```bash
gh issue edit 135 --title "検査が静かに効かなくなる経路を塞ぐ（走査対象の健全性）"
```

- [ ] **Step 2: 新しい Issue を 4 本起票する**

spec §7 の表のとおり。**起票時に現行 main で各前提を測り直す**（Issue 本文の前提が
古いまま着手される事故が 5 回起きている）。

| Issue | 中身 |
|---|---|
| B群 | pnpm 供給網設定の退化を検出する（⑤⑥⑦⑫） |
| D-1 | Constitution Check ゲートの空文化（plan 36 件中 4 件） |
| D-2 | `check-links` が見ていない表記（⑩＋ #70 deferred 2 件） |
| D-3 | ログ衛生の射程に `.tsx` を含めるか（既存 6 件の扱い） |

- [ ] **Step 3: 振り返りを書く**

`docs/guides/retrospective.md` の様式に従う。少なくとも次を書く。

- **設計の対策そのものが同じ穴を持っていた**（`LIVE_DOCS` を「各エントリが 1 件以上に
  一致すること」で守ろうとして、削除には無力だった）
- **git の pathspec で `**` は特別扱いされず `*` と同義。** `scripts/**/*.test.mjs` は
  直下を静かに取りこぼす。**「0 件を返す」と書いた当初の記述は測定こそ正しかったが
  一般化が誤りで、しかも危険の向きが逆だった**（空振りが露見するのではなく、
  一部だけ一致して残りが落ちる）。塞ごうとしている性質を対策の記述が持っていた
- **`| xargs` は GitHub Actions で失敗を握り潰す**（既定シェルが `pipefail` を立てない）
- **走査を広げたら数字が動いた**（構造監査の測り直し。Task 6 Step 7 の値）
- 経路①を塞ぎきれないと認めたこと

- [ ] **Step 4: DoD を確認して PR を出す**

```bash
node --test $(node scripts/list-scan-targets.mjs script-tests)
node scripts/audit-structure.mjs
node scripts/audit-log-hygiene.mjs
node scripts/check-links.mjs
node scripts/mutation-check.mjs
pnpm typecheck && pnpm lint && pnpm test
```

すべて緑を確認してから PR を作る。本文には次を必ず書く。

- DoD 項目 2（E2E）は該当なし — 利用者の通る経路は変わらない
- DoD 項目 4（変異による恒真化確認）は部分的 — `mutation-check` の `detectRunner` が
  `package.json` 依存で `scripts/` を扱えない。手動の破壊検証で代替した（Task 8 Step 5）
- 経路①は塞ぎきれない（対応表と patch を両方消せば通る）

- [ ] **Step 5: コミット**

```bash
git add docs/retrospectives/2026-08-16-issue-135-scan-target-integrity.md
git commit -m "docs: #135 の振り返りを書く

- 対策そのものが同じ穴を持っていた例を 2 件記録
- git pathspec の ** と Actions の pipefail の罠を残す"
```
