/**
 * ci.yml の `e2e-webkit` ジョブ（WebKit の E2E・#674・docs/adr/0031 の追記）の自己テスト。
 *
 * 1. **e2e ジョブとの写しがずれない**: checkout から `pnpm build` までの準備の段が、e2e ジョブと同じであること。
 *    違ってよいのはブラウザの段だけ（キャッシュの鍵の末尾・`playwright install`・`install-deps` の対象）。
 *    写しを減らす composite action を採らない理由は `scripts/e2e-repeat-workflow.test.mjs` の冒頭と同じ
 *    （`scripts/local-check.mjs` が ci.yml の run の段からコマンドを導く前提が崩れる）。
 * 2. **流すのは `pnpm e2e:webkit`**（WebKit の版の確認と、@core・@webkit の絞り込みはその先にある）。
 *
 * 比べ方: 段のテキストからコメントと空行を外し、WebKit の側だけ「webkit」を「chromium」に読み替えて、e2e の段と比べる。
 * 読み替えが当たる段がブラウザの 3 段だけであることも見る（ほかの段に webkit の字が入ったら、読み替えで違いを隠さない）。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { splitJobs, splitSteps, stripComments } from "./lib/workflow.mjs";
import { normalizeStep } from "./lib/workflow-compare.mjs";

const CI = fs.readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

/** ジョブの段（正規化したテキスト）を、`pnpm build` まで（prep）とその後（rest）に分ける。 */
function stepsOf(workflow, jobName) {
  const job = splitJobs(workflow).find((j) => j.name === jobName);
  if (!job) throw new Error(`${jobName} ジョブがありません`);
  const steps = splitSteps(job.lines).map((s) => normalizeStep(s.text));
  const build = steps.findIndex((s) => /^\s*- run: pnpm build$/m.test(s));
  if (build < 0) throw new Error(`${jobName} に pnpm build の段がありません`);
  return { prep: steps.slice(0, build + 1), rest: steps.slice(build + 1) };
}

const asChromium = (step) => step.replaceAll("webkit", "chromium");

describe("e2e-webkit の準備の段が e2e ジョブと同じ（#674）", () => {
  test("ブラウザの段を読み替えれば、checkout から build まで同じ", () => {
    const e2e = stepsOf(CI, "e2e").prep;
    const webkit = stepsOf(CI, "e2e-webkit").prep;
    assert.ok(e2e.length >= 10, `e2e の準備の段が少なすぎます（${e2e.length}）。読み違いの疑い`);
    assert.deepEqual(webkit.map(asChromium), e2e);
  });

  test("読み替えが当たるのはブラウザの 3 段だけ（キャッシュの鍵・導入・OS の依存）", () => {
    const touched = stepsOf(CI, "e2e-webkit").prep.filter((s) => s.includes("webkit"));
    assert.equal(touched.length, 3, touched.join("\n---\n"));
    assert.ok(touched.some((s) => s.includes("key: playwright-${{ steps.playwright-version.outputs.version }}-webkit")));
    assert.ok(touched.some((s) => s.includes("playwright install --with-deps webkit")));
    assert.ok(touched.some((s) => s.includes("playwright install-deps webkit")));
  });

  test("ずれたら捕まえる: action の固定・版の読み方・scope の条件を変えた写しは同じと見なさない", () => {
    const job = (text) => stepsOf(text, "e2e-webkit").prep.map(asChromium);
    const e2e = stepsOf(CI, "e2e").prep;
    const webkitStart = CI.indexOf("  e2e-webkit:");
    assert.ok(webkitStart > 0, "前提: e2e-webkit ジョブがあること");
    const head = CI.slice(0, webkitStart);
    const tail = CI.slice(webkitStart);
    for (const [from, to] of [
      ["actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020", "actions/setup-node@v4"],
      ["devDependencies['@playwright/test']", "devDependencies['playwright-core']"],
      ["bun-version: ${{ steps.toolchain.outputs.bun }}", "bun-version: latest"],
      ["if: steps.scope.outputs.code == 'true' && steps.playwright-cache.outputs.cache-hit != 'true'", "if: steps.playwright-cache.outputs.cache-hit != 'true'"],
    ]) {
      assert.ok(tail.includes(from), `前提: e2e-webkit に ${from} があること`);
      assert.notDeepEqual(job(head + tail.replace(from, to)), e2e, from);
    }
  });
});

describe("e2e-webkit が流すもの（#674）", () => {
  test("build の後は pnpm e2e:webkit と、落ちたときの成果物の保存だけ", () => {
    const rest = stepsOf(CI, "e2e-webkit").rest;
    assert.equal(rest.length, 2, rest.join("\n---\n"));
    assert.match(rest[0], /^\s*- run: pnpm e2e:webkit$/m);
    assert.match(rest[0], /if: steps\.scope\.outputs\.code == 'true'/);
    assert.match(rest[1], /actions\/upload-artifact@/);
    assert.match(rest[1], /if: failure\(\)/);
  });

  test("時間の上限がある（固まったときに既定の 360 分まで待たない）", () => {
    const job = splitJobs(CI).find((j) => j.name === "e2e-webkit");
    const text = stripComments(job.lines.map((l) => l.text).join("\n"));
    assert.match(text, /^ {4}timeout-minutes: \d+$/m);
  });
});
