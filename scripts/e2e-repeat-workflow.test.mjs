/**
 * `.github/workflows/e2e-repeat.yml`（手動起動の E2E 繰り返し実行・#562）の自己テスト。
 *
 * 1. **ci.yml の e2e ジョブとの写しがずれない**: 準備の段（checkout から `pnpm build` まで。action の固定・版の読み方・
 *    Chromium と Caddy の取得とキャッシュ・版の検査に使う `pnpm install`）が、ci.yml と同じであること。
 *    ci.yml の `scope` の段とそれを見る `if:` だけが違う（手動のジョブは常に全部流す）ので、比べる前に外す。
 *    原則 X: 複製を減らす composite action・reusable workflow は、ci.yml の 5 ジョブが同じ準備を既に写している
 *    （ci.yml の中の写しはこのテストの対象ではない）ところへ 1 つ足すだけでは実需が足りないので採らない。
 *    ずれの検知はこのテストで足りる。ジョブが 3 つ以上で同じ手直しを繰り返すようになったら再検討する。
 * 2. **手動の測定用に留まる**: workflow_dispatch だけで、push・pull_request で走らない。権限は read。
 * 3. **測るための引数**: `--repeat-each`・`--retries=0`・JSON reporter。`--max-failures` は付けない。
 * 4. **local-check（pnpm check:full）が拾わない**: CI から手元の段を導くのは ci.yml だけ。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { splitJobs, splitSteps } from "./lib/workflow.mjs";
import { deriveChecks } from "./local-check.mjs";

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const CI = read(".github/workflows/ci.yml");
const REPEAT = read(".github/workflows/e2e-repeat.yml");

/** コメント行を外し、`scope` の段と、それを見る `if:` の条件を外す。 */
export function normalizeStep(text) {
  return text
    .split("\n")
    .filter((l) => !/^\s*#/.test(l) && l.trim() !== "")
    .map((l) =>
      l
        .replace(/^(\s*if: )steps\.scope\.outputs\.code == 'true' && /, "$1")
        .replace(/^\s*if: steps\.scope\.outputs\.code == 'true'\s*$/, ""),
    )
    .filter((l) => l !== "")
    .join("\n");
}

/** ジョブの準備の段（`pnpm build` まで）。`scope` の段は外す。 */
export function prepSteps(workflow, jobName) {
  const job = splitJobs(workflow).find((j) => j.name === jobName);
  assert.ok(job, `${jobName} ジョブがありません`);
  const steps = splitSteps(job.lines).map((s) => s.text);
  const end = steps.findIndex((s) => /^\s*- run: pnpm build\s*$/m.test(s.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n")));
  assert.ok(end >= 0, `${jobName} に pnpm build の段がありません`);
  return steps
    .slice(0, end + 1)
    .filter((s) => !/^\s*- id: scope\s*$/m.test(s.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n")))
    .map(normalizeStep);
}

describe("準備の段が ci.yml の e2e ジョブと同じ", () => {
  test("checkout・toolchain・setup-node・corepack・setup-bun・install・Caddy・Playwright・build が同じ", () => {
    const ci = prepSteps(CI, "e2e");
    const repeat = prepSteps(REPEAT, "e2e-repeat");
    assert.ok(ci.length >= 10, `ci.yml の準備の段が少なすぎます（${ci.length}）。読み違いの疑い`);
    assert.deepEqual(repeat, ci);
  });

  test("ずれたら捕まえる: action の固定・Chromium の取得・Playwright の版の読み方を変えた写しは同じと見なさない", () => {
    for (const [from, to] of [
      ["actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020", "actions/setup-node@v4"],
      ["playwright install --with-deps chromium", "playwright install chromium"],
      ["devDependencies['@playwright/test']", "devDependencies['playwright-core']"],
      ["key: playwright-${{ steps.playwright-version.outputs.version }}-chromium", "key: playwright-chromium"],
    ]) {
      assert.ok(REPEAT.includes(from), `前提: 写しに ${from} があること`);
      assert.notDeepEqual(prepSteps(REPEAT.replace(from, to), "e2e-repeat"), prepSteps(CI, "e2e"), from);
    }
  });
});

describe("手動の測定用に留まる", () => {
  const head = REPEAT.split(/^jobs:/m)[0];

  test("on は workflow_dispatch だけ。push・pull_request・schedule を持たない", () => {
    const on = /^on:\n((?:[ \t].*\n|\n)*)/m.exec(head)?.[1] ?? "";
    assert.match(on, /^ {2}workflow_dispatch:/m);
    assert.deepEqual([...on.matchAll(/^ {2}([\w-]+):/gm)].map((m) => m[1]), ["workflow_dispatch"]);
  });

  test("GITHUB_TOKEN の権限は contents: read だけ", () => {
    assert.match(head, /^permissions:\n {2}contents: read\n/m);
  });

  test("回数は選択式で上限があり、timeout-minutes を回数から決める", () => {
    const options = /options: \[([^\]]*)\]/.exec(head)?.[1].split(",").map((s) => Number(s.trim().replaceAll('"', "")));
    assert.ok(options && options.length > 0 && options.every(Number.isInteger));
    assert.match(REPEAT, /timeout-minutes: \$\{\{ fromJSON\(inputs\.repeat\) \* \d+ \+ \d+ \}\}/);
    assert.ok(Math.max(...options) * 6 + 15 <= 360, "上限が GitHub の最大（360 分）を超える");
  });
});

describe("測るための引数と結果の残し方", () => {
  const code = REPEAT.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

  test("--repeat-each は入力から・--retries=0・JSON reporter。--max-failures は付けない", () => {
    assert.match(code, /pnpm e2e -- --repeat-each="\$REPEAT" --retries=0 --reporter=list,json/);
    assert.match(code, /REPEAT: \$\{\{ inputs\.repeat \}\}/);
    assert.doesNotMatch(code, /max-failures/);
    assert.doesNotMatch(code, /run:.*\$\{\{ inputs\./);
  });

  test("集計は always で流し、結果を artifact に always で残す。集計の入力は reporter の出力先と同じ", () => {
    const steps = splitSteps(splitJobs(REPEAT)[0].lines).map((s) => s.text);
    const summarize = steps.find((s) => s.includes("scripts/summarize-e2e-repeat.mjs"));
    const upload = steps.find((s) => s.includes("actions/upload-artifact@"));
    assert.match(summarize, /if: always\(\)/);
    assert.match(summarize, /GITHUB_STEP_SUMMARY/);
    assert.match(upload, /if: always\(\)/);
    const out = /PLAYWRIGHT_JSON_OUTPUT_NAME: (.+)/.exec(code)?.[1];
    assert.equal(/RESULTS: (.+)/.exec(code)?.[1], out);
  });

  test("JSON の出力先の環境変数が turbo.json の e2e の passThroughEnv にある（strict モードで届く）", () => {
    const turbo = JSON.parse(read("turbo.json"));
    assert.ok(turbo.tasks.e2e.passThroughEnv.includes("PLAYWRIGHT_JSON_OUTPUT_NAME"));
  });
});

describe("local-check が拾わない", () => {
  test("手元の全件の段は ci.yml からだけ導く。e2e-repeat.yml の段は混ざらない", () => {
    assert.ok(!fs.readFileSync(new URL("./local-check.mjs", import.meta.url), "utf8").includes("e2e-repeat"));
    const commands = deriveChecks(CI).map((c) => c.command);
    assert.ok(!commands.some((c) => c.includes("--repeat-each") || c.includes("summarize-e2e-repeat")));
    // ci.yml の `pnpm e2e` は 1 回きりで、繰り返しの引数を持たない
    assert.ok(commands.includes("pnpm e2e"));
  });

  test("もし e2e-repeat.yml を渡されれば、CI 固有の env・式を再現できないと止まる（黙って段に入らない）", () => {
    assert.throws(() => deriveChecks(REPEAT));
  });
});
