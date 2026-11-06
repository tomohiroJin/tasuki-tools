/**
 * `.github/workflows/e2e-repeat.yml`（手動起動の E2E 繰り返し実行・#562）の自己テスト。
 *
 * 1. **ci.yml の e2e ジョブとの写しがずれない**: 準備の段（checkout から `pnpm build` まで。action の固定・版の読み方・
 *    Chromium と Caddy の取得とキャッシュ・版の検査に使う `pnpm install`）が、ci.yml と同じであること。
 *    ci.yml の `scope` の段とそれを見る `if:` だけが違う（手動のジョブは常に全部流す）ので、比べる前に外す。
 *    原則 X: 複製を減らす composite action・reusable workflow は、ci.yml の 5 ジョブが同じ準備を既に写している
 *    （ci.yml の中の写しはこのテストの対象ではない）ところへ 1 つ足すだけでは実需が足りないので採らない。
 *    もう 1 つの理由: scripts/local-check.mjs（pnpm check:full）は ci.yml の段からコマンドを導いている。e2e の準備を
 *    composite action へ寄せると、その導き方の前提（run の段が ci.yml に並ぶ）が崩れ、変更が ci.yml 全体へ広がる。
 *    ずれの検知はこのテストで足りる。ジョブが 3 つ以上で同じ手直しを繰り返すようになったら再検討する。
 * 2. **手動の測定用に留まる**: workflow_dispatch だけで、push・pull_request で走らない。権限は read。
 * 3. **測るための引数**: `--repeat-each`・`--retries=0`・JSON reporter。`--max-failures` は付けない。
 * 4. **local-check（pnpm check:full）が拾わない**: CI から手元の段を導くのは ci.yml だけ。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { splitJobs, splitSteps, stripComments } from "./lib/workflow.mjs";
import { deriveChecks } from "./local-check.mjs";
import { splitE2eSteps, jobLevelKeys, topLevelEnv, compareE2eStep } from "./lib/workflow-compare.mjs";

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const CI = read(".github/workflows/ci.yml");
const REPEAT = read(".github/workflows/e2e-repeat.yml");

const ciSteps = () => splitE2eSteps(CI, "e2e", { stripScope: true });
const repeatSteps = (text = REPEAT) => splitE2eSteps(text, "e2e-repeat", { stripScope: false });

describe("準備の段が ci.yml の e2e ジョブと同じ", () => {
  test("checkout・toolchain・setup-node・corepack・setup-bun・install・Caddy・Playwright・build が同じ", () => {
    const ci = ciSteps();
    assert.ok(ci.prep.length >= 10, `ci.yml の準備の段が少なすぎます（${ci.prep.length}）。読み違いの疑い`);
    assert.deepEqual(repeatSteps().prep, ci.prep);
  });

  test("ずれたら捕まえる: action の固定・Chromium の取得・Playwright の版の読み方を変えた写しは同じと見なさない", () => {
    for (const [from, to] of [
      ["actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020", "actions/setup-node@v4"],
      ["playwright install --with-deps chromium", "playwright install chromium"],
      ["devDependencies['@playwright/test']", "devDependencies['playwright-core']"],
      ["key: playwright-${{ steps.playwright-version.outputs.version }}-chromium", "key: playwright-chromium"],
    ]) {
      assert.ok(REPEAT.includes(from), `前提: 写しに ${from} があること`);
      assert.notDeepEqual(repeatSteps(REPEAT.replace(from, to)).prep, ciSteps().prep, from);
    }
  });

  test("写しの側に steps.scope が残ったら不一致（本番では Chromium の導入が飛ばされる形）。正規化は ci.yml 側だけ", () => {
    assert.ok(!/steps\.scope/.test(stripComments(REPEAT)), "e2e-repeat.yml が steps.scope を見ている");
    const leaked = REPEAT.replace(
      "if: steps.playwright-cache.outputs.cache-hit != 'true'",
      "if: steps.scope.outputs.code == 'true' && steps.playwright-cache.outputs.cache-hit != 'true'",
    );
    assert.notEqual(leaked, REPEAT, "前提: 置き換えが当たること");
    assert.notDeepEqual(repeatSteps(leaked).prep, ciSteps().prep);
  });

  test("写しに scope の段を足したら不一致（scope の段を外すのも ci.yml 側だけ）", () => {
    const withScope = REPEAT.replace("      - run: corepack enable\n", "      - id: scope\n        run: node scripts/ci-scope.mjs\n      - run: corepack enable\n");
    assert.notEqual(withScope, REPEAT, "前提: 置き換えが当たること");
    assert.notDeepEqual(repeatSteps(withScope).prep, ciSteps().prep);
  });

  test("build から pnpm e2e までの間の段が ci.yml と同じ。ci.yml が段を足したら、写すまで赤のまま", () => {
    assert.deepEqual(repeatSteps().between, ciSteps().between);
    const extra = "      - run: node scripts/extra-e2e-setup.mjs\n";
    const insert = (text, before, ifLine) => text.replace(before, `${extra}${ifLine}${before}`);
    const ci2 = insert(CI, "      - run: pnpm e2e\n", "        if: steps.scope.outputs.code == 'true'\n");
    assert.notEqual(ci2, CI, "前提: 置き換えが当たること");
    const ciExtra = splitE2eSteps(ci2, "e2e", { stripScope: true }).between;
    assert.equal(ciExtra.length, 1);
    // 写さなければ赤（ci.yml だけが段を足した）
    assert.notDeepEqual(repeatSteps().between, ciExtra);
    // 同じ段を写せば緑
    const repeat2 = insert(REPEAT, "      - name: E2E を繰り返し流す\n", "");
    assert.notEqual(repeat2, REPEAT, "前提: 置き換えが当たること");
    assert.deepEqual(repeatSteps(repeat2).between, ciExtra);
  });

  test("pnpm e2e の段: ci.yml の引数と run 以外の鍵（env など）が写しにある。repeat 用の引数・env だけが違う", () => {
    assert.deepEqual(compareE2eStep(CI, REPEAT), []);
    // ci.yml が引数を変えたら、写しにも入れるまで赤
    const ciArgs = CI.replace("      - run: pnpm e2e\n", "      - run: pnpm e2e -- --workers=4\n");
    assert.notEqual(ciArgs, CI, "前提: 置き換えが当たること");
    assert.ok(compareE2eStep(ciArgs, REPEAT).length > 0, "ci.yml の引数の変更が見逃された");
    const repeatArgs = REPEAT.replace('--repeat-each="$REPEAT"', '--repeat-each="$REPEAT" --workers=4');
    assert.deepEqual(compareE2eStep(ciArgs, repeatArgs), []);
    // ci.yml が e2e の段に env を足したら、写しにも入れるまで赤
    const ciEnv = CI.replace("      - run: pnpm e2e\n", "      - run: pnpm e2e\n        env:\n          TASUKI_FLAG: \"1\"\n");
    assert.notEqual(ciEnv, CI, "前提: 置き換えが当たること");
    assert.ok(compareE2eStep(ciEnv, REPEAT).length > 0, "ci.yml の env の追加が見逃された");
    const repeatEnv = REPEAT.replace("          REPEAT: ${{ inputs.repeat }}\n", "          REPEAT: ${{ inputs.repeat }}\n          TASUKI_FLAG: \"1\"\n");
    assert.notEqual(repeatEnv, REPEAT);
    assert.deepEqual(compareE2eStep(ciEnv, repeatEnv), []);
    // 写しが勝手に env を足してもずれ（repeat 用の 2 つ以外）
    assert.ok(compareE2eStep(CI, repeatEnv).length > 0, "写しだけの env の追加が見逃された");
    // 写しだけが引数を足したら赤（--grep で測る範囲が縮む・--project で変わる）
    for (const extra of ["--grep @smoke", "--project=x"]) {
      const widened = REPEAT.replace('--repeat-each="$REPEAT"', `--repeat-each="$REPEAT" ${extra}`);
      assert.notEqual(widened, REPEAT);
      assert.ok(compareE2eStep(CI, widened).length > 0, `写しだけの ${extra} が見逃された`);
    }
    // pnpm e2e でなくなったら赤
    assert.ok(compareE2eStep(CI, REPEAT.replace("          pnpm e2e -- --repeat-each", "          pnpm e2e:prod -- --repeat-each")).length > 0);
  });

  test("pnpm e2e の段の run に、ほかの行を足したら赤（ci.yml 側は不可・写し側は既知の mkdir だけ可）", () => {
    // 複数行の run にして、ci.yml に export を足す
    const ciExport = CI.replace("      - run: pnpm e2e\n", "      - run: |\n          export TASUKI_X=1\n          pnpm e2e\n");
    assert.notEqual(ciExport, CI, "前提: 置き換えが当たること");
    assert.ok(compareE2eStep(ciExport, REPEAT).length > 0, "ci.yml の run の export が見逃された");
    // 写しに export を足す（mkdir 以外の行）
    const repeatExport = REPEAT.replace('          mkdir -p "$GITHUB_WORKSPACE/e2e-repeat-results"\n', '          mkdir -p "$GITHUB_WORKSPACE/e2e-repeat-results"\n          export TASUKI_X=1\n');
    assert.notEqual(repeatExport, REPEAT, "前提: 置き換えが当たること");
    assert.ok(compareE2eStep(CI, repeatExport).length > 0, "写しの run の export が見逃された");
  });

  test("ジョブ直下の設定（env・container・services など）を足していない。runs-on と、workflow 直下の env が同じ", () => {
    assert.deepEqual(jobLevelKeys(CI, "e2e"), ["runs-on", "steps"], "ci.yml の e2e ジョブに設定が増えた。写しへの影響を見てください");
    const allowed = ["runs-on", "timeout-minutes", "steps"];
    assert.deepEqual(jobLevelKeys(REPEAT, "e2e-repeat"), allowed);
    const line = (text, re) => re.exec(text)?.[0];
    assert.equal(line(REPEAT, /^ {4}runs-on: .+$/m), line(CI, /^ {4}runs-on: .+$/m));
    // workflow 直下の env は塊ごと比べる（2 行目の変数を足しても見逃さない）
    assert.ok(topLevelEnv(CI).includes("COREPACK_ENABLE_DOWNLOAD_PROMPT"), "前提: ci.yml に workflow 直下の env があること");
    assert.equal(topLevelEnv(REPEAT), topLevelEnv(CI));
    assert.notEqual(topLevelEnv(CI.replace('COREPACK_ENABLE_DOWNLOAD_PROMPT: "0"\n', 'COREPACK_ENABLE_DOWNLOAD_PROMPT: "0"\n  EXTRA_FLAG: "1"\n')), topLevelEnv(REPEAT));
    // env を足した ci.yml は検出できる
    assert.notDeepEqual(jobLevelKeys(CI.replace("  e2e:\n    runs-on: ubuntu-latest\n", "  e2e:\n    runs-on: ubuntu-latest\n    env:\n      X: 1\n"), "e2e"), ["runs-on", "steps"]);
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

  test("回数は選択式で、選べる値がすべて timeout-minutes の対応表にあり、上限に収まる（式は算術を持たないので表で引く）", () => {
    const options = /options: \[([^\]]*)\]/.exec(head)?.[1].split(",").map((s) => s.trim().replaceAll('"', ""));
    assert.ok(options && options.length > 0 && options.every((o) => /^\d+$/.test(o)));
    const m = /timeout-minutes: \$\{\{ fromJSON\('(\{[^']*\})'\)\[inputs\.repeat\] \}\}/.exec(REPEAT);
    assert.ok(m, "timeout-minutes は fromJSON('{…}')[inputs.repeat] の対応表で引いてください");
    const table = JSON.parse(m[1]);
    assert.deepEqual(Object.keys(table).sort(), [...options].sort(), "選べる回数と表の鍵が一致しません");
    for (const n of options) {
      assert.ok(table[n] >= Number(n) * 6 + 15, `${n} 回の上限 ${table[n]} 分が 回数 × 6 + 15 に足りない`);
      assert.ok(table[n] <= 360, `${n} 回の上限が GitHub の最大（360 分）を超える`);
    }
    assert.doesNotMatch(REPEAT, /timeout-minutes:.*[*+]/, "式に算術は書けません");
  });
});

describe("測るための引数と結果の残し方", () => {
  const code = stripComments(REPEAT);

  test("--repeat-each は入力から・--retries=0・JSON reporter。--max-failures は付けない", () => {
    assert.match(code, /pnpm e2e -- --repeat-each="\$REPEAT" --retries=0 --trace=retain-on-failure --reporter=list,json$/m);
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

  test("結果の置き場は作業ツリーの中の 1 つのディレクトリで、upload の path はその外を混ぜない（artifact の根を揃える）", () => {
    const out = /PLAYWRIGHT_JSON_OUTPUT_NAME: (.+)/.exec(code)[1];
    const dir = /^\$\{\{ github\.workspace \}\}\/([\w-]+)\/results\.json$/.exec(out)?.[1];
    assert.ok(dir, `出力先は \${{ github.workspace }}/<ディレクトリ>/results.json にしてください（実際: ${out}）`);
    assert.equal(/FAILURES: (.+)/.exec(code)?.[1], `\${{ github.workspace }}/${dir}/failures.txt`);
    assert.match(code, new RegExp(`mkdir -p "\\$GITHUB_WORKSPACE/${dir}"`));
    const upload = splitSteps(splitJobs(REPEAT)[0].lines).map((s) => s.text).find((s) => s.includes("actions/upload-artifact@"));
    const paths = /path: \|\n((?: {12}.+\n?)+)/.exec(upload)?.[1].split("\n").map((l) => l.trim()).filter(Boolean);
    assert.deepEqual(paths, [`${dir}/`, "e2e/test-results/"]);
    assert.doesNotMatch(code, /runner\.temp|RUNNER_TEMP/);
  });

  // JSON の出力先の環境変数が turbo.json の e2e の passThroughEnv にあること（strict モードで届く）は、
  // e2e/tests/turbo-env.test.ts の 1 か所で見る（変異 1063 のテストもそちら。ここでは二重に持たない）。
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
