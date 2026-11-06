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
 * 1 回の区分は Playwright の判定（test.status・expectedStatus）による（`classifyRun`）。結果の無い回（notRun）と
 * 止められた回（interrupted）は成功にも失敗にも数えず、警告として別に出す。実行された回（成功＋失敗）が 0 なら終了コード 1。
 * 再試行（retries）があっても最後の結果だけを見る（このワークフローは `--retries=0` で流す）。
 */
import fs from "node:fs";
import { isDirectRun } from "./lib/direct-run.mjs";

// reporter の errors には色の符号が入る（\u001b[31m … \u001b[39m）
const ANSI = new RegExp("\\u001b\\[[0-9;]*m", "g");
const FAILED = new Set(["failed", "timedOut"]);

/** 1 つの結果の状態（result.status）を区分へ寄せる。classifyRun が使う。 */
export function classify(status) {
  if (status === "passed") return "pass";
  if (status === "interrupted") return "interrupted";
  if (FAILED.has(status)) return "fail";
  return "skip";
}

/**
 * repeat-each の 1 回（JSON reporter の tests[] の 1 件）を、数える区分へ寄せる。
 * - 結果が無い（読み込み後に止まった実行）: notRun。
 * - 最後の結果が interrupted: interrupted（失敗に数えない。止められた回が「揺れた」を水増ししない）。
 * - test.status（expected / unexpected / flaky / skipped）があればそれを使う。`test.fail()` の期待どおりの失敗は expected = 成功。
 * - 無い古い形は、最後の結果を expectedStatus（既定 passed）と比べる。
 * 再試行があっても最後の結果だけを見る。
 */
export function classifyRun(test) {
  const results = test.results ?? [];
  if (results.length === 0) return "notRun";
  const last = results[results.length - 1].status;
  const kind = classify(last);
  if (kind === "interrupted") return "interrupted";
  switch (test.status) {
    case "expected":
    case "flaky":
      return "pass";
    case "unexpected":
      return "fail";
    case "skipped":
      return "skip";
  }
  if (kind === "skip") return "skip";
  return last === (test.expectedStatus ?? "passed") ? "pass" : "fail";
}

/** suites を再帰でたどり、spec ごとに { id, results } を渡す。 */
function* walkSpecs(suites, path = []) {
  for (const suite of suites ?? []) {
    // 最上位の suite の title はファイル名。describe の入れ子はその下に続く。
    const here = suite.title ? [...path, suite.title] : path;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        yield { id: [...here, spec.title].join(" › "), project: test.projectName ?? "", test };
      }
    }
    yield* walkSpecs(suite.suites, here);
  }
}

/**
 * JSON reporter の出力を集計する。
 * @returns {{ errors: string[], tests: Array<{ id: string, pass: number, fail: number, skip: number, interrupted: number, notRun: number, failedAtMs: number[] }>, totals: { tests: number, runs: number, executed: number, pass: number, fail: number, skip: number, interrupted: number, notRun: number }, durationMs: number | null }}
 */
export function summarize(report) {
  if (report === null || typeof report !== "object" || !Array.isArray(report.suites)) {
    throw new Error("Playwright の JSON reporter の出力ではありません（suites がありません）");
  }
  const byId = new Map();
  const startMs = Date.parse(report.stats?.startTime);
  for (const { id, project, test } of walkSpecs(report.suites)) {
    const key = project ? `${id} [${project}]` : id;
    const row = byId.get(key) ?? { id: key, pass: 0, fail: 0, skip: 0, interrupted: 0, notRun: 0, failedAtMs: [] };
    const kind = classifyRun(test);
    row[kind]++;
    // 落ちた回が実行の開始から何ミリ秒のところだったか。JSON に周の番号（repeatEachIndex）は無いので、時刻で見る
    const offset = Date.parse(test.results?.[test.results.length - 1]?.startTime) - startMs;
    if (kind === "fail" && Number.isFinite(offset)) row.failedAtMs.push(offset);
    byId.set(key, row);
  }
  const tests = [...byId.values()].sort(
    (a, b) => b.fail - a.fail || a.pass - b.pass || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const totals = { tests: tests.length, runs: 0, executed: 0, pass: 0, fail: 0, skip: 0, interrupted: 0, notRun: 0 };
  for (const t of tests) {
    for (const k of ["pass", "fail", "skip", "interrupted", "notRun"]) totals[k] += t[k];
  }
  totals.runs = totals.pass + totals.fail + totals.skip + totals.interrupted + totals.notRun;
  // 実行された回 = 成功か失敗が出た回。飛ばし・止められた回・結果の無い回は入れない
  totals.executed = totals.pass + totals.fail;
  const durationMs = typeof report.stats?.duration === "number" ? report.stats.duration : null;
  // globalSetup の失敗などは suites ではなく errors に出る（suites が空になる）。先頭行だけを集める。
  const errors = (Array.isArray(report.errors) ? report.errors : [])
    .map((e) => String(e?.message ?? "").replace(ANSI, "").split("\n")[0].trim())
    .map((m) => m || "（メッセージなし）");
  return { tests, totals, durationMs, errors };
}

/**
 * 落ちたテストを分ける。
 * - always: 繰り返しのすべての回で落ちた（fail が回数と等しい）。
 * - flaky: 成功も失敗もあった（揺れた）。
 * - partial: 落ちた回はあるが、成功は無く、残りは飛ばし・止められた回・未実行（判断できない）。
 */
export function classifyFailures(tests) {
  const failing = tests.filter((t) => t.fail > 0);
  const total = (t) => t.pass + t.fail + t.skip + t.interrupted + t.notRun;
  return {
    always: failing.filter((t) => t.fail === total(t)),
    flaky: failing.filter((t) => t.pass > 0),
    partial: failing.filter((t) => t.pass === 0 && t.fail !== total(t)),
  };
}

/** 落ちた時点（開始から何分）。読めなければ空文字。 */
function formatFailedAt(t) {
  return t.failedAtMs.map((ms) => `${(ms / 60000).toFixed(1)} 分`).join(", ");
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
  const { always, flaky, partial } = classifyFailures(tests);
  const out = ["## E2E の繰り返し実行の結果", ""];
  if (errors.length > 0) {
    out.push(`**reporter のエラー: ${errors.length} 件**（globalSetup の失敗など。テストの結果とは別に出る）`, "");
    for (const m of errors) out.push(`- ${escapeCell(m)}`);
    out.push("");
  }
  // 結果の無い回・止められた回は、成功にも失敗にも数えない。あれば警告として必ず出す
  const warnings = [];
  if (totals.notRun > 0) warnings.push(`実行されなかった回: ${totals.notRun}（結果が無い。読み込み後に止まった実行など）`);
  if (totals.interrupted > 0) warnings.push(`止められた回: ${totals.interrupted}（失敗にも揺れにも数えない）`);
  if (totals.executed === 0) {
    // 実行された回が 0（globalSetup の失敗・全件が未実行など）は、空の表で「落ちたテストはありません」と読ませない
    out.push("**実行された回が 0 回です。** 測定になっていません。", "");
  }
  if (warnings.length > 0) {
    out.push("**警告**", "");
    for (const w of warnings) out.push(`- ${w}`);
    out.push("");
  }
  if (totals.executed === 0) return out.join("\n") + "\n";
  out.push(
    `- テスト ${totals.tests} 件・実行 ${totals.runs} 回（成功 ${totals.pass} / 失敗 ${totals.fail} / 飛ばし ${totals.skip} / 止められた ${totals.interrupted} / 未実行 ${totals.notRun}）`,
  );
  if (durationMs !== null) out.push(`- 所要時間（Playwright の計測）: ${formatDuration(durationMs)}`);
  out.push(`- 揺れた（成功も失敗もあった）: ${flaky.length} 件 / いつも落ちた: ${always.length} 件 / 一部だけ落ちた（他は飛ばし・未実行）: ${partial.length} 件`, "");
  const failing = [...flaky, ...partial, ...always];
  if (failing.length === 0) {
    out.push(warnings.length > 0 ? "落ちた回はありませんでした（上の警告を見てください）。" : "落ちたテストはありませんでした。", "");
  } else {
    out.push("| テスト | 成功 | 失敗 | 区分 | 落ちた時点（開始から） |", "|---|---:|---:|---|---|");
    for (const t of failing) {
      const kind = flaky.includes(t) ? "揺れた" : always.includes(t) ? "いつも落ちた" : "一部だけ落ちた";
      out.push(`| ${escapeCell(t.id)} | ${t.pass} | ${t.fail} | ${kind} | ${formatFailedAt(t)} |`);
    }
    out.push("");
  }
  out.push("<details><summary>全テストの成功／失敗の回数</summary>", "", "| テスト | 成功 | 失敗 | 飛ばし | 止められた | 未実行 |", "|---|---:|---:|---:|---:|---:|");
  for (const t of tests) out.push(`| ${escapeCell(t.id)} | ${t.pass} | ${t.fail} | ${t.skip} | ${t.interrupted} | ${t.notRun} |`);
  out.push("", "</details>", "");
  return out.join("\n");
}

/** 落ちたテストの一覧（1 行 1 件）。 */
export function formatFailureList(tests) {
  return tests
    .filter((t) => t.fail > 0)
    .map((t) => `${t.id}\t成功 ${t.pass}\t失敗 ${t.fail}` + (t.failedAtMs.length > 0 ? `\t開始から ${formatFailedAt(t)}` : ""))
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
    if (summary.totals.executed === 0) {
      // 空の要約で緑にしない。原因（errors）・未実行があれば要約に出してから止める
      if (summary.errors.length > 0 || summary.totals.tests > 0) process.stdout.write(formatMarkdown(summary));
      throw new Error(
        summary.totals.tests === 0
          ? "結果に 1 件のテストもありません（reporter の出力が空）"
          : "実行された回が 0 回です（全件が結果なし・飛ばし・止められた回）",
      );
    }
    process.stdout.write(formatMarkdown(summary));
  } catch (e) {
    console.error(`[summarize-e2e-repeat] ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}

if (isDirectRun(import.meta.url, process.argv[1])) main();
