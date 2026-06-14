// 生成済みお題を sonnet judge で盲採点する（モデル名は judge に伏せる）。
// 実行: cd apps/sync && bun run scripts/quality-judge.mjs（先に quality-experiment.mjs を実行）
// 結果レポート: docs/experiments/2026-06-14-ai-problem-quality-sonnet-vs-haiku.md
// 入力: /tmp/tasuki-quality-results.json → 出力: /tmp/tasuki-quality-scores.json
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN;
const results = JSON.parse(readFileSync("/tmp/tasuki-quality-results.json", "utf8"));

function judge(language, difficulty, problem) {
  const prompt = `You are a strict senior engineer evaluating a TDD coding kata for quality.
Intended language: ${language}. Intended difficulty: ${difficulty} (easy=beginner/30min, medium=intermediate/60min, hard=advanced/90min+).

Kata JSON:
${JSON.stringify(problem, null, 2)}

Score each dimension 1-5 (5=excellent, 1=poor):
- req_clarity: requirements are clear, unambiguous, and each is verifiable by a test
- test_correctness: exampleTest is valid ${language} syntax AND semantically consistent with the requirements (a correct solution would pass it; assertions are concrete and right)
- difficulty_fit: the kata's actual complexity matches the intended "${difficulty}" difficulty
- tdd_value: practical, educational, well-suited to test-first practice (not trivial, not under-specified)

Return ONLY a JSON object (no markdown):
{"req_clarity":N,"test_correctness":N,"difficulty_fit":N,"tdd_value":N,"note":"one short sentence on the main weakness if any"}`;
  return new Promise((resolve) => {
    const child = spawn("claude", [
      "-p", "--output-format", "json", "--model", "sonnet",
      "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--settings", "{}",
    ], { env: { PATH: process.env.PATH, HOME: process.env.HOME, CLAUDE_CODE_OAUTH_TOKEN: TOKEN }, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (c) => (out += c.toString()));
    child.on("close", (code) => {
      try {
        const resultStr = JSON.parse(out).result;
        const s = resultStr.indexOf("{"), e = resultStr.lastIndexOf("}");
        resolve(JSON.parse(resultStr.slice(s, e + 1)));
      } catch (err) { resolve({ error: String(err).slice(0, 200), code }); }
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

const scored = [];
for (let i = 0; i < results.length; i++) {
  const x = results[i];
  const score = await judge(x.language, x.difficulty, x.result.problem);
  scored.push({ model: x.model, language: x.language, difficulty: x.difficulty, sample: x.sample, score });
  const sc = score.req_clarity ? `clr${score.req_clarity} tst${score.test_correctness} dif${score.difficulty_fit} tdd${score.tdd_value}` : `ERR ${score.error}`;
  process.stderr.write(`  [${i + 1}/${results.length}] ${x.model} ${x.language}/${x.difficulty}#${x.sample} → ${sc}\n`);
}
writeFileSync("/tmp/tasuki-quality-scores.json", JSON.stringify(scored, null, 2));

const dims = ["req_clarity", "test_correctness", "difficulty_fit", "tdd_value"];
for (const model of ["sonnet", "haiku"]) {
  const rs = scored.filter((s) => s.model === model && s.score.req_clarity);
  const avg = (d) => (rs.reduce((a, s) => a + s.score[d], 0) / rs.length).toFixed(2);
  const overall = (rs.reduce((a, s) => a + dims.reduce((b, d) => b + s.score[d], 0) / 4, 0) / rs.length).toFixed(2);
  console.error(`\n[${model}] n=${rs.length}  ` + dims.map((d) => `${d}=${avg(d)}`).join("  ") + `  総合=${overall}`);
}
