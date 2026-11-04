#!/usr/bin/env node
/**
 * 手元の検査の入口（#488）。一覧の正本は CI。追加依存を持たず、現在の workflow の
 * ブロック形式だけを読む。読めない run・matrix・env は実行前に拒否する。
 * actions の実行・キャッシュ・artifact 保存は再現しない。導入は先に済ませる。
 * 速い段の型・lint・単体・監査は取りこぼさないよう workspace 全体を流す。
 * 差分が文書だけなら型・lint・単体を省略し、変異の選択は既存の --changed に任せる。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { splitJobs, splitSteps } from "./lib/workflow.mjs";
import { decideScope } from "./lib/ci-scope.mjs";
import { isDirectRun } from "./lib/direct-run.mjs";
import { classifyFailure } from "./lib/check-outcome.mjs";
import { checkPriorWork, defaultRunners } from "./lib/prior-work.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function commandOf(step) {
  const lines = step.text.split("\n");
  const index = lines.findIndex((line) => /^ {6}- run:|^ {8}run:/.test(line));
  if (index < 0) return null;
  const value = lines[index].replace(/^\s*(?:- )?run:\s*/, "");
  if (value === "|") {
    const body = [];
    for (const line of lines.slice(index + 1)) {
      if (line.trim() === "") { body.push(""); continue; }
      if (!line.startsWith("          ")) break;
      body.push(line.slice(10));
    }
    if (!body.join("\n").trim()) throw new Error(`行 ${step.line}: run が空です`);
    return body.join("\n").trimEnd();
  }
  if (!value || /^[>|'"{&*!]/.test(value) || /\s#|:\s/.test(value)) {
    throw new Error(`行 ${step.line}: run は引用しない一行か run: | にしてください`);
  }
  return value;
}

/** 全 run を拾ったことも照合する。未知の構文を静かに飛ばさない。 */
export function deriveChecks(workflow) {
  // uses で検査を追加した場合も、手元の対象から黙って落とさない。
  const setupActions = new Set(["actions/checkout", "actions/setup-node", "oven-sh/setup-bun", "actions/cache", "actions/upload-artifact"]);
  for (const line of workflow.split("\n").filter((l) => !/^\s*#/.test(l) && /\buses\s*:/.test(l))) {
    const action = /^\s*(?:- )?uses: ([\w/-]+)@\S+/.exec(line)?.[1];
    if (!setupActions.has(action)) throw new Error(`手元で再現できない action です: ${line.trim()}`);
  }
  if (/^\s*(?:defaults|working-directory|container|services):/m.test(workflow)) {
    throw new Error("workflow の defaults・作業場所・container・services は手元で再現できません");
  }
  // ジョブや workflow の env を無視すると、同じコマンドでも検査条件が変わる。
  const topEnv = /^env:\n((?:[ \t].*\n|\n)*)/m.exec(workflow)?.[1];
  if (topEnv && topEnv.trim() !== 'COREPACK_ENABLE_DOWNLOAD_PROMPT: "0"') throw new Error("workflow の env を再現できません");
  if (/^ {4}env:/m.test(workflow)) throw new Error("ジョブの env を再現できません");
  const jobs = splitJobs(workflow);
  const steps = jobs.flatMap((job) => splitSteps(job.lines).map((step) => ({ ...step, job: job.name })));
  const runCount = workflow.split("\n").filter((l) => !/^\s*#/.test(l) && /\brun\s*:/.test(l)).length;
  const checks = [];
  let parsed = 0;
  for (const step of steps) {
    const command = commandOf(step);
    if (command === null) continue;
    parsed++;
    const id = /^\s*(?:- )?id: ([\w-]+)$/m.exec(step.text)?.[1];
    let reason;
    if (["toolchain", "scope", "playwright-version"].includes(id)) reason = `CI の準備（${id}）。手元は事前の版チェックと差分判定を使う`;
    if (["corepack enable", "pnpm install --frozen-lockfile"].includes(command) || /^pnpm --filter @tasuki\/e2e exec playwright install/.test(command)) {
      reason = "CI の導入処理。手元では先に依存・ブラウザを導入する";
    }
    if (/^node scripts\/install-with-supply-chain-check\.mjs(?:\s|$)/.test(command)) {
      reason = "新規チェックアウトの CI で install の検証実行を確かめる処理。導入済みの手元では省略する";
    }
    if (step.job === "mutation-all") reason = "CI の結果集約。手元は最後の一覧と終了コードで集約する";
    if (reason) { checks.push({ job: step.job, command, reason }); continue; }
    const matrix = jobs.find((j) => j.name === step.job).lines.map((l) => l.text).join("\n");
    const shell = /^\s*shell:\s*(.+)$/m.exec(step.text)?.[1];
    if (shell && shell !== "bash") throw new Error(`行 ${step.line}: 未対応の shell: ${shell}`);
    if (step.job === "mutation") {
      if (/^\s*working-directory:/m.test(step.text)) throw new Error("mutation の作業場所を再現できません");
      const shard = /^ {8}shard: \[([\d, ]+)\]\s*$/m.exec(matrix);
      const dimensions = matrix.split(/^ {4}steps:/m)[0].match(/^ {8}[\w-]+:/gm) ?? [];
      if (!shard || dimensions.length !== 1) throw new Error("mutation の matrix は shard の一軸だけにしてください");
      const total = shard[1].split(",").length;
      const expected = { SHARD_INDEX: "${{ strategy.job-index }}", SHARD_TOTAL: "${{ strategy.job-total }}" };
      const entries = [...step.text.matchAll(/^ {10}([\w-]+): (.+)$/gm)].map((m) => [m[1], m[2]]);
      if (JSON.stringify(Object.fromEntries(entries)) !== JSON.stringify(expected)) throw new Error("mutation の env を再現できません");
      if (command.includes("${{")) throw new Error("run 内の GitHub 式は env 経由にしてください");
      for (let i = 0; i < total; i++) checks.push({ job: step.job, command, env: { SHARD_INDEX: String(i), SHARD_TOTAL: String(total) } });
    } else {
      if (/^\s*env:|^\s*working-directory:|\$\{\{|^\s*matrix:/m.test(step.text) || /^\s*matrix:/m.test(matrix)) {
        throw new Error(`行 ${step.line}: CI 固有の env・作業場所・式・matrix を再現できません`);
      }
      checks.push({ job: step.job, command });
    }
  }
  if (parsed === 0 || parsed !== runCount) throw new Error(`workflow の run をすべて読めません（${parsed}/${runCount}）。ブロック形式を使ってください`);
  // E2E と変異は最後にする。各ジョブの中の順序とコマンドは保存する。
  const order = ["ci", "docs", "quality", "shuffle", "e2e", "mutation", "mutation-all"];
  return checks.sort((a, b) => (order.indexOf(a.job) < 0 ? 0 : order.indexOf(a.job)) - (order.indexOf(b.job) < 0 ? 0 : order.indexOf(b.job)));
}

export function planChecks(checks, mode, code) {
  let mutationSeen = false;
  return checks.map((check) => {
    if (mode === "full" || check.reason) return { ...check };
    if (check.job === "mutation") {
      if (mutationSeen) return { ...check, reason: "速い段では --changed を一度だけ流す" };
      mutationSeen = true;
      return { job: check.job, command: "node scripts/mutation-check.mjs --changed" };
    }
    if (check.job === "e2e" || check.job === "shuffle" || check.command === "pnpm build") {
      return { ...check, reason: "速い段では省略。全件の段で流す" };
    }
    if (!code && /^pnpm (typecheck|lint|test)$/.test(check.command)) return { ...check, reason: "差分は文書のみ" };
    return { ...check };
  });
}

/**
 * 検査を流す。`execute` は真偽か `{ passed, output }` を返す。
 * 赤の出力が「テストのワーカーが起動しなかった」だけなら、失敗ではなく未実行（`not-run`）と分ける（#508）。
 * 未実行も緑ではない（終了コードは非ゼロ）。流し直すかどうかを人が決められるように、区別して見せる。
 */
export function runChecks(plan, { preflight, execute }) {
  const ready = preflight();
  return plan.map((check) => {
    const reason = check.reason ?? (!ready ? "事前の版チェックが失敗したため開始しない" : null);
    if (reason) return { ...check, status: "skipped", reason };
    try {
      const result = execute(check);
      const { passed, output = "" } = typeof result === "object" ? result : { passed: result };
      if (passed) return { ...check, status: "passed" };
      const { kind, notStarted, cutOff } = classifyFailure(output);
      const where = notStarted.map((b) => `${b.task ?? ""}${b.task ? ": " : ""}${b.files.length} ファイル`).join("・");
      if (kind === "failed") {
        // 本物の失敗と一緒に起動しなかったものがあれば、それも書く（流し直す範囲が分かるように）
        return notStarted.length === 0 ? { ...check, status: "failed" } : { ...check, status: "failed", reason: `ほかにワーカーが起動しなかったもの: ${where}` };
      }
      return {
        ...check, status: "not-run",
        // 打ち切られたタスクがあれば、その中の本物の失敗は見えていない。パッケージだけを流し直すと見落とす
        reason: cutOff > 0
          ? `テストのワーカーが起動しなかった（${where}）。ほかに turbo が打ち切ったタスクが ${cutOff} 個あり、その結果は分かりません。負荷が下がってから、同じコマンド（${check.command.split("\n")[0]}）を流し直してください`
          : `テストのワーカーが起動しなかった（${where}）。負荷が下がってから流し直してください（パッケージだけなら pnpm --filter <名前> test）`,
      };
    } catch (error) { return { ...check, status: "failed", reason: error.message }; }
  });
}

/** 出力をその場で流しつつ、分類のために控える（tee）。 */
function execute(check) {
  console.log(`\n[local-check] ${check.job ?? "preflight"}: ${check.command}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-check-"));
  const log = path.join(dir, "output.log");
  try {
    const result = spawnSync("bash", ["-o", "pipefail", "-c", 'bash -e -o pipefail -c "$1" 2>&1 | tee "$2"', "local-check", check.command, log], {
      cwd: ROOT, stdio: "inherit", env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0", ...check.env },
    });
    if (result.error) console.error(result.error.message);
    const passed = !result.error && result.status === 0;
    return { passed, output: passed || !fs.existsSync(log) ? "" : fs.readFileSync(log, "utf8") };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/**
 * 速い段の変異の見込み（#508）。変異の検査を流す前に、件数・見込みの時間・全件への切り替え・基準の新しさを出す。
 * 計画の変異のコマンドに `--plan` を足して流す（変異は流さない）。知らせの行（⚠）は最後の一覧でもう一度出す。
 */
function forecastMutations(plan) {
  const mutation = plan.find((c) => c.job === "mutation" && !c.reason);
  if (!mutation) return [];
  const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", `${mutation.command} --plan`], { cwd: ROOT, encoding: "utf8" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trimEnd();
  console.log(`[local-check] 変異の見込み（${mutation.command} --plan）`);
  if (output) console.log(output);
  if (result.error || result.status !== 0) {
    const cause = result.error?.message ?? (result.signal ? `signal ${result.signal}` : `exit ${result.status}`);
    return [`⚠ 変異の見込みを出せませんでした（${cause}）`];
  }
  // 知らせ（⚠）と、それが指す「手元で絞るなら」の行を最後にもう一度出す
  return output.split("\n").filter((l) => l.includes("⚠") || l.includes("手元で絞るなら"));
}

/**
 * 同じ ISSUE の先行する PR・枝の知らせ（#504）。今のブランチ名の番号で引き、最初に出す。
 * 止めない。引けなかったときは失敗でなく未実行と理由を出す。⚠ の行は最後の一覧でもう一度出す。
 */
async function priorWorkNotices() {
  let lines;
  try {
    const { gh, git } = defaultRunners(ROOT);
    lines = (await checkPriorWork({ branch: (await git(["rev-parse", "--abbrev-ref", "HEAD"])).trim(), gh, git })).lines;
  } catch (error) {
    lines = [`⚠ 同じ ISSUE の先行 PR の確認は未実行です（${String(error.message).trim().split("\n")[0]}）`];
  }
  console.log("[local-check] 同じ ISSUE の先行 PR・枝");
  for (const line of lines) console.log(line);
  // 番号の無い枝の案内は ⚠ でないので、最後の一覧では繰り返さない
  return lines.filter((l) => l.startsWith("⚠"));
}

function hasCodeChanges() {
  try {
    const git = (args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
    const base = git(["merge-base", "origin/main", "HEAD"]).trim();
    // 改名先だけが .md でも、削除されたコードの側を数える。
    const files = git(["diff", "--name-only", "--no-renames", "-z", base]) + git(["ls-files", "--others", "--exclude-standard", "-z"]);
    return decideScope(files.split("\0").filter(Boolean)).code;
  } catch { console.log("[local-check] 差分を判定できないため、型・lint・単体をすべて流します"); return true; }
}

async function run() {
  const [mode, ...args] = process.argv.slice(2);
  if (!["fast", "full"].includes(mode) || args.some((a) => a !== "--list") || args.length > 1) {
    console.error("使い方: node scripts/local-check.mjs <fast|full> [--list]"); process.exitCode = 2; return;
  }
  try {
    const checks = deriveChecks(fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8"));
    const plan = planChecks(checks, mode, mode === "full" || hasCodeChanges());
    const notices = mode === "fast" ? forecastMutations(plan) : [];
    const priorNotices = mode === "fast" && !args.includes("--list") ? await priorWorkNotices() : [];
    if (args.includes("--list")) {
      for (const c of plan) console.log(`[${c.reason ? "省略" : "予定"}] ${c.job}: ${c.command.replaceAll("\n", " / ")}${c.env ? ` ${JSON.stringify(c.env)}` : ""}${c.reason ? ` — ${c.reason}` : ""}`);
      return;
    }
    let ready = false;
    const results = runChecks(plan, {
      preflight: () => { ready = execute({ command: `node scripts/check-toolchain.mjs ${mode === "full" ? "e2e" : "test"}` }).passed; return ready; },
      execute,
    });
    console.log("\n[local-check] 実行結果（CI の run から導出）");
    for (const c of results) console.log(`[${{ passed: "成功", failed: "失敗", skipped: "省略", "not-run": "未実行" }[c.status]}] ${c.job}: ${c.command.replaceAll("\n", " / ")}${c.env ? ` ${JSON.stringify(c.env)}` : ""}${c.reason ? ` — ${c.reason}` : ""}`);
    for (const line of [...priorNotices, ...notices]) console.log(`[local-check] ${line}`);
    const count = (status) => results.filter((c) => c.status === status).length;
    if (count("not-run") > 0) console.log(`[local-check] 失敗 ${count("failed")} 件・未実行 ${count("not-run")} 件（未実行はテストの失敗ではなく、走らなかったもの）`);
    process.exitCode = !ready || results.some((c) => c.status === "failed" || c.status === "not-run") ? 1 : 0;
  } catch (error) { console.error(`[local-check] ${error.message}`); process.exitCode = 1; }
}

function main() {
  // 非同期の本体の失敗は終了コードにして、未処理の棄却で落とさない
  run().catch((error) => {
    console.error(`${error.message}`);
    process.exitCode = 1;
  });
}

if (isDirectRun(import.meta.url, process.argv[1])) main();
