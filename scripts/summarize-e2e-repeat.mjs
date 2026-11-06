#!/usr/bin/env node
/**
 * E2E の繰り返し実行（`.github/workflows/e2e-repeat.yml`・#562）の結果を、テストごとの
 * 「成功の回数／失敗の回数」に集計する。入力は Playwright の JSON reporter の出力。
 *
 * 使い方: `node scripts/summarize-e2e-repeat.mjs <results.json> [--failures-out <path>]`
 * - Markdown の要約を標準出力へ書く（ワークフローは `$GITHUB_STEP_SUMMARY` へ流す）。
 * - `--failures-out` を付けると、落ちたテストだけの一覧（1 行 1 件）をそのファイルへ書く。
 * - 結果ファイルが読めない・形が違うときは、要約を出さず終了コード 1 にする（空の要約で緑にしない。憲法 VII）。
 *   テストが落ちたこと自体は終了コードにしない（それは `pnpm e2e` の段が赤になって示す）。
 *
 * 数え方: テスト（ファイル・見出しの並び・プロジェクト）と、`--repeat-each` の 1 回ごとの結果を対応づける。
 * 再試行（retries）があっても 1 回の実行につき**最後の結果**だけを数える。繰り返しの数と成功・失敗の数が
 * 食い違わないようにするため（このワークフローは `--retries=0` で流す）。
 */
import fs from "node:fs";
import { isDirectRun } from "./lib/direct-run.mjs";

const FAILED = new Set(["failed", "timedOut", "interrupted"]);

/** Playwright の結果の状態を、数える区分へ寄せる。 */
export function classify(status) {
  if (status === "passed") return "pass";
  if (FAILED.has(status)) return "fail";
  return "skip";
}

/** suites を再帰でたどり、spec ごとに { id, results } を渡す。 */
function* walkSpecs(suites, path = []) {
  for (const suite of suites ?? []) {
    // 最上位の suite の title はファイル名。describe の入れ子はその下に続く。
    const here = suite.title ? [...path, suite.title] : path;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        yield { id: [...here, spec.title].join(" › "), project: test.projectName ?? "", results: test.results ?? [] };
      }
    }
    yield* walkSpecs(suite.suites, here);
  }
}

/**
 * JSON reporter の出力を集計する。
 * @returns {{ errors: string[], tests: Array<{ id: string, pass: number, fail: number, skip: number }>, totals: { tests: number, runs: number, pass: number, fail: number, skip: number }, durationMs: number | null }}
 */
export function summarize(report) {
  if (report === null || typeof report !== "object" || !Array.isArray(report.suites)) {
    throw new Error("Playwright の JSON reporter の出力ではありません（suites がありません）");
  }
  const byId = new Map();
  for (const { id, project, results } of walkSpecs(report.suites)) {
    const key = project ? `${id} [${project}]` : id;
    const row = byId.get(key) ?? { id: key, pass: 0, fail: 0, skip: 0 };
    if (results.length > 0) row[classify(results[results.length - 1].status)]++;
    else row.skip++;
    byId.set(key, row);
  }
  const tests = [...byId.values()].sort(
    (a, b) => b.fail - a.fail || a.pass - b.pass || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const totals = { tests: tests.length, runs: 0, pass: 0, fail: 0, skip: 0 };
  for (const t of tests) {
    totals.pass += t.pass;
    totals.fail += t.fail;
    totals.skip += t.skip;
  }
  totals.runs = totals.pass + totals.fail + totals.skip;
  const durationMs = typeof report.stats?.duration === "number" ? report.stats.duration : null;
  // globalSetup の失敗などは suites ではなく errors に出る（suites が空になる）。先頭行だけを集める。
  const errors = (Array.isArray(report.errors) ? report.errors : [])
    .map((e) => String(e?.message ?? "").split("\n")[0].trim())
    .map((m) => m || "（メッセージなし）");
  return { tests, totals, durationMs, errors };
}

/** 落ちたテストを「いつも落ちる」「揺れた」に分ける。 */
export function classifyFailures(tests) {
  const failing = tests.filter((t) => t.fail > 0);
  return {
    always: failing.filter((t) => t.pass === 0),
    flaky: failing.filter((t) => t.pass > 0),
  };
}

function escapeCell(text) {
  return text.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function formatDuration(ms) {
  const sec = Math.round(ms / 1000);
  return `${Math.floor(sec / 60)} 分 ${sec % 60} 秒`;
}

/** job summary 用の Markdown。 */
export function formatMarkdown(summary) {
  const { tests, totals, durationMs, errors } = summary;
  const { always, flaky } = classifyFailures(tests);
  const out = ["## E2E の繰り返し実行の結果", ""];
  if (errors.length > 0) {
    out.push(`**reporter のエラー: ${errors.length} 件**（globalSetup の失敗など。テストの結果とは別に出る）`, "");
    for (const m of errors) out.push(`- ${escapeCell(m)}`);
    out.push("");
  }
  out.push(
    `- テスト ${totals.tests} 件・実行 ${totals.runs} 回（成功 ${totals.pass} / 失敗 ${totals.fail} / 飛ばし ${totals.skip}）`,
  );
  if (durationMs !== null) out.push(`- 所要時間（Playwright の計測）: ${formatDuration(durationMs)}`);
  out.push(`- 揺れた（成功も失敗もあった）: ${flaky.length} 件 / いつも落ちた: ${always.length} 件`, "");
  const failing = [...flaky, ...always];
  if (failing.length === 0) {
    out.push("落ちたテストはありませんでした。", "");
  } else {
    out.push("| テスト | 成功 | 失敗 | 区分 |", "|---|---:|---:|---|");
    for (const t of failing) out.push(`| ${escapeCell(t.id)} | ${t.pass} | ${t.fail} | ${t.pass > 0 ? "揺れた" : "いつも落ちた"} |`);
    out.push("");
  }
  out.push("<details><summary>全テストの成功／失敗の回数</summary>", "", "| テスト | 成功 | 失敗 | 飛ばし |", "|---|---:|---:|---:|");
  for (const t of tests) out.push(`| ${escapeCell(t.id)} | ${t.pass} | ${t.fail} | ${t.skip} |`);
  out.push("", "</details>", "");
  return out.join("\n");
}

/** 落ちたテストの一覧（1 行 1 件）。 */
export function formatFailureList(tests) {
  return tests
    .filter((t) => t.fail > 0)
    .map((t) => `${t.id}\t成功 ${t.pass}\t失敗 ${t.fail}`)
    .join("\n")
    .concat(tests.some((t) => t.fail > 0) ? "\n" : "");
}

export function parseArgs(argv) {
  const rest = [...argv];
  let failuresOut = null;
  const i = rest.indexOf("--failures-out");
  if (i >= 0) {
    failuresOut = rest[i + 1] ?? null;
    if (failuresOut === null || failuresOut.startsWith("--")) throw new Error("--failures-out にはファイルを指定してください");
    rest.splice(i, 2);
  }
  if (rest.length !== 1 || rest[0].startsWith("--")) throw new Error("使い方: summarize-e2e-repeat.mjs <results.json> [--failures-out <path>]");
  return { input: rest[0], failuresOut };
}

function main() {
  try {
    const { input, failuresOut } = parseArgs(process.argv.slice(2));
    const summary = summarize(JSON.parse(fs.readFileSync(input, "utf8")));
    if (failuresOut !== null) fs.writeFileSync(failuresOut, formatFailureList(summary.tests));
    if (summary.totals.runs === 0) {
      // 空の要約で緑にしない。errors があれば、原因として要約に出してから止める
      if (summary.errors.length > 0) process.stdout.write(formatMarkdown(summary));
      throw new Error("結果に 1 件のテストもありません（reporter の出力が空）");
    }
    process.stdout.write(formatMarkdown(summary));
  } catch (e) {
    console.error(`[summarize-e2e-repeat] ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}

if (isDirectRun(import.meta.url, process.argv[1])) main();
