import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  splitJobs,
  splitSteps,
  checkWorkflow,
  checkPackageJson,
  checkE2ePackageJson,
  findLiteralVersions,
} from "./audit-toolchain.mjs";

const DECLARED = Object.freeze({ node: "22.22.2", bun: "1.4.3", caddy: "2.11.7", pnpm: "11.28.8" });

const TOOLCHAIN_STEP = [
  "      - id: toolchain",
  "        run: |",
  '          node_version="$(jq -er .node toolchain.json)"',
  '          { echo "node=$node_version"; } >> "$GITHUB_OUTPUT"',
];

/** 正しい形の workflow（宣言から導いている）。 */
function workflow({ toolchain = TOOLCHAIN_STEP, node = "${{ steps.toolchain.outputs.node }}", bun = "${{ steps.toolchain.outputs.bun }}", caddyKey = "caddy-${{ steps.toolchain.outputs.caddy }}" } = {}) {
  return [
    "name: CI",
    "jobs:",
    "  ci:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@abc # v4",
    ...toolchain,
    "      - uses: actions/setup-node@abc # v4",
    "        with:",
    `          node-version: ${node}`,
    "      - uses: oven-sh/setup-bun@abc # v2",
    "        if: steps.scope.outputs.code == 'true'",
    "        with:",
    "          # 本番と揃える。2026-10-22 に 1.4.4 で落ちた",
    `          bun-version: ${bun}`,
    "      - name: Cache Caddy",
    "        uses: actions/cache@abc # v4",
    "        with:",
    "          path: ~/.cache/tasuki-e2e",
    `          key: ${caddyKey}`,
    "  docs:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - run: node scripts/check-links.mjs",
  ].join("\n");
}

describe("splitJobs / splitSteps: workflow を読む", () => {
  test("jobs の直下の名前ごとに分ける", () => {
    const jobs = splitJobs(workflow());
    assert.deepEqual(
      jobs.map((j) => j.name),
      ["ci", "docs"],
    );
  });

  test("ステップを「- 」の行ごとに分け、行番号を持つ", () => {
    const [ci] = splitJobs(workflow());
    const steps = splitSteps(ci.lines);
    assert.equal(steps.length, 5);
    assert.match(steps[0].text, /actions\/checkout/);
    assert.equal(typeof steps[0].line, "number");
  });
});

describe("checkWorkflow: CI は版を宣言から導く", () => {
  test("正しい形なら問題 0 件。setup-node・setup-bun・Caddy の鍵を数える", () => {
    const r = checkWorkflow(workflow(), DECLARED);
    assert.deepEqual(r.problems, []);
    assert.deepEqual(r.counts, { setupNode: 1, setupBun: 1, caddyCache: 1 });
  });

  test("node-version に版を直書きすると捕まえる（#487 以前の node-version: 22）", () => {
    const r = checkWorkflow(workflow({ node: "22" }), DECLARED);
    assert.ok(r.problems.some((p) => /setup-node/.test(p) && /node-version/.test(p)), r.problems.join("\n"));
  });

  test("bun-version に版を直書きすると捕まえる", () => {
    const r = checkWorkflow(workflow({ bun: "1.4.3" }), DECLARED);
    assert.ok(r.problems.some((p) => /setup-bun/.test(p)), r.problems.join("\n"));
  });

  test("Caddy のキャッシュの鍵を宣言から導かないと捕まえる", () => {
    const r = checkWorkflow(workflow({ caddyKey: "caddy-2.11.7" }), DECLARED);
    assert.ok(r.problems.some((p) => /Caddy/.test(p)), r.problems.join("\n"));
  });

  test("toolchain の段が無いのに出力を参照すると捕まえる（空の版で setup-node が既定の版を入れる）", () => {
    const r = checkWorkflow(workflow({ toolchain: [] }), DECLARED);
    assert.ok(r.problems.some((p) => /id: toolchain/.test(p)), r.problems.join("\n"));
  });

  test("toolchain の段が toolchain.json を読まないと捕まえる", () => {
    const fake = ["      - id: toolchain", '        run: echo "node=22" >> "$GITHUB_OUTPUT"'];
    const r = checkWorkflow(workflow({ toolchain: fake }), DECLARED);
    assert.ok(r.problems.some((p) => /toolchain\.json/.test(p)), r.problems.join("\n"));
  });

  test("toolchain の段が参照より後にあると捕まえる", () => {
    const text = workflow({ toolchain: [] }).replace(
      "  docs:",
      [...TOOLCHAIN_STEP, "  docs:"].join("\n"),
    );
    const r = checkWorkflow(text, DECLARED);
    assert.ok(r.problems.some((p) => /前/.test(p)), r.problems.join("\n"));
  });

  test("node-version-file で別のファイルから読ませると捕まえる（宣言が 2 つになる）", () => {
    const text = workflow().replace("node-version: ${{ steps.toolchain.outputs.node }}", "node-version-file: .nvmrc");
    const r = checkWorkflow(text, DECLARED);
    assert.ok(r.problems.some((p) => /node-version/.test(p)), r.problems.join("\n"));
  });
});

describe("findLiteralVersions: 宣言の版をそのまま写していないか", () => {
  test("コメントの外に宣言の版があれば行番号つきで返す", () => {
    const text = ["a: 1", "bun-version: 1.4.3", "# 1.4.3 はコメントなので数えない", "x: y # 2.11.7 も行末のコメント"].join("\n");
    assert.deepEqual(findLiteralVersions(text, DECLARED), [{ line: 2, tool: "bun", version: "1.4.3" }]);
  });

  test("版の一部として現れるだけなら数えない（11.4.3 や 1.4.30 は 1.4.3 ではない）", () => {
    const text = ["a: 11.4.3", "b: 1.4.30"].join("\n");
    assert.deepEqual(findLiteralVersions(text, DECLARED), []);
  });

  test("TS の行コメントとブロックコメントの中も数えない", () => {
    const text = ["// 2.11.7 へ上げた", " * 2.11.7 の理由", "const v = '2.11.7';"].join("\n");
    assert.deepEqual(findLiteralVersions(text, DECLARED), [{ line: 3, tool: "caddy", version: "2.11.7" }]);
  });
});

describe("checkPackageJson: engines と packageManager", () => {
  test("engines.node が宣言の下限と同じなら問題 0 件", () => {
    const pkg = { engines: { node: ">=22.22.2" }, packageManager: "pnpm@11.28.8" };
    assert.deepEqual(checkPackageJson(pkg, DECLARED), []);
  });

  test("engines.node が宣言とずれたら捕まえる（pnpm の警告の下限と、比べる下限が割れる）", () => {
    const pkg = { engines: { node: ">=22.13.0" }, packageManager: "pnpm@11.28.8" };
    assert.ok(checkPackageJson(pkg, DECLARED).some((p) => /engines\.node/.test(p)));
  });

  test("packageManager が pnpm@x.y.z でなければ捕まえる（corepack が版を決められない）", () => {
    const pkg = { engines: { node: ">=22.22.2" }, packageManager: "pnpm@11" };
    assert.ok(checkPackageJson(pkg, DECLARED).some((p) => /packageManager/.test(p)));
  });
});

describe("checkE2ePackageJson: Playwright の版は完全固定で揃っている", () => {
  test("@playwright/test と playwright-core が同じ x.y.z なら問題 0 件", () => {
    const pkg = { devDependencies: { "@playwright/test": "1.64.1", "playwright-core": "1.64.1" } };
    assert.deepEqual(checkE2ePackageJson(pkg), []);
  });

  test("範囲で書くと捕まえる（revision が install のたびに動く）", () => {
    const pkg = { devDependencies: { "@playwright/test": "^1.64.1", "playwright-core": "^1.64.1" } };
    assert.ok(checkE2ePackageJson(pkg).length > 0);
  });

  test("2 つの版がずれたら捕まえる（比べる revision と、動く Playwright の revision が割れる）", () => {
    const pkg = { devDependencies: { "@playwright/test": "1.64.1", "playwright-core": "1.63.0" } };
    assert.ok(checkE2ePackageJson(pkg).some((p) => /playwright-core/.test(p)));
  });
});
