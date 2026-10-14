# テストの重さに合わせた進め方（#387）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 変異検査を「触った所だけ」流せるようにし、対照実行の重複を省き、E2E の同期サーバーにだけルーム枠を広げて渡す。

**Architecture:** 選び方と引数の解釈は純粋関数として `scripts/lib/mutation-select.mjs` に置き、対照実行の使い回しは `scripts/lib/mutation-control-cache.mjs` に置く。`scripts/mutation-check.mjs` は `main()` の配線だけを変える（#380 と同じファイルなので触る面を小さくする）。E2E はハーネスが同期サーバーへ渡す env を関数に切り出し、`MAX_ROOMS` を足す。

**Tech Stack:** Node（`node:test`・追加依存なし）／Playwright のハーネス（TypeScript・vitest）／git

**Spec:** [`docs/superpowers/specs/2026-10-14-test-weight-design.md`](../specs/2026-10-14-test-weight-design.md)

## Constitution Check

憲法（[`docs/constitution.md`](../../constitution.md) v2.1.4）のコンプライアンスゲート。

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. テスト駆動開発 | 通過 | Task 1〜5・8 はすべて赤いテストから始める。条件 1〜3 はそれぞれ 1 つの条件にしか当たらない造作で見る |
| II. 技術選定は ADR を通す | 該当なし | 新しい技術・依存を足さない（Node 標準と既存の Playwright のハーネスだけ） |
| III. 揮発インメモリと単純運用 | 通過 | 製品の状態の持ち方に触れない。本番の `MAX_ROOMS` の既定は変えない（E2E の同期サーバーにだけ渡す） |
| IV. 境界の型安全 | 該当なし | wire・コマンド・フレームに触れない |
| V. 実画面検証 | 通過 | 画面に触れない。E2E 全件をルーム枠を広げた同期サーバーで流し、起動ログの `maxRooms` を見る（Task 8） |
| VI. 依存は内向き | 該当なし | パッケージ間の依存を足さない |
| VII. 検査は壊して確かめる | 通過 | 選び方そのものに変異 m186・m187 を足す（Task 5）。配線のテストは生きたロックを先に置き、壊れた配線でも変異を当てない（Task 4） |
| VIII. 記録が正本 | 通過 | 決定と実測は設計正本、計画で決めた追補（`--base` など）は設計正本へ書き戻す（Task 6） |
| IX. 小さく回す | 通過 | PR を 2 本に分ける。配布は伴わない（scripts と e2e だけ） |
| X. 抽象は実需で | 通過 | パッケージ間の依存をたどる選び方・変異の並列化・E2E の選び方は作らない（設計正本 §3） |
| XI. 秘密と個人情報を持ち込まない | 該当なし | ログ・秘密の扱いに触れない |

**逸脱なし。**

## Global Constraints

- **CI の流し方は変えない**（`.github/workflows/ci.yml`・`scripts/ci-scope.mjs` は触らない。変異も E2E も全件のまま）
- **scripts に追加依存を入れない**（Node 標準と `scripts/lib/*` だけ）
- **本番の `MAX_ROOMS` の既定（`apps/tasuki-sync/src/config.ts` の 100）と `TEST_MAX_ROOMS` は変えない**
- 選び方の指定（`--changed` / `--id` / `--pkg`）は 1 回に 1 つ。混ぜたらエラー
- `--id` の未知の番号・`--pkg` の 0 件はエラー。`--changed` の 0 件は終了コード 0
- 変異検査の機構が差分に入っていたら、`--changed` は全件に倒す（fail-open）
- 手引き（`docs/guides/development.md`）に実測の秒数を書かない
- コメント・docstring・コミットの本文は日本語。コミットの末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **サブエージェントは push・マージ・`git checkout --`・`git stash`・`git reset` をしない**（統括が行う）

## 設計からの追補（この計画で決めたこと）

1. **`--base <ref>` を足す**（`--changed` と一緒にだけ使える。既定は `origin/main`）。PR 1 の枝は機構そのものを変えるので、
   `origin/main` を基準にすると常に全件へ倒れ、`--changed` の実地確認ができない。積み上げた枝でも使える
2. **未知の引数はエラーにする**。いまの `main()` は `--full` 以外を黙って無視するので、`--help` や `--chaged` の打ち間違いで
   全件（CI で約 9 分）が走る（メモリに罠として記録済み）。選び方を足すとこの罠の当たり方が増えるので、同じ PR で塞ぐ
3. **差分は `git diff --name-only --no-renames`** で取る。既定の改名検出は旧パスを出さず、パッケージの外へ移したファイルの元の側を落とす
4. **機構のファイルは `mutation-check.mjs` の相対 import を 1 段だけたどって導く**（`scripts/lib/*.mjs` は Node 標準以外を import していない。
   2 段目が生まれたら `mechanismFilesFrom` の docstring の注意どおり広げる）

## Review Focus

1. **打ち間違いの指定（`--chaged`・`--id150`・位置引数）** → 全件が黙って走らず、エラーで止まる（Task 1 のテスト）
2. **`--pkg apps/timer-web/`（末尾のスラッシュ）や `--pkg apps/timer`（前方一致）** → 前者は受け付け、後者は timer-web に当たらず 0 件のエラー（Task 1・Task 2 のテスト）
3. **`origin/main` が無い・古い** → 無ければ全件に倒れて理由が出る。古ければ多めに選ぶだけ（Task 2 のテスト・Task 4 の実地確認）
4. **パッケージの外へのファイルの移動（改名）** → 旧パスの側の変異も選ばれる（Task 4 の `--no-renames`・Task 2 のテスト）
5. **`--id 150,,151`・`--id 0`・`--id abc`** → エラー（Task 1 のテスト）

---

## ファイルの地図

| ファイル | 役割 | PR |
|---|---|---|
| `scripts/lib/mutation-select.mjs`（新設） | 引数の解釈・変異の選び方・機構のファイルの導出・表題の文言 | 1 |
| `scripts/lib/mutation-select.test.mjs`（新設） | 上の自己テスト | 1 |
| `scripts/lib/mutation-control-cache.mjs`（新設） | 対照実行の使い回し | 1 |
| `scripts/lib/mutation-control-cache.test.mjs`（新設） | 上の自己テスト | 1 |
| `scripts/mutation-check.mjs` | 冒頭の使い方の注釈・`main()` の配線・`MUTATIONS` に 2 件 | 1 |
| `scripts/mutation-check.test.mjs` | 配線のテスト（未知の引数・混ぜた指定・未知の番号で何も実行せずに止まる） | 1 |
| `scripts/mutations/m186-*.patch`・`m187-*.patch`（新設） | 選び方への変異 | 1 |
| `docs/guides/development.md`・`AGENTS.md` | 段ごとに何を流すか | 1 |
| `e2e/harness/sync.ts` | 同期サーバーへ渡す env を `syncEnv` に切り出し `MAX_ROOMS` を足す | 2 |
| `e2e/tests/sync-env.test.ts`（新設） | 上のテスト | 2 |
| `e2e/specs/{layout,roulette,topic,timer-a11y,timer}.spec.ts` | 「枠 100 ぎりぎり」「既定 50」の注釈を直す | 2 |

**枝**: PR 1 は今の枝 `docs/issue-387-test-weight-design`（設計正本と計画も同じ PR に入る）。PR 2 は main から `feature/issue-387-e2e-room-cap`。

---

## PR 1: 変異検査の絞り込み

### Task 1: 引数の解釈（`parseSelector`）

**Files:**
- Create: `scripts/lib/mutation-select.mjs`
- Create: `scripts/lib/mutation-select.test.mjs`

**Interfaces:**
- Produces: `parseSelector(args: string[]) => Selector`。`args` は `process.argv.slice(2)`。
  `Selector` は `{ kind: "all" } | { kind: "id", ids: number[] } | { kind: "pkg", pkg: string } | { kind: "changed", base: string }`。
  不正な指定は `Error` を投げる（メッセージは日本語）。`--full` は読み飛ばす（`main()` が別に見る）

- [ ] **Step 1: 失敗するテストを書く**

`scripts/lib/mutation-select.test.mjs`:

```js
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseSelector } from "./mutation-select.mjs";

/**
 * `scripts/lib/mutation-select.mjs` の自己テスト（#387）。
 *
 * 変異検査の「選んで流す」指定の解釈と、変異の選び方を見る。
 * **打ち間違いが黙って全件実行に化けないこと**を、選び方そのものと同じ重さで見る
 * （以前の `main()` は `--full` 以外の引数を黙って無視し、`--help` で全件が走った）。
 */

describe("parseSelector: 指定の解釈", () => {
  test("指定が無ければ全件", () => {
    assert.deepEqual(parseSelector([]), { kind: "all" });
  });

  test("--full は選び方に関わらない（読み飛ばす）", () => {
    assert.deepEqual(parseSelector(["--full"]), { kind: "all" });
    assert.deepEqual(parseSelector(["--full", "--pkg", "apps/x"]), { kind: "pkg", pkg: "apps/x" });
  });

  test("--changed の基準は既定で origin/main、--base で変えられる", () => {
    assert.deepEqual(parseSelector(["--changed"]), { kind: "changed", base: "origin/main" });
    assert.deepEqual(parseSelector(["--changed", "--base", "HEAD~1"]), { kind: "changed", base: "HEAD~1" });
    assert.deepEqual(parseSelector(["--base", "HEAD~1", "--changed"]), { kind: "changed", base: "HEAD~1" });
  });

  test("--id はカンマ区切りの正の整数", () => {
    assert.deepEqual(parseSelector(["--id", "150,151"]), { kind: "id", ids: [150, 151] });
    assert.deepEqual(parseSelector(["--id", "7"]), { kind: "id", ids: [7] });
  });

  test("--pkg は末尾のスラッシュを落とす", () => {
    assert.deepEqual(parseSelector(["--pkg", "apps/timer-web/"]), { kind: "pkg", pkg: "apps/timer-web" });
  });

  test("未知の引数はエラー（打ち間違いで全件を走らせない）", () => {
    assert.throws(() => parseSelector(["--help"]), /未知の指定/);
    assert.throws(() => parseSelector(["--chaged"]), /未知の指定/);
    assert.throws(() => parseSelector(["--id150"]), /未知の指定/);
    assert.throws(() => parseSelector(["apps/x"]), /未知の指定/);
  });

  test("選び方の指定を 2 つ以上混ぜるとエラー", () => {
    assert.throws(() => parseSelector(["--changed", "--id", "1"]), /1 回に 1 つ/);
    assert.throws(() => parseSelector(["--pkg", "a", "--pkg", "b"]), /1 回に 1 つ/);
  });

  test("値の要る指定に値が無ければエラー", () => {
    assert.throws(() => parseSelector(["--id"]), /値が要ります/);
    assert.throws(() => parseSelector(["--pkg", "--full"]), /値が要ります/);
    assert.throws(() => parseSelector(["--changed", "--base"]), /値が要ります/);
  });

  test("--id の不正な値はエラー", () => {
    for (const bad of ["150,,151", "0", "abc", "1.5", "-1", "150,"]) {
      assert.throws(() => parseSelector(["--id", bad]), /正の整数/, bad);
    }
  });

  test("--pkg が空になる値はエラー", () => {
    assert.throws(() => parseSelector(["--pkg", "/"]), /--pkg/);
  });

  test("--base は --changed の無いところでは使えない", () => {
    assert.throws(() => parseSelector(["--base", "HEAD~1"]), /--changed と一緒に/);
    assert.throws(() => parseSelector(["--pkg", "a", "--base", "HEAD~1"]), /--changed と一緒に/);
  });
});
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `node --test scripts/lib/mutation-select.test.mjs`
Expected: FAIL（`Cannot find module` … `mutation-select.mjs`）

- [ ] **Step 3: 実装する**

`scripts/lib/mutation-select.mjs`:

```js
/**
 * 変異検査の「選んで流す」指定（#387・設計正本 `docs/superpowers/specs/2026-10-14-test-weight-design.md` §4）。
 *
 * 判定は純粋関数で、git にも fs にも触らない。材料（差分のファイル一覧・パッチが触るファイル）は
 * 呼び出し側（`scripts/mutation-check.mjs`）が集めて渡す。
 *
 * **手元の実装中のための仕組みであり、CI は全件のまま流す。** 選び漏れは CI の全件が拾う。
 * そのため選び方は「迷ったら多めに」へ倒し、同じパッケージの中だけを見る（パッケージ間の依存はたどらない）。
 */

/** 選び方の指定。1 回に 1 つだけ使える。 */
const SELECTOR_FLAGS = ["--changed", "--id", "--pkg"];
const KNOWN_FLAGS = new Set(["--full", "--base", ...SELECTOR_FLAGS]);

/**
 * 引数（`process.argv.slice(2)`）から選び方を組む。
 *
 * **知らない引数はエラーにする。** 以前の `main()` は `--full` 以外を黙って無視したので、
 * `--help` や打ち間違いで全件（CI で約 9 分）が走った。
 */
export function parseSelector(args) {
  const found = [];
  let base = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!KNOWN_FLAGS.has(arg)) {
      throw new Error(`未知の指定です: ${arg}（使えるのは ${[...KNOWN_FLAGS].join(" / ")}）`);
    }
    if (arg === "--full") continue;
    if (arg === "--changed") {
      found.push({ kind: "changed" });
      continue;
    }
    const value = args[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${arg} には値が要ります`);
    i++;
    if (arg === "--base") {
      base = value;
    } else if (arg === "--id") {
      const parts = value.split(",");
      if (!parts.every((p) => /^[1-9]\d*$/.test(p))) {
        throw new Error(`--id は正の整数をカンマで区切って書きます: ${value}`);
      }
      found.push({ kind: "id", ids: parts.map(Number) });
    } else {
      const pkg = value.replace(/\/+$/, "");
      if (pkg === "") throw new Error(`--pkg の値が空です: ${value}`);
      found.push({ kind: "pkg", pkg });
    }
  }
  if (found.length > 1) {
    throw new Error(`選び方の指定（${SELECTOR_FLAGS.join(" / ")}）は 1 回に 1 つだけです`);
  }
  const selector = found[0] ?? { kind: "all" };
  if (selector.kind === "changed") return { kind: "changed", base: base ?? "origin/main" };
  if (base !== null) throw new Error("--base は --changed と一緒にだけ使えます");
  return selector;
}
```

- [ ] **Step 4: 通ることを確かめる**

Run: `node --test scripts/lib/mutation-select.test.mjs`
Expected: PASS（11 件）

- [ ] **Step 5: コミット**

```bash
git add scripts/lib/mutation-select.mjs scripts/lib/mutation-select.test.mjs
git commit -m "feat: 変異検査の選び方の指定を解釈する（#387）" -m "- --changed / --id / --pkg と --base を読む
- 未知の引数はエラーにする（打ち間違いで全件が走らないように）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: 変異の選び方（`selectMutations`・`mechanismFilesFrom`・`formatSelectionHeader`）

**Files:**
- Modify: `scripts/lib/mutation-select.mjs`
- Modify: `scripts/lib/mutation-select.test.mjs`

**Interfaces:**
- Consumes: Task 1 の `Selector`
- Produces:
  - `selectMutations(mutations, resolved) => { selected: { mutation, reasons: string[] }[], fallbackToAll: string | null }`。
    `resolved` は `Selector` に、`kind: "changed"` のときだけ `changedFiles: string[] | null`・`mechanismFiles: string[]`・
    `patchDir: string`・`affectedFilesOf: (mutation) => string[]` を足したもの。パスはすべてリポジトリのルートからの相対（`/` 区切り）
  - `mechanismFilesFrom(source: string, selfRelPath: string) => string[]`
  - `formatSelectionHeader(selector, selection, total: number) => string`

- [ ] **Step 1: 失敗するテストを書く**

`scripts/lib/mutation-select.test.mjs` の import を `import { parseSelector, selectMutations, mechanismFilesFrom, formatSelectionHeader } from "./mutation-select.mjs";` にし、末尾へ足す:

```js
/**
 * 変異の造作。**条件ごとに 1 つの条件にしか当たらない変異を分けて置く**
 * （1 つの変異が 3 条件すべてに当たる造作では、どの条件を外しても緑のままになる）。
 */
const M_PKG = { id: 1, pkg: "apps/a", patch: "m01-a.patch" }; // パッチは apps/a/src/x.ts を触る
const M_OUTSIDE = { id: 2, pkg: "apps/b", patch: "m02-b.patch" }; // パッチは pkg の外の packages/c/src/y.ts を触る
const M_PATCH_ONLY = { id: 3, pkg: "apps/d", patch: "m03-d.patch" }; // パッチは apps/d/src/z.ts を触る
const M_PREFIX = { id: 4, pkg: "apps/a-x", patch: "m04-ax.patch" }; // apps/a の前方一致に化けてはならない
const MUTS = [M_PKG, M_OUTSIDE, M_PATCH_ONLY, M_PREFIX];
const TOUCHES = {
  1: ["apps/a/src/x.ts"],
  2: ["packages/c/src/y.ts"],
  3: ["apps/d/src/z.ts"],
  4: ["apps/a-x/src/w.ts"],
};

function changed(changedFiles) {
  return {
    kind: "changed",
    base: "origin/main",
    changedFiles,
    mechanismFiles: ["scripts/mutation-check.mjs", "scripts/lib/mutation-select.mjs"],
    patchDir: "scripts/mutations",
    affectedFilesOf: (m) => TOUCHES[m.id],
  };
}
const ids = (selection) => selection.selected.map((s) => s.mutation.id);

describe("selectMutations: --changed の選び方", () => {
  test("条件 1: pkg 配下の変更なら、パッチが触らないファイルでも選ぶ", () => {
    const s = selectMutations(MUTS, changed(["apps/a/src/other.ts"]));
    assert.deepEqual(ids(s), [1]);
    assert.equal(s.fallbackToAll, null);
    assert.match(s.selected[0].reasons.join(), /pkg 配下/);
  });

  test("条件 1 は前方一致に化けない（apps/a の変更で apps/a-x を選ばない）", () => {
    assert.deepEqual(ids(selectMutations(MUTS, changed(["apps/a/README.md"]))), [1]);
    assert.deepEqual(ids(selectMutations(MUTS, changed(["apps/a-x/src/w2.ts"]))), [4]);
  });

  test("条件 2: パッチが pkg の外を触るとき、その外のファイルの変更で選ぶ", () => {
    const s = selectMutations(MUTS, changed(["packages/c/src/y.ts"]));
    assert.deepEqual(ids(s), [2]);
    assert.match(s.selected[0].reasons.join(), /パッチが触る/);
  });

  test("条件 3: パッチのファイル自体の変更で選ぶ", () => {
    const s = selectMutations(MUTS, changed(["scripts/mutations/m03-d.patch"]));
    assert.deepEqual(ids(s), [3]);
    assert.match(s.selected[0].reasons.join(), /パッチ自体/);
  });

  test("どれにも当たらなければ 0 件（全件に倒さない）", () => {
    const s = selectMutations(MUTS, changed(["docs/x.md", "packages/other/src/q.ts"]));
    assert.deepEqual(ids(s), []);
    assert.equal(s.fallbackToAll, null);
  });

  test("機構のファイルが差分にあれば全件に倒し、理由にそのファイルを出す", () => {
    const s = selectMutations(MUTS, changed(["scripts/lib/mutation-select.mjs"]));
    assert.deepEqual(ids(s), [1, 2, 3, 4]);
    assert.match(s.fallbackToAll, /scripts\/lib\/mutation-select\.mjs/);
  });

  test("差分が取れなければ（null）全件に倒す", () => {
    const s = selectMutations(MUTS, changed(null));
    assert.deepEqual(ids(s), [1, 2, 3, 4]);
    assert.match(s.fallbackToAll, /差分が取れない/);
  });

  test("改名の両側（--no-renames で旧パスも来る）のどちらでも選ぶ", () => {
    // apps/a から packages/moved へ移したとき、差分には旧パスも新パスも並ぶ
    assert.deepEqual(ids(selectMutations(MUTS, changed(["apps/a/src/x.ts", "packages/moved/x.ts"]))), [1]);
  });
});

describe("selectMutations: --id / --pkg / 全件", () => {
  test("全件はすべてを宣言の順に返す", () => {
    assert.deepEqual(ids(selectMutations(MUTS, { kind: "all" })), [1, 2, 3, 4]);
  });

  test("--id は指定した番号だけを宣言の順に返す", () => {
    assert.deepEqual(ids(selectMutations(MUTS, { kind: "id", ids: [3, 1] })), [1, 3]);
  });

  test("--id に宣言に無い番号があればエラー", () => {
    assert.throws(() => selectMutations(MUTS, { kind: "id", ids: [1, 99] }), /宣言に無い変異の番号です: 99/);
  });

  test("--pkg は pkg の完全一致（前方一致にしない）", () => {
    assert.deepEqual(ids(selectMutations(MUTS, { kind: "pkg", pkg: "apps/a" })), [1]);
  });

  test("--pkg に属する変異が 0 件ならエラー（打ち間違いを 0 件の緑にしない）", () => {
    assert.throws(() => selectMutations(MUTS, { kind: "pkg", pkg: "apps" }), /属する変異はありません/);
  });
});

describe("mechanismFilesFrom: 機構のファイルを import から導く", () => {
  test("自分自身と、相対 import のファイルを返す（node: の import は含めない）", () => {
    const source = [
      'import fs from "node:fs";',
      'import { a } from "./lib/scan-targets.mjs";',
      "import { b } from './lib/direct-run.mjs';",
      'import {\n  c,\n  d,\n} from "./lib/mutation-select.mjs";',
    ].join("\n");
    assert.deepEqual(mechanismFilesFrom(source, "scripts/mutation-check.mjs"), [
      "scripts/mutation-check.mjs",
      "scripts/lib/scan-targets.mjs",
      "scripts/lib/direct-run.mjs",
      "scripts/lib/mutation-select.mjs",
    ]);
  });
});

describe("formatSelectionHeader: 表題で全件と絞り込みを取り違えない", () => {
  const sel = (n) => ({ selected: Array.from({ length: n }), fallbackToAll: null });
  test("全件", () => {
    assert.equal(formatSelectionHeader({ kind: "all" }, sel(155), 155), "全件実行: 155 件");
  });
  test("絞り込み", () => {
    assert.equal(
      formatSelectionHeader({ kind: "changed", base: "origin/main" }, sel(18), 155),
      "絞り込み実行（--changed・基準 origin/main）: 155 件中 18 件",
    );
    assert.equal(formatSelectionHeader({ kind: "pkg", pkg: "apps/a" }, sel(3), 155), "絞り込み実行（--pkg apps/a）: 155 件中 3 件");
    assert.equal(formatSelectionHeader({ kind: "id", ids: [1, 2] }, sel(2), 155), "絞り込み実行（--id 1,2）: 155 件中 2 件");
  });
  test("全件に倒したときは理由を出す", () => {
    assert.equal(
      formatSelectionHeader({ kind: "changed", base: "origin/main" }, { selected: sel(155).selected, fallbackToAll: "差分が取れない" }, 155),
      "絞り込み実行（--changed・基準 origin/main）: 全件に倒しました —— 差分が取れない（155 件）",
    );
  });
});
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `node --test scripts/lib/mutation-select.test.mjs`
Expected: FAIL（`selectMutations` などが export されていない）

- [ ] **Step 3: 実装する**

`scripts/lib/mutation-select.mjs` の先頭（docstring の前）に `import path from "node:path";` を足し、末尾へ次を足す:

```js
/**
 * 変異を選ぶ。`resolved` は {@link parseSelector} の結果に、`--changed` のときだけ材料を足したもの。
 * 返す順は宣言（`mutations`）の順。
 */
export function selectMutations(mutations, resolved) {
  const pick = (list, reasons) => list.map((mutation) => ({ mutation, reasons }));
  switch (resolved.kind) {
    case "all":
      return { selected: pick(mutations, []), fallbackToAll: null };
    case "id": {
      const known = new Set(mutations.map((m) => m.id));
      const unknown = resolved.ids.filter((id) => !known.has(id));
      if (unknown.length > 0) throw new Error(`宣言に無い変異の番号です: ${unknown.join(", ")}`);
      const wanted = new Set(resolved.ids);
      return { selected: pick(mutations.filter((m) => wanted.has(m.id)), ["--id"]), fallbackToAll: null };
    }
    case "pkg": {
      const hits = mutations.filter((m) => m.pkg === resolved.pkg);
      if (hits.length === 0) {
        throw new Error(`--pkg ${resolved.pkg} に属する変異はありません（宣言の pkg と完全一致で比べます）`);
      }
      return { selected: pick(hits, ["--pkg"]), fallbackToAll: null };
    }
    case "changed":
      return selectByChange(mutations, resolved);
    default:
      throw new Error(`未対応の選び方です: ${resolved.kind}`);
  }
}

/**
 * `--changed` の選び方（設計正本 §4.2）。次のどれかに当たる変異を選ぶ。
 *
 * 1. 差分に、その変異の `pkg` 配下のファイルがある（パッケージ単位で多めに選ぶ）
 * 2. 差分に、そのパッチが触るファイルがある（`pkg` の外を変異させる場合）
 * 3. 差分に、そのパッチのファイル自体がある
 *
 * **全件に倒す**: 差分が取れない（`changedFiles === null`）か、変異検査の機構が差分にあるとき。
 * 迷ったら多く流す（`scripts/ci-scope.mjs` と同じ fail-open の向き）。
 */
function selectByChange(mutations, { changedFiles, mechanismFiles, patchDir, affectedFilesOf }) {
  const all = (reason) => ({
    selected: mutations.map((mutation) => ({ mutation, reasons: [reason] })),
    fallbackToAll: reason,
  });
  if (changedFiles === null) return all("差分が取れない");
  const changed = new Set(changedFiles);
  const touchedMechanism = mechanismFiles.filter((f) => changed.has(f));
  if (touchedMechanism.length > 0) return all(`変異検査の機構が変わった（${touchedMechanism.join(", ")}）`);

  const selected = [];
  for (const mutation of mutations) {
    const reasons = [];
    // `${pkg}/` で比べる。`apps/a` が `apps/a-x` に前方一致で当たらないように
    if (changedFiles.some((f) => f.startsWith(`${mutation.pkg}/`))) reasons.push(`pkg 配下の変更（${mutation.pkg}）`);
    if (affectedFilesOf(mutation).some((f) => changed.has(f))) reasons.push("パッチが触るファイルの変更");
    if (changed.has(`${patchDir}/${mutation.patch}`)) reasons.push("パッチ自体の変更");
    if (reasons.length > 0) selected.push({ mutation, reasons });
  }
  return { selected, fallbackToAll: null };
}

/**
 * 変異検査の機構のファイル（自分自身と、その相対 import）を、ソースから導く。
 * 一覧をコードに列挙しない —— 列挙は import を足したときに腐る。
 *
 * **たどるのは 1 段だけ。** いま `scripts/lib/*.mjs` は Node 標準以外を import していない。
 * lib が別の lib を import するようになったら、ここを再帰にする。
 */
export function mechanismFilesFrom(source, selfRelPath) {
  const dir = path.posix.dirname(selfRelPath);
  const files = [selfRelPath];
  for (const m of source.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
    files.push(path.posix.join(dir, m[1]));
  }
  return files;
}

/** 結果の表題。**全件の緑と絞り込みの緑を取り違えない**ために、絞り込みは必ずそう書く。 */
export function formatSelectionHeader(selector, { selected, fallbackToAll }, total) {
  if (selector.kind === "all") return `全件実行: ${total} 件`;
  const label =
    selector.kind === "changed"
      ? `--changed・基準 ${selector.base}`
      : selector.kind === "pkg"
        ? `--pkg ${selector.pkg}`
        : `--id ${selector.ids.join(",")}`;
  if (fallbackToAll !== null) return `絞り込み実行（${label}）: 全件に倒しました —— ${fallbackToAll}（${total} 件）`;
  return `絞り込み実行（${label}）: ${total} 件中 ${selected.length} 件`;
}
```

- [ ] **Step 4: 通ることを確かめる**

Run: `node --test scripts/lib/mutation-select.test.mjs`
Expected: PASS（Task 1 の 11 件と合わせて全件）

- [ ] **Step 5: 条件を 1 つずつ外して赤を見る（コミット前・手で戻す）**

`selectByChange` の条件 1・2・3 の行をそれぞれ 1 行ずつコメントアウトし、そのつど
`node --test scripts/lib/mutation-select.test.mjs` が**対応するテストだけで**落ちることを見る。見たらエディタで元に戻す
（`git checkout --` は使わない。この時点では未コミットの実装を消す）。
Expected: 条件 1 → 「条件 1」のテスト、条件 2 → 「条件 2」、条件 3 → 「条件 3」が FAIL

- [ ] **Step 6: コミット**

```bash
git add scripts/lib/mutation-select.mjs scripts/lib/mutation-select.test.mjs
git commit -m "feat: 差分から流す変異を選ぶ（#387）" -m "- pkg 配下・パッチが触るファイル・パッチ自体のどれかが変わった変異を選ぶ
- 機構が変わったか差分が取れなければ全件に倒す
- 表題で全件と絞り込みを取り違えないようにする

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: 対照実行の使い回し（`createControlCache`）

**Files:**
- Create: `scripts/lib/mutation-control-cache.mjs`
- Create: `scripts/lib/mutation-control-cache.test.mjs`

**Interfaces:**
- Produces: `createControlCache(keyOf: (mutation) => string, run: (mutation) => R) => { run(mutation): R & { reused: boolean }, readonly reusedCount: number }`

- [ ] **Step 1: 失敗するテストを書く**

`scripts/lib/mutation-control-cache.test.mjs`:

```js
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createControlCache } from "./mutation-control-cache.mjs";

/**
 * 対照実行の使い回し（#387・設計正本 §4.3）の自己テスト。
 * 同じ鍵の 2 回目以降は実行せずに最初の結果を返し、違う鍵は必ず実行することを、
 * 実行の回数で見る。
 */
describe("createControlCache", () => {
  test("同じ鍵は 1 回だけ実行し、2 回目以降は最初の結果を reused 付きで返す", () => {
    const calls = [];
    const cache = createControlCache(
      (m) => m.key,
      (m) => {
        calls.push(m.id);
        return { passed: true, command: `cmd-${m.key}` };
      },
    );
    assert.deepEqual(cache.run({ id: 1, key: "a" }), { passed: true, command: "cmd-a", reused: false });
    assert.deepEqual(cache.run({ id: 2, key: "a" }), { passed: true, command: "cmd-a", reused: true });
    assert.deepEqual(calls, [1]);
    assert.equal(cache.reusedCount, 1);
  });

  test("違う鍵は使い回さない", () => {
    const calls = [];
    const cache = createControlCache(
      (m) => m.key,
      (m) => {
        calls.push(m.id);
        return { passed: true };
      },
    );
    cache.run({ id: 1, key: "a" });
    cache.run({ id: 2, key: "b" });
    cache.run({ id: 3, key: "a" });
    assert.deepEqual(calls, [1, 2]);
    assert.equal(cache.reusedCount, 1);
  });
});
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `node --test scripts/lib/mutation-control-cache.test.mjs`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: 実装する**

`scripts/lib/mutation-control-cache.mjs`:

```js
/**
 * 対照実行の使い回し（#387・設計正本 `docs/superpowers/specs/2026-10-14-test-weight-design.md` §4.3）。
 *
 * 変異検査は変異ごとに「当てる前の素のコードで同じコマンドが通るか」を流していた。同じテストを
 * 対象にする変異が並ぶと同じ対照を何十回も流し、vitest では時間の約半分がこれだった（PR #384 の CI で約 220 秒）。
 *
 * **使い回してよい根拠**: 各変異の後に、作業ツリーが HEAD に戻ったことを `isRestoredToHead` で確かめ、
 * 戻らなければ実行を止めている。2 回目以降の対照は、同じ木の上で同じコマンドを流すことになる。
 *
 * 鍵は呼び出し側が決める（cwd とコマンドと引数）。1 回の実行の中だけで持ち、ディスクには残さない。
 */
export function createControlCache(keyOf, run) {
  const results = new Map();
  let reused = 0;
  return {
    run(mutation) {
      const key = keyOf(mutation);
      if (results.has(key)) {
        reused++;
        return { ...results.get(key), reused: true };
      }
      const result = run(mutation);
      results.set(key, result);
      return { ...result, reused: false };
    },
    get reusedCount() {
      return reused;
    },
  };
}
```

- [ ] **Step 4: 通ることを確かめる**

Run: `node --test scripts/lib/mutation-control-cache.test.mjs`
Expected: PASS（2 件）

- [ ] **Step 5: コミット**

```bash
git add scripts/lib/mutation-control-cache.mjs scripts/lib/mutation-control-cache.test.mjs
git commit -m "feat: 変異検査の対照実行を使い回す仕組みを足す（#387）" -m "- 同じコマンドの対照実行は 1 回の実行の中で 1 度だけ流す

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: `mutation-check.mjs` の配線

**Files:**
- Modify: `scripts/mutation-check.mjs`（冒頭の注釈の使い方・import・`main()`。宣言の表 `MUTATIONS` はこのタスクでは触らない）
- Modify: `scripts/mutation-check.test.mjs`（「エントリポイントの判定」の describe の後ろに足す）

**Interfaces:**
- Consumes: Task 1〜3 の `parseSelector`・`selectMutations`・`mechanismFilesFrom`・`formatSelectionHeader`・`createControlCache`
- Produces: CLI `node scripts/mutation-check.mjs [--full] [--changed [--base <ref>] | --id <n,...> | --pkg <dir>]`

- [ ] **Step 1: 失敗する配線のテストを書く**

`scripts/mutation-check.test.mjs` の「同時実行のロック」の describe の前へ足す。既存の「symlink 経由で起動しても main() が走る」テストが
`spawnSync` でスクリプトを起動している形に合わせる:

```js
describe("選び方の指定の配線（#387）", () => {
  // **何も実行せずに止まること**を見る。指定の誤りで止まる経路は、ロック・作業ツリーの検査・変異の適用より前にある。
  // ここが配線されていないと、打ち間違いが黙って全件実行（CI で約 9 分）に化ける。
  //
  // **生きたロックを先に置く。** 配線が壊れていても本体はロックで止まり、変異を当てない
  // （このテストが全件実行や変異の適用を引き起こさない）。正しい配線ならロックより前に指定の誤りで止まるので、
  // 期待の文言はロックの文言と区別できる。形は「同時実行のロック」の配線のテストと同じ。
  const run = (...args) => {
    const lockPath = path.join(WORKSPACE_ROOT, "scripts/mutations/.lock");
    assert.equal(fs.existsSync(lockPath), false, "先行するロックが残っている");
    fs.writeFileSync(lockPath, String(process.pid), "utf8");
    try {
      return spawnSync("node", ["scripts/mutation-check.mjs", ...args], {
        cwd: WORKSPACE_ROOT,
        encoding: "utf8",
        timeout: 60_000,
      });
    } finally {
      if (fs.existsSync(lockPath)) fs.rmSync(lockPath);
    }
  };

  test("未知の指定はエラーで止まり、変異を 1 件も流さない", () => {
    const r = run("--help");
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /未知の指定です: --help/);
    assert.doesNotMatch(r.stdout, /--- 変異 #/);
  });

  test("選び方を混ぜるとエラーで止まる", () => {
    const r = run("--changed", "--id", "1");
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /1 回に 1 つ/);
  });

  test("宣言に無い番号はエラーで止まる", () => {
    const r = run("--id", "99999");
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /宣言に無い変異の番号です: 99999/);
  });
});
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `node --test --test-name-pattern="選び方の指定の配線" scripts/mutation-check.test.mjs`
Expected: FAIL（3 件とも）。今の main() は未知の指定を無視して進み、置いておいたロックで「別の実行（PID …）が走っています」と止まるので、
`stderr` に期待の文言が無い。**変異は 1 件も当たらない**。終わったら `git status --porcelain` が今足したテストのファイルだけであること、
`scripts/mutations/.lock` が残っていないことを見る

- [ ] **Step 3: import を足す**

`scripts/mutation-check.mjs` の `import { isDirectRun } from "./lib/direct-run.mjs";` の直後へ:

```js
import { parseSelector, selectMutations, mechanismFilesFrom, formatSelectionHeader } from "./lib/mutation-select.mjs";
import { createControlCache } from "./lib/mutation-control-cache.mjs";
```

- [ ] **Step 4: `main()` の直前に、差分と材料を集める関数を足す**

```js
/**
 * `--changed` の差分: 基準と HEAD の merge-base から HEAD までのコミット済みの変更（#387）。
 * 未コミットの変更は main() が実行を拒むので数えなくてよい。
 * **`--no-renames`**: 既定の改名検出は旧パスを出さず、パッケージの外へ移したファイルの元の側を落とす。
 * 取れなければ null を返し、選び方の側が全件に倒す。
 */
function changedFilesSince(base) {
  try {
    const opts = { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };
    const mergeBase = execFileSync("git", ["merge-base", base, "HEAD"], opts).trim();
    return execFileSync("git", ["diff", "--name-only", "--no-renames", mergeBase, "HEAD"], opts)
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  } catch {
    return null;
  }
}

/** parseSelector の結果に、`--changed` のときだけ選び方の材料を足す。 */
function resolveSelector(selector) {
  if (selector.kind !== "changed") return selector;
  const self = fileURLToPath(import.meta.url);
  return {
    ...selector,
    changedFiles: changedFilesSince(selector.base),
    mechanismFiles: mechanismFilesFrom(fs.readFileSync(self, "utf8"), path.relative(REPO_ROOT, self)),
    patchDir: path.relative(REPO_ROOT, MUTATIONS_DIR),
    affectedFilesOf: (m) => affectedFilesOf(path.join(MUTATIONS_DIR, m.patch)),
  };
}

/** 対照実行の使い回しの鍵。cwd（pkg）と、実際に流すコマンドと引数。 */
function controlKeyOf(mutation, full) {
  const runner = detectRunner(path.join(WORKSPACE_ROOT, mutation.pkg));
  return JSON.stringify([mutation.pkg, buildCommand(runner, mutation, full)]);
}
```

- [ ] **Step 5: `main()` の冒頭を差し替える**

`function main() {` から `acquireLock();` の直前までを次にする（`const full = …` の行を置き換える）:

```js
function main() {
  const full = process.argv.includes("--full");

  // **指定の誤りはロックより前に止める。** 何も触らずに終わらせるため（#387）。
  let selector;
  let selection;
  try {
    selector = parseSelector(process.argv.slice(2));
    selection = selectMutations(MUTATIONS, resolveSelector(selector));
  } catch (e) {
    console.error(`[mutation-check] ${e.message}`);
    process.exit(1);
  }
  const header = formatSelectionHeader(selector, selection, MUTATIONS.length);
  if (selection.selected.length === 0) {
    // `--changed` の 0 件は正常な結果（docs だけの枝など）。--id / --pkg の 0 件は selectMutations がエラーにする
    console.log(`[mutation-check] ${header}。この差分に該当する変異はありません。`);
    process.exit(0);
  }
```

- [ ] **Step 6: 表示とループを差し替える**

`console.log(\`[mutation-check] 変異数: ${MUTATIONS.length}\n\`);` を次にする:

```js
  console.log(`[mutation-check] ${header}\n`);
  const startedAt = Date.now();
  let controlMs = 0;
  const controls = createControlCache(
    (m) => controlKeyOf(m, full),
    (m) => {
      const t = Date.now();
      const r = runTests(m, full);
      controlMs += Date.now() - t;
      return r;
    },
  );
```

`for (const mutation of MUTATIONS) {` と、その直後の `console.log(\`--- 変異 #…\`);` を次にする:

```js
  for (const { mutation, reasons } of selection.selected) {
    console.log(`--- 変異 #${mutation.id}: ${mutation.label} ---`);
    if (selector.kind === "changed" && selection.fallbackToAll === null) {
      console.log(`  選んだ理由: ${reasons.join("・")}`);
    }
```

`const control = runTests(mutation, full);` を `const control = controls.run(mutation);` にし、
`console.log(\`  対照: ○ 通過（${control.command}）\`);` を次にする:

```js
    console.log(`  対照: ○ 通過${control.reused ? "（使い回し）" : ""}（${control.command}）`);
```

（その直後の「出力の末尾 3 行」の表示はそのまま。使い回しでも最初の出力が出る）

- [ ] **Step 7: 結果表の後に所要時間を出す**

`console.log("\n=== 変異検査 結果表 ===");` を `console.log(\`\n=== 変異検査 結果表（${header}）===\`);` にし、
結果表の `for` ループの直後（`const undetected = …` の前）へ:

```js
  const sec = (ms) => (ms / 1000).toFixed(0);
  console.log(
    `\n[mutation-check] 所要時間: ${sec(Date.now() - startedAt)} 秒` +
      `（対照実行 ${sec(controlMs)} 秒・対照の使い回し ${controls.reusedCount} 回・変異 ${results.length} 件）`,
  );
```

最後の成功の文言 `"\n[mutation-check] 全変異が検出されました（ベースラインとして妥当）。"` は、絞り込みのときに嘘になるので次にする:

```js
  console.log(
    selector.kind === "all" || selection.fallbackToAll !== null
      ? "\n[mutation-check] 全変異が検出されました（ベースラインとして妥当）。"
      : `\n[mutation-check] 選んだ ${results.length} 件の変異がすべて検出されました（全件ではありません。全件は CI が流します）。`,
  );
```

- [ ] **Step 8: 冒頭の注釈の使い方を直す**

ファイル冒頭の docstring の `node scripts/mutation-check.mjs --full   変異の属するパッケージ全体を実行` の行の後に足す:

```
 *   node scripts/mutation-check.mjs --changed           origin/main との差分に関係する変異だけ（#387）
 *   node scripts/mutation-check.mjs --changed --base <ref>  基準を変える（積み上げた枝・機構を変えた枝）
 *   node scripts/mutation-check.mjs --id 150,151        番号で選ぶ
 *   node scripts/mutation-check.mjs --pkg apps/roulette-web  pkg の完全一致で選ぶ
 *   選び方は 1 回に 1 つ。知らない指定はエラー。CI は指定なし（全件）で流す。
 *   選び方の規則は scripts/lib/mutation-select.mjs と設計正本
 *   docs/superpowers/specs/2026-10-14-test-weight-design.md §4。
```

（既存の行の書式・桁揃えに合わせる）

- [ ] **Step 9: 自己テストを通す**

Run: `node --test scripts/mutation-check.test.mjs scripts/lib/mutation-select.test.mjs scripts/lib/mutation-control-cache.test.mjs`
Expected: PASS（「選び方の指定の配線」の 3 件を含む全件）

- [ ] **Step 10: コミット**

```bash
git add scripts/mutation-check.mjs scripts/mutation-check.test.mjs
git commit -m "feat: 変異検査を選んで流せるようにする（#387）" -m "- --changed / --base / --id / --pkg を main() に配線する
- 同じコマンドの対照実行を使い回し、所要時間と使い回しの回数を出す
- 未知の指定はロックより前にエラーで止める

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 11: 実地確認（統括が行う・手元・約 10 分）**

1. `node scripts/mutation-check.mjs --changed` → この枝は機構を変えているので「全件に倒しました —— 変異検査の機構が変わった（scripts/mutation-check.mjs, …）」が出る。**出たら Ctrl-C で止める**（止めた後 `git status --porcelain` が空であることを見る）
2. 捨てる枝で `--base` を確かめる:
   ```bash
   git switch -c tmp/387-probe
   printf '\n' >> apps/roulette-web/src/roulette-view.ts && git commit -qam "tmp"
   node scripts/mutation-check.mjs --changed --base HEAD~1
   ```
   Expected: 「絞り込み実行（--changed・基準 HEAD~1）: N 件中 18 件」前後（roulette-web の変異の数。`grep -c 'pkg: "apps/roulette-web"' scripts/mutation-check.mjs` で照合する。
   パッチが roulette-web の外から roulette-web のファイルを触る変異があればその分増える）。各変異に「選んだ理由: pkg 配下の変更（apps/roulette-web）」。
   最後に所要時間の行。**対照の使い回しが 0 回でない**こと
   ```bash
   git switch docs/issue-387-test-weight-design && git branch -D tmp/387-probe
   ```
3. `node scripts/mutation-check.mjs --changed --base HEAD`（差分 0）→ 「この差分に該当する変異はありません」で終了コード 0
4. `node scripts/mutation-check.mjs --changed --base no-such-ref` → 「全件に倒しました —— 差分が取れない」が出たら Ctrl-C

### Task 5: 選び方そのものへの変異（m186・m187）

**Files:**
- Create: `scripts/mutations/m186-select-without-pkg-rule.patch`
- Create: `scripts/mutations/m187-select-without-mechanism-fallback.patch`
- Modify: `scripts/mutation-check.mjs`（`MUTATIONS` の末尾へ 2 件）

**番号**: 着手時に `grep -o "id: [0-9]*" scripts/mutation-check.mjs | awk '{print $2}' | sort -n | tail -1` で最大番号を見て、その次の 2 つを使う
（2026-10-14 時点は 185 → 186・187）。#380（別セッション）が同じ表を触っているので、**PR の前に main を取り込んで衝突を見る**。番号を変えたらパッチのファイル名と中身の見出しの番号も直す。

- [ ] **Step 1: 作業ツリーが clean であることを見る**

Run: `git status --porcelain`
Expected: 空（Task 4 までコミット済み）。**空でなければ先へ進まない**（パッチを作る手順は `git checkout --` で戻すので、未コミットの実装を消す）

- [ ] **Step 2: m186 のパッチを作る**

`scripts/lib/mutation-select.mjs` の `selectByChange` から、条件 1 の 1 行
`if (changedFiles.some((f) => f.startsWith(\`${mutation.pkg}/\`))) reasons.push(\`pkg 配下の変更（${mutation.pkg}）\`);`
（とその直前の注釈 1 行）を消して:

```bash
{ cat <<'EOF'
# 変異 186: --changed の条件 1（pkg 配下の変更で選ぶ）を外す
#
# 検出を期待するテスト:
#   - scripts/lib/mutation-select.test.mjs
#     「条件 1: pkg 配下の変更なら、パッチが触らないファイルでも選ぶ」
#
# 適用: リポジトリルートから git apply scripts/mutations/m186-*.patch
# 復元: git apply -R scripts/mutations/m186-*.patch
#
# #387。条件 1 が無いと、パッチが触るファイル以外の変更（同じパッケージのテストや隣のモジュール）で
# 変異が選ばれず、検出力が落ちた変異を手元で見逃す。
EOF
git diff -- scripts/lib/mutation-select.mjs; } > scripts/mutations/m186-select-without-pkg-rule.patch
git checkout -- scripts/lib/mutation-select.mjs
```

- [ ] **Step 3: m187 のパッチを作る**

`selectByChange` から `if (touchedMechanism.length > 0) return all(…);` の 1 行を消して:

```bash
{ cat <<'EOF'
# 変異 187: 変異検査の機構が変わっても全件に倒さない
#
# 検出を期待するテスト:
#   - scripts/lib/mutation-select.test.mjs
#     「機構のファイルが差分にあれば全件に倒し、理由にそのファイルを出す」
#
# 適用: リポジトリルートから git apply scripts/mutations/m187-*.patch
# 復元: git apply -R scripts/mutations/m187-*.patch
#
# #387。機構を変えた枝で --changed が機構の変異だけ（あるいは 0 件）を流し、
# 変えた機構が他の変異の検出を壊していても手元で気づけなくなる。
EOF
git diff -- scripts/lib/mutation-select.mjs; } > scripts/mutations/m187-select-without-mechanism-fallback.patch
git checkout -- scripts/lib/mutation-select.mjs
```

- [ ] **Step 4: 宣言を足す**

`MUTATIONS` の最後の要素の後ろへ（既存の `pkg: "scripts"` の項目と同じ形）:

```js
  {
    id: 186,
    label: "--changed の条件 1（pkg 配下の変更で選ぶ）を外す",
    patch: "m186-select-without-pkg-rule.patch",
    pkg: "scripts",
    tests: ["lib/mutation-select.test.mjs"],
    note: "#387。**対応表より後に足した変異。** 選び方そのものが静かに狭まると、手元で流すべき変異を流さなくなる。",
  },
  {
    id: 187,
    label: "変異検査の機構が変わっても --changed を全件に倒さない",
    patch: "m187-select-without-mechanism-fallback.patch",
    pkg: "scripts",
    tests: ["lib/mutation-select.test.mjs"],
    note: "#387。**対応表より後に足した変異。** 機構を変えた枝で、変えた機構の影響を手元で見ない。",
  },
```

- [ ] **Step 5: パッチが当たることを見る**

Run: `node --test --test-name-pattern="宣言した変異が当たること" scripts/mutation-check.test.mjs`
Expected: PASS

- [ ] **Step 6: コミット**（変異検査は作業ツリーが clean でないと走らないので、検出の確認より先にコミットする）

```bash
git add scripts/mutations/m186-select-without-pkg-rule.patch scripts/mutations/m187-select-without-mechanism-fallback.patch scripts/mutation-check.mjs
git commit -m "test: 変異検査の選び方に変異を 2 件足す（#387）" -m "- m186: --changed の pkg 配下の条件を外す
- m187: 機構が変わっても全件に倒さない

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: 2 件が検出されることを見る**

Run: `node scripts/mutation-check.mjs --id 186,187`
Expected: 表題「絞り込み実行（--id 186,187）: 155 件中 2 件」・2 件とも「○ 検出された」・終了コード 0・`git status --porcelain` が空

### Task 6: 手引きと AGENTS.md

**Files:**
- Modify: `docs/guides/development.md`（「**変異検査は作業ツリーが汚れていると実行できません。**」で始まる段落の直前）
- Modify: `AGENTS.md:53`

- [ ] **Step 1: 手引きに節を足す**

`docs/guides/development.md` の上記の段落の直前へ:

```markdown
**変異検査と E2E は、段ごとに流す範囲を変えます**（#387・設計正本 [`2026-10-14-test-weight-design.md`](../superpowers/specs/2026-10-14-test-weight-design.md)）。
CI は変異も E2E も全件を流し続けます。手元で絞った分の漏れは CI が拾います。

| 段 | 変異検査 | E2E |
|---|---|---|
| 実装中（タスクごと） | `--changed`、または `--pkg <触ったパッケージ>` | 触った画面の spec だけ（`cd e2e && pnpm exec playwright test specs/<名前>.spec.ts`） |
| PR を出す前 | `--changed` | 全件（`pnpm e2e`） |
| CI | 全件（指定なし） | 全件 |

- `--changed` は `origin/main` との差分から、**同じパッケージの中で**関係する変異を選びます（パッケージ間の依存はたどりません）。
  変異検査の機構（`scripts/mutation-check.mjs` とその import）が差分にあると全件に倒れます。その枝で絞りたいときは `--base <ref>` で基準を変えます
- 実行の最後に**所要時間**が出ます。計画の検証の見積もりは、直前の実行のこの行を根拠にします（手引きには秒数を書きません）
- 知らない指定（`--help` を含む）はエラーで止まります
```

- [ ] **Step 2: AGENTS.md の行を直す**

`- \`node scripts/mutation-check.mjs\` — 変異検査` を次にする:

```markdown
- `node scripts/mutation-check.mjs` — 変異検査（全件。手元の実装中は `--changed` / `--pkg <dir>` / `--id <番号>` で絞る。段ごとの使い分けは `docs/guides/development.md`）
```

- [ ] **Step 3: 設計正本へ追補を書き戻す**

`docs/superpowers/specs/2026-10-14-test-weight-design.md` の §4.1 のコードブロックに
`node scripts/mutation-check.mjs --changed --base HEAD~1   # 基準を変える（--changed と一緒にだけ）` を足し、箇条に次の 2 つを足す:

```markdown
- `--base <ref>` で `--changed` の基準を変えられる（既定は `origin/main`）。変異検査の機構そのものを変える枝は、`origin/main` を基準にすると常に全件へ倒れるため（2026-10-14 の計画で追補）
- **知らない指定はエラーで止める**（`--help` を含む）。以前は `--full` 以外を黙って無視し、打ち間違いで全件が走った（2026-10-14 の計画で追補）
```

§4.2 の「差分」の段落の `git merge-base origin/main HEAD` を `git merge-base <基準> HEAD` に、`--name-only` の説明に
「`--no-renames` で改名の両側を拾う」を足す。

- [ ] **Step 4: リンク検査**

Run: `node scripts/check-links.mjs`
Expected: `リンク検査 OK`

- [ ] **Step 5: コミット**

```bash
git add docs/guides/development.md AGENTS.md docs/superpowers/specs/2026-10-14-test-weight-design.md
git commit -m "docs: 段ごとに流す検査の範囲を手引きに書く（#387）" -m "- 実装中・PR 前・CI で変異検査と E2E の流し方を分ける

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: PR 1 の検証と提出（統括が行う）

- [ ] **Step 1: scripts の自己テスト全件**（約 2 分）

Run: `bash -c 'set -euo pipefail; targets="$(node scripts/list-scan-targets.mjs script-tests)"; node --test $targets'`
Expected: 全件 PASS。**新設の `scripts/lib/*.test.mjs` 2 本が対象に入っていること**を出力で見る

- [ ] **Step 2: 構造監査とリンク検査**（1 分未満）

Run: `node scripts/audit-structure.mjs && node scripts/check-links.mjs && pnpm lint`
Expected: すべて成功

- [ ] **Step 3: 全件の変異検査を手元で 1 回**（10〜15 分の見込み。背景で起動して完了通知を待つ）

Run: `node scripts/mutation-check.mjs > <scratchpad>/mut-full.log 2>&1; echo exit=$?`
Expected: exit=0・表題「全件実行: 155 件」・「所要時間」の行・対照の使い回しが 100 回前後（推測）。**見積もりの 2 倍（30 分）を超えたら止めて利用者に報告する**

- [ ] **Step 4: main を取り込んで #380 との衝突を見る**

Run: `git fetch origin && git merge-base --is-ancestor origin/main HEAD || git rebase origin/main`
衝突したら、#380 が分けた先の形に合わせて宣言 2 件と `main()` の差分を当て直し、Step 1 と `--id 186,187` を流し直す

- [ ] **Step 5: push と PR**

PR の本文は `.claude/rules/git-workflow.md` の構成（概要・変更内容・テスト方法）。`Refs #387`（**閉じない**。PR 2 が残る。閉鎖キーワードを地の文に書かない）。
末尾に `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

- [ ] **Step 6: CI を待つ**（約 10 分）

Expected: すべて緑。`quality` の変異検査のステップの所要時間を、PR #384 の 557 秒と並べて PR にコメントする（使い回しの効果の実測）

- [ ] **Step 7: `/code-review <PR 番号>` を流し、指摘を直す**

---

## PR 2: E2E のルーム枠

### Task 8: ハーネスが同期サーバーへ渡す env

**枝**: `git switch main && git pull && git switch -c feature/issue-387-e2e-room-cap`

**Files:**
- Modify: `e2e/harness/sync.ts`（`spawn` の `env` を関数に切り出す）
- Create: `e2e/tests/sync-env.test.ts`

**Interfaces:**
- Produces: `export const E2E_MAX_ROOMS = 1000;`・`export function syncEnv(base: NodeJS.ProcessEnv, port: number): NodeJS.ProcessEnv`

- [ ] **Step 1: 失敗するテストを書く**

`e2e/tests/sync-env.test.ts`（既存の `e2e/tests/*.test.ts` の import と書き方に合わせる。vitest）:

```ts
import { describe, expect, it } from 'vitest';
import { E2E_MAX_ROOMS, syncEnv } from '../harness/sync';

/**
 * E2E のハーネスが同期サーバーへ渡す env（#387）。
 * ルーム枠だけを E2E 用に広げ、本番と同じ経路を通すための値（NODE_ENV など）は変えないことを見る。
 */
describe('syncEnv', () => {
  it('ルーム枠を E2E 用に広げる（手元の env に MAX_ROOMS があっても上書きする）', () => {
    const env = syncEnv({ MAX_ROOMS: '5' }, 1234);
    expect(env['MAX_ROOMS']).toBe(String(E2E_MAX_ROOMS));
    // 本番の既定（100）より広いこと。等しいと「広げた」が恒真になる
    expect(E2E_MAX_ROOMS).toBeGreaterThan(100);
  });

  it('本番と同じ経路を通す値はそのまま渡す', () => {
    const env = syncEnv({ PATH: '/bin' }, 1234);
    expect(env['PORT']).toBe('1234');
    expect(env['HOST']).toBe('127.0.0.1');
    expect(env['NODE_ENV']).toBe('production');
    expect(env['PATH']).toBe('/bin');
  });
});
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `cd e2e && pnpm exec vitest run tests/sync-env.test.ts`
Expected: FAIL（`syncEnv` が export されていない）

- [ ] **Step 3: 実装する**

`e2e/harness/sync.ts` の `SYNC_SERVERS` の定義の後に足し、`spawn` の `env: { … }` を `env: syncEnv(process.env, server.port),` にする。
**既存の `NODE_ENV` の注釈（#103 の理由）は関数の中へそのまま移す**:

```ts
/**
 * E2E の同期サーバーのルーム枠（#387）。
 *
 * **本番の既定（`apps/tasuki-sync/src/config.ts` の 100）は変えない。** E2E 全件が 100 をちょうど使い切り、
 * 検査を足すたびに既存の検査を 1 ルームへ畳む作業が要っていた（#316・#348・#94）。
 * 枠いっぱいの挙動を E2E で確かめている spec は無い（枠の拒否は `apps/tasuki-sync` の単体テストが見る）。
 * 接続数（`MAX_CONNECTIONS`）など他の枠は変えていない。
 */
export const E2E_MAX_ROOMS = 1000;

/** 同期サーバーへ渡す env。手元の env を引き継ぎ、E2E が決める値で上書きする。 */
export function syncEnv(base: NodeJS.ProcessEnv, port: number): NodeJS.ProcessEnv {
  return {
    ...base,
    PORT: String(port),
    HOST: '127.0.0.1',
    ALLOWED_ORIGINS: LOCAL_BASE_URL,
    // （既存の NODE_ENV の注釈をここへ移す）
    NODE_ENV: 'production',
    MAX_ROOMS: String(E2E_MAX_ROOMS),
  };
}
```

- [ ] **Step 4: 通ることを確かめる**

Run: `cd e2e && pnpm exec vitest run tests/sync-env.test.ts && pnpm typecheck`
Expected: PASS・型検査も成功

- [ ] **Step 5: spec の注釈を直す**

次の 6 か所を読み、「枠 100 ぎりぎりなので 1 ルームにまとめる」という**理由の書き方**を、「（以前は枠 100 ぎりぎりだったので）まとめた。
#387 で E2E の枠は広げたが、動いている検査なのでほどかない」という**経緯の書き方**へ直す。検査のコードは触らない。

- `e2e/specs/layout.spec.ts:423` と `:609`
- `e2e/specs/roulette.spec.ts:8`（「ルームを作るのはこの 1 本だけ」は事実なので残し、理由の部分だけ直す）
- `e2e/specs/topic.spec.ts:603`
- `e2e/specs/timer-a11y.spec.ts:248`
- `e2e/specs/timer.spec.ts:671`（「`maxRooms`（既定 50）」は古い。既定は 100、E2E では `E2E_MAX_ROOMS`）

確認: `grep -rn "ルーム枠\|maxRooms" e2e/specs` の残りが、本番の枠の話（タグの注釈）だけであること

- [ ] **Step 6: 実地確認（約 2 分）**

Run: `pnpm e2e`
Expected: 全件 PASS。続けて同期サーバーのログ（`e2e/harness/paths.ts` の `LOG_DIR` の `tasuki-sync.log`）で起動行の `maxRooms` が 1000 であることを見る:
`grep -o '"maxRooms":[0-9]*\|maxRooms[^,]*' <LOG_DIR>/tasuki-sync.log | head -1`

- [ ] **Step 7: コミット・push・PR・`/code-review`**

```bash
git add e2e/harness/sync.ts e2e/tests/sync-env.test.ts e2e/specs
git commit -m "test: E2E の同期サーバーにだけルーム枠を広げて渡す（#387）" -m "- E2E 全件が枠 100 をちょうど使い切り、検査を足すたびに既存の検査を畳んでいた
- 本番の既定と単体テストの枠は変えない

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

PR は `Refs #387`。PR 1 と PR 2 の両方がマージされたら、Issue #387 を閉じる（Task 9）。

### Task 9: Issue の後始末（統括が行う・利用者に確認してから）

- [ ] Issue #387 に、設計正本 §2 の実測（手元の E2E 1.3 分・CI の e2e 約 3 分・約 10 分は quality）と、PR 1 の CI で測った変異検査の所要時間をコメントする
- [ ] PR 1・PR 2 がマージされたら close する
- [ ] メモリ（ロードマップ・`tasuki-dev-environment`・`estimate-verification-time-in-plans`）を書き換える

---

## 検証の見積もり

| 検証 | 1 回 | 回数 | 小計 |
|---|---|---|---|
| 単体の自己テスト（Task 1〜5 の各 Step） | 数秒〜30 秒 | 約 15 回 | 約 5 分 |
| `--id 186,187` | 約 1 分 | 1〜2 回 | 約 2 分 |
| 実地確認（Task 4 Step 11） | 1〜3 分 | 4 回 | 約 10 分 |
| scripts の自己テスト全件 | 約 2 分 | 2 回 | 約 4 分 |
| 全件の変異検査（手元） | 10〜15 分（推測） | 1〜2 回 | 約 25 分 |
| CI（PR 1・PR 2） | 約 10 分 | 2〜3 回 | 約 25 分 |
| E2E 全件（PR 2） | 約 1.5 分 | 2 回 | 約 3 分 |

**機械の待ちは約 1 時間 15 分。** 実作業は 3〜4 時間（推測）。`/code-review` は PR ごとに 15〜30 分。
**どれかの検証が見積もりの 2 倍を超えたら、続ける前に利用者へ報告する。**
