import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseSelector, selectMutations, mechanismFilesFrom, formatSelectionHeader } from "./mutation-select.mjs";

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
    assert.deepEqual(parseSelector(["--changed"]), { kind: "changed", base: "origin/main", baseExplicit: false });
    assert.deepEqual(parseSelector(["--changed", "--base", "HEAD~1"]), { kind: "changed", base: "HEAD~1", baseExplicit: true });
    assert.deepEqual(parseSelector(["--base", "HEAD~1", "--changed"]), { kind: "changed", base: "HEAD~1", baseExplicit: true });
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

  test("改名で旧パスが差分に並べば、旧パス側で選ぶ（--no-renames は呼び出し側の責務）", () => {
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
