#!/usr/bin/env node
/**
 * CI のログから、変異検査の対照の組ごとの実測の秒数を数える道具（#550）。
 *
 * 分け方（`scripts/lib/mutation-partition.mjs`）の重さは 2 つの値で決まる。
 * ランナーごとの既定値（`mutation-check.mjs` の `RUNNER_COST_SECONDS`）と、重い組の実測の表
 * （`scripts/lib/mutation-weights.mjs` の `MEASURED_GROUPS`）。どちらも CI の秒数に合わせて持つので、測り直す道具を置く。
 * 手順は `docs/guides/procedures/mutations.md` の「重い組の実測の表」。
 *
 * 数え方: ワーカー（`[w番号]`）ごとに、`--- 変異 #n` の行 → `対照:` の行 → `検出:` の行の時刻の差を取る。
 * 対照 = 「変異」の行から「対照:」の行まで（`使い回し` の対照は 0 秒に近いので数えない）、
 * 検出 = 「対照:」の行から「検出:」の行まで（変異を当てて・テストを流し・戻すまで）。
 * 組の鍵は `controlGroupKey`（置き場とテストの並び）。テストの並びは対照のコマンドから戻す。
 *
 * 使い方:
 *   node scripts/measure-mutation-costs.mjs [--simulate | --leave-one-out] [--shards 3] [--jobs 4] <run のログ> [<run のログ> …]
 *   run のログ = 1 つの run の `mutation (k)` の job のログのファイルを `,` でつないだもの（例: a-1.log,a-2.log,a-3.log）。
 *   離れた 2 つ以上の run を渡す。何も付けなければ、ランナーごと・組ごとの実測と、いまの既定値・表との差を出す。
 *   --simulate は、各 run の変異の集合を --shard k/n・--jobs m で分けたときの各ワーカーの実測の秒数（最長と最短）を、
 *   いまのコードの重み（既定値と表）と、測り直した案の重みで並べて出す。--leave-one-out は、案を残した run 以外から測って分ける。
 *   いまの宣言に無い組（消えた・並びが変わった組）の変異は数えない。
 */
import fs from "node:fs";
import { controlGroupKey, groupByControl } from "./lib/mutation-partition.mjs";
import { selectMutations } from "./lib/mutation-select.mjs";
import { planWorkers } from "./lib/mutation-parallel.mjs";
import { isDirectRun } from "./lib/direct-run.mjs";
import { MEASURED_GROUPS, measuredCostOf } from "./lib/mutation-weights.mjs";
import { MUTATIONS } from "./lib/mutation-declarations.mjs";
import { RUNNER_COST_SECONDS } from "./mutation-check.mjs";

/** 載せる目安（`mutation-weights.mjs` の JSDoc と手順書と同じ）: 組の合計がこの秒数以上で、見積もりの半分以下（実測が見積もりの 2 倍以上）。 */
export const HEAVY_TOTAL_SECONDS = 30;

const PREFIX_TOKENS = { vitest: 3, bun: 2, node: 2 }; // npx vitest run / bun test / node --test

/** 対照のコマンド（`runTests` が出す文字列の、cwd の前まで）から、テストの並びを戻す。フラグ（`--` で始まるもの）は除く。 */
export function commandToTests(command, runner) {
  const skip = PREFIX_TOKENS[runner] ?? 0;
  return command.split(/\s+/).filter(Boolean).slice(skip).filter((token) => !token.startsWith("--"));
}

const LINE = /^\uFEFF?(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)\.(\d+)Z (?:\[(w\d+)\] )?(.*)$/;
const MUTATION = /^--- 変異 #(\d+):/;
const CONTROL = /^\s*対照: ○ 通過(（使い回し）)?（(.+)（cwd: ([^,]+), runner: (\w+)））\s*$/;
const DETECT = /^\s*検出:/;

/**
 * ログのテキストから、変異ごとの { id, pkg, tests, runner, controlSec（使い回しは null）, detectSec } を読む。
 * 検出の行まで届かなかった変異（切れたログ・対照が落ちた変異）は数えない。
 */
export function parseMutationLog(text) {
  const records = [];
  const open = new Map(); // ワーカー → 途中の変異
  for (const raw of text.split(/\r?\n/)) {
    const m = LINE.exec(raw);
    if (!m) continue;
    const at = Date.parse(`${m[1]}Z`) / 1000 + Number(`0.${m[2]}`); // 秒
    const worker = m[3] ?? "";
    const body = m[4];
    let hit;
    if ((hit = MUTATION.exec(body))) {
      open.set(worker, { id: Number(hit[1]), start: at });
    } else if ((hit = CONTROL.exec(body))) {
      const cur = open.get(worker);
      if (!cur) continue;
      const runner = hit[4];
      Object.assign(cur, {
        controlAt: at,
        reused: Boolean(hit[1]),
        runner,
        pkg: hit[3],
        tests: commandToTests(hit[2], runner),
      });
    } else if (DETECT.test(body)) {
      const cur = open.get(worker);
      if (!cur || cur.controlAt === undefined) continue;
      records.push({
        id: cur.id,
        pkg: cur.pkg,
        tests: cur.tests,
        runner: cur.runner,
        controlSec: cur.reused ? null : cur.controlAt - cur.start,
        detectSec: at - cur.controlAt,
      });
      open.delete(worker);
    }
  }
  return records;
}

const mean = (values) => values.reduce((s, v) => s + v, 0) / values.length;

export function median(values) {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 組ごとに、run をまたいだ代表値（run ごとの平均の、run をまたいだ平均）を出す。
 * @param {{ name: string, records: object[] }[]} runs
 * @returns {{ key: string, pkg: string, tests: string[], runner: string, count: number, control: number, mutation: number, perRun: object[] }[]}
 */
export function summarizeGroups(runs) {
  const groups = new Map();
  for (const run of runs) {
    const inRun = new Map();
    for (const rec of run.records) {
      const key = controlGroupKey(rec);
      if (!inRun.has(key)) inRun.set(key, []);
      inRun.get(key).push(rec);
    }
    for (const [key, recs] of inRun) {
      const controls = recs.filter((r) => r.controlSec !== null).map((r) => r.controlSec);
      if (!groups.has(key)) groups.set(key, { key, pkg: recs[0].pkg, tests: recs[0].tests, runner: recs[0].runner, count: 0, perRun: [] });
      const g = groups.get(key);
      g.count = Math.max(g.count, recs.length);
      g.perRun.push({
        run: run.name,
        count: recs.length,
        control: controls.length ? mean(controls) : null,
        mutation: mean(recs.map((r) => r.detectSec)),
      });
    }
  }
  return [...groups.values()].map((g) => {
    const controls = g.perRun.map((p) => p.control).filter((v) => v !== null);
    return { ...g, control: controls.length ? mean(controls) : NaN, mutation: mean(g.perRun.map((p) => p.mutation)) };
  });
}

const round1 = (v) => Math.round(v * 10) / 10;

/**
 * ランナーごとの既定値の案: 表の行（`tableKeys`。個別に持つ組）を除いた組の、対照・検出の中央値を 0.1 秒単位に丸めたもの。
 * 平均でなく中央値にするのは、表に載らない程度に重い組や、まれに遅れた組に引かれないため。
 */
export function proposeRunnerDefaults(groups, tableKeys) {
  const out = {};
  for (const runner of [...new Set(groups.map((g) => g.runner))].sort()) {
    const rest = groups.filter((g) => g.runner === runner && !tableKeys.has(controlGroupKey(g)));
    out[runner] = {
      control: round1(median(rest.map((g) => g.control).filter(Number.isFinite))),
      mutation: round1(median(rest.map((g) => g.mutation))),
    };
  }
  return out;
}

/** 組の実測の合計（対照 1 回＋検出 × 件数）。 */
export const totalSeconds = (g) => g.control + g.mutation * g.count;

/** 表に載せる目安に当たる組（合計が {@link HEAVY_TOTAL_SECONDS} 秒以上で、見積もりの 2 倍以上）。`estimateOf` は組の見積もり（秒）。 */
export function proposeTableRows(groups, estimateOf) {
  return groups.filter((g) => totalSeconds(g) >= HEAVY_TOTAL_SECONDS && estimateOf(g) * 2 <= totalSeconds(g));
}

const roundHalf = (v) => Math.round(v * 2) / 2;

/**
 * 既定値と表の行をまとめて案にする。表の行は既定値の見積もりで決まり、既定値は表の行を除いた組で決まる（互いに依る）ので、
 * 表の行が変わらなくなるまで繰り返す（上限 10 回。収まらなければ最後の案）。表の値は半秒単位に丸める（今の表と同じ）。
 * @returns {{ defaults: Record<string, {control: number, mutation: number}>, rows: { pkg: string, tests: string[], runner: string, count: number, control: number, mutation: number }[] }}
 */
export function proposeWeights(groups) {
  let keys = new Set();
  let defaults = proposeRunnerDefaults(groups, keys);
  for (let i = 0; i < 10; i++) {
    const rows = proposeTableRows(groups, (g) => defaults[g.runner].control + defaults[g.runner].mutation * g.count);
    const next = new Set(rows.map(controlGroupKey));
    const same = next.size === keys.size && [...next].every((k) => keys.has(k));
    keys = next;
    defaults = proposeRunnerDefaults(groups, keys);
    if (same) break;
  }
  const rows = groups
    .filter((g) => keys.has(controlGroupKey(g)))
    .map((g) => ({ pkg: g.pkg, tests: g.tests, runner: g.runner, count: g.count, control: roundHalf(g.control), mutation: roundHalf(g.mutation) }));
  return { defaults, rows };
}

/** 案（{@link proposeWeights} の返り値）を、分け方へ渡す重さと印の関数にする。`weightOf` の引数は `groupByControl` の組（変異に `runner` を持たせる）。 */
export function weightsFrom({ defaults, rows }) {
  const table = new Map(rows.map((r) => [controlGroupKey(r), r]));
  const costOf = (group) => table.get(group.key) ?? defaults[group.mutations[0].runner];
  return {
    weightOf: (group) => costOf(group).control + costOf(group).mutation * group.mutations.length,
    isHeavy: (group) => table.has(group.key),
  };
}

/**
 * 1 つの run の変異の集合を `--shard k/n`・`--jobs m` で分けたときの、各ワーカーの実測の秒数。
 * 重みは `weightOf`・`isHeavy`（本番と同じ分け方 `selectMutations`・`planWorkers` へ渡す）、秒数はその run の実測。
 * @returns {{ workers: number[], max: number, min: number, spread: number, shards: { workers: number[], max: number, min: number }[] }}
 */
export function simulateShards(records, { shards, jobs, weightOf, isHeavy }) {
  const byId = new Map();
  for (const r of records) byId.set(r.id, r);
  const mutations = [...byId.values()].sort((a, b) => a.id - b.id).map((r) => ({ id: r.id, pkg: r.pkg, tests: r.tests, runner: r.runner }));
  const seconds = (m) => {
    const r = byId.get(m.id);
    return (r.controlSec ?? 0) + r.detectSec;
  };
  const perShard = [];
  for (let index = 1; index <= shards; index++) {
    const { selected } = selectMutations(mutations, { kind: "shard", index, total: shards, weightOf, isHeavy });
    const workers = planWorkers(selected.map((s) => s.mutation), jobs, weightOf, isHeavy).map((ms) => ms.reduce((s, m) => s + seconds(m), 0));
    perShard.push({ workers, max: Math.max(...workers), min: Math.min(...workers) });
  }
  const all = perShard.flatMap((s) => s.workers);
  const max = Math.max(...all);
  const min = Math.min(...all);
  return { workers: all, max, min, spread: max - min, shards: perShard };
}

// ---- CLI ----

const fmt = (v, digits = 1) => (Number.isFinite(v) ? v.toFixed(digits) : "-");

function readRuns(args, declaredKeys) {
  let dropped = 0;
  const runs = args.map((arg) => {
    const all = arg.split(",").flatMap((file) => parseMutationLog(fs.readFileSync(file, "utf8")));
    const records = all.filter((r) => declaredKeys.has(controlGroupKey(r)));
    dropped += all.length - records.length;
    return { name: arg.split(",")[0].replace(/^.*\//, "").replace(/-\d+\.log$/, ""), records };
  });
  return { runs, dropped };
}

function main() {
  const argv = process.argv.slice(2);
  let simulate = false;
  let leaveOneOut = false;
  let shards = 3;
  let jobs = 4;
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--simulate") simulate = true;
    else if (argv[i] === "--leave-one-out") leaveOneOut = true;
    else if (argv[i] === "--shards") shards = Number(argv[++i]);
    else if (argv[i] === "--jobs") jobs = Number(argv[++i]);
    else files.push(argv[i]);
  }
  if (files.length === 0) {
    console.error("使い方: node scripts/measure-mutation-costs.mjs [--simulate | --leave-one-out] [--shards 3] [--jobs 4] <a-1.log,a-2.log,a-3.log> [<run のログ> …]");
    process.exitCode = 1;
    return;
  }
  const { runs, dropped } = readRuns(files, new Set(MUTATIONS.map(controlGroupKey)));
  console.log(`run ${runs.length} 個: ${runs.map((r) => `${r.name}（${r.records.length} 件）`).join("・")}`);
  if (dropped > 0) console.log(`（いまの宣言に無い組の変異 ${dropped} 件は数えない）`);

  const current = {
    weightOf: (group) => {
      const cost = measuredCostOf(group) ?? RUNNER_COST_SECONDS[group.mutations[0].runner];
      return cost.control + cost.mutation * group.mutations.length;
    },
    isHeavy: (group) => measuredCostOf(group) !== null,
  };
  const spreadLine = (label, r) =>
    `  ${label}: シャードの最長 ${r.shards.map((s) => fmt(s.max, 0)).join("/")} 秒・ワーカー全体で最長 ${fmt(r.max, 0)} 秒・最短 ${fmt(r.min, 0)} 秒・差 ${fmt(r.spread, 0)} 秒`;

  if (simulate) {
    const proposal = weightsFrom(proposeWeights(summarizeGroups(runs)));
    for (const run of runs) {
      console.log(`${run.name}: --shard k/${shards}・--jobs ${jobs} の実測の秒数`);
      console.log(spreadLine("いまのコードの重み", simulateShards(run.records, { shards, jobs, ...current })));
      console.log(spreadLine("測り直した案の重み", simulateShards(run.records, { shards, jobs, ...proposal })));
    }
    return;
  }

  if (leaveOneOut) {
    // 他の run から測った案で、残した run を分ける（案を測った run そのものでは良く見えすぎるため）。
    for (const [i, run] of runs.entries()) {
      const others = runs.filter((_, j) => j !== i);
      const proposal = weightsFrom(proposeWeights(summarizeGroups(others)));
      console.log(`${run.name}: 他の ${others.length} run から測った案で分ける`);
      console.log(spreadLine("いまのコードの重み", simulateShards(run.records, { shards, jobs, ...current })));
      console.log(spreadLine("他の run の案の重み", simulateShards(run.records, { shards, jobs, ...proposal })));
    }
    return;
  }

  const groups = summarizeGroups(runs);
  const tableKeys = new Set(MEASURED_GROUPS.map(controlGroupKey));
  const rest = (runner) => groups.filter((g) => g.runner === runner && !tableKeys.has(controlGroupKey(g)));
  console.log("\n## ランナーごと（いまの表の行を除いた組。括弧はいまの既定値）");
  for (const [runner, d] of Object.entries(proposeRunnerDefaults(groups, tableKeys))) {
    const now = RUNNER_COST_SECONDS[runner];
    const ratios = rest(runner).map((g) => totalSeconds(g) / (now.control + now.mutation * g.count));
    const sum = (f) => rest(runner).reduce((s, g) => s + f(g), 0);
    console.log(
      `${runner}: 組 ${rest(runner).length} 個・対照の中央値 ${d.control}（${now.control}）・検出の中央値 ${d.mutation}（${now.mutation}）` +
        `・組の合計の「実測÷いまの既定値」の中央値 ${fmt(median(ratios), 2)}・実測の合計 ${fmt(sum(totalSeconds), 0)} 秒に対し、いまの既定値の見積もりの合計 ${fmt(sum((g) => now.control + now.mutation * g.count), 0)} 秒`,
    );
  }
  console.log("\n## 組ごと（合計の大きい順。比 = 実測の合計 ÷ いまの重さ。● = いまの表の行。run ごと = 対照/検出）");
  for (const g of [...groups].sort((a, b) => totalSeconds(b) - totalSeconds(a))) {
    const cost = measuredCostOf(g) ?? RUNNER_COST_SECONDS[g.runner];
    const est = cost.control + cost.mutation * g.count;
    console.log(
      [
        tableKeys.has(controlGroupKey(g)) ? "●" : " ",
        g.runner.padEnd(6),
        `${g.pkg} :: ${g.tests.join(" ") || "(全部)"}`,
        `件数 ${g.count}`,
        `対照 ${fmt(g.control)}`,
        `検出 ${fmt(g.mutation)}`,
        `合計 ${fmt(totalSeconds(g))}`,
        `重さ ${fmt(est)}`,
        `比 ${fmt(totalSeconds(g) / est, 2)}`,
        `run ごと ${g.perRun.map((p) => `${fmt(p.control)}/${fmt(p.mutation)}`).join(" ")}`,
      ].join(" | "),
    );
  }
  const { defaults, rows } = proposeWeights(groups);
  console.log("\n## 案: ランナーごとの既定値（RUNNER_COST_SECONDS）");
  for (const [runner, d] of Object.entries(defaults)) console.log(`  ${runner}: { control: ${d.control}, mutation: ${d.mutation} },`);
  console.log(`\n## 案: 表の行（MEASURED_GROUPS。合計 ${HEAVY_TOTAL_SECONDS} 秒以上・案の既定値の見積もりの 2 倍以上。${rows.length} 行）`);
  for (const r of rows) console.log(`  { pkg: ${JSON.stringify(r.pkg)}, tests: ${JSON.stringify(r.tests)}, control: ${r.control}, mutation: ${r.mutation} },  // 件数 ${r.count}`);
}

if (isDirectRun(import.meta.url, process.argv[1])) main();
