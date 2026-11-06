/**
 * `scripts/summarize-e2e-repeat.mjs`（E2E の繰り返し実行の集計・#562）の自己テスト。
 * 数え方と、**検査本体への配線**（結果が読めないときに終了コード 1 になる・要約と一覧を書く）を見る。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { classify, summarize, classifyFailures, formatMarkdown, formatFailureList, parseArgs } from "./summarize-e2e-repeat.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "summarize-e2e-repeat.mjs");

const result = (status, retry = 0) => ({ status, retry, duration: 10 });
const testOf = (statuses, projectName = "chromium") => ({ projectName, results: statuses.map((s, i) => result(s, i)) });

function report() {
  return {
    stats: { duration: 125_000 },
    suites: [
      {
        title: "poker.spec.ts",
        specs: [{ title: "安定", tests: [testOf(["passed"]), testOf(["passed"]), testOf(["passed"])] }],
        suites: [
          {
            title: "ルーム",
            specs: [
              { title: "揺れる", tests: [testOf(["passed"]), testOf(["failed"]), testOf(["timedOut"])] },
              { title: "いつも落ちる", tests: [testOf(["failed"]), testOf(["failed"]), testOf(["failed"])] },
            ],
          },
        ],
      },
    ],
  };
}

describe("classify", () => {
  test("成功・失敗・飛ばしに寄せる", () => {
    assert.equal(classify("passed"), "pass");
    for (const s of ["failed", "timedOut", "interrupted"]) assert.equal(classify(s), "fail");
    assert.equal(classify("skipped"), "skip");
  });
});

describe("summarize", () => {
  test("テストごとに、繰り返しの 1 回ごとの結果を数える（入れ子の見出しはつなぐ）", () => {
    const { tests, totals } = summarize(report());
    const by = Object.fromEntries(tests.map((t) => [t.id, t]));
    assert.deepEqual(by["poker.spec.ts › 安定 [chromium]"], { id: "poker.spec.ts › 安定 [chromium]", pass: 3, fail: 0, skip: 0 });
    assert.equal(by["poker.spec.ts › ルーム › 揺れる [chromium]"].pass, 1);
    assert.equal(by["poker.spec.ts › ルーム › 揺れる [chromium]"].fail, 2);
    assert.equal(by["poker.spec.ts › ルーム › いつも落ちる [chromium]"].fail, 3);
    assert.deepEqual(totals, { tests: 3, runs: 9, pass: 4, fail: 5, skip: 0 });
  });

  test("落ちたものが先に並ぶ（失敗の多い順）", () => {
    const { tests } = summarize(report());
    assert.deepEqual(tests.map((t) => t.fail), [3, 2, 0]);
  });

  test("再試行があっても 1 回の実行につき最後の結果だけを数える", () => {
    const r = { suites: [{ title: "a.spec.ts", specs: [{ title: "t", tests: [testOf(["failed", "passed"])] }] }] };
    assert.deepEqual(summarize(r).totals, { tests: 1, runs: 1, pass: 1, fail: 0, skip: 0 });
  });

  test("結果の無いテストは飛ばしに数える。所要時間が無ければ null", () => {
    const r = { suites: [{ title: "a.spec.ts", specs: [{ title: "t", tests: [{ projectName: "chromium", results: [] }] }] }] };
    const s = summarize(r);
    assert.equal(s.totals.skip, 1);
    assert.equal(s.durationMs, null);
  });

  test("JSON reporter の形でなければ投げる", () => {
    for (const bad of [null, {}, [], "x", { suites: {} }]) assert.throws(() => summarize(bad), /JSON reporter/);
  });
});

describe("classifyFailures・formatMarkdown・formatFailureList", () => {
  test("揺れた／いつも落ちたに分ける", () => {
    const { always, flaky } = classifyFailures(summarize(report()).tests);
    assert.equal(always.length, 1);
    assert.equal(flaky.length, 1);
  });

  test("要約に件数・所要時間・落ちたテストの表を出す", () => {
    const md = formatMarkdown(summarize(report()));
    assert.match(md, /テスト 3 件・実行 9 回（成功 4 \/ 失敗 5 \/ 飛ばし 0）/);
    assert.match(md, /2 分 5 秒/);
    assert.match(md, /揺れた（成功も失敗もあった）: 1 件 \/ いつも落ちた: 1 件/);
    assert.match(md, /\| poker\.spec\.ts › ルーム › 揺れる \[chromium\] \| 1 \| 2 \| 揺れた \|/);
  });

  test("落ちたテストが無ければ、そう書く", () => {
    const r = { suites: [{ title: "a.spec.ts", specs: [{ title: "t", tests: [testOf(["passed"])] }] }] };
    assert.match(formatMarkdown(summarize(r)), /落ちたテストはありませんでした/);
    assert.equal(formatFailureList(summarize(r).tests), "");
  });

  test("表のセルの | と改行を逃がす", () => {
    const r = { suites: [{ title: "a.spec.ts", specs: [{ title: "x|y\nz", tests: [testOf(["failed"])] }] }] };
    assert.match(formatMarkdown(summarize(r)), /x\\\|y z/);
  });

  test("落ちた一覧は落ちたものだけ 1 行 1 件", () => {
    const lines = formatFailureList(summarize(report()).tests).trimEnd().split("\n");
    assert.equal(lines.length, 2);
    assert.match(lines[0], /いつも落ちる \[chromium\]\t成功 0\t失敗 3/);
  });
});

// globalSetup が落ちたときの実際の形（suites が空・errors に 1 件）を写した最小の fixture
const SETUP_FAILED = {
  suites: [],
  errors: [{ message: "Error: 開発環境の版が宣言と合いません（上の [check-toolchain] の出力）。\n    at assertToolchain (x.ts:24:9)", stack: "…" }],
  stats: { duration: 211 },
};

describe("reporter の errors（globalSetup の失敗など）", () => {
  test("errors の先頭行を集める。無ければ空", () => {
    assert.deepEqual(summarize(SETUP_FAILED).errors, ["Error: 開発環境の版が宣言と合いません（上の [check-toolchain] の出力）。"]);
    assert.deepEqual(summarize(report()).errors, []);
  });

  test("テストが通っていても errors があれば要約に出す", () => {
    const md = formatMarkdown(summarize({ ...report(), errors: SETUP_FAILED.errors }));
    assert.match(md, /reporter のエラー: 1 件/);
    assert.match(md, /開発環境の版が宣言と合いません/);
    assert.doesNotMatch(formatMarkdown(summarize(report())), /reporter のエラー/);
  });

  test("配線: テストが 0 件で errors があるとき、中身を要約に出して終了コード 1。通っていて errors があるときは 0", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "summarize-e2e-repeat-errors-"));
    try {
      const failed = path.join(dir, "gs.json");
      const mixed = path.join(dir, "mixed.json");
      fs.writeFileSync(failed, JSON.stringify(SETUP_FAILED));
      fs.writeFileSync(mixed, JSON.stringify({ ...report(), errors: SETUP_FAILED.errors }));
      const a = spawnSync(process.execPath, [SCRIPT, failed], { encoding: "utf8" });
      assert.equal(a.status, 1);
      assert.match(a.stdout, /開発環境の版が宣言と合いません/);
      assert.match(a.stderr, /1 件のテストもありません/);
      const b = spawnSync(process.execPath, [SCRIPT, mixed], { encoding: "utf8" });
      assert.equal(b.status, 0, b.stderr);
      assert.match(b.stdout, /reporter のエラー: 1 件/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("parseArgs", () => {
  test("入力と --failures-out を読む。足りない・余るときは投げる", () => {
    assert.deepEqual(parseArgs(["r.json", "--failures-out", "f.txt"]), { input: "r.json", failuresOut: "f.txt" });
    assert.deepEqual(parseArgs(["r.json"]), { input: "r.json", failuresOut: null });
    for (const bad of [[], ["a", "b"], ["--failures-out"], ["--failures-out", "--x", "r.json"], ["--x"]]) assert.throws(() => parseArgs(bad));
  });
});

describe("配線: 実際に起動して終了コードと出力を見る", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "summarize-e2e-repeat-"));
  const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });

  test("結果を読めたら要約を標準出力へ・一覧をファイルへ書き、落ちたテストがあっても終了コード 0", () => {
    const input = path.join(dir, "r.json");
    const list = path.join(dir, "failures.txt");
    fs.writeFileSync(input, JSON.stringify(report()));
    const r = run([input, "--failures-out", list]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /E2E の繰り返し実行の結果/);
    assert.match(fs.readFileSync(list, "utf8"), /揺れる/);
  });

  test("結果が無い・壊れている・空なら終了コード 1（空の要約で緑にしない）", () => {
    const broken = path.join(dir, "broken.json");
    const empty = path.join(dir, "empty.json");
    fs.writeFileSync(broken, "{not json");
    fs.writeFileSync(empty, JSON.stringify({ suites: [] }));
    for (const input of [path.join(dir, "missing.json"), broken, empty]) {
      const r = run([input]);
      assert.equal(r.status, 1, input);
      assert.equal(r.stdout, "");
      assert.match(r.stderr, /\[summarize-e2e-repeat\]/);
    }
  });

  test("引数が違えば終了コード 1", () => {
    assert.equal(run([]).status, 1);
  });

  test("終わりに掃除する", () => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
