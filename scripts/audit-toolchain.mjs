#!/usr/bin/env node
/**
 * 開発環境の版の宣言と、それを読む側（CI・E2E のハーネス・package.json）のずれを見る検査
 * （#487・docs/adr/0031）。
 *
 * ## 何を見るか
 *
 * 1. **宣言が読める。** `toolchain.json`（Node・Bun・Caddy）・`package.json` の `packageManager`（pnpm）・
 *    `e2e/package.json` の `@playwright/test`（Chromium の revision を決める）
 * 2. **CI が版を宣言から導く**（`.github/workflows/*.yml`）。`actions/setup-node` の `node-version` と
 *    `oven-sh/setup-bun` の `bun-version` が `steps.toolchain.outputs.*` を指し、Caddy のキャッシュの鍵も
 *    そこから作る。参照するジョブには、参照より前に `toolchain.json` を読む `id: toolchain` の段がある
 * 3. **宣言の版を写していない。** workflow と `e2e/harness/*.ts` のコメントの外に、宣言の版の文字列が無い
 * 4. **`package.json` の `engines.node` が宣言の下限と同じ**（pnpm が警告に使う下限と、
 *    `scripts/check-toolchain.mjs` が止める下限を割らない）
 * 5. **Playwright が完全固定で、`@playwright/test` と `playwright-core` が同じ版**
 *
 * ## 何を見ていないか
 *
 * - **環境の版は見ない。** それは `scripts/check-toolchain.mjs` の役目（検査の前に流れる）
 * - workflow は行で読む（YAML を解釈しない。追加依存は禁止）。ジョブは 2 字下げ、ステップは 6 字下げの
 *   `- ` という今の書き方を前提にする。書き方を変えたら、走査量の 0 件ガードが先に赤くなる
 * - devcontainer の定義はリポジトリに無い（2026-10-31）。置いたら、ここで読むものに足す
 *
 * 設計方針: 判定は純粋関数、実 I/O と `process.exit` は `main()` の薄い配線だけに置く。追加依存は禁止。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listTrackedFiles, findEmptyScanDimensions } from "./lib/scan-targets.mjs";
import { isDirectRun } from "./lib/direct-run.mjs";
import { parseToolchain, parsePackageManager } from "./lib/toolchain.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const WORKFLOW_PATTERNS = [".github/workflows/*.yml", ".github/workflows/*.yaml"];
/** 版を宣言から読むはずの置き場。ここに版の文字列があれば写しである。 */
const READER_PATTERNS = ["e2e/harness/*.ts"];

const NODE_REF = "${{ steps.toolchain.outputs.node }}";
const BUN_REF = "${{ steps.toolchain.outputs.bun }}";
const CADDY_KEY = "caddy-${{ steps.toolchain.outputs.caddy }}";

/** `jobs:` の直下（2 字下げ）の名前ごとに行を分ける。 */
export function splitJobs(text) {
  const jobs = [];
  let inJobs = false;
  let current = null;
  text.split("\n").forEach((raw, i) => {
    if (/^jobs:\s*$/.test(raw)) {
      inJobs = true;
      return;
    }
    if (!inJobs) return;
    if (/^\S/.test(raw)) {
      inJobs = false;
      current = null;
      return;
    }
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(raw);
    if (m) {
      current = { name: m[1], lines: [] };
      jobs.push(current);
      return;
    }
    if (current) current.lines.push({ text: raw, line: i + 1 });
  });
  return jobs;
}

/** ジョブの行を、6 字下げの `- ` ごとのステップに分ける。 */
export function splitSteps(lines) {
  const steps = [];
  let current = null;
  for (const { text, line } of lines) {
    if (/^ {6}- /.test(text)) {
      current = { line, lines: [text] };
      steps.push(current);
    } else if (current && (/^ {7,}\S/.test(text) || text.trim() === "")) {
      current.lines.push(text);
    } else {
      current = null;
    }
  }
  return steps.map((s) => ({ line: s.line, text: s.lines.join("\n") }));
}

/** コメントを落とした行（YAML の `#`・TS の `//`・ブロックコメントの行）。 */
function stripComment(line) {
  const t = line.trim();
  if (t.startsWith("#") || t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return "";
  return line.replace(/\s#.*$/, "").replace(/\s\/\/.*$/, "");
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** コメントの外に、宣言の版の文字列がそのまま現れる行を返す。 */
export function findLiteralVersions(text, declared) {
  const hits = [];
  text.split("\n").forEach((raw, i) => {
    const line = stripComment(raw);
    for (const [tool, version] of Object.entries(declared)) {
      if (typeof version !== "string") continue;
      if (new RegExp(`(?<![\\d.])${escapeRe(version)}(?!\\d|\\.\\d)`).test(line)) {
        hits.push({ line: i + 1, tool, version });
      }
    }
  });
  return hits;
}

/** `key: value` の行の値（コメントを落とす）。無ければ null。 */
function valueOf(stepText, key) {
  const m = new RegExp(`^\\s+${escapeRe(key)}:\\s*(.*?)\\s*(?:#.*)?$`, "m").exec(stepText);
  return m ? m[1] : null;
}

/** workflow 1 本を見る。 */
export function checkWorkflow(text, declared) {
  const problems = [];
  const counts = { setupNode: 0, setupBun: 0, caddyCache: 0 };
  for (const job of splitJobs(text)) {
    const steps = splitSteps(job.lines);
    const toolchainIndex = steps.findIndex((s) => /^\s*-?\s*id:\s*toolchain\s*$/m.test(s.text));
    if (toolchainIndex >= 0 && !steps[toolchainIndex].text.includes("toolchain.json")) {
      problems.push(`行 ${steps[toolchainIndex].line}（${job.name}）: id: toolchain の段が toolchain.json を読んでいません`);
    }
    steps.forEach((step, i) => {
      if (step.text.includes("steps.toolchain.outputs.")) {
        if (toolchainIndex < 0) {
          problems.push(`行 ${step.line}（${job.name}）: steps.toolchain の出力を使うのに、このジョブに id: toolchain の段がありません`);
        } else if (toolchainIndex > i) {
          problems.push(`行 ${step.line}（${job.name}）: id: toolchain の段がこの段より前にありません`);
        }
      }
      if (/uses:\s*actions\/setup-node@/.test(step.text)) {
        counts.setupNode++;
        if (valueOf(step.text, "node-version") !== NODE_REF || valueOf(step.text, "node-version-file") !== null) {
          problems.push(`行 ${step.line}（${job.name}）: setup-node の node-version は ${NODE_REF} にしてください（版を書かない・別のファイルから読ませない）`);
        }
      }
      if (/uses:\s*oven-sh\/setup-bun@/.test(step.text)) {
        counts.setupBun++;
        if (valueOf(step.text, "bun-version") !== BUN_REF || valueOf(step.text, "bun-version-file") !== null) {
          problems.push(`行 ${step.line}（${job.name}）: setup-bun の bun-version は ${BUN_REF} にしてください`);
        }
      }
      const key = valueOf(step.text, "key");
      if (key !== null && key.startsWith("caddy-")) {
        counts.caddyCache++;
        if (key !== CADDY_KEY) {
          problems.push(`行 ${step.line}（${job.name}）: Caddy のキャッシュの鍵は ${CADDY_KEY} にしてください（宣言から導く）`);
        }
      }
    });
  }
  for (const hit of findLiteralVersions(text, declared)) {
    problems.push(`行 ${hit.line}: ${hit.tool} の版 ${hit.version} を写しています（宣言から読んでください）`);
  }
  return { problems, counts };
}

/** ルートの package.json。 */
export function checkPackageJson(pkg, declared) {
  const problems = [];
  const expected = `>=${declared.node}`;
  if (pkg.engines?.node !== expected) {
    problems.push(`engines.node は ${expected} にしてください（実際: ${JSON.stringify(pkg.engines?.node)}。下限の正本は toolchain.json の node）`);
  }
  if (parsePackageManager(pkg.packageManager) === null) {
    problems.push(`packageManager が pnpm@x.y.z ではありません（実際: ${JSON.stringify(pkg.packageManager)}）`);
  }
  return problems;
}

/** e2e/package.json。Chromium の revision は Playwright の版に 1 対 1 で紐づく。 */
export function checkE2ePackageJson(pkg) {
  const problems = [];
  const test = pkg.devDependencies?.["@playwright/test"];
  const core = pkg.devDependencies?.["playwright-core"];
  for (const [name, v] of [["@playwright/test", test], ["playwright-core", core]]) {
    if (typeof v !== "string" || !/^\d+\.\d+\.\d+$/.test(v)) {
      problems.push(`${name} は x.y.z で完全固定してください（実際: ${JSON.stringify(v)}。範囲だと Chromium の revision が install のたびに動く）`);
    }
  }
  if (test !== core) problems.push(`@playwright/test（${test}）と playwright-core（${core}）の版がずれています`);
  return problems;
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), "utf8"));
}

function main() {
  const problems = [];
  const toolchain = parseToolchain(fs.readFileSync(path.join(REPO_ROOT, "toolchain.json"), "utf8"));
  if (!toolchain.ok) {
    console.error("[audit-toolchain] toolchain.json を読めません");
    for (const p of toolchain.problems) console.error(`  ${p}`);
    process.exit(1);
  }
  const pkg = readJson("package.json");
  const declared = { ...toolchain.value, pnpm: parsePackageManager(pkg.packageManager) };

  problems.push(...checkPackageJson(pkg, toolchain.value).map((p) => `package.json: ${p}`));
  problems.push(...checkE2ePackageJson(readJson("e2e/package.json")).map((p) => `e2e/package.json: ${p}`));

  const workflows = listTrackedFiles(REPO_ROOT, WORKFLOW_PATTERNS);
  const readers = listTrackedFiles(REPO_ROOT, READER_PATTERNS);
  const total = { setupNode: 0, setupBun: 0, caddyCache: 0 };
  for (const rel of workflows) {
    const r = checkWorkflow(fs.readFileSync(path.join(REPO_ROOT, rel), "utf8"), declared);
    for (const k of Object.keys(total)) total[k] += r.counts[k];
    problems.push(...r.problems.map((p) => `${rel}: ${p}`));
  }
  for (const rel of readers) {
    for (const hit of findLiteralVersions(fs.readFileSync(path.join(REPO_ROOT, rel), "utf8"), declared)) {
      problems.push(`${rel}: 行 ${hit.line}: ${hit.tool} の版 ${hit.version} を写しています（toolchain.json から読んでください）`);
    }
  }

  console.log(
    `[audit-toolchain] 走査対象: workflow ${workflows.length} 本（setup-node ${total.setupNode} / setup-bun ${total.setupBun} / Caddy の鍵 ${total.caddyCache}）/ ハーネス ${readers.length} 本`,
  );
  const empty = findEmptyScanDimensions([
    { label: "workflow", count: workflows.length },
    { label: "setup-node", count: total.setupNode },
    { label: "setup-bun", count: total.setupBun },
    { label: "Caddy の鍵", count: total.caddyCache },
    { label: "ハーネス", count: readers.length },
  ]);
  if (empty.length > 0) {
    console.error(`[audit-toolchain] 走査対象が 0 件です（${empty.join(" / ")}）。検査が空振りしています`);
    process.exit(1);
  }

  if (problems.length > 0) {
    console.error(`[audit-toolchain] 版の宣言と、それを読む側がずれています（${problems.length} 件）`);
    for (const p of problems) console.error(`  ${p}`);
    console.error("  根拠: docs/adr/0031（版の正本は toolchain.json・packageManager・@playwright/test）");
    process.exit(1);
  }
  console.log(`[audit-toolchain] OK（node ${declared.node} / pnpm ${declared.pnpm} / bun ${declared.bun} / caddy ${declared.caddy}）`);
}

if (isDirectRun(import.meta.url, process.argv[1])) main();
