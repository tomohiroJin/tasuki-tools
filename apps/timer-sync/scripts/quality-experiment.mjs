// AI お題生成 品質実験：sonnet/haiku を実プロンプトで回し、スキーマ検証＋レイテンシ＋多様性を計測する。
// 実行: cd apps/sync && bun run scripts/quality-experiment.mjs
// 認証: cwd の .env（CLAUDE_CODE_OAUTH_TOKEN）を Bun が自動読込。
// 結果レポート: docs/experiments/2026-06-14-ai-problem-quality-sonnet-vs-haiku.md
// 出力: /tmp/tasuki-quality-results.json（採点は quality-judge.mjs で実施）
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { buildProblemPrompt, validateProblem } from "@tasuki/timer-core";

const TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_CODE_OAUTH_TOKEN が未設定です（apps/sync/.env を確認）");
  process.exit(1);
}

const MODELS = ["sonnet", "haiku"];
const COMBOS = [
  { language: "TypeScript", difficulty: "easy" },
  { language: "TypeScript", difficulty: "hard" },
  { language: "Python", difficulty: "medium" },
  { language: "Go", difficulty: "easy" },
  { language: "Java", difficulty: "medium" },
];
const SAMPLES = 2;
const CONCURRENCY = 1; // claude -p の並列起動は認証/設定競合で落ちるため直列（本番も maxConcurrent=1）

// アダプタと同じ起動方法で claude -p を呼ぶ。
function generate(model, language, difficulty) {
  const prompt = buildProblemPrompt(language, difficulty);
  return new Promise((resolve) => {
    const started = Date.now();
    const args = [
      "-p", "--output-format", "json", "--model", model,
      "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--settings", "{}",
    ];
    const child = spawn("claude", args, {
      env: { PATH: process.env.PATH, HOME: process.env.HOME, CLAUDE_CODE_OAUTH_TOKEN: TOKEN },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (c) => (stdout += c.toString()));
    child.stderr.on("data", (c) => (stderr += c.toString()));
    child.on("error", (e) =>
      resolve({ ok: false, stage: "spawn", error: String(e), ms: Date.now() - started }));
    child.on("close", (code) => {
      const ms = Date.now() - started;
      if (code !== 0) {
        const redacted = stderr.replace(/sk-ant-[\w-]+/g, "[redacted]").slice(0, 300);
        resolve({ ok: false, stage: "exit", code, error: redacted, ms });
        return;
      }
      try {
        const outer = JSON.parse(stdout);
        const resultStr = outer.result;
        const s = resultStr.indexOf("{"), e = resultStr.lastIndexOf("}");
        const raw = JSON.parse(resultStr.slice(s, e + 1));
        const validated = validateProblem(raw); // neverthrow Result
        const isValid = validated.isOk();
        resolve({
          ok: true, ms,
          valid: isValid,
          validationError: isValid ? null : JSON.stringify(validated.error).slice(0, 400),
          problem: raw,
          usage: { cost_usd: outer.total_cost_usd, num_turns: outer.num_turns },
        });
      } catch (err) {
        resolve({ ok: false, stage: "parse", error: String(err).slice(0, 400), ms, stdout: stdout.slice(0, 2000) });
      }
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// 軽量並列実行（CONCURRENCY 件ずつ）。
async function runPool(tasks, concurrency) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
      const r = results[i].result;
      process.stderr.write(
        `  [${i + 1}/${tasks.length}] ${results[i].model} ${results[i].language}/${results[i].difficulty} ` +
        `#${results[i].sample} → ${r.ok ? (r.valid ? "OK" : "INVALID") : "FAIL"} ${r.ms}ms\n`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

const jobs = [];
for (const model of MODELS)
  for (const combo of COMBOS)
    for (let s = 1; s <= SAMPLES; s++)
      jobs.push(() =>
        generate(model, combo.language, combo.difficulty).then((result) => ({
          model, language: combo.language, difficulty: combo.difficulty, sample: s, result,
        })));

console.error(`生成開始: ${jobs.length} 件（並列 ${CONCURRENCY}）`);
const results = await runPool(jobs, CONCURRENCY);
const out = "/tmp/tasuki-quality-results.json";
writeFileSync(out, JSON.stringify(results, null, 2));
console.error(`\n保存: ${out}`);

// 簡易集計
for (const model of MODELS) {
  const rs = results.filter((r) => r.model === model);
  const ok = rs.filter((r) => r.result.ok);
  const valid = ok.filter((r) => r.result.valid);
  const avgMs = ok.length ? Math.round(ok.reduce((a, r) => a + r.result.ms, 0) / ok.length) : 0;
  const titles = valid.map((r) => r.result.problem.title);
  const uniq = new Set(titles.map((t) => String(t).toLowerCase().trim())).size;
  console.error(
    `\n[${model}] 生成成功 ${ok.length}/${rs.length}・スキーマ妥当 ${valid.length}/${ok.length}・` +
    `平均 ${avgMs}ms・タイトル多様性 ${uniq}/${titles.length}`);
}
