// 1 つの作業ツリーで、割り当てられた変異を 1 つずつ入れ、core・利用側のテストを流して元へ戻す
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { execSync, spawnSync } from "node:child_process";
const [, , listPath, wt, shard, nShards, outPath, bun] = process.argv;
const CONSUMERS = { "roulette-core": ["apps/roulette-web"], "agenda-core": ["apps/agenda-web"], "timer-core": ["apps/timer-web"], "poker-core": ["apps/poker-web"], "rate-limit": [] };
const list = JSON.parse(readFileSync(listPath, "utf8")).filter((_, i) => i % Number(nShards) === Number(shard));
function apply(m) {
  const path = `${wt}/packages/${m.pkg}/${m.file}`;
  const src = readFileSync(path, "utf8");
  const lines = src.split("\n");
  const off = (loc) => lines.slice(0, loc.line - 1).reduce((a, l) => a + l.length + 1, 0) + loc.column - 1;
  writeFileSync(path, src.slice(0, off(m.location.start)) + m.replacement + src.slice(off(m.location.end)));
  return path;
}
function run(cwd, cmd) { const r = spawnSync("bash", ["-c", cmd], { cwd, encoding: "utf8", timeout: 600000 }); return r.status === 0; }
for (const m of list) {
  const path = apply(m);
  const res = { core: run(`${wt}/packages/${m.pkg}`, "pnpm exec vitest run --bail=1 >/dev/null 2>&1") ? "survived" : "killed" };
  res["apps/tasuki-sync"] = run(`${wt}/apps/tasuki-sync`, `${bun} test --timeout 15000 --bail >/dev/null 2>&1`) ? "survived" : "killed";
  for (const c of CONSUMERS[m.pkg]) res[c] = run(`${wt}/${c}`, "pnpm exec vitest run --bail=1 >/dev/null 2>&1") ? "survived" : "killed";
  execSync(`git -C ${wt} checkout -- ${path}`);
  appendFileSync(outPath, JSON.stringify({ ...m, location: undefined, res }) + "\n");
}
