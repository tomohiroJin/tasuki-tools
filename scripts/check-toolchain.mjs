#!/usr/bin/env node
/**
 * 検査を始める前に、開発環境の版を宣言と比べる（#487・docs/adr/0031）。
 *
 *     node scripts/check-toolchain.mjs <test|e2e|mutation>
 *
 * 合わなければ**検査を始めずに** exit 1 で終わり、どの道具がどの版で、どう揃えるかを示す。
 * `pnpm test`・`pnpm e2e`（ルートの package.json）・`scripts/mutation-check.mjs`・
 * E2E のハーネス（`e2e/harness/global-setup.ts`）がこれを先に呼ぶ。
 *
 * 宣言の置き場と比べ方は `scripts/lib/toolchain.mjs` の冒頭の表。
 *
 * ## 何を見ていないか
 *
 * - **道具が正しく動くかは見ない。** 見るのは版と、ブラウザの置き場の実在だけ
 * - **Caddy がまだ無いことは止めない。** ハーネスが宣言の版を取りに行く（取れなければハーネスが止まる）
 * - Chromium の置き場を決められないとき（`PLAYWRIGHT_BROWSERS_PATH=0`・知らない OS）は比べず、そう出す
 *
 * 設計方針: 判定は `scripts/lib/toolchain.mjs` の純粋関数。ここは環境から値を集める配線だけ。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { isDirectRun } from "./lib/direct-run.mjs";
import {
  STAGES,
  parseToolchain,
  parsePackageManager,
  parsePnpmUserAgent,
  parseCaddyVersionOutput,
  chromiumBrowsersDir,
  evaluateStage,
  formatProblems,
} from "./lib/toolchain.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SOURCES =
  "宣言: toolchain.json（Node・Bun・Caddy）/ package.json の packageManager（pnpm）/ e2e/package.json の @playwright/test（Chromium）";

/** 宣言を集める。読めなければ problems を返す（例外を投げない）。 */
function readDeclared(stage) {
  const problems = [];
  const toolchain = parseToolchain(fs.readFileSync(path.join(REPO_ROOT, "toolchain.json"), "utf8"));
  if (!toolchain.ok) problems.push(...toolchain.problems.map((p) => `toolchain.json: ${p}`));

  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  const pnpm = parsePackageManager(pkg.packageManager);
  if (pnpm === null) problems.push(`package.json: packageManager が pnpm@x.y.z ではありません（${pkg.packageManager}）`);

  let chromium = null;
  if (STAGES[stage].includes("chromium")) {
    // revision は playwright-core の browsers.json が決める。package.json の exports に
    // browsers.json は無いので、package.json を解決してから隣を読む。
    try {
      const require = createRequire(path.join(REPO_ROOT, "e2e", "package.json"));
      const dir = path.dirname(require.resolve("playwright-core/package.json"));
      const browsers = JSON.parse(fs.readFileSync(path.join(dir, "browsers.json"), "utf8"));
      chromium = browsers.browsers.find((b) => b.name === "chromium")?.revision ?? null;
      if (chromium === null) problems.push("playwright-core の browsers.json に chromium の項目がありません");
    } catch (e) {
      problems.push(`playwright-core を読めません（先に \`pnpm install\` を流してください）: ${e.message}`);
    }
  }
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, value: { ...toolchain.value, pnpm, chromium } };
}

/** コマンドを起動して標準出力を返す。起動できない・非ゼロなら null。 */
function probe(command, args) {
  const r = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 30_000,
    // corepack が版を取りに行くときに確認を出して止まらないようにする（CI と同じ）
    env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
  });
  if (r.error || r.status !== 0) return null;
  return r.stdout.trim();
}

/**
 * Bun の版。`mutation` の段では `scripts/mutation-check.mjs` と同じく `~/.bun/bin/bun` へも倒す。
 * `test`・`e2e` は package.json の `bun test`・`bun run` が PATH の上の bun を使うので、PATH だけを見る。
 */
function probeBun(stage) {
  const onPath = probe("bun", ["--version"]);
  if (onPath !== null || stage !== "mutation") return onPath;
  const fallback = path.join(os.homedir(), ".bun", "bin", "bun");
  return fs.existsSync(fallback) ? probe(fallback, ["--version"]) : null;
}

/** 環境から値を集める。宣言の Caddy の版はキャッシュの置き場の名前に使う（e2e/harness/paths.ts と同じ）。 */
function collectActual(stage, declared) {
  const tools = STAGES[stage];
  const actual = {
    node: process.version,
    pnpm: tools.includes("pnpm")
      ? (parsePnpmUserAgent(process.env["npm_config_user_agent"]) ?? probe("pnpm", ["--version"]))
      : null,
    bun: tools.includes("bun") ? probeBun(stage) : null,
    chromium: { dir: null, entries: null },
    caddy: { present: false, version: null, dir: null },
  };
  if (tools.includes("chromium")) {
    const dir = chromiumBrowsersDir(process.env, process.platform, os.homedir());
    actual.chromium = { dir, entries: dir !== null && fs.existsSync(dir) ? fs.readdirSync(dir) : null };
  }
  if (tools.includes("caddy")) {
    const dir = path.join(process.env["HOME"] ?? "/tmp", ".cache/tasuki-e2e", `caddy-${declared.caddy}`);
    const binary = path.join(dir, "caddy");
    if (fs.existsSync(binary)) {
      const out = probe(binary, ["version"]);
      actual.caddy = { present: true, version: out === null ? null : parseCaddyVersionOutput(out), dir };
    }
  }
  return actual;
}

function main() {
  const stage = process.argv[2];
  if (stage === undefined || !Object.hasOwn(STAGES, stage)) {
    console.error(`[check-toolchain] 段を指定してください: node scripts/check-toolchain.mjs <${Object.keys(STAGES).join("|")}>`);
    process.exit(2);
  }

  const declared = readDeclared(stage);
  if (!declared.ok) {
    console.error(`[check-toolchain] 版の宣言を読めません（${declared.problems.length} 件）。${stage} の検査を始めません`);
    for (const p of declared.problems) console.error(`  ${p}`);
    process.exit(1);
  }

  const actual = collectActual(stage, declared.value);
  const { problems, notes } = evaluateStage(stage, declared.value, actual);
  for (const n of notes) console.log(`[check-toolchain] 注: ${n}`);
  if (problems.length > 0) {
    console.error(`[check-toolchain] 開発環境の版が宣言と合いません（${problems.length} 件）。${stage} の検査を始めません`);
    console.error(formatProblems(problems));
    console.error(`  ${SOURCES}`);
    console.error("  根拠: docs/adr/0031");
    process.exit(1);
  }
  const summary = STAGES[stage]
    .map((tool) => {
      if (tool === "chromium") return `chromium ${declared.value.chromium}`;
      if (tool === "caddy") return `caddy ${actual.caddy.present ? actual.caddy.version : "（未取得）"}`;
      return `${tool} ${tool === "node" ? process.version.slice(1) : actual[tool]}`;
    })
    .join(" / ");
  console.log(`[check-toolchain] OK（${stage}: ${summary}）`);
}

if (isDirectRun(import.meta.url, process.argv[1])) main();
